// 快速核验个别词的 6.2/6.4 判定
// 跑法：node scripts/tools/check-words.mjs word1,word2,...
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))
function parseCsvLine(line) {
  const out = []; let cur = ''; let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false } else cur += ch }
    else { if (ch === '"') inQ = true; else if (ch === ',') { out.push(cur); cur = '' } else cur += ch }
  }
  out.push(cur); return out
}
const ecdict = new Map()
for (const line of readFileSync(join(here, '..', '.work', 'raw', 'ecdict.csv'), 'utf8').split('\n')) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const w = (f[0] || '').toLowerCase()
  if (!w) continue
  ecdict.set(w, { tag: (f[7] || '').split(' ').filter(Boolean), collins: f[5] || '', oxford: f[6] || '', bnc: Number(f[8] || 0), frq: Number(f[9] || 0) })
}
const words = (process.argv[2] || 'exponent,disposition,victorious,persist,consistent,irresistible,persistence,composure,deposition,superimpose,imposition,reposition').split(',')
for (const w of words) {
  const e = ecdict.get(w)
  if (!e) { console.log(`${w}: 不在 ECDICT`); continue }
  const d1 = e.tag.includes('zk') || e.tag.includes('gk') || Number(e.collins) === 5 || (e.bnc > 0 && e.bnc < 3000)
  const d5 = (e.tag.includes('cet6') || e.tag.includes('toefl')) && (e.bnc > 10000 || e.bnc === 0)
  const passTag = e.tag.some((t) => ['zk', 'gk', 'cet4', 'cet6'].includes(t))
  const passCom = Boolean(e.collins || e.oxford) || (e.bnc > 0 && e.bnc < 20000) || (e.frq > 0 && e.frq < 20000)
  console.log(`${w}: d=${d1 ? 1 : d5 ? 5 : 3} 6.2=${passTag && passCom ? '过' : '不过'} tag=[${e.tag.join(' ')}] collins=${e.collins} oxford=${e.oxford} bnc=${e.bnc} frq=${e.frq}`)
}
