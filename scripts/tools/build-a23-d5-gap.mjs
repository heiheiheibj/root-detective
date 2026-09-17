// 生成 A23 结构性缺口白名单（d5 + d1 两张）：
//   scripts/gates/a23-d5-structural-gap.json
//   scripts/gates/a23-d1-structural-gap.json
//
// 口径（与 20-select-words.mjs 完全一致）：
//   d5 词 = ECDICT tag 含 cet6 或 toefl，且 bnc>10000 或 bnc=0。
//   d1 词 = ECDICT 标 zk/gk，或 collins===5，或 0<bnc<3000（即「入门/常见」词）。
// 判定：把**整个可切分考试词库**（splits-merged）都翻一遍，只要还存在一个含该词根的
//   对应难度词，就说明这个缺口是「没收进来」的选题疏漏 —— **不许进白名单**，A23 继续报警。
//   只有翻遍全库都找不到，才写进白名单（day/room/body 这类常见词根天然只有简单词，
//   或 tight/script 这类词根天然只有高级派生，硬补就是把偏词硬塞进词库）。
//
// 每次词库或上游词表变动都要重跑，否则白名单会过期（放行了本该补的词根）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const gatesDir = join(root, 'scripts', 'gates')

const words = JSON.parse(readFileSync(join(root, 'src', 'domain', 'content', 'words.json'), 'utf8'))
const morphemes = JSON.parse(readFileSync(join(root, 'src', 'domain', 'content', 'morphemes.json'), 'utf8'))
const mType = new Map(morphemes.map((m) => [m.id, m.type]))
const cfg = JSON.parse(readFileSync(join(root, 'scripts', 'lib', 'stage3-content.json'), 'utf8'))
const MIN_WORDS_PER_ROOT = 3

// ── 缺 d5 / 缺 d1 的教学词根 ──
const family = new Map()
for (const w of words) for (const p of w.parts) {
  if (!family.has(p.morphemeId)) family.set(p.morphemeId, [])
  family.get(p.morphemeId).push(w)
}
const missingD5 = []
const missingD1 = []
for (const [id, fam] of family) {
  if (fam.length < MIN_WORDS_PER_ROOT) continue
  if (mType.get(id) !== 'root') continue
  if (!fam.some((w) => w.difficulty === 5)) missingD5.push(id)
  if (!fam.some((w) => w.difficulty === 1)) missingD1.push(id)
}

// ── ECDICT（逐字符 CSV 解析，与 20 号一致）──
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
for (const line of readFileSync(join(root, 'scripts', '.work', 'raw', 'ecdict.csv'), 'utf8').split('\n')) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const word = (f[0] || '').toLowerCase()
  if (!word) continue
  ecdict.set(word, { collins: Number(f[5] || 0), tag: (f[7] || '').split(' ').filter(Boolean), bnc: Number(f[8] || 0) })
}
// 与 20 号同口径：**easy 优先**（`easy ? 1 : hard ? 5 : 3`）：一个词既带 zk/gk 又带 cet6 时，判 d1。
// 早先这里写成 hard 优先，把 baseball/weekday/rainfall 这类中考词误判成 d5，白名单因此漏了词根。
function isD1(word) {
  const e = ecdict.get(word.toLowerCase())
  if (!e) return false
  return e.tag.includes('zk') || e.tag.includes('gk') || e.collins === 5 || (e.bnc > 0 && e.bnc < 3000)
}
function isD5(word) {
  const e = ecdict.get(word.toLowerCase())
  if (!e) return false
  const easy = isD1(word)
  const hard = (e.tag.includes('cet6') || e.tag.includes('toefl')) && (e.bnc > 10000 || e.bnc === 0)
  return !easy && hard
}

// ── 全语料里有没有含该词根的 d1 / d5 词 ──
const upstream = JSON.parse(readFileSync(join(root, 'scripts', '.work', 'derived', 'splits-merged.json'), 'utf8'))
const upSplits = upstream.splits ?? upstream.words
const easyHits = new Map() // rootId -> [含该词根的 d1 词]
const hardHits = new Map() // rootId -> [含该词根的 d5 词]
let poolSize = 0
for (const [word, entry] of Object.entries(upSplits)) {
  poolSize += 1
  const parts = cfg.splits[word] || entry.parts || entry
  if (!Array.isArray(parts)) continue
  const ids = parts.map((p) => p.id ?? p.morphemeId)
  if (isD5(word)) for (const id of ids) if (missingD5.includes(id)) { if (!hardHits.has(id)) hardHits.set(id, []); hardHits.get(id).push(word) }
  else if (isD1(word)) for (const id of ids) if (missingD1.includes(id)) { if (!easyHits.has(id)) easyHits.set(id, []); easyHits.get(id).push(word) }
}

function splitWhitelist(missing, hits) {
  const exempt = {}
  const actionable = []
  for (const id of missing) {
    const h = hits.get(id)
    if (h && h.length) { actionable.push(`${id}(${[...new Set(h)].join('/')})`); continue }
    exempt[id] = `全语料 ${poolSize} 个可切分考试词里都没有含 ${id} 的对应难度词（常见词根天然只有简单词、或该词根天然只有高级派生），结构性补不出来`
  }
  return { exempt, actionable }
}

const d5 = splitWhitelist(missingD5, hardHits)
const d1 = splitWhitelist(missingD1, easyHits)

mkdirSync(gatesDir, { recursive: true })

const d5Out = {
  _comment: `A23「教学词根缺 difficulty-5 词」的结构性缺口清单。只收「翻遍全库也补不出来」的词根；能补的（语料里确有 cet6/toefl 词）一律不收，A23 继续报警。由 scripts/tools/build-a23-d5-gap.mjs 生成（语料 ${poolSize} 词），词库或上游词表变动后必须重跑。`,
  _generatedAt: new Date().toISOString(),
  _poolSize: poolSize,
  ...d5.exempt,
}
writeFileSync(join(gatesDir, 'a23-d5-structural-gap.json'), `${JSON.stringify(d5Out, null, 2)}\n`)

const d1Out = {
  _comment: `A23「教学词根缺 difficulty-1 词」的结构性缺口清单。只收「翻遍全库也补不出入门词」的词根（tight/script 这类词根家族词全是高级派生，基础词本身不在词库里）；能补的（语料里确有 zk/gk 入门词）一律不收，A23 继续报警。由 scripts/tools/build-a23-d5-gap.mjs 生成（语料 ${poolSize} 词），词库或上游词表变动后必须重跑。`,
  _generatedAt: new Date().toISOString(),
  _poolSize: poolSize,
  ...d1.exempt,
}
writeFileSync(join(gatesDir, 'a23-d1-structural-gap.json'), `${JSON.stringify(d1Out, null, 2)}\n`)

if (existsSync(join(gatesDir, 'a23-d5-structural-gap.json'))) console.log(`已写出 ${join(gatesDir, 'a23-d5-structural-gap.json')}`)
if (existsSync(join(gatesDir, 'a23-d1-structural-gap.json'))) console.log(`已写出 ${join(gatesDir, 'a23-d1-structural-gap.json')}`)
console.log(`缺 d5 教学词根 ${missingD5.length} 个：结构性缺口 ${Object.keys(d5.exempt).length} 个（写入白名单），可补 ${d5.actionable.length} 个（继续报警）${d5.actionable.length ? ` —— 可补：${d5.actionable.join('、')}` : ''}`)
console.log(`缺 d1 教学词根 ${missingD1.length} 个：结构性缺口 ${Object.keys(d1.exempt).length} 个（写入白名单），可补 ${d1.actionable.length} 个（继续报警）${d1.actionable.length ? ` —— 可补：${d1.actionable.join('、')}` : ''}`)
