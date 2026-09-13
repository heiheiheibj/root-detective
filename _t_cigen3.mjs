import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))
const c = JSON.parse(readFileSync(join(here, 'scripts', '.work', 'raw', 'cigen-roots_affixes.json'), 'utf8'))
console.log('top keys', Object.keys(c))
const e = c.entries
const isArr = Array.isArray(e)
console.log('entries isArray', isArr)
const keys = isArr ? e.map((x) => x.word || x.id || x.entry) : Object.keys(e)
console.log('entries count', keys.length)
const sample = isArr ? e[0] : e[keys[0]]
console.log('sample', JSON.stringify(sample).slice(0, 500))
for (const w of ['predict', 'portable', 'visible', 'inspection', 'biology']) {
  if (isArr) {
    const hit = e.find((x) => (x.word || '').toLowerCase() === w)
    console.log(w, '->', hit ? JSON.stringify(hit).slice(0, 300) : 'MISSING')
  } else {
    console.log(w, '->', e[w] !== undefined ? JSON.stringify(e[w]).slice(0, 300) : 'MISSING')
  }
}
