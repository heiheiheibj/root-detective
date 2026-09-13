// 探针：读 stage1-content.json + ecdict.csv，打印每个候选词的真实难度/标签/6.2 通过情况，
// 以及每个家族的覆盖摘要（词数 / d1 / d5）。用于决定 Stage 1 最终 60 词 / 20 词根。
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const cfgPath = join(here, 'scripts', 'lib', 'stage1-content.json')
const ecdictPath = join(here, 'scripts', '.work', 'raw', 'ecdict.csv')
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
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
  ecdict.set(w, {
    word: w, phonetic: f[1] || '', translation: f[3] || '', pos: f[4] || '',
    collins: f[5] || '', oxford: f[6] || '',
    tag: (f[7] || '').split(' ').filter(Boolean),
    bnc: Number(f[8] || 0), frq: Number(f[9] || 0),
  })
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
  const freqOk = (e.collins || e.oxford) || (e.bnc > 0 && e.bnc < 20000) || (e.frq > 0 && e.frq < 20000)
  return { tagOk, freqOk, ok: tagOk && freqOk }
}

// 收集所有候选词（families 里的 + difficulties 里多出来的）
const allWords = new Set()
for (const fam of Object.values(cfg.families)) for (const w of fam.words) allWords.add(w)
for (const w of Object.keys(cfg.difficulties)) allWords.add(w)
// 也把 extraMorphemes 里的词（biotech/manufacture 等）纳入探针
for (const m of cfg.extraMorphemes) {
  // extraMorphemes 没有 word 字段，跳过
}

console.log('=== 逐词 ===')
console.log('word | inECDICT | tag | bnc | collins | oxford | diff | pass62(tag/freq) | modernMeaning?')
const rows = []
for (const w of [...allWords].sort()) {
  const e = ecdict.get(w)
  if (!e) { console.log(`${w} | NO | - | - | - | - | - | -`); continue }
  const d = difficultyFor(e)
  const p = pass62(e)
  const diffVal = cfg.difficulties[w]
  rows.push({ w, e, d, p, diffVal })
  console.log(`${w} | yes | ${e.tag.join('/') || '-'} | ${e.bnc} | ${e.collins || '-'} | ${e.oxford || '-'} | ${d}${diffVal !== undefined ? `(cfg${diffVal})` : ''} | ${p.tagOk ? 'T' : 't'}${p.freqOk ? 'F' : 'f'} ${p.ok ? 'OK' : 'X'}`)
}

console.log('\n=== 逐家族 ===')
for (const [fam, def] of Object.entries(cfg.families)) {
  const ws = def.words
  const d1 = ws.filter((w) => (cfg.difficulties[w] ?? rows.find((r) => r.w === w)?.d) === 1).length
  const d5 = ws.filter((w) => (cfg.difficulties[w] ?? rows.find((r) => r.w === w)?.d) === 5).length
  const missing = ws.filter((w) => !ecdict.has(w))
  const fail62 = ws.filter((w) => { const r = rows.find((x) => x.w === w); return r && !r.p.ok })
  console.log(`${fam.padEnd(8)} n=${ws.length} d1=${d1} d5=${d5}${ws.length < 3 ? ' ⚠<3' : ''}${d1 === 0 ? ' ⚠no-d1' : ''}${d5 === 0 ? ' ⚠no-d5' : ''}${missing.length ? ' 缺:' + missing.join(',') : ''}${fail62.length ? ' 不过62:' + fail62.map((r) => r.w).join(',') : ''}`)
}

console.log('\n=== 候选词总数 ===', allWords.size)
