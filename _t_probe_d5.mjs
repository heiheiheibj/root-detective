import { readFileSync } from 'node:fs'
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false }
      else cur += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { out.push(cur); cur = '' } else cur += ch
    }
  }
  out.push(cur)
  return out
}
const want = new Set(`
duction induction deduction conductive conducive seductive reproductive
biochemistry biotechnology biochemical biotech biome
gene genetics geneticist genocide generic genesis congenital regeneration
graphite monograph paragraph telegraph photograph photogenic photography
telecommunications telepathy telecommunication telegram telescope telephone
inaction proactive counteract exact reactivate reactor activate transaction
educate education educator educational eduction
`.trim().split(/\s+/))
const rows = new Map()
for (const line of readFileSync('scripts/.work/raw/ecdict.csv', 'utf8').split('\n')) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const w = (f[0] || '').toLowerCase()
  if (want.has(w) && !rows.has(w)) rows.set(w, { w, tag: (f[7] || '').split(' ').filter(Boolean), collins: Number(f[5] || 0), bnc: Number(f[8] || 0), frq: Number(f[9] || 0) })
}
function diff(r) {
  const easy = r.tag.includes('zk') || r.tag.includes('gk') || r.collins === 5 || (r.bnc > 0 && r.bnc < 3000)
  const hard = (r.tag.includes('cet6') || r.tag.includes('toefl')) && (r.bnc > 10000 || r.bnc === 0)
  return easy ? 1 : hard ? 5 : 3
}
for (const w of [...want]) {
  const r = rows.get(w)
  if (!r) { console.log(`${w.padEnd(22)} ✗不在`); continue }
  const pass1 = r.tag.some((t) => ['zk', 'gk', 'cet4', 'cet6'].includes(t))
  console.log(`${w.padEnd(22)} d${diff(r)} pass1=${pass1} tag=[${r.tag.slice(0, 5).join(' ')}] bnc=${r.bnc} coll=${r.collins}`)
}