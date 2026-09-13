// 临时：量清新规模下 A23 等规则的影响面，作为规则改造依据。
import { readFileSync } from 'node:fs'

const lex = JSON.parse(readFileSync('scripts/.work/derived/morpheme-lexicon.json', 'utf8')).lexicon
const merged = JSON.parse(readFileSync('scripts/.work/derived/splits-merged.json', 'utf8'))

for (const type of ['root', 'prefix', 'suffix']) {
  const list = lex.filter((m) => m.type === type)
  const both = list.filter((m) => m.difficulty.d1 >= 1 && m.difficulty.d5 >= 1)
  const noD5 = list.filter((m) => m.difficulty.d1 >= 1 && m.difficulty.d5 === 0)
  const noD1 = list.filter((m) => m.difficulty.d1 === 0)
  console.log(`${type.padEnd(7)} ${String(list.length).padStart(3)} 个｜d1&d5 齐 ${String(both.length).padStart(3)}｜缺 d5 ${String(noD5.length).padStart(3)}｜缺 d1 ${String(noD1.length).padStart(3)}`)
  if (type === 'root') {
    console.log(`   缺 d5 样例：${noD5.slice(0, 12).map((m) => `${m.surface}(${m.words}词)`).join(' ')}`)
    console.log(`   缺 d1 样例：${noD1.slice(0, 12).map((m) => `${m.surface}(${m.words}词)`).join(' ')}`)
  }
}

// 零件词素的家族词数分布
const used = new Map()
for (const info of Object.values(merged.splits)) {
  for (const p of info.parts) {
    const key = p.surface
    if (!used.has(key)) used.set(key, new Set())
    used.get(key).add(p.id)
  }
}
const lexSet = new Set(lex.map((m) => m.surface))
const delta = new Map()
for (const [word, info] of Object.entries(merged.splits)) {
  for (const p of info.parts) delta.set(p.surface, (delta.get(p.surface) || 0) + 1)
}
const partsOnly = [...delta].filter(([s]) => !lexSet.has(s))
const dist = { '1 词': 0, '2 词': 0, '3+ 词': 0 }
for (const [, c] of partsOnly) { if (c === 1) dist['1 词'] += 1; else if (c === 2) dist['2 词'] += 1; else dist['3+ 词'] += 1 }
console.log(`\n零件词素 ${partsOnly.length} 个（不在教学库）：${JSON.stringify(dist)}`)

// 词的零件里含"仅 1 词"词素的比例（这些词拼词时会出现只有一次机会的卡片）
const oneWordParts = new Set([...delta].filter(([s, c]) => c === 1 && !lexSet.has(s)).map(([s]) => s))
let wordsWithRare = 0
for (const [, info] of Object.entries(merged.splits)) {
  if (info.parts.some((p) => oneWordParts.has(p.surface))) wordsWithRare += 1
}
console.log(`含"只出现 1 次"零件词素的词：${wordsWithRare} / ${Object.keys(merged.splits).length}`)

// familyWordIds 规则（A16 要求 2~8 个家族词）：单 part 词有多少
const singlePart = Object.values(merged.splits).filter((info) => info.parts.length === 1).length
console.log(`单 part 词（familyWordIds 会难凑）：${singlePart}`)

// A18：每个词要有至少一个 type=root 的 part（缺了结算会给 0 经验）
const lexType = new Map(lex.map((m) => [m.surface, m.type]))
let noRoot = 0
const noRootSample = []
for (const [word, info] of Object.entries(merged.splits)) {
  if (info.parts.some((p) => lexType.get(p.surface) === 'root')) continue
  noRoot += 1
  if (noRootSample.length < 10) noRootSample.push(word)
}
console.log(`A18 缺 root part 的词：${noRoot} / ${Object.keys(merged.splits).length}  样例：${noRootSample.join(', ')}`)

// A6：part.surface 必须在 morpheme.allomorphs 里 —— 对齐产生的变体有多少
let mismatch = 0; let totalParts = 0
const mismatchSample = []
for (const [word, info] of Object.entries(merged.splits)) {
  for (const p of info.parts) {
    totalParts += 1
    if (p.surface !== p.id) { mismatch += 1; if (mismatchSample.length < 8) mismatchSample.push(`${word}:${p.id}→${p.surface}`) }
  }
}
console.log(`A6 surface≠id 的 part：${mismatch} / ${totalParts}  样例：${mismatchSample.join(' ')}`)
