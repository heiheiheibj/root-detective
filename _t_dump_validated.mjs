import { readFileSync } from 'node:fs'

const validated = JSON.parse(readFileSync('scripts/.work/derived/roots.validated.json', 'utf8')).entries
for (const e of validated) {
  console.log(`${e.id.padEnd(10)} ${e.type.padEnd(7)} L${e.level} ${(e.displayText || '').padEnd(18)} ${e.meaningCn}  || ${e.glossEn ?? e.sourceGlossEn ?? ''}`)
}
console.log(`\nTOTAL ${validated.length}`)