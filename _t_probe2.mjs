// 扩展探针：检查候选替换词根家族 + graph 家族的真实难度/6.2 通过情况。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const ecdictPath = join(here, 'scripts', '.work', 'raw', 'ecdict.csv')
const raw = readFileSync(ecdictPath, 'utf8')

function parseCsvLine(line) {
  const out = []; let cur = ''; let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += ch }
    else { if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = '' } else cur += ch }
  }
  out.push(cur); return out
}
const ecdict = new Map()
for (const line of raw.split('\n')) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const w = (f[0] || '').toLowerCase()
  if (!w) continue
  ecdict.set(w, { word: w, tag: (f[7] || '').split(' ').filter(Boolean), bnc: Number(f[8] || 0), collins: f[5] || '', oxford: f[6] || '' })
}
function difficultyFor(e) {
  const t = e.tag
  const collins = Number(e.collins || 0)
  const bnc = e.bnc
  const easy = t.includes('zk') || t.includes('gk') || collins === 5 || (bnc > 0 && bnc < 3000)
  const hard = (t.includes('cet6') || t.includes('toefl')) && (bnc > 10000 || bnc === 0)
  return easy ? 1 : hard ? 5 : 3
}
function pass62(e) {
  const tagOk = e.tag.some((t) => ['zk', 'gk', 'cet4', 'cet6'].includes(t))
  const freqOk = (e.collins || e.oxford) || (e.bnc > 0 && e.bnc < 20000)
  return tagOk && freqOk
}

// 候选替换词根家族（替换 temp/therm）
const candFams = {
  graph: ['paragraph', 'photograph', 'telegraph', 'graphite', 'photography', 'graphic'],
  tract: ['attract', 'contract', 'extract', 'distract', 'retract'],
  struct: ['structure', 'construct', 'instruct', 'destruct'],
  cept: ['accept', 'concept', 'except', 'receipt', 'perception'],
  form: ['format', 'transform', 'reform', 'inform', 'formal'],
  scrib: ['describe', 'script', 'prescribe', 'manuscript'],
  quire: ['require', 'acquire', 'request', 'inquire'],
  tain: ['contain', 'obtain', 'maintain', 'tenant', 'content'],
}
for (const [fam, ws] of Object.entries(candFams)) {
  const rows = ws.map((w) => {
    const e = ecdict.get(w)
    if (!e) return { w, miss: true }
    return { w, d: difficultyFor(e), ok: pass62(e), tag: e.tag.join('/'), bnc: e.bnc }
  })
  const d1 = rows.filter((r) => r.d === 1).length
  const d5 = rows.filter((r) => r.d === 5).length
  console.log(`\n${fam}: d1=${d1} d5=${d5}`)
  for (const r of rows) console.log(`  ${r.w} ${r.miss ? 'MISS' : 'd' + r.d + (r.ok ? ' OK' : ' X') + ' [' + r.tag + ' bnc' + r.bnc + ']'}`)
}
