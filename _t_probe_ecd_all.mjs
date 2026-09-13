// 探针：把候选词的 ECDICT 元数据全打出来，用于定稿 60 词白名单和难度。
import { readFileSync } from 'node:fs'

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

// 每个候选词： { word, 期望家族(仅供参考) }
const pool = new Set(`
action active react interact transaction counteract
audio audience audit audible auditorium
biology biography antibiotic biosphere
century percent centigrade centimeter
chronic chronicle chronological synchronize
credit credible incredible credential discredit
doctor document documentary doctrine
produce introduce conduct educate reduce deduct
factory factor facility manufacture facilitate
general generate generation generous genetic indigenous
grade graduate gradual degrade
project object subject reject inject eject
logic logical dialogue apology catalog
manage manual manuscript manipulate
admit commit permit submit transmit mission
attend extend intend tendency
universe version reverse diverse versatile
vivid survive revive
voice vocal vocabulary advocate provoke
prospect spectator spectacle dictate dictator verdict
deport transport export support evidence provide visual invisible
`.trim().split(/\s+/))

const rows = new Map()
for (const line of readFileSync('scripts/.work/raw/ecdict.csv', 'utf8').split('\n')) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const word = (f[0] || '').toLowerCase()
  if (pool.has(word) && !rows.has(word)) {
    rows.set(word, { word, tag: f[7] || '', collins: f[5] || '', oxford: f[6] || '', bnc: Number(f[8] || 0), frq: Number(f[9] || 0) })
  }
}
for (const w of [...pool]) {
  const r = rows.get(w)
  if (r) {
    const diff = r.bnc > 0 ? Math.log10(r.bnc) : 6
    const tags = String(r.tag).split(' ').filter(Boolean)
    const isEasy = tags.some((t) => ['zk', 'gk'].includes(t)) || r.collins === '5' || (r.bnc > 0 && r.bnc < 3000)
    const isHard = tags.some((t) => ['cet6', 'toefl'].includes(t)) && (r.bnc > 10000 || r.bnc === 0)
    const d = isEasy ? 1 : isHard ? 5 : 3
    console.log(`${r.word.padEnd(14)} d${d} tag=${String(r.tag).padEnd(20)} collins=${r.collins} bnc=${r.bnc} frq=${r.frq}${r.bnc > 0 ? ' pen=' + diff.toFixed(2) : ''}`)
  } else {
    console.log(`${w.padEnd(14)} ✗ 不在 ecdict`)
  }
}