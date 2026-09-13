// Stage 3.0 第 1 项：精确词根供给测算（严格版）
//
// 与旧版 supply-analysis.mjs 的唯一区别：**去掉裸子串匹配**。
// 旧版 252 个合格词根里混进了 government→mit、state→man 这类假供给，数字虚高。
// 本脚本只认三个硬信号：
//   a) wordroot.txt 权威例词（候选条目自带 examples，ECDICT MIT，许可干净）
//   b) cigen 人工切分（components.morpheme 归一化后**全等**于词根 surface）
//   c) MorphyNet 派生关系（第 5 列 morpheme 全等于 surface → 取 word 与 derived）
// 三者并集再过 6.2（考试词表 + 常用度）与 6.4（难度），最后按 A23（≥3 词且 d1/d5 各≥1）判定。
//
// 同时保留旧口径（含子串）以便对比，量化「有多少词根是只靠子串才凑齐的」。
//
// 输出  scripts/.work/derived/supply-strict.json + 控制台摘要
// 跑法：node scripts/tools/supply-analysis-strict.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const rawDir = join(here, '..', '.work', 'raw')
const derivedDir = join(here, '..', '.work', 'derived')
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

// ── ECDICT ──
function parseCsvLine(line) {
  const out = []; let cur = ''; let inQ = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1 } else inQ = false } else cur += ch }
    else { if (ch === '"') inQ = true; else if (ch === ',') { out.push(cur); cur = '' } else cur += ch }
  }
  out.push(cur); return out
}
const ecdict = new Map()
for (const line of readFileSync(join(rawDir, 'ecdict.csv'), 'utf8').split('\n')) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const w = norm(f[0])
  if (!w) continue
  ecdict.set(w, { tag: (f[7] || '').split(' ').filter(Boolean), collins: Number(f[5] || 0), oxford: Number(f[6] || 0), bnc: Number(f[8] || 0), frq: Number(f[9] || 0) })
}
const difficultyFor = (e) => {
  if (e.tag.includes('zk') || e.tag.includes('gk') || e.collins === 5 || (e.bnc > 0 && e.bnc < 3000)) return 1
  if ((e.tag.includes('cet6') || e.tag.includes('toefl')) && (e.bnc > 10000 || e.bnc === 0)) return 5
  return 3
}
const pass62 = (e) => {
  const passTag = e.tag.some((t) => ['zk', 'gk', 'cet4', 'cet6'].includes(t))
  const passCom = Boolean(e.collins || e.oxford) || (e.bnc > 0 && e.bnc < 20000) || (e.frq > 0 && e.frq < 20000)
  return passTag && passCom
}

// ── 三个硬信号索引 ──
const cigen = JSON.parse(readFileSync(join(rawDir, 'cigen-roots_affixes.json'), 'utf8'))
const cigenByMorpheme = new Map()
for (const e of cigen.entries || []) {
  for (const c of e.components || []) {
    const m = norm(c.morpheme)
    if (!m) continue
    if (!cigenByMorpheme.has(m)) cigenByMorpheme.set(m, new Set())
    cigenByMorpheme.get(m).add(norm(e.word))
  }
}
const cigenRootSamples = new Map()
for (const r of cigen.roots || []) {
  const id = norm(r.root)
  if (!id) continue
  cigenRootSamples.set(id, (r.sampleWords || []).map(norm).filter(Boolean))
}
const morphByMorpheme = new Map()
if (existsSync(join(rawDir, 'morphynet-eng-derivational.tsv'))) {
  for (const line of readFileSync(join(rawDir, 'morphynet-eng-derivational.tsv'), 'utf8').split('\n')) {
    const cols = line.split('\t')
    if (cols.length < 6) continue
    const m = norm(cols[4])
    if (!m) continue
    if (!morphByMorpheme.has(m)) morphByMorpheme.set(m, new Set())
    morphByMorpheme.get(m).add(norm(cols[0]))
    morphByMorpheme.get(m).add(norm(cols[1]))
  }
}

const candidates = JSON.parse(readFileSync(join(derivedDir, 'roots.candidates.json'), 'utf8')).entries

function collectStrict(c) {
  const surfaces = [...new Set([c.id, ...(c.allomorphs || []).map(norm)].map(norm).filter(Boolean))]
  const words = new Map() // word → 来源
  for (const w of c.examples || []) words.set(norm(w), 'wordroot')
  for (const s of surfaces) {
    for (const w of cigenByMorpheme.get(s) || []) if (!words.has(w)) words.set(w, 'cigen')
    for (const w of cigenRootSamples.get(s) || []) if (!words.has(w)) words.set(w, 'cigen-root')
    for (const w of morphByMorpheme.get(s) || []) if (!words.has(w)) words.set(w, 'morphynet')
  }
  return { surfaces, words }
}
function collectLoose(c, strictWords) {
  const out = new Map(strictWords)
  const surfaces = [...new Set([c.id, ...(c.allomorphs || [])].map(norm).filter(Boolean))]
  for (const s of surfaces) {
    for (const [w] of ecdict) {
      if (out.has(w)) continue
      if (s.length >= 4) { if (w.includes(s)) out.set(w, 'substring') }
      else if (s.length === 3) { if (w.startsWith(s) || w.endsWith(s)) out.set(w, 'substring') }
    }
  }
  return out
}
// Stage 2 实践：难度=5 且带 toefl/ielts/gre/cet6 标签的词，可经 forceInclude 保送进词库
// （6.2 的常用度不达标也能保送）。测算必须模拟这个口径，否则会低估真实可用的词根数。
const canForce = (e) => {
  const d = difficultyFor(e)
  return d === 5 && e.tag.some((t) => ['toefl', 'ielts', 'gre', 'cet6'].includes(t))
}
function stat(words, allowForce = false) {
  const usable = []
  for (const [w, src] of words) {
    const e = ecdict.get(w)
    if (!e) continue
    const ok62 = pass62(e)
    if (!ok62 && !(allowForce && canForce(e))) continue
    usable.push({ word: w, d: difficultyFor(e), src, forced: !ok62 })
  }
  const d1 = usable.filter((x) => x.d === 1).length
  const d5 = usable.filter((x) => x.d === 5).length
  return { usable, total: usable.length, d1, d3: usable.length - d1 - d5, d5, qualified: usable.length >= 3 && d1 >= 1 && d5 >= 1 }
}

const results = []
for (const c of candidates) {
  if (c.type !== 'root') continue
  const strict = collectStrict(c)
  const loose = collectLoose(c, strict.words)
  const s = stat(strict.words)            // 严格：去子串 + 严格 6.2
  const sf = stat(strict.words, true)     // 去子串 + 允许 forceInclude（Stage 2 实际口径）
  const l = stat(loose)                   // 含子串 + 严格 6.2（旧口径）
  results.push({
    id: c.id, glossEn: c.glossEn,
    strict: { total: s.total, d1: s.d1, d3: s.d3, d5: s.d5, qualified: s.qualified },
    withForce: { total: sf.total, d1: sf.d1, d3: sf.d3, d5: sf.d5, qualified: sf.qualified },
    loose: { total: l.total, qualified: l.qualified },
    onlyBySubstring: l.qualified && !s.qualified,
    sample: sf.usable.slice(0, 12).map((x) => `${x.word}/d${x.d}${x.forced ? 'F' : ''}`),
  })
}

const strictQ = results.filter((r) => r.strict.qualified)
const forceQ = results.filter((r) => r.withForce.qualified)
const looseQ = results.filter((r) => r.loose.qualified)
const noise = results.filter((r) => r.onlyBySubstring)
const nearMiss = results.filter((r) => !r.withForce.qualified && r.withForce.total >= 3)
const tooFew = results.filter((r) => r.withForce.total < 3)

// 供给能力分档（合格词根里，能供多少词）
const byCapacity = { '3-4': 0, '5-6': 0, '7-9': 0, '10+': 0 }
for (const r of forceQ) {
  const n = r.withForce.total
  if (n <= 4) byCapacity['3-4'] += 1
  else if (n <= 6) byCapacity['5-6'] += 1
  else if (n <= 9) byCapacity['7-9'] += 1
  else byCapacity['10+'] += 1
}
// 全局可供给词数（去重，词可能属于多个词根）
const allWords = new Set()
for (const r of strictQ) for (const s of r.sample) allWords.add(s.split('/')[0])

console.log(`候选词根 ${results.length} 个（候选表 type=root）`)
console.log(`\n【口径 A 去子串 + 严格 6.2】A23 合格：${strictQ.length} 个`)
console.log(`【口径 B 去子串 + 允许 forceInclude】A23 合格：${forceQ.length} 个  ← Stage 2 实际做法`)
console.log(`【口径 C 含子串 + 严格 6.2（旧脚本）】A23 合格：${looseQ.length} 个`)
console.log(`\n只靠子串才凑齐（噪声）：${noise.length} 个`)
console.log(`口径 B 下差一点（≥3 词但缺 d1 或 d5）：${nearMiss.length} 个`)
console.log(`口径 B 下词根本不够 3 个：${tooFew.length} 个`)
console.log(`\n合格词根的供给能力分档（口径 B）：3-4词 ${byCapacity['3-4']} / 5-6词 ${byCapacity['5-6']} / 7-9词 ${byCapacity['7-9']} / 10+词 ${byCapacity['10+']}`)
console.log(`\n供给最多的 25 个词根（口径 B，F 标记=需 forceInclude 保送）：`)
for (const r of forceQ.sort((a, b) => b.withForce.total - a.withForce.total).slice(0, 25)) {
  console.log(`  ${r.id.padEnd(8)} 供${String(r.withForce.total).padStart(3)}  d1=${String(r.withForce.d1).padStart(3)} d5=${String(r.withForce.d5).padStart(2)}  ${r.glossEn || ''}`)
}
console.log(`\n差一点没合格的（有 ≥3 词但缺 d1 或 d5），前 20：`)
for (const r of nearMiss.sort((a, b) => b.strict.total - a.strict.total).slice(0, 20)) {
  console.log(`  ${r.id.padEnd(8)} 供${String(r.strict.total).padStart(3)}  d1=${r.strict.d1} d5=${r.strict.d5}  ${r.glossEn || ''}`)
}

mkdirSync(derivedDir, { recursive: true })
writeFileSync(join(derivedDir, 'supply-strict.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  summary: {
    candidateRoots: results.length,
    strictQualified: strictQ.length,
    looseQualified: looseQ.length,
    noiseOnlyBySubstring: noise.length,
    nearMiss: nearMiss.length, tooFew: tooFew.length,
    capacity: byCapacity,
  },
  // 存口径 B（Stage 2 实际做法）作为决策依据；口径 A 的计数在 summary 里保留
  qualified: forceQ.map((r) => ({ id: r.id, glossEn: r.glossEn, ...r.withForce, strictQualified: r.strict.qualified, sample: r.sample })),
  nearMiss: nearMiss.map((r) => ({ id: r.id, glossEn: r.glossEn, ...r.strict, sample: r.sample })),
}, null, 1), 'utf8')
console.log(`\n全量结果已写 scripts/.work/derived/supply-strict.json`)
