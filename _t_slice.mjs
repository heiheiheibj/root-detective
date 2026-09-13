import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
const from = Number(process.argv[3] || 1)
const to = Number(process.argv[4] || 60)
const lines = readFileSync(file, 'utf8').split('\n')
const slice = lines.slice(from - 1, to).map((l, i) => `${from + i}: ${l}`).join('\n')
writeFileSync('_t_slice.log', slice, 'utf8')
console.log(`共 ${lines.length} 行，已写出 ${from}~${to}`)
