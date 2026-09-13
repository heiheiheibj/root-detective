import { readFileSync } from 'node:fs'

const candidates = JSON.parse(readFileSync('scripts/.work/derived/roots.candidates.json', 'utf8'))
const ids = new Set(['age', 'al', 'an', 'ance', 'ant', 'arian', 'ation', 'ment'])
for (const entry of candidates.entries) {
  if (ids.has(entry.id)) {
    console.log(JSON.stringify({
      id: entry.id,
      type: entry.type,
      allomorphs: entry.allomorphs,
      glossEn: entry.glossEn,
      origin: entry.origin,
      variants: entry.variants?.map((v) => ({ surface: v.surface, glossEn: v.glossEn })),
    }, null, 2))
  }
}