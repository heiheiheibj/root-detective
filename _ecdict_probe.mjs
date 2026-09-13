import { readFileSync } from 'node:fs'
const lines = readFileSync('scripts/.work/raw/ecdict.csv', 'utf8').split('\n')
const want = new Set(['circumspect', 'dictator', 'portable', 'respect', 'visible'])
for (const l of lines) {
  const f = l.split(',')
  if (want.has(f[0])) console.log(f[0], '=>', JSON.stringify(f.slice(0, 6)))
}
