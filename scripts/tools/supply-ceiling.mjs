// Stage 3 天花板实证：**可切分口径**的合格词根数。
//
// 与 supply-analysis-strict.mjs 的关键区别：那个脚本量的是「有多少词与这个词根有关」，
// 本脚本量的是「有多少词真的能切出这个词根」——这才是加词时真正卡人的约束，
// 因为 21 号切分器要产出 parts.surface 拼接 = 原词的切分，写不出来就是 A5/A23 红。
//
// 判据：
//   a) cigen 人工切分（components.morpheme 归一化全等于词根 surface）← 边界权威，直接用
//   b) wordroot.txt 例词 / MorphyNet 派生词 → **必须字面包含 surface（或 ≥3 字的 allomorph）**
//      （不校验包含性就会重演 `non`(nine) 匹配到 sense/ability 的错配）
//   再并集过 6.2（考试词表+常用度）、6.4（难度），按 A23 判定。
//
// 输出  scripts/.work/derived/ceiling.json + 控制台摘要
// 跑法：node scripts/tools/supply-ceiling.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const rawDir = join(here, '..', '.work', 'raw')
const derivedDir = join(here, '..', '.work', 'derived')
const libDir = join(here, '..', 'lib')
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

// ── ECDICT（列序 0 word / 5 collins / 6 oxford / 7 tag / 8 bnc / 9 frq） ──
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
const ecdict = new Map()
for (const line of readFileSync(join(rawDir, 'ecdict.csv'), 'utf8').split('\n').slice(1)) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const w = norm(f[0])
  if (!w) continue
  ecdict.set(w, {
    tag: (f[7] || '').split(' ').filter(Boolean),
    collins: Number(f[5] || 0),
    oxford: Number(f[6] || 0),
    bnc: Number(f[8] || 0),
    frq: Number(f[9] || 0),
  })
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
const canForce = (e) => {
  const d = difficultyFor(e)
  return d === 5 && e.tag.some((t) => ['toefl', 'ielts', 'gre', 'cet6'].includes(t))
}

// ── 信号索引 ──
const cigen = JSON.parse(readFileSync(join(rawDir, 'cigen-roots_affixes.json'), 'utf8'))
const cigenCut = new Map() // surface → Set(word)：cigen 人工切分把 word 切成了这个 morpheme
for (const entry of cigen.entries || []) {
  for (const comp of entry.components || []) {
    const m = norm(comp.morpheme)
    if (!m) continue
    if (!cigenCut.has(m)) cigenCut.set(m, new Set())
    cigenCut.get(m).add(norm(entry.word))
  }
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
const cfg = JSON.parse(readFileSync(join(libDir, 'stage3-content.json'), 'utf8'))
const legacy = JSON.parse(readFileSync(join(libDir, 'legacy-morphemes.json'), 'utf8'))
// 已用词根的**全部表面形式**：只看 id 会把 spect 当新根（它其实是 spec 的变体），
// 从而高估天花板。只要候选的任何表面与已用词根的任何表面重叠，就按已用算（保守）。
const usedSurfaces = new Set()
for (const m of [...cfg.extraMorphemes, ...legacy.morphemes]) {
  if (m.type !== 'root') continue
  usedSurfaces.add(norm(m.id))
  for (const a of m.allomorphs || []) {
    const s = norm(a)
    if (s) usedSurfaces.add(s)
  }
}
const isUsed = (c) => [c.id, ...(c.allomorphs || [])].map(norm).filter(Boolean).some((s) => usedSurfaces.has(s))

const surfaceList = (c) => [...new Set([c.id, ...(c.allomorphs || [])].map(norm).filter((s) => s.length >= 3))]
// 词根落在词尾且前面还有别的成分 → 多半是复合词尾或后缀位，不是这个词根。
// 只对 MorphyNet 派生关系用这条（抽检发现复合词误判全来自它）：king|dom、police|man。
// cigen 是人工切分（边界权威）、词典例词是人工整理，都不能用位置规则——
// 否则会把 attend / extend / intend（at|tend 这种「前缀+词根」结构）误杀。
const tailOnly = (word, surface) => word.endsWith(surface) && word.length > surface.length + 1
// 字面包含判定：≥4 字用 includes；3 字要求首尾对齐（避免 sta 匹配 state 之外的一堆词）
const contains = (word, surface) => (surface.length >= 4 ? word.includes(surface)
  : word.startsWith(surface) || word.endsWith(surface))

function collectWords(c) {
  const surfaces = surfaceList(c)
  const words = new Map()
  for (const s of surfaces) {
    for (const w of cigenCut.get(s) || []) words.set(w, 'cigen')
  }
  for (const w of (c.examples || []).map(norm)) {
    if (!w) continue
    if (surfaces.some((s) => contains(w, s))) words.set(w, words.get(w) || 'wordroot')
  }
  for (const s of surfaces) {
    for (const w of morphByMorpheme.get(s) || []) {
      if (contains(w, s) && !tailOnly(w, s)) words.set(w, words.get(w) || 'morphynet')
    }
  }
  return { surfaces, words }
}

function stat(words, allowForce, requireD5) {
  const usable = []
  for (const [w, src] of words) {
    const e = ecdict.get(w)
    if (!e) continue
    const ok = pass62(e)
    if (!ok && !(allowForce && canForce(e))) continue
    usable.push({ word: w, d: difficultyFor(e), src, forced: !ok })
  }
  const d1 = usable.filter((x) => x.d === 1).length
  const d5 = usable.filter((x) => x.d === 5).length
  return {
    total: usable.length, d1, d3: usable.length - d1 - d5, d5,
    qualified: usable.length >= 3 && d1 >= 1 && (!requireD5 || d5 >= 1),
    usable,
  }
}

const results = []
for (const c of candidates) {
  if (c.type !== 'root') continue
  const { surfaces, words } = collectWords(c)
  const strict = stat(words, false, true)      // X1 严格 6.2 + 完整 A23
  const force = stat(words, true, true)        // X2 允许 forceInclude + 完整 A23（Stage 2 口径）
  const looseD5 = stat(words, true, false)     // X3 允许保送 + 放宽「必须有 d5」
  results.push({
    id: c.id,
    glossEn: c.glossEn,
    used: isUsed(c),
    hasConflict: (c.conflicts || []).length > 0,
    surfaces,
    strict: { total: strict.total, d1: strict.d1, d5: strict.d5, qualified: strict.qualified },
    force: { total: force.total, d1: force.d1, d5: force.d5, qualified: force.qualified },
    looseD5: { total: looseD5.total, d1: looseD5.d1, d5: looseD5.d5, qualified: looseD5.qualified },
    sample: force.usable.slice(0, 10).map((x) => `${x.word}/d${x.d}${x.forced ? 'F' : ''}`),
    usable: force.usable.map((x) => `${x.word}/d${x.d}${x.forced ? 'F' : ''}/${x.src}`),
  })
}

// ── 详情模式：抽检某个词根的完整可用词（选根/复核时用） ──
// 跑法：node scripts/tools/supply-ceiling.mjs --detail man tend mill
if (process.argv[2] === '--detail') {
  for (const id of process.argv.slice(3)) {
    const r = results.find((x) => x.id === id)
    if (!r) { console.log(`\n${id}：候选表里没有这个词根`); continue }
    console.log(`\n${id}（${r.glossEn || '—'}）表面=${r.surfaces.join('/')} 已用=${r.used} 冲突=${r.hasConflict}`)
    console.log(`  X1 供${r.strict.total}/d1=${r.strict.d1}/d5=${r.strict.d5} ${r.strict.qualified ? '合格' : '不合格'}`)
    console.log(`  X2 供${r.force.total}/d1=${r.force.d1}/d5=${r.force.d5} ${r.force.qualified ? '合格' : '不合格'}`)
    console.log(`  词表：${r.usable.join('  ') || '（空）'}`)
  }
  process.exit(0)
}

const unused = results.filter((r) => !r.used)
const x1 = results.filter((r) => r.strict.qualified)
const x2 = results.filter((r) => r.force.qualified)
const x3 = results.filter((r) => r.looseD5.qualified)
const u1 = unused.filter((r) => r.strict.qualified)
const u2 = unused.filter((r) => r.force.qualified)
const u3 = unused.filter((r) => r.looseD5.qualified)
const fail = { tooFew: 0, noD1: 0, noD5: 0 }
for (const r of unused) {
  if (r.force.qualified) continue
  if (r.force.total < 3) fail.tooFew += 1
  else if (r.force.d1 === 0) fail.noD1 += 1
  else fail.noD5 += 1
}

console.log(`候选词根 ${results.length} 个（已用 ${results.length - unused.length} / 未用 ${unused.length}）\n`)
console.log(`【X1 严格 6.2 + 完整 A23】合格 ${x1.length} 个（未用 ${u1.length}）`)
console.log(`【X2 允许保送 + 完整 A23】合格 ${x2.length} 个（未用 ${u2.length}）  ← Stage 2 同口径`)
console.log(`【X3 允许保送 + 放宽 d5】合格 ${x3.length} 个（未用 ${u3.length}）`)
console.log(`\n未用候选的失败原因（X2 口径）：词不足 3 个 ${fail.tooFew} / 缺 d1 ${fail.noD1} / 缺 d5 ${fail.noD5}`)
console.log(`同形异义或 type 冲突标记：${unused.filter((r) => r.hasConflict).length} 个（这些要人工判类型）`)
console.log(`\n天花板推算：已用 60 + X2 未用合格 ${u2.length} = ${60 + u2.length} 个；放宽 d5 则 ${60 + u3.length} 个`)
// 供给总量：合格词根一共能撑多少词（去重 —— 一个词可以属于多个词根，但只能上一次）
const distinctWords = new Set()
let sumWords = 0
for (const r of x2) {
  sumWords += r.usable.length
  for (const item of r.usable) distinctWords.add(item.split('/')[0])
}
const perRoot = x2.length ? (sumWords / x2.length).toFixed(1) : '0'
console.log(`\n供给总量：X2 合格 ${x2.length} 个词根，可用词合计 ${sumWords} 条（去重后 ${distinctWords.size} 个不同单词），平均每根 ${perRoot} 词`)
console.log(`  → 若只保留未用合格 ${u2.length} 个词根，能加的词（去重）约 ${new Set(u2.flatMap((r) => r.usable.map((x) => x.split('/')[0]))).size} 个`)

console.log(`\n未用候选里 X2 合格、按可供给词数排序：`)
for (const r of u2.sort((a, b) => b.force.total - a.force.total)) {
  console.log(`  ${r.id.padEnd(9)} 供${String(r.force.total).padStart(3)} d1=${String(r.force.d1).padStart(3)} d5=${String(r.force.d5).padStart(2)}${r.hasConflict ? ' ⚠冲突' : ''}  ${(r.glossEn || '').split(',')[0].slice(0, 14).padEnd(15)} :: ${r.sample.slice(0, 5).join(', ')}`)
}
console.log(`\nX3 比 X2 多出来的（只差 d5）：`)
for (const r of u3.filter((r) => !r.force.qualified).sort((a, b) => b.looseD5.total - a.looseD5.total).slice(0, 30)) {
  console.log(`  ${r.id.padEnd(9)} 供${String(r.looseD5.total).padStart(3)} d1=${String(r.looseD5.d1).padStart(3)}  ${(r.glossEn || '').split(',')[0].slice(0, 14).padEnd(15)} :: ${r.sample.slice(0, 5).join(', ')}`)
}

mkdirSync(derivedDir, { recursive: true })
writeFileSync(join(derivedDir, 'ceiling.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  summary: {
    candidates: results.length, used: results.length - unused.length, unused: unused.length,
    x1: x1.length, x2: x2.length, x3: x3.length,
    unusedX1: u1.length, unusedX2: u2.length, unusedX3: u3.length,
    fail, ceilingWithD5: 60 + u2.length, ceilingLooseD5: 60 + u3.length,
  },
  roots: results,
}, null, 1), 'utf8')
console.log(`\n全量结果已写 scripts/.work/derived/ceiling.json`)
