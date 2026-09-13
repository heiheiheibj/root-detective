// Stage 2 go/no-go 供给分析：563 个候选词素里，哪些词根能凑齐 A23
// （每词根 ≥3 个考试词，且 d1/d5 各 ≥1）。
//
// 供给信号（并集，全部映射回 ECDICT 词条取难度）：
//   a) wordroot.txt 例词（候选条目自带 examples，权威）
//   b) morphynet 派生关系（morpheme == id/allomorph → word + derived）
//   c) cigen 953 条人工切分（components.morpheme == id → word）+ cigen.roots 样例词
//   d) 子串匹配（len≥4 用 includes；len==3 只认首尾；len≤2 跳过——纯噪声）
//
// 难度口径与 6.4 一致；6.2 考试词表 = zk/gk/cet4/cet6。
// 另统计「扩展供给」：仅标 toefl/ielts/gre 的词（进词库要靠 forceInclude，Stage 1 已有先例）。
//
// 输出  scripts/.work/derived/supply-analysis.json（全量）
//        控制台摘要（合格词根排行 + Stage 1 的 20 根复检）
//
// 跑法：node scripts/tools/supply-analysis.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const rawDir = join(here, '..', '.work', 'raw')
const derivedDir = join(here, '..', '.work', 'derived')

// ── ECDICT：单遍建 Map（77 万行，别在循环里整表扫） ─────────────────────────
function parseCsvLine(line) {
  const out = []; let cur = ''; let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false } else cur += ch }
    else { if (ch === '"') inQ = true; else if (ch === ',') { out.push(cur); cur = '' } else cur += ch }
  }
  out.push(cur); return out
}
const ecdictPath = join(rawDir, 'ecdict.csv')
if (!existsSync(ecdictPath)) { console.error('缺少 ecdict.csv'); process.exit(1) }

/** 6.4 难度规则（与 20 号一致） */
function difficultyFor(tags, collins, bnc) {
  const easy = tags.includes('zk') || tags.includes('gk') || Number(collins) === 5 || (bnc > 0 && bnc < 3000)
  if (easy) return 1
  const hard = (tags.includes('cet6') || tags.includes('toefl')) && (bnc > 10000 || bnc === 0)
  if (hard) return 5
  return 3
}

const ecdict = new Map() // word → { tags:Set, collins, oxford, bnc, frq, difficulty }
for (const line of readFileSync(ecdictPath, 'utf8').split('\n')) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const word = (f[0] || '').toLowerCase()
  if (!word || !/^[a-z][a-z-]*$/.test(word)) continue
  const tags = (f[7] || '').split(' ').filter(Boolean)
  ecdict.set(word, {
    tags: new Set(tags),
    collins: f[5] || '', oxford: f[6] || '',
    bnc: Number(f[8] || 0), frq: Number(f[9] || 0),
  })
}
function examLevel(w) {
  const e = ecdict.get(w)
  if (!e) return null
  const strict = ['zk', 'gk', 'cet4', 'cet6'].some((t) => e.tags.has(t))
  const extended = ['toefl', 'ielts', 'gre'].some((t) => e.tags.has(t))
  if (!strict && !extended) return null
  return { level: strict ? 'strict' : 'extended', difficulty: difficultyFor([...e.tags], e.collins, e.bnc), entry: e }
}
// 6.3 打分（选词排序用）
function score6dot3(e) {
  let s = 0
  if (e.collins) s += 3
  if (e.oxford) s += 2
  if (['cet4', 'gk', 'zk'].some((t) => e.tags.has(t))) s += 2
  if (e.tags.has('cet6')) s += 1
  s += e.bnc > 0 ? -Math.log10(e.bnc) : -6
  return s
}

// ── Stage 1 已用词（标记，不算新增供给） ────────────────────────────────────
const stage1 = JSON.parse(readFileSync(join(here, '..', 'lib', 'stage1-content.json'), 'utf8'))
const stage1Words = new Set(Object.values(stage1.families).flatMap((f) => f.words))

// ── 供给信号源 ─────────────────────────────────────────────────────────────
const candidates = JSON.parse(readFileSync(join(derivedDir, 'roots.candidates.json'), 'utf8')).entries
const cigen = JSON.parse(readFileSync(join(rawDir, 'cigen-roots_affixes.json'), 'utf8'))
// cigen 人工切分：morpheme → words
const cigenByMorpheme = new Map()
for (const e of cigen.entries || []) {
  for (const c of e.components || []) {
    const m = String(c.morpheme || '').toLowerCase().replace(/[^a-z]/g, '')
    if (!m) continue
    if (!cigenByMorpheme.has(m)) cigenByMorpheme.set(m, new Set())
    cigenByMorpheme.get(m).add(e.word.toLowerCase())
  }
}
const cigenRoots = new Map()
for (const r of cigen.roots || []) {
  const id = String(r.root || '').toLowerCase().replace(/[^a-z]/g, '')
  if (!id) continue
  cigenRoots.set(id, (r.sampleWords || []).map((w) => String(w).toLowerCase()))
}
// morphynet：morpheme → words
const morphynetPath = join(rawDir, 'morphynet-eng-derivational.tsv')
const morphynetByMorpheme = new Map()
for (const line of readFileSync(morphynetPath, 'utf8').split('\n')) {
  const cols = line.split('\t')
  if (cols.length < 6) continue
  const m = cols[4].toLowerCase().replace(/[^a-z]/g, '')
  if (!m) continue
  if (!morphynetByMorpheme.has(m)) morphynetByMorpheme.set(m, new Set())
  morphynetByMorpheme.get(m).add(cols[0].toLowerCase())
  morphynetByMorpheme.get(m).add(cols[1].toLowerCase())
}

// ── 逐词根统计 ─────────────────────────────────────────────────────────────
const bySource = { wordroot: 2, morphynet: 1, cigen: 1, substring: 0 } // 来源权重（只用于排序供给词）
const results = []
for (const c of candidates) {
  if (c.type !== 'root') continue
  const id = c.id
  const surfaces = [...new Set([id, ...(c.allomorphs || []).map((s) => String(s).toLowerCase().replace(/[^a-z]/g, ''))].filter(Boolean))]
  const supply = new Map() // word → best source weight

  const addWord = (w, src) => {
    if (!w || !/^[a-z][a-z-]*$/.test(w)) return
    const prev = supply.get(w)
    if (prev === undefined || bySource[src] > prev) supply.set(w, bySource[src])
  }
  for (const w of c.examples || []) addWord(String(w).toLowerCase(), 'wordroot')
  for (const s of surfaces) {
    for (const w of morphynetByMorpheme.get(s) || []) addWord(w, 'morphynet')
    for (const w of cigenByMorpheme.get(s) || []) addWord(w, 'cigen')
    for (const w of cigenRoots.get(s) || []) addWord(w, 'cigen')
  }
  // 子串：len≥4 includes；len==3 首尾；≤2 跳过
  for (const [w] of [...ecdict].slice(0, 0)) break // noop，防误用
  for (const s of surfaces) {
    if (s.length >= 4) {
      for (const [w] of ecdict) if (w.includes(s)) addWord(w, 'substring')
    } else if (s.length === 3) {
      for (const [w] of ecdict) if (w.startsWith(s) || w.endsWith(s)) addWord(w, 'substring')
    }
  }

  // 映射到考试词 + 难度
  const words = []
  for (const [w] of supply) {
    const lvl = examLevel(w)
    if (!lvl) continue
    words.push({ word: w, difficulty: lvl.difficulty, exam: lvl.level, stage1Used: stage1Words.has(w), score: score6dot3(lvl.entry) })
  }
  const strictWords = words.filter((x) => x.exam === 'strict')
  const newStrict = strictWords.filter((x) => !x.stage1Used)
  const pool = strictWords.length ? strictWords : newStrict
  const d1 = pool.filter((x) => x.difficulty === 1).length
  const d5 = pool.filter((x) => x.difficulty === 5).length
  const qualified = pool.length >= 3 && d1 >= 1 && d5 >= 1
  words.sort((a, b) => b.score - a.score)
  results.push({ id, type: c.type, glossEn: c.glossEn, qualified, total: pool.length, d1, d5, d3: pool.length - d1 - d5, extendedOnly: strictWords.length === 0 && words.length > 0, words: words.slice(0, 40).map((x) => ({ word: x.word, d: x.difficulty, exam: x.exam, used: x.stage1Used })) })
}

// ── 摘要 ───────────────────────────────────────────────────────────────────
const qualified = results.filter((r) => r.qualified).sort((a, b) => (b.d1 + b.d5) - (a.d1 + a.d5))
const unqualified = results.filter((r) => !r.qualified)
const stage1Ids = new Set(Object.keys(stage1.families))
const stage1Recheck = results.filter((r) => stage1Ids.has(r.id))

console.log(`候选 root 共 ${results.length} 个（563 中的 root 部分）`)
console.log(`A23 合格（≥3 词且 d1/d5 各≥1）：${qualified.length} 个`)
console.log(`其中全新（非 Stage 1 的 20 个）：${qualified.filter((r) => !stage1Ids.has(r.id)).length} 个\n`)

console.log('── Stage 1 的 20 根复检 ──')
for (const r of stage1Recheck) console.log(`  ${r.qualified ? '✓' : '✗'} ${r.id.padEnd(6)} 供 ${String(r.total).padStart(3)}  d1=${r.d1} d5=${r.d5}`)

console.log('\n── 合格词根 top 80（按 d1+d5 排）──')
for (const r of qualified.slice(0, 80)) {
  console.log(`  ${r.id.padEnd(8)} 供${String(r.total).padStart(4)}  d1=${String(r.d1).padStart(3)} d5=${String(r.d5).padStart(3)}  ${r.glossEn || ''}`)
}
console.log('\n── 接近合格（差 d5 或差词数）的前 30 ──')
const near = unqualified.filter((r) => r.total >= 3).sort((a, b) => (b.d1 + b.d5) - (a.d1 + a.d5)).slice(0, 30)
for (const r of near) console.log(`  ${r.id.padEnd(8)} 供${String(r.total).padStart(4)}  d1=${r.d1} d5=${r.d5}  ${r.glossEn || ''}`)

mkdirSync(derivedDir, { recursive: true })
writeFileSync(join(derivedDir, 'supply-analysis.json'), JSON.stringify({ generatedAt: new Date().toISOString(), summary: { candidates: results.length, qualified: qualified.length }, results }, null, 1))
console.log(`\n全量数据已写 scripts/.work/derived/supply-analysis.json（含每根最多 40 个供给词）`)
