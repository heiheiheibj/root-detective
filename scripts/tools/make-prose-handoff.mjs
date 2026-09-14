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
// **增量生成**：已有释义的词不再生成模板，批次号从已有最大编号往后排。
// 中考批的 batch-1~7 已经写好并过闸，重跑本脚本绝不能把它们覆盖回空白模板。
//
// 跑法：node scripts/tools/make-prose-handoff.mjs [每批词数，默认 60]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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

const outDir = join(libDir, 'handoff', 'words-prose-stage3')

// ── 已有释义的词与批次编号 ──
const existing = new Set()
let lastIndex = 0
if (existsSync(outDir)) {
  for (const f of readdirSync(outDir).filter((x) => /^batch-\d+\.json$/.test(x))) {
    lastIndex = Math.max(lastIndex, Number(f.match(/^batch-(\d+)\.json$/)[1]))
    for (const k of Object.keys(JSON.parse(readFileSync(join(outDir, f), 'utf8')))) {
      if (!k.startsWith('_')) existing.add(k)
    }
  }
}

const words = splits.words.map((w) => w.word).filter((w) => !canary.has(w) && !existing.has(w)).sort()
const chunks = []
for (let i = 0; i < words.length; i += batchSize) chunks.push(words.slice(i, i + batchSize))

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

chunks.forEach((group, i) => {
  const index = lastIndex + i + 1
  const obj = {
    _comment: `Stage 3 待写释义（batch-${index}，本批 ${group.length} 词）。`
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
  writeFileSync(join(outDir, `batch-${index}.json`), `${JSON.stringify(obj, null, 1)}\n`, 'utf8')
})

console.log(`已有释义 ${existing.size} 词（batch-1~${lastIndex}），本次新增 ${words.length} 词 → ${chunks.length} 批`)
console.log(`新批编号：batch-${lastIndex + 1} ~ batch-${lastIndex + chunks.length}（每批 ≤${batchSize}）`)
console.log(`输出目录：scripts/lib/handoff/words-prose-stage3/`)
const noMean = words.filter((w) => !shortMean(byWord.get(w)?.translation)).length
console.log(`modernMeaningCn 已预填 ${words.length - noMean} 个，${noMean} 个需人工补（词典无中文义）`)
