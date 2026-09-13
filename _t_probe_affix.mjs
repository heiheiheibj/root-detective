// 探针：确认关键前缀/后缀在 candidates/reviewed 里的可用性（含 allomorphs）。
import { readFileSync } from 'node:fs'

const candidates = JSON.parse(readFileSync('scripts/.work/derived/roots.candidates.json', 'utf8'))
const cand = (candidates.entries || [])
const candById = new Map(cand.map((e) => [e.id, e]))
const reviewed = JSON.parse(readFileSync('scripts/.work/derived/roots.reviewed.json', 'utf8'))
const rev = (reviewed.entries || reviewed)
const revById = new Map(rev.map((e) => [e.id, e]))
const rejected = JSON.parse(readFileSync('scripts/.work/derived/roots.rejected.json', 'utf8'))
const rej = (rejected.entries || rejected)
const rejById = new Map(rej.map((e) => [e.id, e]))

const ids = ['pro', 'de', 'dis', 'con', 'trans', 'ex', 'sub', 'uni', 'inter', 'anti', 'ob', 'per', 'ment', 'ion', 'ation', 'ity', 'meter', 'tory', 'or', 'ate', 'ive', 'ile', 'ous', 'al', 'ary', 'ance', 'ence', 'ty', 'ic', 'ical', 'ed', 's', 'ism', 'ist', 'ize', 'fy', 'graph', 'logy', 'meter', 'vis', 'spect', 'dic', 'vise', 'ject', 'mit', 'tend', 'ten', 'vers', 'vert', 'act', 'aud', 'bio', 'cent', 'centi', 'chron', 'cred', 'doc', 'duct', 'fac', 'gen', 'grad', 'log', 'log', 'tend']
for (const id of ids) {
  const c = candById.get(id)
  const r = revById.get(id)
  const rj = rejById.get(id)
  const status = r ? `REVIEWED(keep=${r.keep})` : rj ? `REJECTED: ${(rj.reason || '').slice(0, 40)}` : c ? `candidate only(keep=${c.keep})` : 'NOT A CANDIDATE'
  const al = c ? `allomorphs=[${(c.allomorphs || []).join(',')}]` : ''
  const type = c ? `type=${c.type}` : ''
  console.log(`${id.padEnd(8)} ${status.padEnd(70)} ${type} ${al}`)
}