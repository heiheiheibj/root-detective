// 导出需要的词根/词缀的 allomorphs + type（reviewed + legacy 12），用于核对手写 split 的表面形式。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))
const reviewed = JSON.parse(readFileSync(join(here, 'scripts', '.work', 'derived', 'roots.reviewed.json'), 'utf8'))
const entries = reviewed.entries || reviewed
const byId = new Map(entries.map((e) => [e.id, e]))
const ids = ['spec','dict','port','vid','aud','bio','cent','cred','gen','grad','ject','log','mob','nat','pend','vers','voc','graph','tract','fac',
  'circum','pre','re','in','ion','ive','able','ity','spect','dic','vis','vise','tele','para','photo','at','ite','tech','gram','manu',
  'pro','de','dis','con','trans','ex','sub','inter','anti','per','ob','intro','cata','uni','auto','micro','syn','ben','e',
  'ment','ation','ate','or','ary','ic','ical','ist','ism','ize','meter','ure','ory','ent','ence','o','s','ual','y','ulum','ice','urity','trine','emb',
  'logy','graphy','ury','enn','ial','er','tic','u','dia','ue','ile','ility','abul']
for (const id of ids) {
  const e = byId.get(id)
  console.log(`${id.padEnd(8)} ${e ? e.type + ' [' + e.allomorphs.join('/') + ']' : 'MISSING'}`)
}
