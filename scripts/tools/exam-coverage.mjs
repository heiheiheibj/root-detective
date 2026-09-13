// 需求驱动测算：**考试词**有多少能被 kaikki 的权威拆分覆盖，需要多少词素。
//
// 与 supply-ceiling.mjs 的区别：那个是「供给视角」（这个词根能凑几个词），
// 这个是「需求视角」（用户要学的词，有多少能用词根法教）——结果驱动的目标应该由它定。
//
// 跑法：node scripts/tools/exam-coverage.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const rawDir = join(here, '..', '.work', 'raw')
const derivedDir = join(here, '..', '.work', 'derived')
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

// ── ECDICT：考试标签 + 难度 ──
function parseCsvLine(line) {
  const out = []; let cur = ''; let inQuote = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1 } else inQuote = false }
      else cur += ch
    } else if (ch === '"') inQuote = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}
const EXAM_TAGS = ['zk', 'gk', 'cet4', 'cet6']
const examWords = new Map() // word → { tags, collins, bnc }
let ecdictTotal = 0
for (const line of readFileSync(join(rawDir, 'ecdict.csv'), 'utf8').split('\n')) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const w = norm(f[0])
  if (!w) continue
  ecdictTotal += 1
  const tags = (f[7] || '').split(' ').filter(Boolean)
  if (!tags.some((t) => EXAM_TAGS.includes(t))) continue
  examWords.set(w, { tags, collins: Number(f[5] || 0), bnc: Number(f[8] || 0) })
}
const difficultyFor = (e) => {
  const tags = e.tags
  if (tags.includes('zk') || tags.includes('gk') || e.collins === 5 || (e.bnc > 0 && e.bnc < 3000)) return 1
  if ((tags.includes('cet6') || tags.includes('toefl')) && (e.bnc > 10000 || e.bnc === 0)) return 5
  return 3
}

// ── kaikki 权威拆分 ──
const kaikki = JSON.parse(readFileSync(join(derivedDir, 'kaikki-splits.json'), 'utf8'))
const splits = kaikki.splits

// ── 交叉：考试词 ∩ 有拆分 ──
const covered = new Map()      // 考试词 → parts
const uncovered = []
for (const [word, info] of examWords) {
  const parts = splits[word]
  if (parts && parts.parts.length >= 2) covered.set(word, parts)
  else uncovered.push(word)
}
const byTag = {}
for (const tag of EXAM_TAGS) {
  const inTag = [...examWords.entries()].filter(([, e]) => e.tags.includes(tag))
  const coveredInTag = inTag.filter(([w]) => covered.has(w))
  byTag[tag] = { total: inTag.length, covered: coveredInTag.length, rate: inTag.length ? +(coveredInTag.length / inTag.length * 100).toFixed(1) : 0 }
}

// ── 词素统计：每个词素能覆盖多少考试词 ──
const morphemeExam = new Map() // morpheme → Set(word)
const positionOf = new Map()   // morpheme → { head, mid, tail }
for (const [word, info] of covered) {
  const parts = info.parts
  parts.forEach((p, i) => {
    if (!morphemeExam.has(p)) morphemeExam.set(p, new Set())
    morphemeExam.get(p).add(word)
    if (!positionOf.has(p)) positionOf.set(p, { head: 0, mid: 0, tail: 0 })
    const pos = i === 0 ? 'head' : i === parts.length - 1 ? 'tail' : 'mid'
    positionOf.get(p)[pos] += 1
  })
}
const rank = [...morphemeExam.entries()].map(([id, words]) => ({
  id,
  words: words.size,
  ...positionOf.get(id),
  sample: [...words].slice(0, 6),
})).sort((a, b) => b.words - a.words)

const buckets = { '1': 0, '2': 0, '3-4': 0, '5-9': 0, '10-19': 0, '20-49': 0, '50+': 0 }
for (const m of rank) {
  const n = m.words
  if (n === 1) buckets['1'] += 1
  else if (n === 2) buckets['2'] += 1
  else if (n <= 4) buckets['3-4'] += 1
  else if (n <= 9) buckets['5-9'] += 1
  else if (n <= 19) buckets['10-19'] += 1
  else if (n <= 49) buckets['20-49'] += 1
  else buckets['50+'] += 1
}

console.log(`ECDICT 词条 ${ecdictTotal}｜考试词（zk/gk/cet4/cet6 任一）${examWords.size} 个`)
console.log(`\nkaikki 权威拆分覆盖情况（词必须有 ≥2 个词素的明确拆分）：`)
console.log(`  覆盖 ${covered.size} 个（${(covered.size / examWords.size * 100).toFixed(1)}%）｜未覆盖 ${uncovered.length} 个`)
for (const tag of EXAM_TAGS) {
  const t = byTag[tag]
  console.log(`  ${tag.padEnd(5)} ${String(t.total).padStart(5)} 词 → 覆盖 ${String(t.covered).padStart(5)}（${t.rate}%）`)
}
console.log(`\n涉及词素 ${rank.length} 个`)
console.log(`  供给分档（按覆盖的考试词数）：1 词 ${buckets['1']} / 2 词 ${buckets['2']} / 3-4 词 ${buckets['3-4']} / 5-9 词 ${buckets['5-9']} / 10-19 词 ${buckets['10-19']} / 20-49 词 ${buckets['20-49']} / 50+ 词 ${buckets['50+']}`)
for (const min of [3, 5, 10, 20]) {
  const hit = rank.filter((m) => m.words >= min)
  const wordsCovered = new Set()
  for (const m of hit) for (const w of morphemeExam.get(m.id)) wordsCovered.add(w)
  console.log(`  → 只保留「覆盖 ≥${String(min).padStart(2)} 个考试词」的词素：${String(hit.length).padStart(5)} 个词素，可覆盖 ${wordsCovered.size} 个考试词（${(wordsCovered.size / covered.size * 100).toFixed(1)}% 的有拆分词）`)
}
console.log(`\n覆盖考试词最多的 40 个词素（head=词首/mid=词中/tail=词尾，用来判前缀/词根/后缀）：`)
for (const m of rank.slice(0, 40)) {
  const kind = m.head > m.tail * 1.5 ? '前缀向' : m.tail > m.head * 1.5 ? '后缀向' : '词根向'
  console.log(`  ${m.id.padEnd(12)} ${String(m.words).padStart(4)} 词  h${String(m.head).padStart(4)} m${String(m.mid).padStart(4)} t${String(m.tail).padStart(4)}  ${kind}  :: ${m.sample.join(', ')}`)
}

writeFileSync(join(derivedDir, 'exam-coverage.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  ecdictTotal,
  examWords: examWords.size,
  covered: covered.size,
  uncovered: uncovered.length,
  byTag,
  morphemes: rank.length,
  buckets,
  rank: rank.slice(0, 3000),
  uncoveredSample: uncovered.slice(0, 300),
}, null, 1), 'utf8')
console.log(`\n已写 scripts/.work/derived/exam-coverage.json`)
