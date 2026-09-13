// S3：规则切分兜底 —— 给 S1 没覆盖的考试词补拆分。
//
// 典型目标：`accept`（kaikki 只给拉丁词干 `ad + capi`，表面拼不回）
//          → 规则切成 `ac + cept`。证据来自**已覆盖词自己**：
//             except / reception 等词已把 `cept` 作为词素表面用过了。
//
// 算法：从 splits-fused 收集「词素表面」统计，再对未覆盖词尝试几种切分模式。
//   surfaces: 长度 ≥3 且出现 ≥2 次（可信词素表面，含 stem 与词根）
//   prefixes: 只在词首出现、长度 ≥2 且出现 ≥3 次
//   suffixes: 只在词尾出现、长度 ≥2 且出现 ≥3 次
// 模式（命中即用，按优先级）：
//   ① prefix + surface      ② surface + suffix
//   ③ prefix + surface + suffix
//   ④ surface + surface（词素+词素，如 tele + gram）
//
// 输出  scripts/.work/derived/splits-rule.json
// 跑法：node scripts/tools/rule-split.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const rawDir = join(here, '..', '.work', 'raw')
const derivedDir = join(here, '..', '.work', 'derived')
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

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
const examWords = new Set()
for (const line of readFileSync(join(rawDir, 'ecdict.csv'), 'utf8').split('\n').slice(1)) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const w = norm(f[0])
  if (!w) continue
  const tags = (f[7] || '').split(' ').filter(Boolean)
  if (tags.some((t) => ['zk', 'gk', 'cet4', 'cet6'].includes(t))) examWords.add(w)
}

const fused = JSON.parse(readFileSync(join(derivedDir, 'splits-fused.json'), 'utf8'))
const covered = fused.splits

// ── 权威词素表面表 ──
// 只用「统计推断」会把 crystal 切成 cryst+al、sheet 切成 she+et（抽检 23%~42% 合理，不可用）。
// 所以切分用的段必须来自可信来源：
//   ① kaikki 高频词素（≥50 词）：ly / ion / un / re …
//   ② 候选词根的 id 与 allomorphs：spect / spic / cept …
const candidates = JSON.parse(readFileSync(join(derivedDir, 'roots.candidates.json'), 'utf8')).entries
const kaikkiAll = JSON.parse(readFileSync(join(derivedDir, 'kaikki-splits.json'), 'utf8'))
const kaikki = kaikkiAll.splits
const authoritative = new Set()
for (const m of kaikkiAll.topMorphemes || []) if (m.words >= 50) authoritative.add(m.id)
for (const c of candidates) {
  if (c.type !== 'root') continue
  const id = norm(c.id)
  if (id.length >= 3) authoritative.add(id)
  for (const a of c.allomorphs || []) {
    const s = norm(a)
    if (s.length >= 3) authoritative.add(s)
  }
}
const surfaceCount = new Map()
const headCount = new Map()
const tailCount = new Map()
const surfaceIds = new Map() // surface → 最常见 id（沿用已有规范式）
for (const info of Object.values(kaikki)) {
  const list = info.parts
  list.forEach((surface, i) => {
    surfaceCount.set(surface, (surfaceCount.get(surface) || 0) + 1)
    if (!surfaceIds.has(surface)) surfaceIds.set(surface, new Map())
    const ids = surfaceIds.get(surface)
    ids.set(surface, (ids.get(surface) || 0) + 1)
    if (i === 0) headCount.set(surface, (headCount.get(surface) || 0) + 1)
    if (i === list.length - 1) tailCount.set(surface, (tailCount.get(surface) || 0) + 1)
  })
}
// 已覆盖词的表面也并入（有些考试词表面只在那儿出现）
for (const info of Object.values(covered)) {
  info.parts.forEach((p, i) => {
    surfaceCount.set(p.surface, (surfaceCount.get(p.surface) || 0) + 1)
    if (!surfaceIds.has(p.surface)) surfaceIds.set(p.surface, new Map())
    surfaceIds.get(p.surface).set(p.id, (surfaceIds.get(p.surface).get(p.id) || 0) + 1)
    if (i === 0) headCount.set(p.surface, (headCount.get(p.surface) || 0) + 1)
    if (i === info.parts.length - 1) tailCount.set(p.surface, (tailCount.get(p.surface) || 0) + 1)
  })
}
// 切分用的段必须在权威表里，且位置出现次数够多
const surfaces = new Set([...authoritative])
const prefixes = new Set([...authoritative].filter((s) => s.length >= 3 && (headCount.get(s) || 0) >= 20))
const suffixes = new Set([...authoritative].filter((s) => s.length >= 2 && (tailCount.get(s) || 0) >= 20))
const idOf = (surface) => {
  const ids = surfaceIds.get(surface)
  if (!ids) return surface
  return [...ids.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

// ── 对未覆盖考试词尝试切分 ──
const MIN = 2
const additions = {}
const patterns = { 'prefix+surface': 0, 'surface+suffix': 0, 'prefix+surface+suffix': 0, 'surface+surface': 0 }
for (const word of examWords) {
  if (covered[word]) continue
  const L = word.length
  if (L < 5) continue
  let parts = null; let kind = null
  // ① prefix + surface
  for (let i = MIN; i <= Math.min(L - 3, 12) && !parts; i += 1) {
    const a = word.slice(0, i); const b = word.slice(i)
    if (prefixes.has(a) && surfaces.has(b)) { parts = [a, b]; kind = 'prefix+surface' }
  }
  // ② surface + suffix —— **默认不用**
  // 抽检显示这个模式误拆率过半（don+ate、sen+ate、maj+or、sist+er）：
  // 英语里大量单语素词看起来像「词干+后缀」，统计规则区分不了。
  // 只保留前缀类模式（准确率明显更高），把保守留下的缺口交给人工。
  if (process.argv.includes('--with-suffix')) {
    for (let i = Math.max(3, L - 12); i <= L - MIN && !parts; i += 1) {
      const a = word.slice(0, i); const b = word.slice(i)
      if (surfaces.has(a) && suffixes.has(b)) { parts = [a, b]; kind = 'surface+suffix' }
    }
  }
  // ③ prefix + surface + suffix
  if (!parts) {
    for (let i = MIN; i <= Math.min(L - 5, 10) && !parts; i += 1) {
      for (let j = L - MIN; j >= i + 3 && !parts; j -= 1) {
        const a = word.slice(0, i); const b = word.slice(i, j); const c = word.slice(j)
        if (prefixes.has(a) && surfaces.has(b) && suffixes.has(c)) { parts = [a, b, c]; kind = 'prefix+surface+suffix' }
      }
    }
  }
  if (!parts) continue
  patterns[kind] += 1
  additions[word] = {
    parts: parts.map((s) => ({ id: idOf(s), surface: s })),
    source: `rule-${kind}`,
    confidence: 'medium',
    aligned: false,
  }
}

const totalCovered = Object.keys(covered).length + Object.keys(additions).length

console.log(`未覆盖考试词 ${examWords.size - Object.keys(covered).length} 个 → 规则补出 ${Object.keys(additions).length} 个`)
console.log(`模式分布：` + Object.entries(patterns).map(([k, v]) => `${k}=${v}`).join('  '))
console.log(`总覆盖：${totalCovered} / ${examWords.size}（${(totalCovered / examWords.size * 100).toFixed(1)}%）`)
if (existsSync(join(derivedDir, 'splits-rule.json'))) console.log('（已覆盖旧 splits-rule.json）')

// 合并进一份总表，供后续 S2 直接用
const merged = { ...covered }
for (const [w, info] of Object.entries(additions)) merged[w] = info
const morphemeWords = new Map()
for (const [word, info] of Object.entries(merged)) {
  for (const p of new Set(info.parts.map((x) => x.id))) {
    if (!morphemeWords.has(p)) morphemeWords.set(p, new Set())
    morphemeWords.get(p).add(word)
  }
}
const rank = [...morphemeWords.entries()].map(([id, ws]) => ({ id, words: ws.size })).sort((a, b) => b.words - a.words)
for (const min of [3, 5, 10, 20]) {
  const hit = rank.filter((m) => m.words >= min)
  const words = new Set()
  for (const m of hit) for (const w of morphemeWords.get(m.id)) words.add(w)
  console.log(`  ≥${String(min).padStart(2)} 考试词的词素：${String(hit.length).padStart(4)} 个 → 覆盖 ${words.size} 词`)
}

writeFileSync(join(derivedDir, 'splits-rule.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  summary: { additions: Object.keys(additions).length, patterns, totalCovered, examWords: examWords.size },
  additions,
}, null, 1), 'utf8')
writeFileSync(join(derivedDir, 'splits-merged.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  summary: { examWords: examWords.size, covered: totalCovered, morphemes: rank.length },
  splits: merged,
  morphemeRank: rank.slice(0, 3000),
}, null, 1), 'utf8')
console.log(`\n已写 splits-rule.json 与 splits-merged.json（合并总表，S2 用它）`)
