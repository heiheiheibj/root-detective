// 12 号：词根确定性闸门。
//
// 输入  .work/derived/roots.cleaned.json   （11 号产物，或 handoff 直供版）
// 输出  .work/derived/roots.validated.json + roots.rejected.json
//
// 全部规则都是确定性的，不调 LLM，免费、可重跑。11 号（或 handoff）给的是
// 「英文义项 → 中文释义」的候选，这一关负责把不合格的丢掉、把同形异义和
// type 冲突裁决掉，只留下能出厂的词素。
//
// 裁决原则（和文档一致）：
//   同形异义 → 取 chosenVariant 指定的义项，被放弃的写进 rejected
//   type 冲突 → 以 ECDICT 的 type 为准（它是唯一许可干净、结构完整的来源）
//   实在判断不了 → 写进 rejected，理由「来源冲突无法自动裁决，需人工」，绝不猜
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { countHanzi } from '../src/domain/contentRules.ts'

const here = dirname(fileURLToPath(import.meta.url))
const derivedDir = join(here, '.work', 'derived')

const cleanedPath = join(derivedDir, 'roots.cleaned.json')
if (!existsSync(cleanedPath)) {
  console.error('缺少 .work/derived/roots.cleaned.json，先跑 node scripts/11-glossary-llm-clean.mjs（或把 handoff 直供版放好）')
  process.exit(1)
}
const cleaned = JSON.parse(readFileSync(cleanedPath, 'utf8'))
const entries = cleaned.entries || cleaned

// 11 号机器校验没过的 id 一律丢弃
const failuresPath = join(derivedDir, 'roots.llm-failures.json')
const failures = new Set()
if (existsSync(failuresPath)) {
  for (const failure of JSON.parse(readFileSync(failuresPath, 'utf8'))) failures.add(failure.id)
}

const TYPE_COLOR = { prefix: 'blue', root: 'orange', suffix: 'green' }
const VALID_TYPES = new Set(['root', 'prefix', 'suffix'])

const rejected = []
const validated = []
const seenDisplay = new Set()

function reject(entry, reason) {
  rejected.push({ id: entry.id, type: entry.type, displayText: entry.displayText, meaningCn: entry.meaningCn, reason })
}

for (const entry of entries) {
  const at = entry.id || '?'

  // 1. keep === false 的丢弃
  if (entry.keep === false) {
    reject(entry, (entry.rejectReason || 'keep 为 false') + '（模型判断不值得收）')
    continue
  }

  // 2. 机器校验没过
  if (failures.has(entry.id)) {
    reject(entry, '11 号机器校验没通过（见 roots.llm-failures.json）')
    continue
  }

  // 3. id 必须纯小写字母
  if (!/^[a-z]+$/.test(entry.id || '')) {
    reject(entry, `id「${entry.id}」不是纯小写字母`)
    continue
  }

  // 4. displayText 全局唯一（只留第一个）
  if (seenDisplay.has(entry.displayText)) {
    reject(entry, `displayText「${entry.displayText}」重复，只保留第一条`)
    continue
  }
  seenDisplay.add(entry.displayText)

  // 5. allomorphs 非空数组
  if (!Array.isArray(entry.allomorphs) || entry.allomorphs.length === 0) {
    reject(entry, 'allomorphs 为空')
    continue
  }

  // 6. meaningCn 汉字数 1–8
  const hanzi = countHanzi(entry.meaningCn || '')
  if (hanzi < 1 || hanzi > 8) {
    reject(entry, `meaningCn「${entry.meaningCn}」有 ${hanzi} 个汉字，应在 1–8`)
    continue
  }

  // 7. meaningCn 不得含拉丁字母
  if (/[A-Za-z]/.test(entry.meaningCn || '')) {
    reject(entry, `meaningCn 含拉丁字母：「${entry.meaningCn}」`)
    continue
  }

  // 8. level 1–5 整数
  if (!Number.isInteger(entry.level) || entry.level < 1 || entry.level > 5) {
    reject(entry, `level「${entry.level}」不是 1–5 的整数`)
    continue
  }

  // 9. type/color 对应
  if (!VALID_TYPES.has(entry.type)) {
    reject(entry, `type「${entry.type}」不是 root/prefix/suffix`)
    continue
  }
  if (TYPE_COLOR[entry.type] !== entry.color) {
    // ECDICT 的 type 是权威，颜色跟着 type 走。若脚本已经据 type 填了颜色就不会走到这。
    reject(entry, `color「${entry.color}」和 type「${entry.type}」不对应`)
    continue
  }

  // ---- 冲突裁决 ----
  // 11 号留了 chosenVariant（下标）。能落到这里说明：它有 variants 且模型已裁决，
  // 或者没有 variants 时 chosenVariant 恒为 0。我们取 variants[chosenVariant] 的义项
  // 作为 sourceGlossEn 的最终依据。被放弃的义项记 rejected。
  if (Array.isArray(entry.variants) && entry.variants.length > 1) {
    const chosen = Number.isInteger(entry.chosenVariant) && entry.chosenVariant < entry.variants.length ? entry.chosenVariant : 0
    if (chosen !== 0) {
      // 第一个义项被放弃
      rejected.push({
        id: entry.id,
        type: entry.type,
        displayText: entry.displayText,
        meaningCn: entry.variants[0].glossEn,
        reason: '同形异义，取了另一个义项（chosenVariant=' + chosen + '）',
      })
    }
    entry.sourceGlossEn = entry.variants[chosen].glossEn
  }

  // 校验 etymologyZh 存在（不出产就不写，但这里只做信息性提示）
  if (!entry.etymologyZh) {
    rejected.push({ id: entry.id, type: entry.type, reason: '缺少 etymologyZh' })
    continue
  }

  validated.push(entry)
}

mkdirSync(derivedDir, { recursive: true })
writeFileSync(join(derivedDir, 'roots.validated.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), generator: 'scripts/12-glossary-rules.mjs', entries: validated }, null, 2)}\n`)
writeFileSync(join(derivedDir, 'roots.rejected.json'), `${JSON.stringify({ entries: rejected }, null, 2)}\n`)

const byType = { root: 0, prefix: 0, suffix: 0 }
for (const entry of validated) byType[entry.type] += 1
const reasons = {}
for (const item of rejected) {
  const key = (item.reason || '?').slice(0, 18)
  reasons[key] = (reasons[key] || 0) + 1
}

console.log('')
console.log(`通过: ${validated.length} 条`)
console.log(`  词根 ${byType.root}，前缀 ${byType.prefix}，后缀 ${byType.suffix}`)
console.log(`拒绝: ${rejected.length} 条`)
Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([reason, count]) => console.log(`  ${count}  ${reason}`))
console.log('')
console.log('已写出 .work/derived/roots.validated.json + roots.rejected.json')
console.log('下一步：node scripts/13-glossary-llm-review.mjs（或 handoff 复核）')