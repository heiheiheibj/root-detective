// 探针：最终确定 60 词白名单（每个家族都要有 d1 + d5）+ 可用词素检查。
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

const interests = new Set(`
enact reactant interaction transaction counteract proactive reactor
audible auditorium audio audience audible
antibiotic biosphere biography biologist biology
centenary centennial centigrade centimeter century percent
chronicle chronological chronic synchronize
credential credible incredible credit discredit
doctor document documentary doctrine doctrinal
produce introduce conduct reduce deduct seduce induce reproduce induct
factory factor facility manufacture facilitate faction
general generate generation genetic generous indigenous genesis gender
grade graduate gradual degrade upgrade
project object reject eject inject subject
logic logical dialogue apology catalog biology
admit commit permit submit transmit emit mission dismiss remit
attend extend intend tendency contend extension intense tendentious
universe version reverse diverse versatile aversion controversy inverse
spectator prospect spectacle expect inspect
dictate dictator verdict diction dictionary predictable predictive
transport export import support deport
visual invisible visible vision
`.trim().split(/\s+/))

const rows = new Map()
for (const line of readFileSync('scripts/.work/raw/ecdict.csv', 'utf8').split('\n')) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const word = (f[0] || '').toLowerCase()
  if (interests.has(word) && !rows.has(word)) {
    rows.set(word, { word, tag: (f[7] || '').split(' ').filter(Boolean), collins: Number(f[5] || 0), oxford: Number(f[6] || 0), bnc: Number(f[8] || 0), frq: Number(f[9] || 0), pos: f[4] || '' })
  }
}

function diff(r) {
  if (!r) return '?'
  const easy = r.tag.includes('zk') || r.tag.includes('gk') || r.collins === 5 || (r.bnc > 0 && r.bnc < 3000)
  const hard = (r.tag.includes('cet6') || r.tag.includes('toefl')) && (r.bnc > 10000 || r.bnc === 0)
  return easy ? 1 : hard ? 5 : 3
}
for (const w of [...interests]) {
  const r = rows.get(w)
  if (r) console.log(`${w.padEnd(16)} d${diff(r)} tag=[${r.tag.slice(0, 5).join(' ')}] coll=${r.collins} bnc=${r.bnc} frq=${r.frq}`)
  else console.log(`${w.padEnd(16)} ✗ 不在`)
}

// 检查关键词素在 reviewed 里是否存在（供切分表引用）
const reviewed = JSON.parse(readFileSync('scripts/.work/derived/roots.reviewed.json', 'utf8'))
const rev = (reviewed.entries || reviewed)
const revById = new Map(rev.map((e) => [e.id, e]))
console.log('\n== 词素可用性（roots.reviewed.json）==')
const needIds = ['act', 'aud', 'bio', 'cent', 'chron', 'cred', 'doc', 'duc', 'fac', 'gen', 'grad', 'ject', 'log', 'mit', 'tend', 'vers', 'spect', 'dic', 'vis', 'ten', 'ion', 'ation', 'ate', 'ive', 'able', 'ity', 'er', 'or', 'al', 'ary', 'ous', 'y', 'ance', 'ant', 'att', 'pro', 'de', 'dis', 'con', 'trans', 'ex', 'sub', 'uni', 'inter', 'ob', 'per', 'counter', 'anti', 'bio', 'logy', 'en', 'in', 're', 'pre', 'circum', 'spec', 'dict', 'port', 'vid']
for (const id of needIds) {
  const e = revById.get(id)
  if (e) console.log(`  ✓ ${id.padEnd(10)} ${e.type.padEnd(7)} allomorphs=[${(e.allomorphs || []).join(',')}] ${e.meaningCn || ''}`)
  else console.log(`  ✗ ${id} 不在 reviewed（需要手写补充或换词）`)
}