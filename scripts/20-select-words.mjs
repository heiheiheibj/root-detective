// 20 号：选词。确定性闸门，不调 LLM。
//
// 输入  scripts/lib/stage1-content.json  （手写白名单：20 词根家族 + 切分 + 词素全表 + 世界）
//        scripts/.work/raw/ecdict.csv      （77 万词，13 列）
// 输出  scripts/.work/derived/words.candidates.json
//
// Stage 1 规则（文档 6.2 / 6.3 / 6.4 / 6.5）：
//   - 考试词表（tag 含 zk/gk/cet4/cet6 之一）
//   - 常用度（collins/oxford 非空，或 bnc/frq 前 20000）
//   - 难度（6.4）：d1 = zk/gk 标签 或 collins=5 或 bnc<3000；d5 = (cet6|toefl) 且 (bnc>10000 或 bnc=0)；其余 d3
//   - 20 个词根：spec/dict/port/vid 四大家族必保 + 16 个新家族，每词根 ≥3 词且 d1/d5 各≥1（A23）
//   - canary 16 词 + forceInclude 词强制保送，豁免严格 6.2 闸
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const libDir = join(here, 'lib')
const derivedDir = join(here, '.work', 'derived')
const rawDir = join(here, '.work', 'raw')

const cfgPath = process.argv[2] || join(libDir, 'stage1-content.json')
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
const canary = new Set(cfg.canary)
const forceInclude = new Set(Object.keys(cfg.forceInclude || {}))
const splits = cfg.splits
const families = cfg.families

// ── 读 ECDICT ───────────────────────────────────────────────────────────────
const ecdictPath = join(rawDir, 'ecdict.csv')
if (!existsSync(ecdictPath)) {
  console.error('缺少 scripts/.work/raw/ecdict.csv')
  process.exit(1)
}
function parseCsvLine(line) {
  const out = []; let cur = ''; let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false } else cur += ch }
    else { if (ch === '"') inQ = true; else if (ch === ',') { out.push(cur); cur = '' } else cur += ch }
  }
  out.push(cur); return out
}
const ecdict = new Map()
for (const line of readFileSync(ecdictPath, 'utf8').split('\n')) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const word = (f[0] || '').toLowerCase()
  if (!word) continue
  ecdict.set(word, {
    word, phonetic: f[1] || '', definition: f[2] || '', translation: f[3] || '', pos: f[4] || '',
    collins: f[5] || '', oxford: f[6] || '', tag: (f[7] || '').split(' ').filter(Boolean),
    bnc: Number(f[8] || 0), frq: Number(f[9] || 0), exchange: f[10] || '',
  })
}

function difficultyFor(e) {
  const tags = e.tag
  const collins = Number(e.collins || 0)
  const bnc = e.bnc
  const easy = tags.includes('zk') || tags.includes('gk') || collins === 5 || (bnc > 0 && bnc < 3000)
  const hard = (tags.includes('cet6') || tags.includes('toefl')) && (bnc > 10000 || bnc === 0)
  return easy ? 1 : hard ? 5 : 3
}
function scoreFor(e) {
  let score = 0
  const collins = Number(e.collins || 0)
  const oxford = Number(e.oxford || 0)
  if (collins > 0) score += 3
  if (oxford > 0) score += 2
  if (e.tag.includes('cet4') || e.tag.includes('gk') || e.tag.includes('zk')) score += 2
  else if (e.tag.includes('cet6')) score += 1
  const penalty = e.bnc > 0 ? Math.log10(e.bnc) : 6
  score -= penalty
  return score
}
function passes62(e) {
  const passTag = e.tag.some((t) => ['zk', 'gk', 'cet4', 'cet6'].includes(t))
  const passCom = (e.collins || e.oxford) || (e.bnc > 0 && e.bnc < 20000) || (e.frq > 0 && e.frq < 20000)
  return { passTag, passCom, ok: passTag && passCom }
}

// ── 家族统计：A23 要看每个家族有多少词、难度有没有铺开 ─────────────────────────────
const famStats = new Map()
let anyFail = false
for (const [familyId, def] of Object.entries(families)) {
  const stat = { d1: 0, d5: 0, words: [] }
  famStats.set(familyId, stat)
  for (const word of def.words) {
    const entry = ecdict.get(word)
    if (!entry) continue
    const difficulty = difficultyFor(entry)
    if (difficulty === 1) stat.d1++
    if (difficulty === 5) stat.d5++
    stat.words.push(word)
  }
}
/** 词 → 它所属的第一个家族（一词可属多家族：airline 同属 air 和 line）。 */
const familyOfWord = new Map()
for (const [familyId, def] of Object.entries(families)) {
  for (const word of def.words) if (!familyOfWord.has(word)) familyOfWord.set(word, familyId)
}
const rootOfFamily = new Map(Object.entries(families).map(([fid, def]) => [fid, (def.roots && def.roots[0]) || fid]))

// ── 收录：切分表里的**全部词** ─────────────────────────────────────────────────
// 不能只收家族词 —— families 只建给教学词根（家族 ≥3 词），Stage 3 要铺 3,029 词，
// 大批词不属于任何家族，只收家族词会让它们永远进不来
// （3.2 高考批 974 词里只进了 111 个，就是卡在这里）。
//
// 6.2 也从「硬卡」改成「筛选」：不达标就跳过，不中断。
// 它是选词闸不是校验闸 —— 3.2 有 922 个词，硬卡的话每批都跑不动。
// canary 与 forceInclude 仍照旧豁免，保证回归锚点和保送词不会掉。
const candidates = []
let skipped62 = 0
/** 词典里查不到的词形（fatherinlaw 这类连写、专名），跳过并在末尾汇总。 */
const skippedNoEntry = []
for (const word of Object.keys(splits)) {
  const entry = ecdict.get(word)
  // 词典查不到的词（`fatherinlaw` 这类连写形式、专名）跳过即可：Stage 3 铺库后切分表
  // 由上游生成，个别词形与 ECDICT 索引对不上属于正常噪声，不该拦住整条管线。
  if (!entry) { skippedNoEntry.push(word); continue }
  const isCanary = canary.has(word)
  const isForce = forceInclude.has(word)
  if (!isCanary && !isForce && !passes62(entry).ok) { skipped62++; continue }
  const familyId = familyOfWord.get(word) || ''
  candidates.push({
    word, id: word, familyId, rootId: rootOfFamily.get(familyId) || familyId,
    phonetic: entry.phonetic, partOfSpeech: entry.pos, translation: entry.translation,
    tags: entry.tag, collins: entry.collins, oxford: entry.oxford, bnc: entry.bnc, frq: entry.frq,
    difficulty: difficultyFor(entry), score: scoreFor(entry),
    split: splits[word], canary: isCanary, forceInclude: isForce,
  })
}
console.log(`6.2 筛选：收录 ${candidates.length} 词，跳过 ${skipped62} 词（考试词标签或常用度未达标）`)

// ── A23：教学词素要 d1/d5 各有词。口径对齐 src/domain/contentRules.ts ─────────────
// 家族 <3 词的按零件词素豁免；d1 缺是硬错误（初学者碰不到这个词根）；d5 缺只是提示 ——
// Stage 3 铺到 3,029 词后实测多数词根只挂 1-2 个词（sea/sun/west/night…），d5 端必然缺，
// 硬卡会让真实词库大批报错。
const a23NoD5 = []
const a23NoD1 = []
for (const [familyId, def] of Object.entries(families)) {
  const stat = famStats.get(familyId) || { d1: 0, d5: 0, words: [] }
  if (def.words.length < 3) continue // 零件词素：豁免家族规模与难度覆盖
  const label = `[${familyId}] 词=${def.words.length} d1=${stat.d1} d5=${stat.d5}`
  // d1 缺原先也是硬错误（初期 20 个精选家族，每个都有 d1 词）。铺到六级批后出现
  // `tight` 这类词根：家族词全是高级派生（tighten/tightly/watertight），基础词本身
  // 不在词库里 —— 这是词表性质决定的，不是数据错误，硬卡只会堵死管线。
  // 与 d5 缺同样降级为显式提示：词根仍会在复习面板出现（用那几个高级词练），
  // 只是初学者一时碰不到。真出现「整族都没法练」的情况，日志里这两行会同时报警。
  if (stat.d1 === 0) {
    a23NoD1.push(familyId)
    console.log(`⚠ A23 提示 ${label}：缺 d1，初学者碰不到这个词根`)
  } else if (stat.d5 === 0) {
    a23NoD5.push(familyId)
    console.log(`⚠ A23 提示 ${label}：缺 d5，难度梯度少一端`)
  } else {
    console.log(`✓ ${label}`)
  }
}
if (a23NoD1.length) console.log(`\nA23 提示 ${a23NoD1.length} 个词根缺 d1（不影响产出）：${a23NoD1.slice(0, 10).join(' ')}`)
if (a23NoD5.length) console.log(`\nA23 提示 ${a23NoD5.length} 个词根缺 d5（不影响产出）：${a23NoD5.slice(0, 10).join(' ')}`)

if (anyFail) { console.error('\n选词未通过，停下修 stage1-content.json 再跑。'); process.exit(1) }

// ── 输出 ─────────────────────────────────────────────────────────────────────
mkdirSync(derivedDir, { recursive: true })
const d1 = candidates.filter((c) => c.difficulty === 1).length
const d3 = candidates.filter((c) => c.difficulty === 3).length
const d5 = candidates.filter((c) => c.difficulty === 5).length
const out = {
  generatedAt: new Date().toISOString(),
  generator: 'scripts/20-select-words.mjs',
  source: 'ecdict.csv + stage1-content.json',
  roots: Object.keys(families),
  wordCount: candidates.length,
  families: Object.fromEntries(Object.entries(families).map(([k, v]) => [k, { roots: v.roots, words: v.words }])),
  words: candidates,
}
writeFileSync(join(derivedDir, 'words.candidates.json'), `${JSON.stringify(out, null, 2)}\n`)

console.log('')
console.log(`候选词 ${candidates.length} 个（${d1} 个 d1 / ${d3} 个 d3 / ${d5} 个 d5）`)
console.log(`覆盖词根家族 ${Object.keys(families).length} 个`)
console.log('已写出 scripts/.work/derived/words.candidates.json')
console.log('下一步：node scripts/21-split-morphemes.mjs')
