// LLM pass 1：给 563 条候选词素写中文释义。
//
// ── 为什么这一步必须调 LLM，而不能继续用开源数据 ────────────────────────
// 权威来源 ECDICT wordroot.txt 的义项是**英文**的（`man, human` / `pertaining to`）。
// 用户不读英文，界面上必须是中文。两个中文词根表（cigen / shiweihappy）虽然有中文，
// 但它们是从新东方 PDF 抽的、质量也不可靠（`un` 被标成「难为情的」），
// 逐字复制既有版权风险又会把错误带进产物。所以中文释义全部重写。
//
// ── 提示词契约里最要紧的一条 ─────────────────────────────────────────────
// **模型不产出结构，只产出文字。** id / type / allomorphs 是冻结的、权威的——
// 和 30 号脚本里 parts 冻结是同一个原则。切分器最容易出的错是「拼得起来但切错了」，
// 让模型有机会改 allomorphs 就是把那个风险引进来。
//
// 模型要产出的只有：中文释义、显示写法、难度档、中文词源句、以及一个 keep 判断
// （有些词根在 CET 词表里根本长不出词，留着只会占地方）。
//
// 跑法：node scripts/11-glossary-llm-clean.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chatJson, mapBatches, MODELS, reportUsage } from './lib/llm.mjs'
// 汉字计数用闸门那一份实现，不另写一个。两套计数器必然会在边界上打架。
import { countHanzi } from '../src/domain/contentRules.ts'

const here = dirname(fileURLToPath(import.meta.url))
const derivedDir = join(here, '.work', 'derived')

const BATCH_SIZE = 25

/** 手写的那 12 个词素是最好的风格样本——让模型照着写，比写十条形容词规则管用。 */
const STYLE_EXAMPLES = [
  { id: 'circum', type: 'prefix', displayText: 'circum-', meaningCn: '周围' },
  { id: 'pre', type: 'prefix', displayText: 'pre-', meaningCn: '前、预先' },
  { id: 'in', type: 'prefix', displayText: 'in- / im-', meaningCn: '不；进入' },
  { id: 'spec', type: 'root', displayText: 'spec / spect', meaningCn: '看' },
  { id: 'port', type: 'root', displayText: 'port', meaningCn: '携带' },
  { id: 'able', type: 'suffix', displayText: '-able / -ible', meaningCn: '能够……的（形容词）' },
  { id: 'ive', type: 'suffix', displayText: '-ive', meaningCn: '具有……性质的（形容词）' },
  { id: 'ity', type: 'suffix', displayText: '-ity / -ty', meaningCn: '性质、状态（抽象名词）' },
  { id: 'ion', type: 'suffix', displayText: '-ion', meaningCn: '动作、过程（名词）' },
]

const SYSTEM = `你在给一个中文的「词根背单词」应用写词素释义表。用户是中学生到大学生，正在准备中考/高考/四六级。

# 你的产出会被机器规则逐条校验，不通过就整条丢弃

硬性格式（违反任意一条这条就废了）：

1. meaningCn：
   - 只允许汉字、顿号「、」、分号「；」、省略号「……」、全角括号「（）」。**不许出现任何拉丁字母。**
   - 汉字个数上限：词根和前缀 **6 个**；后缀 **8 个**。
   - **括号里的词性也算进这个字数预算**，不是只数前半截。这是最容易踩的坑。
   - 词根/前缀：直接写意思，如「周围」「看」「携带」「前、预先」。用「、」或「；」分隔，**最多 3 个义项**，再多就超字数了。
   - 后缀：写成「……的（形容词）」这种样子，末尾用全角括号标词性；一个词素最多标两个词性，用「/」连。
     照着下面数一遍再落笔：
       「能够……的（形容词）」= 6 字 ✓
       「做……的（形容词）」= 5 字 ✓
       「做……的（形容词/名词）」= 7 字 ✓
       「相关的人或物（名词）」= 7 字 ✓
       「与……相关的人或物（名词）」= 9 字 ✗ 超了——去掉「与」和「的」
       「做……的（形容词）；做……的人（名词）」= 10 字 ✗ 超了——两个词性塞进一个括号里
   - **不许把现代汉语的完整释义抄进去**。这是词素义，要短、要能拼出画面感，不是词典释义。

2. displayText：
   - 前缀以连字符结尾（\`pre-\`），后缀以连字符开头（\`-able\`），词根两边都不带（\`port\`）。
   - 有同源变体时用「 / 」分隔全部写法，如 \`-able / -ible\`、\`spec / spect\`。

3. level：1–5 的整数，表示这个词素在中学阶段出现的早晚。1 = 初中就见到，5 = 六级才见到。
   参考：高频短词根（port、dict、vid）= 1–2；常见的（spec、ity）= 2–3；生僻的（pter、loqu）= 4–5。

4. etymologyZh：一句中文，说清它来自哪种语言、原本是什么意思。不超过 30 个汉字。
   **只能基于给你的 origin 字段（Latin / Greek / …）和 glossEn 来写，不许编造你记忆里的其他词源细节。**

5. keep：这个词素值不值得收进词库？
   - 收的条件：它在英语里能长出一批常用词（例词列表里有你认识的常见词）。
   - 不收的条件：例词全是生僻词、或它其实是某个更基本词素的重复写法、或它不是真正的构词单位。
   - 不收时 rejectReason 写一句中文说明。

6. 有 variants 的条目（同形异义，比如 \`-al1\` 形容词后缀和 \`-al2\` 名词后缀）：
   额外给 chosenVariant（下标，从 0 开始）和 variantReason。
   挑那个**对学习者更有用**的义项——即例词更常见、在更多 CET 词里出现的那一个。

# 参考数据的可信度（很重要）

- glossEn、origin、examples 来自 ECDICT：**权威，以它为准**。
- zhCandidates 来自两份中文词根表，它们是别人的学习资料、且是从 PDF 抽出来的：
  **语义上仅供参考，可能完全错误，绝不要照抄措辞。** 遇到和 glossEn 冲突时一律以 glossEn 为准。

# 输出

只输出一个 JSON 对象，形如：
{"results":[{"id":"…","meaningCn":"…","displayText":"…","level":2,"etymologyZh":"…","keep":true,"rejectReason":"","chosenVariant":0,"variantReason":""}]}

- results 必须**和输入的条目一一对应**，id 原样返回，不许多、不许少、不许改。
- 没有 variants 的条目，chosenVariant 填 0，variantReason 填空字符串。`

function buildUser(batch) {
  const payload = batch.map((entry) => {
    const item = {
      id: entry.id,
      type: entry.type,
      glossEn: entry.glossEn,
      origin: entry.origin,
      examples: entry.examples.slice(0, 8),
    }
    if (entry.variants.length > 1) {
      item.variants = entry.variants.map((variant) => ({ surface: variant.surface, glossEn: variant.glossEn }))
    }
    const zh = entry.zhCandidates.map((candidate) => candidate.text).filter(Boolean).slice(0, 2)
    if (zh.length > 0) item.zhCandidates = zh
    return item
  })

  return `风格样本（照着这个写）：
${JSON.stringify(STYLE_EXAMPLES, null, 2)}

要处理的条目：
${JSON.stringify(payload, null, 2)}

把这 ${batch.length} 条按上面的格式产出。`
}

/** 机器校验。模型说的不算，自己数一遍。 */
function checkResult(entry, result) {
  const problems = []
  if (typeof result.meaningCn !== 'string' || result.meaningCn.length === 0) {
    problems.push('meaningCn 缺失')
  } else {
    const hanzi = countHanzi(result.meaningCn)
    const limit = entry.type === 'suffix' ? 8 : 6
    if (hanzi < 1 || hanzi > limit) problems.push(`meaningCn 有 ${hanzi} 个汉字，上限 ${limit}：「${result.meaningCn}」`)
    if (/[A-Za-z]/.test(result.meaningCn)) problems.push(`meaningCn 含拉丁字母：「${result.meaningCn}」`)
  }
  if (typeof result.displayText !== 'string' || result.displayText.length === 0) problems.push('displayText 缺失')
  if (!Number.isInteger(result.level) || result.level < 1 || result.level > 5) problems.push(`level 非法：${result.level}`)
  if (typeof result.etymologyZh !== 'string' || result.etymologyZh.length === 0) problems.push('etymologyZh 缺失')
  if (countHanzi(result.etymologyZh || '') > 30) problems.push(`etymologyZh 超过 30 汉字`)
  if (typeof result.keep !== 'boolean') problems.push('keep 不是布尔值')
  if (result.keep === false && !result.rejectReason) problems.push('keep 为 false 但没给 rejectReason')
  return problems
}

// ── 主流程 ────────────────────────────────────────────────────────────────

const candidatesPath = join(derivedDir, 'roots.candidates.json')
if (!existsSync(candidatesPath)) {
  console.error('缺少 .work/derived/roots.candidates.json，先跑 node scripts/10-build-roots.mjs')
  process.exit(1)
}
const candidates = JSON.parse(readFileSync(candidatesPath, 'utf8'))
const entries = candidates.entries

console.log(`给 ${entries.length} 条候选词素写中文释义，每批 ${BATCH_SIZE} 条，模型 ${MODELS.generator}`)
console.log('（命中缓存的话是免费的，重跑不会重复花钱）\n')

const raw = await mapBatches(
  entries,
  BATCH_SIZE,
  async (batch, index) => {
    const json = await chatJson({
      model: MODELS.generator,
      system: SYSTEM,
      user: buildUser(batch),
      label: `11 批 ${index + 1}`,
    })
    const rows = Array.isArray(json.results) ? json.results : []
    const byId = new Map(rows.map((row) => [row.id, row]))
    console.log(`  批 ${index + 1}/${Math.ceil(entries.length / BATCH_SIZE)}：要 ${batch.length} 条，回 ${rows.length} 条`)
    // 模型漏条或写错 id 时不要静默跳过——把缺的标出来，让 12 号规则决定丢还是留。
    return batch.map((entry) => ({ entry, result: byId.get(entry.id) ?? null }))
  },
  4,
)

const cleaned = []
const failures = []
for (const { entry, result } of raw) {
  if (!result) {
    failures.push({ id: entry.id, problems: ['模型没返回这一条'] })
    continue
  }
  const problems = checkResult(entry, result)
  if (problems.length > 0) {
    failures.push({ id: entry.id, problems })
    continue
  }
  cleaned.push({
    id: entry.id,
    // id / type / allomorphs 是冻结的，照抄候选表，不看模型怎么说
    type: entry.type,
    allomorphs: entry.allomorphs,
    displayText: result.displayText,
    meaningCn: result.meaningCn,
    level: result.level,
    color: entry.type === 'prefix' ? 'blue' : entry.type === 'root' ? 'orange' : 'green',
    etymologyZh: result.etymologyZh,
    keep: result.keep,
    rejectReason: result.rejectReason || '',
    // 词源审计用：出厂产物里的 etymologyZh 必须能追溯到 ECDICT 的英文义项
    sourceGlossEn: entry.glossEn,
    sourceOrigin: entry.origin,
    examples: entry.examples.slice(0, 8),
    chosenVariant: Number.isInteger(result.chosenVariant) ? result.chosenVariant : 0,
    variantReason: result.variantReason || '',
    provenance: entry.provenance,
  })
}

mkdirSync(derivedDir, { recursive: true })
const outPath = join(derivedDir, 'roots.cleaned.json')
writeFileSync(outPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  generator: 'scripts/11-glossary-llm-clean.mjs',
  model: MODELS.generator,
  sources: candidates.sources,
  entries: cleaned,
}, null, 2)}\n`)

writeFileSync(join(derivedDir, 'roots.llm-failures.json'), `${JSON.stringify(failures, null, 2)}\n`)

const kept = cleaned.filter((entry) => entry.keep).length
const suffixAtLimit = cleaned.filter((entry) => entry.type === 'suffix' && countHanzi(entry.meaningCn) >= 7).length

console.log('')
console.log(`写出 ${cleaned.length} 条到 .work/derived/roots.cleaned.json`)
console.log(`  其中 keep=true 的 ${kept} 条，keep=false 的 ${cleaned.length - kept} 条（12 号规则会丢弃）`)
console.log(`  机器校验没过的 ${failures.length} 条 → roots.llm-failures.json`)
if (suffixAtLimit > 0) console.log(`  提示：${suffixAtLimit} 个后缀的释义已到 7–8 字的边缘，Stage 2 前考虑统一收紧`)
for (const failure of failures.slice(0, 8)) console.log(`    · ${failure.id}：${failure.problems[0]}`)
if (failures.length > 8) console.log(`    … 其余 ${failures.length - 8} 条见 roots.llm-failures.json`)

reportUsage('11 号词根清洗')
console.log('\n下一步：node scripts/12-glossary-rules.mjs')
