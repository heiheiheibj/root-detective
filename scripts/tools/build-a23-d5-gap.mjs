// 生成 A23「教学词根缺 d5」的结构性缺口白名单：scripts/gates/a23-d5-structural-gap.json
//
// 口径（与 20-select-words.mjs 完全一致）：
//   d5 词 = ECDICT tag 含 cet6 或 toefl，且 bnc>10000 或 bnc=0。
// 判定：把**整个可切分考试词库**（splits-merged 3,029 词）都翻一遍，只要还存在一个 d5 词
//   切分里含有该词根，就说明这个缺口是「没收进来」的选题疏漏 —— **不许进白名单**，
//   A23 继续报警。只有翻遍全库都找不到，才写进白名单（day/room/body/take/happy 这类
//   常见词根天然只有简单词，硬补就是把偏词硬塞进词库）。
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

// ── 缺 d5 的教学词根 ──
const family = new Map()
for (const w of words) for (const p of w.parts) {
  if (!family.has(p.morphemeId)) family.set(p.morphemeId, [])
  family.get(p.morphemeId).push(w)
}
const missing = []
for (const [id, fam] of family) {
  if (fam.length < MIN_WORDS_PER_ROOT) continue
  if (mType.get(id) !== 'root') continue
  if (!fam.some((w) => w.difficulty === 5)) missing.push(id)
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
// 与 20 号同口径：**easy 优先**（`easy ? 1 : hard ? 5 : 3`）—— 一个词既带 zk/gk 又带 cet6
// 时，20 号判 d1。早先这里写成 hard 优先，把 baseball/weekday/rainfall 这类中考词
// 误判成 d5，白名单因此漏了 11 个本该判定为「结构性缺口」的词根。
function isD5(word) {
  const e = ecdict.get(word.toLowerCase())
  if (!e) return false
  const easy = e.tag.includes('zk') || e.tag.includes('gk') || e.collins === 5 || (e.bnc > 0 && e.bnc < 3000)
  const hard = (e.tag.includes('cet6') || e.tag.includes('toefl')) && (e.bnc > 10000 || e.bnc === 0)
  return !easy && hard
}

// ── 全语料里有没有含该词根的 d5 词 ──
const upstream = JSON.parse(readFileSync(join(root, 'scripts', '.work', 'derived', 'splits-merged.json'), 'utf8'))
const upSplits = upstream.splits ?? upstream.words
const hardHits = new Map() // rootId -> [能补的词]
let poolSize = 0
for (const [word, entry] of Object.entries(upSplits)) {
  poolSize += 1
  if (!isD5(word)) continue
  const parts = cfg.splits[word] || entry.parts || entry
  if (!Array.isArray(parts)) continue
  for (const p of parts) {
    const id = p.id ?? p.morphemeId
    if (!missing.includes(id)) continue
    if (!hardHits.has(id)) hardHits.set(id, [])
    hardHits.get(id).push(word)
  }
}

const exempt = {}
const actionable = []
for (const id of missing) {
  const hits = hardHits.get(id)
  if (hits && hits.length) { actionable.push(`${id}(${[...new Set(hits)].join('/')})`); continue }
  exempt[id] = `全语料 ${poolSize} 个可切分考试词里没有任何含 ${id} 的 cet6/toefl 词（常见词根天然只有简单词），结构性补不出来`
}
const out = {
  _comment: `A23「教学词根缺 difficulty-5 词」的结构性缺口清单。只收「翻遍全库也补不出来」的词根；能补的（语料里确有 cet6 词）一律不收，A23 继续报警。由 scripts/tools/build-a23-d5-gap.mjs 生成（语料 ${poolSize} 词），词库或上游词表变动后必须重跑。`,
  // 下划线开头才是注释：readAllowlist() 只过滤 `_` 键，不带头下划线的字段会被当成白名单条目
  _generatedAt: new Date().toISOString(),
  _poolSize: poolSize,
  ...exempt,
}
mkdirSync(gatesDir, { recursive: true })
writeFileSync(join(gatesDir, 'a23-d5-structural-gap.json'), `${JSON.stringify(out, null, 2)}\n`)

const prevPath = join(gatesDir, 'a23-d5-structural-gap.json')
console.log(`缺 d5 教学词根 ${missing.length} 个：结构性缺口 ${Object.keys(exempt).length} 个（写入白名单），可补 ${actionable.length} 个（继续报警）`)
if (actionable.length) console.log(`可补的：${actionable.join('、')} —— 收进来就能补上，别放进口名单`)
if (existsSync(prevPath)) console.log(`已写出 ${prevPath}`)
