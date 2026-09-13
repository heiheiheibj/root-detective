import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))
const ex = JSON.parse(readFileSync(join(here, 'scripts', '.work', 'derived', 'words.examples.json'), 'utf8'))
const canary = ['circumspect', 'inspection', 'respect', 'circumspection', 'predict', 'prediction', 'predictable', 'predictive', 'portable', 'import', 'report', 'porter', 'visible', 'vision', 'revise', 'visibility']
for (const e of ex) {
  if (e.exampleSource === 'tatoeba') continue
  if (canary.includes(e.word)) continue
  console.log(`${e.word} ||| ${e.exampleEn} ||| ${e.exampleSource}`)
}
