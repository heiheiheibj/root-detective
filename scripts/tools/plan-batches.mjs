// S4：目标词表与批次划分定案。
//
// 两条规则决定谁能进目标词表：
//   ① **所有零件都必须入池** —— 拼词时每个 part 都要有卡片，缺一个这词就拼不出来
//   ② 按考试层级分批：词的层级取它的**最低** tag（zk > gk > cet4 > cet6）
//
// 词素分批：某词素最早在哪一批被需要，就归到那一批（避免跨批重复引入）。
//
// 输出  scripts/.work/derived/batches.json + 控制台批次表
// 跑法：node scripts/tools/plan-batches.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const rawDir = join(here, '..', '.work', 'raw')
const derivedDir = join(here, '..', '.work', 'derived')
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
const LEVELS = ['zk', 'gk', 'cet4', 'cet6']
const LEVEL_CN = { zk: '中考', gk: '高考', cet4: '四级', cet6: '六级' }

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
const tagsOf = new Map()
for (const line of readFileSync(join(rawDir, 'ecdict.csv'), 'utf8').split('\n').slice(1)) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const w = norm(f[0])
  if (!w || tagsOf.has(w)) continue
  const tags = (f[7] || '').split(' ').filter(Boolean)
  if (tags.some((t) => LEVELS.includes(t))) tagsOf.set(w, tags)
}

const merged = JSON.parse(readFileSync(join(derivedDir, 'splits-merged.json'), 'utf8'))
const lexicon = JSON.parse(readFileSync(join(derivedDir, 'morpheme-lexicon.json'), 'utf8')).lexicon
const lexiconSurfaces = new Map(lexicon.map((m) => [m.surface, m]))

// ── 目标词表 ──
// 不要求「所有零件都入池」：拼词卡片是按 word.parts 生成的（见 getAvailableCards），
// 低频词素照样能当卡片 —— 只是它不做「教学单元」（没有世界归属、不做家族练习）。
// 所以词素分两层：
//   教学词素（lexicon，≥3 个考试词）：有义项、有世界归属、可作词根卡
//   零件词素（其余）：只在拼词卡片里出现，也要有最小记录（id/显示/义项）
const target = []
for (const [word, info] of Object.entries(merged.splits)) {
  const tags = tagsOf.get(word)
  if (!tags) continue
  const level = LEVELS.findIndex((t) => tags.includes(t))
  if (level < 0) continue
  target.push({ word, level, parts: info.parts.map((p) => p.surface), source: info.source, tags, teaching: info.parts.filter((p) => lexiconSurfaces.has(p.surface)).length })
}
const byLevel = [[], [], [], []]
for (const t of target) byLevel[t.level].push(t)

// ── 词素分批：最早被需要的批次 ──
const morphemeBatch = new Map()
for (let level = 0; level < 4; level += 1) {
  for (const t of byLevel[level]) {
    for (const s of new Set(t.parts)) if (!morphemeBatch.has(s)) morphemeBatch.set(s, level)
  }
}
const teachingCount = [...morphemeBatch.keys()].filter((s) => lexiconSurfaces.has(s)).length

// ── 批次统计 ──
const batches = []
let cumWords = 0; let cumMorphemes = 0; let cumTeaching = 0
console.log(`目标词表 ${target.length} 词｜用到的词素 ${morphemeBatch.size} 个（教学词素 ${teachingCount} / 零件词素 ${morphemeBatch.size - teachingCount}）\n`)
console.log('批次   层级   新增词   新增词素(教学)   累计词   累计词素   难度 d1/d3/d5')
for (let level = 0; level < 4; level += 1) {
  const words = byLevel[level]
  const morphemes = [...morphemeBatch].filter(([, b]) => b === level).map(([s]) => s)
  const teaching = morphemes.filter((s) => lexiconSurfaces.has(s))
  cumWords += words.length
  cumMorphemes += morphemes.length
  cumTeaching += teaching.length
  const dist = { d1: 0, d3: 0, d5: 0 }
  for (const w of words) {
    const d = w.tags.includes('zk') || w.tags.includes('gk') ? 1 : w.tags.includes('cet4') ? 3 : 5
    dist[`d${d}`] += 1
  }
  batches.push({
    id: `3.${level + 1}`, level: LEVELS[level], levelCn: LEVEL_CN[LEVELS[level]],
    words: words.map((w) => w.word).sort(),
    morphemes: morphemes.sort(),
    teachingMorphemes: teaching.sort(),
    deltaWords: words.length, deltaMorphemes: morphemes.length, deltaTeaching: teaching.length,
    cumWords, cumMorphemes, cumTeaching, difficulty: dist,
  })
  console.log(`3.${level + 1}  ${LEVEL_CN[LEVELS[level]].padEnd(4)} ${String(words.length).padStart(7)} ${String(`${morphemes.length}(${teaching.length})`).padStart(15)} ${String(cumWords).padStart(8)} ${String(cumMorphemes).padStart(10)}   ${dist.d1}/${dist.d3}/${dist.d5}`)
}
console.log(`\n合计 ${cumWords} 词 / ${cumMorphemes} 词素（其中教学词素 ${cumTeaching}）`)
const typeCount = { prefix: 0, root: 0, suffix: 0 }
for (const s of morphemeBatch.keys()) {
  const m = lexiconSurfaces.get(s)
  if (m) typeCount[m.type] += 1
}
console.log(`教学词素类型：前缀 ${typeCount.prefix} / 词根 ${typeCount.root} / 后缀 ${typeCount.suffix}`)
console.log(`\n第一批（中考）样例 20 词：${batches[0].words.slice(0, 20).join(', ')}`)
console.log(`第一批新增教学词素（前 25）：${batches[0].teachingMorphemes.slice(0, 25).map((s) => `${s}(${lexiconSurfaces.get(s)?.words ?? 0})`).join(' ')}`)

writeFileSync(join(derivedDir, 'batches.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  summary: { targetWords: target.length, morphemesUsed: morphemeBatch.size, teachingMorphemes: teachingCount, batches: batches.map((b) => ({ id: b.id, level: b.level, deltaWords: b.deltaWords, deltaMorphemes: b.deltaMorphemes, deltaTeaching: b.deltaTeaching, cumWords: b.cumWords, cumMorphemes: b.cumMorphemes })) },
  batches,
}, null, 1), 'utf8')
console.log(`\n已写 .work/derived/batches.json`)
