// 探针：检查 ECDICT 里测例词的字段，确认筛选/打分能跑通；以及 MorphyNet 链走向。
import { readFileSync } from 'node:fs'

// ECDICT csv 13 列：word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQ = false
      } else cur += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { out.push(cur); cur = '' }
      else cur += ch
    }
  }
  out.push(cur)
  return out
}

const targets = new Set([
  'predict', 'prediction', 'predictable', 'predictive', 'deport', 'deportation', 'export', 'import', 'importation',
  'portable', 'porter', 'report', 'reportable', 'support', 'transport', 'transportation',
  'inspect', 'inspection', 'inspector', 'respect', 'respectable', 'circumspect', 'circumspection', 'spectacle', 'spectator', 'prospect', 'expect', 'expectation', 'introspection',
  'visible', 'vision', 'revise', 'visibility', 'visual', 'invisible', 'visit', 'visitor', 'provide', 'provision', 'evident', 'evidence',
])
const want = new Map()
let lines = 0
for (const line of readFileSync('scripts/.work/raw/ecdict.csv', 'utf8').split('\n')) {
  if (!line.trim()) continue
  lines++
  const f = parseCsvLine(line)
  const word = (f[0] || '').toLowerCase()
  if (targets.has(word)) {
    want.set(word, { word, tag: f[7], collins: f[5], oxford: f[6], bnc: f[8], frq: f[9], definition: f[2]?.slice(0, 60), pos: f[4] })
  }
  if (want.size === targets.size) break
}
console.log('ecdict 行数约', lines)
for (const t of [...targets]) {
  const r = want.get(t)
  console.log(r ? `${r.word.padEnd(16)} tag=${String(r.tag).padEnd(12)} collins=${r.collins} oxford=${r.oxford} bnc=${r.bnc} frq=${r.frq} | ${r.definition}` : `  ✗ ${t} 没在 ecdict`)
}

// MorphyNet 链：看看能从 spec/dict/port/vid 出发到哪些词根
console.log('\n== MorphyNet spec/dict/port/vid 链 ==')
const rows = new Map()
for (const line of readFileSync('scripts/.work/raw/morphynet-eng-derivational.tsv', 'utf8').split('\n')) {
  if (!line.trim()) continue
  const parts = line.split('\t')
  if (parts.length < 6) continue
  const src = parts[0].toLowerCase(), deriv = parts[1].toLowerCase(), affix = parts[4]
  if (!rows.has(src)) rows.set(src, new Map())
  rows.get(src).set(deriv, affix)
}
for (const seed of ['spect', 'spec', 'dict', 'dic', 'port', 'vid', 'vis']) {
  const kids = rows.get(seed)
  console.log(`\n-- ${seed} --`)
  if (kids) for (const [d, a] of kids) console.log(`  ${seed} → ${d}  (${a})`)
  else console.log('  (无直接派生)')
}