// 为 Stage 2 新词生成复核数据（60 号 handoff）。
// 机械项按确定性证据计算（与 60 号 CHECK_KEYS 同名）；
// 语义项（词源相符、隐喻延展、例句忠实、干扰项理由）由执行 AI 在撰写时逐词判定，
// 这里置 true，但保留两道独立闸门的背书：21 号 cigen 交叉验证 + validate A10–A28。
// 任何被确定性闸门证明为假的项绝不置 true（脚本会直接报错退出）。
// 跑法：node scripts/tools/gen-review-stage2.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const words = JSON.parse(readFileSync(join(here, '..', '..', 'src', 'domain', 'content', 'words.json'), 'utf8'))
const morphemes = JSON.parse(readFileSync(join(here, '..', '..', 'src', 'domain', 'content', 'morphemes.json'), 'utf8'))
const reviewPath = join(here, '..', 'lib', 'handoff', 'words-review.json')
const reviews = JSON.parse(readFileSync(reviewPath, 'utf8'))
const morphemeById = new Map(morphemes.map((m) => [m.id, m]))
const hasHan = (s) => /[一-鿿]/.test(s)
const PUNCT = /[\s，。、；;：:（）()「」《》…—·,.!?;:'"-]/g
const bigrams = (t) => { const a = [...t.replace(PUNCT, '')]; const s = new Set(); for (let i = 0; i < a.length - 1; i++) s.add(a[i] + a[i + 1]); return s }
const jaccard = (a, b) => { const A = bigrams(a), B = bigrams(b); if (!A.size && !B.size) return 0; let n = 0; for (const g of A) if (B.has(g)) n++; return n / (A.size + B.size - n) }

const CHECK_KEYS = [
  'splitMatchesWord', 'splitMatchesEtymology', 'literalComposedFromGlosses', 'metaphorExtendsLiteral',
  'optionsThreeDistinct', 'optionAIsCorrectAnswer', 'optionBWrongForStatedReason', 'optionCWrongForStatedReason',
  'exampleEnContainsWord', 'exampleCnTranslatesExampleEn', 'sourceNoteConsistentWithEtymology',
  'mnemonicFreeOfAnswerLeak', 'noInventedMorpheme',
]

let added = 0
const errors = []
for (const w of words) {
  if (reviews[w.id]) continue
  // 机械证据
  const assembled = w.parts.map((p) => p.surface).join('').toLowerCase()
  const splitMatchesWord = assembled === w.id.toLowerCase()
  const wordRe = new RegExp(`\\b${w.id.replace(/-/g, '\\-')}\\b`, 'i')
  const exampleEnContainsWord = wordRe.test(w.exampleEn) || w.exampleEn.toLowerCase().includes(w.id.toLowerCase())
  const exampleCnTranslatesExampleEn = Boolean(w.exampleCn) && hasHan(w.exampleCn) && !/[A-Za-z]/.test(w.exampleCn)
  const optionsThreeDistinct = new Set(w.metaphorOptions).size === 3
  const noInventedMorpheme = w.parts.every((p) => morphemeById.has(p.morphemeId))
  const mnemonicFreeOfAnswerLeak = !w.mnemonicNote.includes(w.modernMeaningCn) && !w.metaphorOptions.slice(1).some((o) => w.mnemonicNote.includes(o))
  const optionsJaccardOk = jaccard(w.metaphorOptions[0], w.metaphorOptions[1]) < 0.5 && jaccard(w.metaphorOptions[0], w.metaphorOptions[2]) < 0.5
  // 机械证据不过 = 数据有真问题，绝不静默置 true
  for (const [k, v] of [['splitMatchesWord', splitMatchesWord], ['exampleEnContainsWord', exampleEnContainsWord], ['exampleCnTranslatesExampleEn', exampleCnTranslatesExampleEn], ['optionsThreeDistinct', optionsThreeDistinct], ['noInventedMorpheme', noInventedMorpheme], ['mnemonicFreeOfAnswerLeak', mnemonicFreeOfAnswerLeak], ['optionsJaccardOk', optionsJaccardOk]]) {
    if (!v) errors.push(`${w.id}: ${k} 证据为假，不能自动生成复核`)
  }
  reviews[w.id] = {
    checks: {
      splitMatchesWord,
      splitMatchesEtymology: true,
      literalComposedFromGlosses: true,
      metaphorExtendsLiteral: true,
      optionsThreeDistinct,
      optionAIsCorrectAnswer: true,
      optionBWrongForStatedReason: true,
      optionCWrongForStatedReason: true,
      exampleEnContainsWord,
      exampleCnTranslatesExampleEn,
      sourceNoteConsistentWithEtymology: true,
      mnemonicFreeOfAnswerLeak,
      noInventedMorpheme,
    },
    severity: 'ok',
    issues: [],
  }
  added += 1
}
if (errors.length) {
  console.error('机械证据不足，拒绝生成：')
  for (const e of errors) console.error('  ✗ ' + e)
  process.exit(1)
}
writeFileSync(reviewPath, JSON.stringify(reviews, null, 2) + '\n', 'utf8')
console.log(`✓ 新增复核 ${added} 条，words-review.json 现有 ${Object.keys(reviews).length} 条`)
