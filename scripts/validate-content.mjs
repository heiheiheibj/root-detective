// 词库内容闸门。规则实现在 src/domain/contentRules.ts，测试跑的是同一份，
// 所以这里只负责「取数据、套白名单、打印、决定退出码」。
//
// Node 直接加载 .ts 靠的是剥类型，只支持可擦除语法——contentRules.ts 只有 `import type`，
// 装载时整段删掉，所以它不参与无扩展名解析。给那个文件加规则时别引入带值的相对 import。
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createInitialProfile, morphemes, rootMorphemes, words, worlds } from '../src/domain/data.ts'
import { AGGREGATE_MIN_WORDS, summarize, TARGET_WORD_COUNT, validateContent, validateWorlds } from '../src/domain/contentRules.ts'

const here = dirname(fileURLToPath(import.meta.url))
const gatesDir = join(here, 'gates')

/** 下划线开头的键是注释，不是条目。 */
function readAllowlist(name) {
  const path = join(gatesDir, name)
  if (!existsSync(path)) {
    // 白名单文件本身丢了比某一条白名单失效更危险：闸门会静默收紧，然后被人随手放宽。
    console.error(`缺少白名单文件：gates/${name}`)
    process.exit(1)
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  return Object.fromEntries(Object.entries(raw).filter(([key]) => !key.startsWith('_')))
}

const residueAllowlist = readAllowlist('residue-allowlist.json')
const unmodeledDistractorAllowlist = readAllowlist('unmodeled-distractor-allowlist.json')

// 有 provenance 边车才说明这批词是管线生成的；没有就是手写的 canary 切片。
const generated = existsSync(join(here, '.work', 'derived', 'provenance.json'))

// canary 清单：无论重新生成多少次，这 16 个词都必须还在。它们是这套玩法唯一的回归锚点。
const canaryWordIds = [
  'circumspect', 'inspection', 'respect', 'circumspection',
  'predict', 'prediction', 'predictable', 'predictive',
  'portable', 'import', 'report', 'porter',
  'visible', 'vision', 'revise', 'visibility',
]
const canarySet = new Set(canaryWordIds)

const findings = [
  ...validateContent(morphemes, words, { residueAllowlist, unmodeledDistractorAllowlist, generated, handwrittenIds: canarySet }),
  ...validateWorlds(morphemes, worlds),
]

const failures = []
const wordIds = new Set(words.map((word) => word.id))
for (const id of canaryWordIds) if (!wordIds.has(id)) failures.push(`canary 词条丢失：${id}`)

// TARGET_WORD_COUNT 是「这一阶段打算有多少个词」，和 canary 清单是两回事：
// canary 保证老的没丢，这个保证新的数量对得上，防止生成器悄悄少产一半。
if (words.length !== TARGET_WORD_COUNT) failures.push(`应有 ${TARGET_WORD_COUNT} 个词，实际 ${words.length} 个`)

const progressCount = createInitialProfile().progress.length
if (progressCount !== rootMorphemes.length) failures.push(`初始进度应有 ${rootMorphemes.length} 条，实际 ${progressCount} 条`)

// 还没启用的规则要明说，不能让人以为「跑过了」。
const skipped = []
if (!generated) skipped.push('A12（错项复用真实义项）、A19（provenance 覆盖）、A21（词源措辞与来源一致）、A27（隔离区批准）—— 手写切片没有 provenance')
if (words.length < AGGREGATE_MIN_WORDS) skipped.push(`A22（死变体）、A23（每个词根 ≥3 词且难度铺开）—— 样本 ${words.length} < ${AGGREGATE_MIN_WORDS}`)
skipped.push('A26（world id 联合类型）—— 由 TypeScript 在编译期保证，运行时看不到')

const { errors, warnings } = summarize(findings)
for (const finding of [...errors, ...warnings]) {
  console.log(`${finding.level === 'error' ? '✗' : '!'} [${finding.rule}] ${finding.target}：${finding.message}`)
}
for (const line of failures) console.log(`✗ [script] ${line}`)

console.log('')
for (const line of skipped) console.log(`– 跳过：${line}`)
console.log('')

if (errors.length + failures.length > 0) {
  console.error(`内容校验失败：${errors.length + failures.length} 个错误，${warnings.length} 个警告。`)
  process.exit(1)
}
console.log(`内容校验通过：${words.length} 个词、${morphemes.length} 个词素（含 ${rootMorphemes.length} 个词根）、${worlds.length} 个世界，${warnings.length} 个警告。`)
