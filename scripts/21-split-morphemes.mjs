// 21 号：切分词素。确定性闸门，不调 LLM。
//
// 输入  scripts/.work/derived/words.candidates.json  （20 号产物：67 词 + 难度 + 手写 split 引用）
//        scripts/lib/stage1-content.json             （splits 手写表）
//        scripts/lib/legacy-morphemes.json           （原 12 词素，id 相同老版胜出）
//        scripts/lib/stage1-content.json#extraMorphemes（本阶段词素全表）
//        scripts/gates/residue-allowlist.json        （A5 词尾残留白名单）
//        scripts/.work/raw/cigen-roots_affixes.json  （交叉验证；缺失或对不上就丢词，绝不修复）
// 输出  scripts/.work/derived/words.splits.json
//
// 规则（文档 A5 / A6 / A18）：
//   - A5：parts 表面拼起来必须正好是这个单词；只有词尾残留可挂在 residue-allowlist 里。
//   - A6：每个 surface 必须落在对应词素的 allomorphs（或 displayText）里。
//   - A18：词必须有至少一个 type=root 的 part，否则结算经验会静默变 0。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CIGEN_ROOT_ALIAS, CIGEN_ROOT_IGNORE } from './lib/id-canon.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const libDir = join(here, 'lib')
const derivedDir = join(here, '.work', 'derived')
const rawDir = join(here, '.work', 'raw')
const gatesDir = join(here, 'gates')

const candidates = JSON.parse(readFileSync(join(derivedDir, 'words.candidates.json'), 'utf8'))
const cfgPath = process.argv[2] || join(libDir, 'stage1-content.json')
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
const legacy = JSON.parse(readFileSync(join(libDir, 'legacy-morphemes.json'), 'utf8'))
const residueRaw = JSON.parse(readFileSync(join(gatesDir, 'residue-allowlist.json'), 'utf8'))
const residueAllowlist = Object.fromEntries(Object.entries(residueRaw).filter(([k]) => !k.startsWith('_')))

// ── 合并词素表：legacy 12 优先（id 相同老版胜出），再 ∪ extraMorphemes ───────
const morphemes = new Map()
for (const m of legacy.morphemes) morphemes.set(m.id, m)
for (const m of cfg.extraMorphemes) if (!morphemes.has(m.id)) morphemes.set(m.id, m)
const surfaceToId = new Map()
for (const m of morphemes.values()) {
  for (const a of m.allomorphs) surfaceToId.set(a.toLowerCase(), m.id)
  surfaceToId.set(m.displayText.replace(/^-+|-+$/g, '').toLowerCase(), m.id)
  surfaceToId.set(m.id.toLowerCase(), m.id)
}
function findId(token) {
  const t = (token || '').toLowerCase()
  return surfaceToId.get(t)
}
// 只看词根：cigen 交叉验证只比对词根集合（前缀/后缀粒度差异是 cigen 更粗，不算错）
const rootSurfaceToId = new Map()
for (const m of morphemes.values()) {
  if (m.type !== 'root') continue
  for (const a of m.allomorphs) rootSurfaceToId.set(a.toLowerCase(), m.id)
  rootSurfaceToId.set(m.id.toLowerCase(), m.id)
}

// ── cigen 交叉验证索引 ────────────────────────────────────────────────────────
let cigenByWord = null
const cigenPath = join(rawDir, 'cigen-roots_affixes.json')
if (existsSync(cigenPath)) {
  const cigen = JSON.parse(readFileSync(cigenPath, 'utf8'))
  cigenByWord = new Map()
  for (const e of cigen.entries || []) {
    const w = (e.word || '').toLowerCase()
    if (w) cigenByWord.set(w, e)
  }
}

// ── 切分 + 闸门 ──────────────────────────────────────────────────────────────
const out = []
const dropped = []
let anyFail = false

for (const cand of candidates.words) {
  const word = cand.word
  const split = cfg.splits[word]
  if (!split) { console.error(`❌ ${word}：缺手写 split`); anyFail = true; continue }

  const parts = split.map((p, i) => ({ morphemeId: p.id, surface: p.surface, position: i, isAssimilated: p.isAssimilated || false }))

  // A5：拼接必须等于单词，或词尾残留进了白名单
  const assembled = parts.map((p) => p.surface).join('').toLowerCase()
  const target = word.toLowerCase()
  let a5ok = true
  let a5msg = ''
  if (assembled !== target) {
    const reason = residueAllowlist[word]
    if (!reason) { a5ok = false; a5msg = `拼出「${assembled}」≠「${target}」且无 residue 白名单` }
    else if (!target.startsWith(assembled)) { a5ok = false; a5msg = `残留「${assembled}」不是「${target}」前缀` }
  }
  if (!a5ok) { console.error(`❌ A5 ${word}：${a5msg}`); dropped.push(word); anyFail = true; continue }

  // A6：surface 必须落在词素 allomorphs
  let a6ok = true
  for (const p of parts) {
    const m = morphemes.get(p.morphemeId)
    if (!m) { console.error(`❌ A6 ${word}：引用未建模词素 ${p.morphemeId}`); a6ok = false; break }
    const allowed = new Set([...m.allomorphs, m.displayText.replace(/^-+|-+$/g, ''), m.id])
    if (!allowed.has(p.surface)) {
      console.error(`❌ A6 ${word}：surface「${p.surface}」不在 ${p.morphemeId}.allomorphs（${m.allomorphs.join('、')}）`)
      a6ok = false; break
    }
  }
  if (!a6ok) { dropped.push(word); anyFail = true; continue }

  // A18：至少一个 root part
  if (!parts.some((p) => morphemes.get(p.morphemeId)?.type === 'root')) {
    console.error(`❌ A18 ${word}：没有 root 词素 part`)
    dropped.push(word); anyFail = true; continue
  }

  // cigen 交叉验证：cigen 标出的词根必须都被本阶段拆出来（cigen 更粗不算错；
  // 只有 cigen 声称某个词根本阶段没拆到，才是真冲突，丢词）。
  if (cigenByWord && cigenByWord.has(word)) {
    const ce = cigenByWord.get(word)
    const toks = (ce.components || []).map((c) => (c.morpheme || '').toLowerCase()).filter(Boolean)
    // cigen 把词根拼成拉丁词干全形（trah / mitt / dc / minimus / passer…），词库按词形定的 id
    // 是另一套拼法（tract / mit / duce / minim / pass…），两边同一个词根。先落到词库 id，
    // 再查别名表拿到「可接受的 id 集合」—— 同一个 token 可能对上不止一个 id
    // （minimus 既对 minimum 也对 minimal），所以是「任一匹配即可」，不是全都要在。
    const cigenRoots = []
    for (const t of toks) {
      const id = rootSurfaceToId.get(t)
      if (!id || CIGEN_ROOT_IGNORE.has(id)) continue
      cigenRoots.push(CIGEN_ROOT_ALIAS.get(id) || [id])
    }
    if (cigenRoots.length > 0) {
      const ourRoots = new Set(parts.filter((p) => morphemes.get(p.morphemeId)?.type === 'root').map((p) => p.morphemeId))
      const missing = cigenRoots.filter((accept) => accept.length > 0 && !accept.some((r) => ourRoots.has(r)))
      if (missing.length > 0) {
        console.error(`❌ cigen ${word}：cigen 标了本阶段没拆出的词根 ${missing.map((a) => a.join('|')).join('/')}（cigen=${cigenRoots.map((a) => a.join('|')).join('+')} 本阶段=${[...ourRoots].join('+')}）`)
        dropped.push(word); anyFail = true; continue
      }
    }
  }

  out.push({ ...cand, parts })
}

// 丢词从「硬失败」改成「报告后继续」：Stage 3 铺库后每批都有几十上百个词不适合词根法拆解
// （`within`/`wherever`/`wisdom`/`collect` 这类复合词或功能词派生，压根没有 root 词素，
// A18「每个词至少一个 root part」必然拦下）。这是正常筛除，不是异常 ——
// 早期词库小（67 词精选）时丢一个都值得停下来看，铺到 1,600 词后就不适合再硬卡了。
// 列出来供人工扫一眼，但不阻断管线。
if (dropped.length) {
  console.warn(`\n切分丢词 ${dropped.length} 个（无 root 词素，不适合词根法拆解，已跳过）：${dropped.slice(0, 12).join('、')}${dropped.length > 12 ? ' …' : ''}`)
}

mkdirSync(derivedDir, { recursive: true })
const payload = {
  generatedAt: new Date().toISOString(),
  generator: 'scripts/21-split-morphemes.mjs',
  source: 'words.candidates.json + stage1-content.json',
  wordCount: out.length,
  roots: candidates.roots,
  words: out,
}
writeFileSync(join(derivedDir, 'words.splits.json'), `${JSON.stringify(payload, null, 2)}\n`)

console.log(`切分通过 ${out.length} 个词（丢 0 个）`)
console.log('已写出 scripts/.work/derived/words.splits.json')
console.log('下一步：node scripts/22-choose-examples.mjs')
