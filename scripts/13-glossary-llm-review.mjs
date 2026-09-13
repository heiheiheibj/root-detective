// LLM pass 2：用和生成器不同的模型，对抗式复核词根表。
//
// ── handoff 模式（这台机器没有 OPENROUTER_API_KEY，用户不走 OpenRouter）──
// 脚本**优先**读 scripts/handoff/roots-review.json（由执行 AI 手写的静态复核结果，
// 等价于复核模型的输出且可复现）；没有才回退到真正的 LLM 调用。
// handoff 格式：
//   { "rows": [ { entry: {...12 号产物...}, result: { id, verdict, issue, correctedMeaningCn } } ] }
//
// 裁决规则（与文档一致）：
//   ok       → 进 reviewed，正常出货
//   suspect  → 进 reviewed 但打 reviewFlag，汇报时统计
//   reject   → 进 .work/quarantine/词根/，不进 reviewed
// ⚠️ 绝不自动采用 correctedMeaningCn——那是绕过 12 号规则。真要采纳 → 改完重跑 12 号。
//    correctedMeaningCn 只写进隔离区文件供人工参考。
//
// 跑法：node scripts/13-glossary-llm-review.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chatJson, mapBatches, MODELS, reportUsage } from './lib/llm.mjs'
import { hasHandoff, handoffDir } from './lib/handoff.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const derivedDir = join(here, '.work', 'derived')
const quarantineDir = join(here, '.work', 'quarantine')

const BATCH_SIZE = 20

const SYSTEM = `你是一个严格的审校员。你的任务是**找出下面每一条词素释义的缺陷**。
默认倾向于报告问题——如果拿不准，就报 suspect，不要报 ok。

逐条检查：
1. meaningCn 说的意思和英文义项（glossEn）对得上吗？
2. meaningCn 是不是太宽泛、或者根本是另一个词素的意思？
3. displayText 的连字符位置对吗？（前缀结尾带 -、后缀开头带 -、词根都不带）
4. level 合理吗？1=初中见到、5=六级才见到
5. etymologyZh 里说的来源语言和 origin 字段一致吗？有没有编造细节？

只输出 JSON：{"results":[{"id":"...","verdict":"ok|suspect|reject","issue":"...","correctedMeaningCn":"..."}]}
verdict 只能是 ok / suspect / reject 三个值之一。
results 必须和输入一一对应，id 原样返回。`

function buildUser(batch) {
  const payload = batch.map((entry) => ({
    id: entry.id,
    type: entry.type,
    displayText: entry.displayText,
    meaningCn: entry.meaningCn,
    level: entry.level,
    etymologyZh: entry.etymologyZh,
    glossEn: entry.sourceGlossEn || entry.glossEn,
    origin: entry.sourceOrigin || entry.origin,
  }))
  return `请逐条审校下面 ${batch.length} 条词素，只输出 JSON（verdict 必须是 ok/suspect/reject 之一）：
${JSON.stringify(payload, null, 2)}`
}

async function main() {
  const validatedPath = join(derivedDir, 'roots.validated.json')
  if (!existsSync(validatedPath)) {
    console.error('缺少 .work/derived/roots.validated.json，先跑 node scripts/12-glossary-rules.mjs')
    process.exit(1)
  }
  const validated = JSON.parse(readFileSync(validatedPath, 'utf8'))
  const entries = validated.entries || validated

  if (!process.env.OPENROUTER_API_KEY && !hasHandoff('roots-review')) {
    console.error('没有 OPENROUTER_API_KEY，也没有 scripts/handoff/roots-review.json。')
    console.error('这台机器按用户要求不走 OpenRouter：请把执行 AI 写好的 roots-review.json 放到 scripts/handoff/，或配置 OPENROUTER_API_KEY。')
    process.exit(1)
  }

  console.log(`复核 ${entries.length} 条，每批 ${BATCH_SIZE} 条，模型 ${MODELS.reviewer}`)
  console.log('（命中缓存/命中 handoff 的话免费，重跑不会重复花钱）\n')

  // 异步部分：真调 LLM 时用 mapBatches，handoff 时直接读。
  const runner = async () => {
    if (hasHandoff('roots-review')) {
      const handoff = JSON.parse(readFileSync(join(handoffDir, 'roots-review.json'), 'utf8'))
      const byId = new Map(handoff.rows.map((row) => [row.entry?.id, row]))
      const rows = entries.map((entry) => byId.get(entry.id) ?? { entry, result: null })
      console.log(`[handoff] 命中 scripts/handoff/roots-review.json，${handoff.rows.length} 条已配对结果，不调 LLM`)
      return rows
    }
    return mapBatches(
      entries,
      BATCH_SIZE,
      async (batch, index) => {
        const json = await chatJson({
          model: MODELS.reviewer,
          system: SYSTEM,
          user: buildUser(batch),
          label: `13 批 ${index + 1}`,
        })
        const batchRows = Array.isArray(json.results) ? json.results : []
        const byId = new Map(batchRows.map((row) => [row.id, row]))
        console.log(`  批 ${index + 1}/${Math.ceil(entries.length / BATCH_SIZE)}：要 ${batch.length} 条，回 ${batchRows.length} 条`)
        return batch.map((entry) => ({ entry, result: byId.get(entry.id) ?? null }))
      },
      4,
    )
  }

  const rows = await runner()

  // ── 裁决 ──
  const reviewed = []
  const rejected = [] // 只有 reject 才进隔离区
  const flags = []
  for (const { entry, result } of rows) {
    const verdict = result?.verdict
    if (!verdict) {
      rejected.push({ ...entry, review: { verdict: 'reject', issue: '复核模型没返回这一条' } })
      continue
    }
    if (verdict === 'reject') {
      rejected.push({ ...entry, review: { verdict, issue: result.issue, correctedMeaningCn: result.correctedMeaningCn } })
      continue
    }
    reviewed.push({ ...entry, reviewFlag: verdict === 'suspect', reviewIssue: verdict === 'suspect' ? result.issue : '' })
    if (verdict === 'suspect') flags.push({ id: entry.id, issue: result.issue })
  }

  // 非异步部分：写文件
  mkdirSync(derivedDir, { recursive: true })
  writeFileSync(join(derivedDir, 'roots.reviewed.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), generator: 'scripts/13-glossary-llm-review.mjs', model: MODELS.reviewer, entries: reviewed }, null, 2)}\n`)

  // reject 进隔离区
  if (rejected.length > 0) {
    const date = new Date().toISOString().slice(0, 10)
    const dir = join(quarantineDir, date)
    mkdirSync(dir, { recursive: true })
    for (const entry of rejected) {
      writeFileSync(join(dir, `${entry.id}.json`), `${JSON.stringify(entry, null, 2)}\n`)
    }
  }

  const okCount = reviewed.filter((e) => !e.reviewFlag).length
  const flagCount = flags.length
  const rejectPct = (rejected.length / entries.length) * 100

  console.log('')
  console.log(`复核完成：ok+ok/suspect ${reviewed.length} 条（其中 suspect ${flagCount} 条），reject ${rejected.length} 条（${rejectPct.toFixed(1)}%）`)
  if (flagCount > 0) {
    console.log('  suspect 明细：')
    for (const f of flags) console.log(`    · ${f.id}: ${f.issue}`)
  }
  console.log(`已写出 ${reviewed.length} 条到 .work/derived/roots.reviewed.json`)
  if (rejected.length > 0) console.log(`隔离区：${rejected.length} 条 → .work/quarantine/`)

  // ⚠️ 文档红线：reject >20% 说明要么模型太苛刻、要么 11 号质量差，停下来告诉用户。
  if (rejectPct > 20) {
    console.error(`\n⚠️ reject 占比 ${rejectPct.toFixed(1)}% 超过 20%——要么复核模型太苛刻，要么 11 号生成质量真的差。`)
    console.error('按文档要求，停下来向用户报告，不继续。')
    process.exit(1)
  }

  reportUsage('13 号词根复核')
  console.log('\n下一步：node scripts/20-select-words.mjs')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})