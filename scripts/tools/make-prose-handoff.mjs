// 为待写释义的词生成 handoff 模板（走 handoff 模式：零成本、无 OpenRouter，人工或外部 LLM 填）。
//
// 9.3 契约（30 号逐条校验，填错会被拦下）：
//   modernMeaningCn  非空、含汉字              —— 现代词典义
//   literalMeaningCn ≤12 汉字、无拉丁         —— 字面义（词根拼出来的直译）
//   metaphorMeaningCn ≤20 字                  —— 隐喻义（这个词真正表达的意思）
//   metaphorOptions  恰 3 个，且 [0] === metaphorMeaningCn
//   mnemonicNote     ≤40 字                   —— 记忆钩子
//   sourceNote       ≤60 字                   —— 词源小注
//   字面义 ≠ 隐喻义
//
// 预填 modernMeaningCn（取 ECDICT 第一个中文义），其余留空 —— 留空项正是 30 号报出来的待办。
//
// 跑法：node scripts/tools/make-prose-handoff.mjs [每批词数，默认 60]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const derivedDir = join(here, '..', '.work', 'derived')
const libDir = join(here, '..', 'lib')
const batchSize = Number(process.argv[2] || 60)

const splits = JSON.parse(readFileSync(join(derivedDir, 'words.splits.json'), 'utf8'))
const cands = JSON.parse(readFileSync(join(derivedDir, 'words.candidates.json'), 'utf8'))
const candList = Array.isArray(cands) ? cands : (cands.words || [])
const byWord = new Map(candList.map((w) => [w.word, w]))
const canary = new Set(JSON.parse(readFileSync(join(libDir, 'stage1-content.json'), 'utf8')).canary)

/** 取 ECDICT 的第一个中文义项，砍到 8 个汉字。 */
const shortMean = (t) => String(t || '')
  .split(/[；;，,]/)[0]
  .replace(/^(n|v|vt|vi|adj|adv|prep|conj|pron|int|aux|num|art)\.\s*/i, '')
  .replace(/[^\u4e00-\u9fff]/g, '')
  .slice(0, 8)

const words = splits.words.map((w) => w.word).filter((w) => !canary.has(w)).sort()
const chunks = []
for (let i = 0; i < words.length; i += batchSize) chunks.push(words.slice(i, i + batchSize))

const outDir = join(libDir, 'handoff', 'words-prose-stage3')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

chunks.forEach((group, i) => {
  const obj = {
    _comment: `Stage 3 待写释义（第 ${i + 1}/${chunks.length} 批，共 ${words.length} 词）。`
      + '按 9.3 契约补全：literalMeaningCn(≤12汉字) / metaphorMeaningCn(≤20字) / metaphorOptions(恰3个，[0]同 metaphorMeaningCn) /'
      + ' mnemonicNote(≤40字) / sourceNote(≤60字)；modernMeaningCn 已预填，可润色。填完跑 30-llm-prose.mjs 校验。',
  }
  for (const w of group) {
    obj[w] = {
      modernMeaningCn: shortMean(byWord.get(w)?.translation),
      literalMeaningCn: '',
      metaphorMeaningCn: '',
      metaphorOptions: [],
      mnemonicNote: '',
      sourceNote: '',
    }
  }
  writeFileSync(join(outDir, `batch-${i + 1}.json`), `${JSON.stringify(obj, null, 1)}\n`, 'utf8')
})

console.log(`handoff 模板：${words.length} 词 → ${chunks.length} 批（每批 ≤${batchSize}）`)
console.log(`输出目录：scripts/lib/handoff/words-prose-stage3/`)
const noMean = words.filter((w) => !shortMean(byWord.get(w)?.translation)).length
console.log(`modernMeaningCn 已预填 ${words.length - noMean} 个，${noMean} 个需人工补（词典无中文义）`)
