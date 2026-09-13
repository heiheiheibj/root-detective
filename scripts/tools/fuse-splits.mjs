// S1：融合多源，给考试词建立权威拆分（词 → 词素序列）。
//
// 五个来源，按可信度从高到低取第一个能给出合法拆分的：
//   1. kaikki 模板（surf/affix/prefix/suffix，Wiktionary 手工标注）      confidence=high
//   2. kaikki 词源文本（"equivalent to X + Y" 等句式）                   confidence=high
//   3. cigen 人工切分（953 条）                                          confidence=high
//   4. MorphyNet 派生关系（递归展开 base）                                confidence=medium
//   5. 复合词规则（word = A + B，两半都是常见英语词）                      confidence=medium
//
// **所有拆分必须通过「零件拼回来 == 原词」校验**（就是 A5 闸门那条），否则降级/丢弃。
//
// 输出  scripts/.work/derived/splits-fused.json
// 跑法：node scripts/tools/fuse-splits.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const rawDir = join(here, '..', '.work', 'raw')
const derivedDir = join(here, '..', '.work', 'derived')
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

// ── ECDICT：词集合 / 常见词集合 / 考试词 ──
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
const englishWords = new Set()
const commonWords = new Set()
const examWords = new Map()
for (const line of readFileSync(join(rawDir, 'ecdict.csv'), 'utf8').split('\n').slice(1)) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const w = norm(f[0])
  if (!w) continue
  englishWords.add(w)
  const collins = Number(f[5] || 0); const oxford = Number(f[6] || 0); const bnc = Number(f[8] || 0)
  // 词缀条目（ECDICT 里 tri-/pre- 这类）不算「实词」——否则 compound 规则会拆出
  // tribute = tri + bute 这种伪拆分。
  const isAffixEntry = /前缀|后缀|词根|^\[?(pre|suf|root)/i.test(f[3] || '')
  if (!isAffixEntry && (collins > 0 || oxford > 0 || (bnc > 0 && bnc < 30000))) commonWords.add(w)
  const tags = (f[7] || '').split(' ').filter(Boolean)
  if (tags.some((t) => ['zk', 'gk', 'cet4', 'cet6'].includes(t))) examWords.set(w, tags)
}

// ── 1/2. kaikki（模板 + 文本，已在之前提取） ──
const kaikki = JSON.parse(readFileSync(join(derivedDir, 'kaikki-splits.json'), 'utf8')).splits
const kaikkiByConfidence = { template: 'high', text: 'medium' }

// ── 3. cigen 人工切分 ──
const cigen = JSON.parse(readFileSync(join(rawDir, 'cigen-roots_affixes.json'), 'utf8'))
const cigenSplits = new Map()
for (const entry of cigen.entries || []) {
  const w = norm(entry.word)
  const parts = (entry.components || []).map((c) => norm(c.morpheme)).filter(Boolean)
  if (w && parts.length >= 2) cigenSplits.set(w, parts)
}

// ── 4. MorphyNet 派生关系：derived → [{ base, affix, type }] ──
const derivations = new Map()
if (existsSync(join(rawDir, 'morphynet-eng-derivational.tsv'))) {
  for (const line of readFileSync(join(rawDir, 'morphynet-eng-derivational.tsv'), 'utf8').split('\n')) {
    const cols = line.split('\t')
    if (cols.length < 6) continue
    const base = norm(cols[0]); const derived = norm(cols[1]); const affix = norm(cols[4]); const type = cols[5]
    if (!base || !derived || !affix) continue
    if (!derivations.has(derived)) derivations.set(derived, [])
    derivations.get(derived).push({ base, affix, type })
  }
}
const joinsTo = (parts, word) => parts.join('') === word

// ── 表面对齐 ────────────────────────────────────────────────────────────────
// Wiktionary 给的是**词源拆分**（ability = able + -ity），产品要的是**表面切分**
// （parts.surface 拼回来必须等于原词 → abil + ity）。两者差一个「词素变体」的距离，
// 用 DP 找切分点，使各段与对应词素的编辑距离之和最小。
function editDistance(a, b) {
  const m = a.length; const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i += 1) dp[i][0] = i
  for (let j = 0; j <= n; j += 1) dp[0][j] = j
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return dp[m][n]
}
function alignSurfaces(word, ids) {
  const n = ids.length; const L = word.length
  const INF = 1e9
  const dp = Array.from({ length: n + 1 }, () => new Array(L + 1).fill(INF))
  const from = Array.from({ length: n + 1 }, () => new Array(L + 1).fill(-1))
  dp[0][0] = 0
  for (let i = 1; i <= n; i += 1) {
    // 每段至少 1 个字符，且要给后面 n-i 段留够字符
    for (let j = i; j <= L - (n - i); j += 1) {
      for (let k = i - 1; k < j; k += 1) {
        if (dp[i - 1][k] >= INF) continue
        const cost = dp[i - 1][k] + editDistance(word.slice(k, j), ids[i - 1])
        // 用 <= 而非 <：代价打平时选「前段更长」的切法，让后缀保持完整
        // （snobbish 应切 snobb+ish，而不是 snob+bish）
        if (cost <= dp[i][j]) { dp[i][j] = cost; from[i][j] = k }
      }
    }
  }
  if (dp[n][L] >= INF) return null
  const cuts = []
  let j = L
  for (let i = n; i >= 1; i -= 1) { const k = from[i][j]; if (k < 0) return null; cuts.unshift([k, j]); j = k }
  return { surfaces: cuts.map(([a, b]) => word.slice(a, b)), cost: dp[n][L] }
}
/** 对齐容差：短词 2 个字符，长词按 25% 放宽。松了会错配，紧了救不回同化变体。 */
const tolerance = (word) => Math.max(2, Math.floor(word.length * 0.25))

/**
 * 统一入口：给定词素的规范形式，产出 { parts: [{id, surface}] }。
 * 拼接能对上直接用；对不上就对齐，超出容差则放弃。
 */
function buildParts(word, ids) {
  if (ids.length < 2 || ids.some((p) => !p)) return null
  if (joinsTo(ids, word)) return { parts: ids.map((id) => ({ id, surface: id })), aligned: false }
  const aligned = alignSurfaces(word, ids)
  if (!aligned || aligned.cost > tolerance(word)) return null
  return { parts: ids.map((id, i) => ({ id, surface: aligned.surfaces[i] })), aligned: true, cost: aligned.cost }
}
function splitByMorphyNet(word, depth = 0) {
  if (depth > 4) return null
  const list = derivations.get(word)
  if (!list) return null
  for (const d of list) {
    const baseParts = splitByMorphyNet(d.base, depth + 1) ?? [d.base]
    const parts = d.type === 'prefix' ? [d.affix, ...baseParts] : [...baseParts, d.affix]
    if (parts.length <= 5 && joinsTo(parts, word) && parts.every((p) => p.length >= 2)) return parts
  }
  return null
}

// ── 5. 复合词规则：word = A + B，两半都得是常见英语**实词** ──
// 不加这层约束会拆出 tribute = tri + bute（tri 是前缀条目）。
// 另要求至少一半有实义长度（≥4），避免 tri/bi/un 这类极短部件凑数。
function splitCompound(word) {
  for (let i = 3; i <= word.length - 3; i += 1) {
    const a = word.slice(0, i); const b = word.slice(i)
    if (!commonWords.has(a) || !commonWords.has(b)) continue
    if (a.length < 4 && b.length < 4) continue
    return [a, b]
  }
  return null
}

// ── 逐个考试词尝试 ──
const splits = {}
const stats = { kaikkiTemplate: 0, kaikkiText: 0, cigen: 0, morphynet: 0, compound: 0, aligned: 0, none: 0 }
const rejected = []
for (const [word] of examWords) {
  const k = kaikki[word]
  if (k) {
    const built = buildParts(word, k.parts)
    if (built) {
      splits[word] = {
        parts: built.parts,
        source: `kaikki-${k.template}`,
        // 对齐过的说明表面形式与词素规范式不同（如 able→abil），置信度降一档，S2 要写进 allomorphs
        confidence: built.aligned ? 'medium' : (kaikkiByConfidence[k.template] ?? 'high'),
        aligned: Boolean(built.aligned),
      }
      if (k.template === 'text') stats.kaikkiText += 1; else stats.kaikkiTemplate += 1
      if (built.aligned) stats.aligned += 1
      continue
    }
    rejected.push(`${word}: kaikki 对不齐（${k.parts.join('+')}）`)
  }
  const cg = cigenSplits.get(word)
  if (cg) {
    const built = buildParts(word, cg)
    if (built) {
      splits[word] = { parts: built.parts, source: 'cigen', confidence: 'high', aligned: Boolean(built.aligned) }
      stats.cigen += 1
      if (built.aligned) stats.aligned += 1
      continue
    }
  }
  const mn = splitByMorphyNet(word)
  if (mn) {
    splits[word] = { parts: mn.map((id) => ({ id, surface: id })), source: 'morphynet', confidence: 'medium', aligned: false }
    stats.morphynet += 1
    continue
  }
  const cp = splitCompound(word)
  if (cp) {
    splits[word] = { parts: cp.map((id) => ({ id, surface: id })), source: 'compound', confidence: 'medium', aligned: false }
    stats.compound += 1
    continue
  }
  stats.none += 1
}

const covered = Object.keys(splits).length
const bySource = {}
for (const [, v] of Object.entries(splits)) bySource[v.source] = (bySource[v.source] || 0) + 1
const byTag = {}
for (const tag of ['zk', 'gk', 'cet4', 'cet6']) {
  const total = [...examWords.values()].filter((tags) => tags.includes(tag)).length
  const cov = Object.keys(splits).filter((w) => examWords.get(w).includes(tag)).length
  byTag[tag] = { total, covered: cov, rate: +(cov / total * 100).toFixed(1) }
}
// 涉及词素
const morphemeWords = new Map()
for (const [word, info] of Object.entries(splits)) {
  for (const p of new Set(info.parts.map((part) => part.id))) {
    if (!morphemeWords.has(p)) morphemeWords.set(p, new Set())
    morphemeWords.get(p).add(word)
  }
}
const rank = [...morphemeWords.entries()].map(([id, ws]) => ({ id, words: ws.size })).sort((a, b) => b.words - a.words)

console.log(`考试词 ${examWords.size} 个 → 融合后覆盖 ${covered} 个（${(covered / examWords.size * 100).toFixed(1)}%），未覆盖 ${stats.none}`)
console.log(`来源分布：` + Object.entries(stats).filter(([k]) => !['none', 'rejected'].includes(k)).map(([k, v]) => `${k}=${v}`).join('  '))
console.log(`分层：` + Object.entries(byTag).map(([t, v]) => `${t} ${v.covered}/${v.total}(${v.rate}%)`).join('  '))
console.log(`涉及词素 ${rank.length} 个`)
for (const min of [1, 2, 3, 5, 10, 20]) {
  const hit = rank.filter((m) => m.words >= min)
  const words = new Set()
  for (const m of hit) for (const w of morphemeWords.get(m.id)) words.add(w)
  console.log(`  ≥${String(min).padStart(2)} 考试词的词素：${String(hit.length).padStart(5)} 个 → 覆盖 ${words.size} 词`)
}
console.log(`覆盖最多的 12 个词素：` + rank.slice(0, 12).map((m) => `${m.id}=${m.words}`).join(' '))
if (rejected.length) console.log(`\n拼不回被拒的（前 10）：\n  ` + rejected.slice(0, 10).join('\n  '))

writeFileSync(join(derivedDir, 'splits-fused.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  summary: { examWords: examWords.size, covered, stats, byTag, morphemes: rank.length },
  splits,
  morphemeRank: rank.slice(0, 3000),
}, null, 1), 'utf8')
console.log(`\n已写 scripts/.work/derived/splits-fused.json`)
