// 探针：对每个候选词根，能否通过 MorphyNet 链式派生到达 ECDICT 的 CET 词。
// 输出每个词根可达的 CET 词 + 链 + 每跳用到的词缀。
import { readFileSync, writeFileSync } from 'node:fs'

// ---- 1. 读 MorphyNet ----
const lines = readFileSync('scripts/.work/raw/morphynet-eng-derivational.tsv', 'utf8').split('\n')
const fromBase = new Map() // base -> [{derived, posS, posT, affix, type}]
for (const line of lines) {
  if (!line.trim()) continue
  const [base, derived, posS, posT, affix, type] = line.split('\t')
  if (!base || !derived || !affix) continue
  if (!fromBase.has(base)) fromBase.set(base, [])
  fromBase.get(base).push({ derived, posS, posT, affix, type })
}

// ---- 2. 读 ECDICT 建立词表 ----
function parseCsvLine(line) {
  const out = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else { if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = '' } else cur += c }
  }
  out.push(cur); return out
}
const ecdictList = readFileSync('scripts/.work/raw/ecdict.csv', 'utf8').split('\n').slice(1)
const wordInfo = new Map()
let n = 0
for (const line of ecdictList) {
  if (!line.trim()) continue
  const cols = parseCsvLine(line)
  wordInfo.set(cols[0].toLowerCase(), cols)
  n++
}
console.log('ecdict 行数:', n)

// ---- 3. 候选词根（含表面变体）----
const ROOTS = {
  spec: ['spec', 'spect', 'spic'],
  dict: ['dict', 'dic'],
  port: ['port'],
  vid: ['vid', 'vis', 'vise'],
  aud: ['aud', 'audi', 'audio'],
  cred: ['cred', 'credit'],
  duc: ['duc', 'duct', 'duce', 'decu'],
  fin: ['fin', 'fine'],
  form: ['form'],
  gen: ['gen', 'gener', 'genit'],
  grad: ['grad', 'grade', 'gress'],
  ject: ['ject', 'jac', 'jet'],
  lect: ['lect', 'leg', 'lig'],
  man: ['man', 'manu'],
  medi: ['medi', 'med'],
  mit: ['mit', 'mitt', 'miss', 'mis'],
  mob: ['mob', 'mot', 'mov', 'move'],
  nov: ['nov', 'nova'],
  struct: ['struct'],
  ten: ['ten', 'tent', 'tain', 'tin'],
  tract: ['tract', 'trac'],
  rupt: ['rupt'],
  ven: ['ven', 'vent', 'vene'],
  vers: ['vers', 'vert'],
  voc: ['voc', 'vok', 'voca'],
  act: ['act'],
  fac: ['fac', 'fact', 'fect', 'fic'],
  graph: ['graph', 'graphy'],
  log: ['log', 'logue', 'logo'],
  mort: ['mort'],
  nat: ['nat', 'nas'],
  scrib: ['scrib', 'script'],
  vis: ['vid', 'vis'],  // same as vid
}
const now = Date.now()

const PCT = (s) => (wordInfo.has(s) ? wordInfo.get(s) : null)
const isCet = (w) => {
  const tags = PCT(w)?.[7] || ''
  return /zk|gk|cet4|cet6/.test(tags)
}

// ---- 4. BFS 链式派生 ----
// 每跳记录 affix 和 type。affix 必须是小写字母。链上所有词素最后都要被建模。
const results = {}
for (const [rootId, surfaces] of Object.entries(ROOTS)) {
  const found = new Map() // word -> { chain: [{node, affix, type}], affixes: Set }
  const queue = []
  for (const s of surfaces) {
    found.set(s, { chain: [], affixes: new Set() })
    queue.push({ node: s, depth: 0 })
  }
  while (queue.length) {
    const { node, depth } = queue.shift()
    if (depth >= 5) continue
    const edges = fromBase.get(node) || []
    for (const e of edges) {
      const w = e.derived.toLowerCase()
      if (found.has(w)) continue
      const affixes = new Set([...found.get(node).affixes, e.affix])
      const chain = [...found.get(node).chain, { node: w, affix: e.affix, type: e.type }]
      found.set(w, { chain, affixes })
      queue.push({ node: w, depth: depth + 1 })
    }
  }
  const cetWords = []
  for (const [w, info] of found) {
    if (w !== rootId && isCet(w)) cetWords.push({ w, ...info })
  }
  cetWords.sort((a, b) => {
    const pa = PCT(b.w)
    const pb = PCT(a.w)
    const ra = pa ? (Number(pa[8]) || 1e9) : 1e9
    const rb = pb ? (Number(pb[8]) || 1e9) : 1e9
    return ra - rb
  })
  results[rootId] = cetWords.slice(0, 30)
}

// 输出
const out = []
for (const [rootId, list] of Object.entries(results)) {
  out.push(`\n===== ${rootId}（${ROOTS[rootId].join('/')}）可达 CET 词 ${list.length} 个 =====`)
  for (const item of list) {
    const info = PCT(item.w)
    const tags = info ? (info[7] || '-') : '-'
    const bnc = info ? info[8] : '-'
    const collins = info ? info[5] : '-'
    const affs = [...item.affixes].join(',')
    const chain = item.chain.map((c) => `${c.node}(${c.affix}/${c.type})`).join(' → ')
    out.push(`  ${item.w}  [tag:${tags} bnc:${bnc} collins:${collins}] aff:${affs} | ${chain}`)
  }
}
writeFileSync('_t_morphy_probe.txt', out.join('\n'))
console.log('written _t_morphy_probe.txt, 用时', Date.now() - now, 'ms')