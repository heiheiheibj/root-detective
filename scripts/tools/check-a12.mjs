// 本地复刻 validate-content 的 A12/A14 判定，快速列出待修清单。
// 跑法：node scripts/tools/check-a12.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const words = JSON.parse(readFileSync(join(here, '..', '..', 'src', 'domain', 'content', 'words.json'), 'utf8'))
const morphemes = JSON.parse(readFileSync(join(here, '..', '..', 'src', 'domain', 'content', 'morphemes.json'), 'utf8'))
const canaryIds = new Set(JSON.parse(readFileSync(join(here, '..', 'overrides', 'canary-words.json'), 'utf8')).map((w) => w.id))
const morphemeById = new Map(morphemes.map((m) => [m.id, m]))
const splitGlosses = (s) => String(s).replace(/（[^）]*）/g, '').split(/[、；;，,]/).map((x) => x.trim()).filter(Boolean)
const pool = new Set()
for (const m of morphemes) for (const g of splitGlosses(m.meaningCn)) if ([...g].filter((c) => /[一-鿿]/.test(c)).length >= 2) pool.add(g)
const HANZI = /[一-鿿]/
const A12miss = [], A14miss = [], A13miss = []
for (const w of words) {
  if (canaryIds.has(w.id)) continue
  const own = new Set(w.parts.flatMap((p) => (morphemeById.get(p.morphemeId) ? splitGlosses(morphemeById.get(p.morphemeId).meaningCn) : [])))
  const foreign = [...pool].filter((g) => !own.has(g))
  w.metaphorOptions.slice(1).forEach((opt, i) => {
    if (!foreign.some((g) => opt.includes(g))) A12miss.push(`${w.id}#${i + 1}:${opt}`)
  })
  const mod = w.modernMeaningCn
  if (w.mnemonicNote.includes(mod)) A14miss.push(`${w.id}:mnemonic`)
  if (w.sourceNote.includes(mod)) A14miss.push(`${w.id}:source`)
  for (const [f, v] of [['literal', w.literalMeaningCn], ['meta', w.metaphorMeaningCn], ...w.metaphorOptions.map((o, i) => ['opt' + i, o])]) {
    if (/[A-Za-z]/.test(v)) A13miss.push(`${w.id}:${f}:${v}`)
  }
}
console.log(`A12 待修 ${A12miss.length}：`)
for (const s of A12miss) console.log('  ' + s)
console.log(`A14 待修 ${A14miss.length}：` + A14miss.join(', '))
console.log(`A13 待修 ${A13miss.length}：` + A13miss.slice(0, 10).join(' | '))
