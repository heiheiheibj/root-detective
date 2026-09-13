// 精确检查 MorphyNet 里和四个家族相关的行。
import { readFileSync } from 'node:fs'

const lines = readFileSync('scripts/.work/raw/morphynet-eng-derivational.tsv', 'utf8').split('\n')
const hits = []
const wanted = ['spect', 'spic', 'spec', 'inspect', 'respect', 'circumspect', 'dict', 'dic', 'predict', 'port', 'report', 'porter', 'vid', 'vis', 'vise', 'visible', 'vision', 'revise', 'visibility', 'circum', 'spectate', 'inspection']
for (const line of lines) {
  if (!line.trim()) continue
  const [base, derived] = line.split('\t')
  if (wanted.includes(base) || wanted.includes(derived)) hits.push(line)
}
console.log('命中行数:', hits.length)
for (const h of hits.slice(0, 80)) console.log('  ' + h)