// 把 563 条候选词素压成一张紧凑表，供逐条翻译时通读。
import { readFileSync, writeFileSync } from 'node:fs'

const candidates = JSON.parse(readFileSync('scripts/.work/derived/roots.candidates.json', 'utf8'))
const lines = []
for (const e of candidates.entries) {
  const examples = (e.examples || []).slice(0, 4).join(',')
  const variants = (e.variants || [])
    .map((v) => `${v.surface}(${v.homograph})=${v.glossEn}`)
    .join(' | ')
  const conflicts = (e.conflicts || []).length
  lines.push(
    [e.id, e.type, e.glossEn, e.origin || '-', examples, `v:${e.variants.length}`, variants, `c:${conflicts}`, (e.allomorphs || []).join('/')].join('\t'),
  )
}
writeFileSync('_t_candidates.tsv', lines.join('\n'))
console.log('entries:', candidates.entries.length, 'lines:', lines.length)
const conflicted = candidates.entries.filter((e) => (e.variants || []).length > 1 || (e.conflicts || []).length > 0)
console.log('同形异义或冲突条数:', conflicted.length)
