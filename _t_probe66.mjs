// 探针：读 stage1-content.json 的全部词，按 ECDICT 计算难度 + 6.2 通过情况
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const cfg = JSON.parse(readFileSync(join(here, 'scripts', 'lib', 'stage1-content.json'), 'utf8'))
const ecdictPath = join(here, 'scripts', '.work', 'raw', 'ecdict.csv')
if (!existsSync(ecdictPath)) { console.error('NO ecdict.csv at', ecdictPath); process.exit(1) }

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
for (const line of readFileSync(ecdictPath, 'utf8').split('\n')) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const w = (f[0] || '').toLowerCase()
  if (!w) continue
  ecdict.set(w, { word: w, phonetic: f[1] || '', translation: f[3] || '', pos: f[4] || '', collins: f[5] || '', oxford: f[6] || '', tag: (f[7] || '').split(' ').filter(Boolean), bnc: Number(f[8] || 0), frq: Number(f[9] || 0) })
}
function diff(e) {
  const tags = e.tag; const collins = Number(e.collins || 0); const bnc = e.bnc
  const easy = tags.includes('zk') || tags.includes('gk') || collins === 5 || (bnc > 0 && bnc < 3000)
  const hard = (tags.includes('cet6') || tags.includes('toefl')) && (bnc > 10000 || bnc === 0)
  return easy ? 1 : hard ? 5 : 3
}
function f62(e) {
  const passTag = e.tag.some((t) => ['zk', 'gk', 'cet4', 'cet6'].includes(t))
  const passCom = (e.collins || e.oxford) || (e.bnc > 0 && e.bnc < 20000) || (e.frq > 0 && e.frq < 20000)
  return { passTag, passCom }
}

const force = new Set(Object.keys(cfg.forceInclude))
const canary = new Set(cfg.canary)
let problems = 0
for (const [fam, def] of Object.entries(cfg.families)) {
  let d1 = 0, d5 = 0
  console.log(`\n== ${fam} (roots=${def.roots.join(',')}) ==`)
  for (const w of def.words) {
    const e = ecdict.get(w)
    if (!e) { console.log(`  ${w}: ❌ NOT IN ECDICT`); problems++; continue }
    const d = diff(e); const g = f62(e)
    const flag = canary.has(w) ? 'C' : force.has(w) ? 'F' : ' '
    if (d === 1) d1++; if (d === 5) d5++
    const ok = canary.has(w) || force.has(w) || (g.passTag && g.passCom)
    const mark = ok ? '✓' : '❌62'
    if (!ok) problems++
    console.log(`  ${flag} ${w.padEnd(14)} d=${d} tag=[${e.tag.join(' ')}] bnc=${e.bnc} frq=${e.frq} col=${e.collins} ox=${e.oxford} ${mark}`)
  }
  const a23 = (def.words.length >= 3 && d1 > 0 && d5 > 0)
  console.log(`  -> words=${def.words.length} d1=${d1} d5=${d5} A23=${a23 ? 'PASS' : 'FAIL'}`)
  if (!a23) problems++
}
console.log(`\n=== TOTAL PROBLEMS: ${problems} ===`)
