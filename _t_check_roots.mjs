// 检查需要的「新词根 id」是否已在 roots.reviewed.json 里（在则组装器用 reviewed，不在则需 extraMorphemes 补）。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))
const reviewed = JSON.parse(readFileSync(join(here, 'scripts', '.work', 'derived', 'roots.reviewed.json'), 'utf8'))
const entries = reviewed.entries || reviewed
const byId = new Map(entries.map((e) => [e.id, e]))
const need = ['aud','bio','cent','cred','gen','grad','ject','log','mob','nat','pend','vers','voc','graph','tract','fac',
  'spec','dict','port','vid','circum','pre','re','in','ion','ive','able','ity',
  'para','tele','photo','at','ite','tech','gram','manu','spect','vis','vise','dic']
for (const id of need) {
  const e = byId.get(id)
  console.log(`${id.padEnd(8)} ${e ? 'IN reviewed ('+e.type+')' : 'MISSING'}`)
}
