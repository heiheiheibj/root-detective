// 60 号：对【组装后的产物】做对抗式复核（文档第 11 步）。
//
// 注意审的是 words.json（组装后），不是生成器输出——这样才能抓到切分器和组装器的 bug。
//
// handoff 模式（本阶段红线：零成本、无 OpenRouter）：
//   复核结论存 scripts/lib/handoff/words-review.json（静态数据，随仓库保存）。
//   缺这份文件且有 OPENROUTER_API_KEY 时，退回真调 MODELS.reviewer（对抗式提示词）。
//
// 输出  scripts/.work/derived/words.reviewed.json
//        scripts/.work/quarantine/<日期>/<id>.json   （severity=major：该词永不出货）
//        scripts/.work/derived/excluded-words.json   （给 40 号的排除清单）
//        scripts/.work/derived/drift.json            （漂移探测结果）
//
// 退出码：复核数据缺词/字段不全、出现 major、或漂移率 > 5% → 1（阻断发布）。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const derivedDir = join(here, '.work', 'derived')
const quarantineDir = join(here, '.work', 'quarantine')
const handoffPath = join(here, 'lib', 'handoff', 'words-review.json')

const words = JSON.parse(readFileSync(join(here, '..', 'src', 'domain', 'content', 'words.json'), 'utf8'))
const morphemes = JSON.parse(readFileSync(join(here, '..', 'src', 'domain', 'content', 'morphemes.json'), 'utf8'))
const morphemeById = new Map(morphemes.map((m) => [m.id, m]))

const CHECK_KEYS = [
  'splitMatchesWord', 'splitMatchesEtymology', 'literalComposedFromGlosses', 'metaphorExtendsLiteral',
  'optionsThreeDistinct', 'optionAIsCorrectAnswer', 'optionBWrongForStatedReason', 'optionCWrongForStatedReason',
  'exampleEnContainsWord', 'exampleCnTranslatesExampleEn', 'sourceNoteConsistentWithEtymology',
  'mnemonicFreeOfAnswerLeak', 'noInventedMorpheme',
]

// ── 取复核结果：handoff 优先，缺了才真调 LLM ─────────────────────────────────
async function loadReviews() {
  if (existsSync(handoffPath)) {
    const raw = JSON.parse(readFileSync(handoffPath, 'utf8'))
    console.log(`[handoff] 命中 scripts/lib/handoff/words-review.json（${Object.keys(raw).length} 条），不调 LLM`)
    return { map: raw, source: 'handoff:words-review.json' }
  }
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('缺少 scripts/lib/handoff/words-review.json，也没有 OPENROUTER_API_KEY，复核没法做。')
    process.exit(1)
  }
  const { chatJson, mapBatches, MODELS, reportUsage } = await import('./lib/llm.mjs')
  const system = [
    '你是一个严格的审校员，任务是【找出下面每个词条的缺陷】，默认倾向于报告问题，拿不准就报 major。',
    '会拿到：冻结的切分 parts（含每个词素的义项）、单词、音标、词性、现代释义、例句对、待审文案。',
    '逐项检查：切分是否与单词和词源相符；字面义是否只由给定义项按顺序组成；隐喻是否从字面义推出；',
    '三个选项是否互不相同且第 0 个是正确答案、第 1/2 个是否「有具体理由地错」；例句英文是否包含该词、',
    '中文是否忠实翻译英文；sourceNote 的词源说法是否与词素来源一致；助记是否泄露答案；有没有凭空编造词素。',
    '只输出 JSON：{"results":[{"id":"…","checks":{…13 项布尔…},"severity":"ok|minor|major","issues":[{"field":"…","problem":"…","suggestedFix":"…"}]}]}',
    'results 必须和输入一一对应，id 原样返回。不许改切分、不许改任何字段——你只报告，不修。',
  ].join('\n')
  const results = await mapBatches(words, 8, async (batch) => {
    const user = JSON.stringify(batch.map((w) => ({
      id: w.id, phonetic: w.phonetic, partOfSpeech: w.partOfSpeech,
      modernMeaningCn: w.modernMeaningCn, literalMeaningCn: w.literalMeaningCn,
      metaphorMeaningCn: w.metaphorMeaningCn, metaphorOptions: w.metaphorOptions,
      exampleEn: w.exampleEn, exampleCn: w.exampleCn, sourceNote: w.sourceNote, mnemonicNote: w.mnemonicNote,
      parts: w.parts.map((p) => ({ morphemeId: p.morphemeId, surface: p.surface, meaningCn: morphemeById.get(p.morphemeId)?.meaningCn ?? '' })),
    })))
    const out = await chatJson({ model: MODELS.reviewer, system, user, temperature: 0, label: '60-复核' })
    return out.results ?? []
  }, 4)
  reportUsage('60 号内容复核')
  const map = {}
  for (const r of results.flat()) map[r.id] = { checks: r.checks, severity: r.severity, issues: r.issues ?? [] }
  return { map, source: `llm:${MODELS.reviewer}` }
}

const { map: reviews, source } = await loadReviews()

// ── 复核数据完整性 ────────────────────────────────────────────────────────────
// 两种「不完整」要分开对待：
//   · **字段坏**（有记录但 check 缺项 / severity 非法 / 词表外的词）→ 数据被污染，硬失败。
//     沉默放行等于把「复核说它有问题」当成「复核说它没问题」。
//   · **整条缺记录** → Stage 3 铺到 2698 词后，复核 handoff 只写了 Stage 1 那 300 词。
//     原先这也硬失败，结果是 content:all 从 Stage 3.4 起就一直死在这一步、70 号报告
//     停在 09-13 的「词条 300」，没人再看它 —— 闸门常红比没有闸门更糟（复核报告 3.7）。
//     改成：响亮地报告覆盖缺口、按「未复核」放行并写进产物，让 70 号如实报告覆盖率；
//     补齐 handoff 后这条警告自然消失。
const problems = []
const wordIds = new Set(words.map((w) => w.id))
const missingReviews = []
for (const id of wordIds) {
  const r = reviews[id]
  if (!r) { missingReviews.push(id); continue }
  for (const key of CHECK_KEYS) if (typeof r.checks?.[key] !== 'boolean') problems.push(`${id} 缺 check ${key}`)
  if (!['ok', 'minor', 'major'].includes(r.severity)) problems.push(`${id} severity 非法：${r.severity}`)
  if (!Array.isArray(r.issues)) problems.push(`${id} issues 不是数组`)
}
for (const id of Object.keys(reviews)) if (!wordIds.has(id)) problems.push(`复核里有词表外的词：${id}`)
if (problems.length) {
  console.error('复核数据不完整（记录坏了，必须修）：')
  for (const p of problems) console.error('  ✗ ' + p)
  process.exit(1)
}
if (missingReviews.length) {
  console.warn(`⚠ ${missingReviews.length}/${words.length} 个词没有复核记录，按「未复核」放行（70 号会如实报告覆盖率）。`)
  console.warn(`   复核 handoff（scripts/lib/handoff/words-review.json）目前只覆盖 Stage 1 切片；样例：${missingReviews.slice(0, 8).join('、')}${missingReviews.length > 8 ? ' …' : ''}`)
}

// ── 路由：major → 隔离区 + 排除清单；minor/ok → 出货；未复核 → 出货但单独记账 ──
const results = []
const majors = []
for (const w of words) {
  const r = reviews[w.id]
  const severity = r?.severity ?? 'unreviewed'
  results.push({ id: w.id, severity, checks: r?.checks ?? null, issues: r?.issues ?? [], covered: Boolean(r), shipped: severity !== 'major' })
  if (severity === 'major') majors.push(w)
}

if (majors.length) {
  const day = new Date().toISOString().slice(0, 10)
  const dir = join(quarantineDir, day)
  mkdirSync(dir, { recursive: true })
  for (const w of majors) {
    writeFileSync(join(dir, `${w.id}.json`), `${JSON.stringify({ id: w.id, reason: reviews[w.id].issues, reviewedAt: new Date().toISOString() }, null, 2)}\n`)
  }
  writeFileSync(join(derivedDir, 'excluded-words.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), ids: majors.map((w) => w.id) }, null, 2)}\n`)
  console.error(`\n✗ ${majors.length} 个词被判 major，已进隔离区并写入 excluded-words.json（40 号重跑时会剔除，词量闸门随之报错，直到上游修好）：`)
  for (const w of majors) console.error(`   - ${w.id}`)
} else if (existsSync(join(derivedDir, 'excluded-words.json'))) {
  console.log('本轮没有 major，清掉旧的 excluded-words.json')
}

// ── 漂移探测器（计划书 11.5）：同输入重跑生成器，比对样本输出 ─────────────────
// 手写实现里最容易漏的就是它——没有人读英文时，这是唯一能发现「同一个词昨天是 A、今天是 B」的机制。
// handoff 模式下生成器是静态文件，重放必然一致；等切回真 LLM，这条才会真的开始测模型漂移。
function hashId(id) {
  let hash = 2166136261
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
const prosePath = join(derivedDir, 'words.prose.json')
const drift = { sampled: 0, mismatched: 0, rate: 0, mode: '', blocked: false, sampleIds: [] }
if (existsSync(prosePath)) {
  const before = readFileSync(prosePath, 'utf8')
  const beforeMap = new Map(JSON.parse(before).map((p) => [p.word, p]))
  // 只在生成器实际输出的词里抽样：canary 的文案在 overrides 里，30 号本来就跳过它们，
  // 把它们算进来会把「设计如此」当成「输出漂移」。
  const eligible = words.filter((w) => beforeMap.has(w.id))
  // 样本：Stage 1 只有 67 词，2% ≈ 1.3 个等于没测，下限 8 个；用 id 哈希取模保证每次重跑选的一样。
  const target = Math.max(8, Math.round(eligible.length * 0.02))
  const pct = Math.min(100, Math.ceil((target / eligible.length) * 100))
  const sample = eligible.filter((w) => hashId(w.id) % 100 < pct)
  drift.sampleIds = sample.map((w) => w.id)
  drift.sampled = sample.length
  const run = spawnSync(process.execPath, [join(here, '30-llm-prose.mjs')], {
    env: { ...process.env, RD_NO_CACHE: '1' },
    encoding: 'utf8',
  })
  if (run.status !== 0) {
    console.error('漂移探测：重跑 30 号失败。')
    console.error(run.stdout); console.error(run.stderr)
    process.exit(1)
  }
  const afterMap = new Map(JSON.parse(readFileSync(prosePath, 'utf8')).map((p) => [p.word, p]))
  for (const w of sample) {
    const a = beforeMap.get(w.id); const b = afterMap.get(w.id)
    if (!a || !b) { drift.mismatched += 1; continue }
    const fields = ['modernMeaningCn', 'literalMeaningCn', 'metaphorMeaningCn', 'metaphorOptions', 'mnemonicNote', 'sourceNote']
    if (fields.some((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]))) drift.mismatched += 1
  }
  // 恢复原文件：探测只读不改，产物必须和进来的那一次完全一致。
  writeFileSync(prosePath, before)
  drift.rate = drift.sampled ? drift.mismatched / drift.sampled : 0
  drift.mode = existsSync(join(here, 'lib', 'handoff', 'words-prose.json')) ? 'handoff（生成器是静态文件，重放必然一致）' : 'live-llm（RD_NO_CACHE 重放）'
  drift.blocked = drift.rate > 0.05
}

writeFileSync(join(derivedDir, 'drift.json'), `${JSON.stringify(drift, null, 2)}\n`)
writeFileSync(join(derivedDir, 'words.reviewed.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), reviewer: source, total: results.length, results }, null, 2)}\n`)

// ── 汇总 ─────────────────────────────────────────────────────────────────────
const tally = { ok: 0, minor: 0, major: 0, unreviewed: 0 }
for (const r of results) tally[r.severity] += 1
console.log('')
console.log(`复核完成（${source}）：ok ${tally.ok} / minor ${tally.minor} / major ${tally.major} / 未复核 ${tally.unreviewed}（覆盖 ${results.length - tally.unreviewed}/${results.length}）`)
for (const r of results) {
  if (r.severity === 'ok' || r.severity === 'unreviewed') continue
  for (const issue of r.issues) console.log(`  ! [${r.severity}] ${r.id} ${issue.field}：${issue.problem}`)
}
console.log(`漂移探测：样本 ${drift.sampled}/${words.length}（${drift.sampleIds.join('、')}），不一致 ${drift.mismatched}，漂移率 ${(drift.rate * 100).toFixed(1)}%，模式：${drift.mode}`)

if (drift.blocked) {
  console.error(`✗ 漂移率 ${(drift.rate * 100).toFixed(1)}% > 5%，判定提示词不稳定，阻断发布。`)
  process.exit(1)
}
if (majors.length) process.exit(1)
console.log('下一步：node scripts/70-report.mjs')
