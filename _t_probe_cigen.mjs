// 探针：看 cigen 对关键家族词的人工切分，确认 21 号切分器要用的第二意见。
import { readFileSync } from 'node:fs'
const cigen = JSON.parse(readFileSync('scripts/.work/raw/cigen-roots_affixes.json', 'utf8'))
const byWord = new Map((cigen.entries || []).map((e) => [e.word, e]))
const targets = [
  'inspection', 'circumspection', 'respect', 'respectable', 'predict', 'prediction', 'predictable',
  'portable', 'porter', 'import', 'importation', 'report', 'support', 'transport', 'deport', 'deportation',
  'visible', 'vision', 'revise', 'visibility', 'visual', 'invisible', 'visitor', 'visit', 'provide', 'evident', 'evidence',
  'prospect', 'spectacle', 'spectator', 'expect', 'expectation', 'introspection', 'inspect', 'inspector',
]
for (const t of targets) {
  const e = byWord.get(t)
  if (e) {
    const comps = (e.components || []).map((c) => c.morpheme).join('|')
    console.log(`${t.padEnd(16)} ${comps}`)
  } else {
    console.log(`${t.padEnd(16)} ✗ 不在 cigen`)
  }
}
console.log('\ncigen 词条总数', (cigen.entries || []).length)