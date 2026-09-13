// 70 号：Stage 1 产出报告（文档第 12 步）。确定性，不调 LLM。
//
// 写到 scripts/.work/report.md：
//   - 每个词根的覆盖度、难度分布（A23 的两面）
//   - 隔离率（60 号判 major 的比例）
//   - 产物体积（gzip）
//   - 切分分歧（21 号 vs cigen 的交叉验证结果）
//   - 本次花销（handoff 模式 = 0）
import { gzipSync } from 'node:zlib'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const derivedDir = join(here, '.work', 'derived')
const rawDir = join(here, '.work', 'raw')
const contentDir = join(here, '..', 'src', 'domain', 'content')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

const words = readJson(join(contentDir, 'words.json'))
const morphemes = readJson(join(contentDir, 'morphemes.json'))
const worlds = readJson(join(contentDir, 'worlds.json'))
const provenance = readJson(join(derivedDir, 'provenance.json'))
const reviewed = readJson(join(derivedDir, 'words.reviewed.json'))
const drift = readJson(join(derivedDir, 'drift.json'))
const splits = readJson(join(derivedDir, 'words.splits.json'))

// ── 词根覆盖度 / 难度分布 ────────────────────────────────────────────────────
const roots = morphemes.filter((m) => m.type === 'root')
const perRoot = new Map(roots.map((r) => [r.id, { count: 0, d1: 0, d3: 0, d5: 0, words: [] }]))
for (const w of words) {
  for (const part of w.parts) {
    const stat = perRoot.get(part.morphemeId)
    if (!stat) continue
    stat.count += 1
    stat[`d${w.difficulty}`] += 1
    if (!stat.words.includes(w.id)) stat.words.push(w.id)
  }
}

// ── 隔离率 ───────────────────────────────────────────────────────────────────
const severity = { ok: 0, minor: 0, major: 0 }
for (const r of reviewed.results) severity[r.severity] += 1
const quarantineRate = words.length ? severity.major / words.length : 0

// ── 体积（gzip）：分层后分「首屏（索引层）」和「懒加载（详情分片）」两组 ──
const sizes = []
for (const name of ['morphemes.json', 'words-index.json', 'worlds.json']) {
  const buf = readFileSync(join(contentDir, name))
  sizes.push({ name, raw: buf.length, gzip: gzipSync(buf).length })
}
const detailsDir = join(contentDir, 'details')
if (existsSync(detailsDir)) {
  let detailRaw = 0
  let detailGzip = 0
  let detailCount = 0
  for (const name of readdirSync(detailsDir)) {
    if (!name.endsWith('.json')) continue
    const buf = readFileSync(join(detailsDir, name))
    detailRaw += buf.length
    detailGzip += gzipSync(buf).length
    detailCount++
  }
  sizes.push({ name: `details/ × ${detailCount}（懒加载）`, raw: detailRaw, gzip: detailGzip })
}
const dataTs = readFileSync(join(here, '..', 'src', 'domain', 'data.ts'))
sizes.push({ name: 'data.ts（首屏，内联索引层）', raw: dataTs.length, gzip: gzipSync(dataTs).length })
const totalGzip = sizes.reduce((n, s) => n + s.gzip, 0)

// ── 切分分歧（cigen 交叉验证） ───────────────────────────────────────────────
// 21 号的规则是「cigen 标了本阶段没拆到的词根才算冲突（丢词）」；这里把两种粒度差异都摊开看。
const surfaceToRoot = new Map()
for (const m of morphemes) {
  if (m.type !== 'root') continue
  for (const a of m.allomorphs) surfaceToRoot.set(a.toLowerCase(), m.id)
  surfaceToRoot.set(m.id.toLowerCase(), m.id)
}
const cigen = readJson(join(rawDir, 'cigen-roots_affixes.json'))
const cigenByWord = new Map((cigen.entries ?? []).map((e) => [(e.word || '').toLowerCase(), e]))
const divergences = []
let compared = 0
for (const s of splits.words) {
  const ce = cigenByWord.get(s.word.toLowerCase())
  if (!ce) continue
  compared += 1
  const cigenRoots = [...new Set((ce.components ?? []).map((c) => (c.morpheme || '').toLowerCase()).map((t) => surfaceToRoot.get(t)).filter(Boolean))]
  const ourRoots = new Set(s.parts.filter((p) => morphemes.find((m) => m.id === p.morphemeId)?.type === 'root').map((p) => p.morphemeId))
  const missing = cigenRoots.filter((r) => !ourRoots.has(r))
  const extra = [...ourRoots].filter((r) => !cigenRoots.includes(r))
  if (missing.length || extra.length) divergences.push({ word: s.word, cigen: cigenRoots.join('+'), ours: [...ourRoots].join('+'), missing, extra })
}

// ── 花销 ─────────────────────────────────────────────────────────────────────
const llmDriven = [reviewed.reviewer?.startsWith('llm:')].filter(Boolean).length
const costLine = llmDriven
  ? '60 号走了真调 LLM，花销见该步日志（llm.mjs 记账）'
  : '全部四步（11/13/30/60）都走 handoff 静态数据，本次管线 LLM 花销 $0'

const line = (s = '') => `${s}\n`
let md = ''
md += line(`# Stage 1 产出报告`)
md += line()
md += line(`> 生成于 ${new Date().toISOString()}，由 scripts/70-report.mjs 产出。`)
md += line()
md += line(`## 总览`)
md += line()
md += line(`- 词条 **${words.length}**（canary ${provenance.words.canary} + 生成 ${provenance.words.generated}），词素 **${morphemes.length}**（词根 ${roots.length}），世界 **${worlds.length}**`)
md += line(`- 复核：ok ${severity.ok} / minor ${severity.minor} / major ${severity.major}，隔离率 **${(quarantineRate * 100).toFixed(1)}%**`)
md += line(`- 漂移探测：样本 ${drift.sampled}，不一致 ${drift.mismatched}，漂移率 **${(drift.rate * 100).toFixed(1)}%**${drift.blocked ? '（**超过 5%，阻断发布**）' : '（≤5%，通过）'}，模式：${drift.mode}`)
md += line(`- 花销：${costLine}`)
md += line()
md += line(`## 词根覆盖度与难度分布`)
md += line()
md += line(`| 词根 | 词数 | d1 | d3 | d5 | A23 | 词 |`)
md += line(`|---|---|---|---|---|---|---|`)
for (const [id, stat] of [...perRoot.entries()].sort((a, b) => b[1].count - a[1].count)) {
  const ok = stat.count >= 3 && stat.d1 > 0 && stat.d5 > 0
  md += line(`| ${id} | ${stat.count} | ${stat.d1} | ${stat.d3} | ${stat.d5} | ${ok ? '✓' : '✗'} | ${stat.words.join('、')} |`)
}
md += line()
md += line(`## 产物体积`)
md += line()
md += line(`| 文件 | 原始 | gzip |`)
md += line(`|---|---|---|`)
for (const s of sizes) md += line(`| ${s.name} | ${(s.raw / 1024).toFixed(1)} kB | ${(s.gzip / 1024).toFixed(1)} kB |`)
md += line(`| 合计 | — | **${(totalGzip / 1024).toFixed(1)} kB** |`)
md += line()
md += line(`## 切分分歧（vs cigen 人工切分）`)
md += line()
md += line(`cigen 覆盖 ${compared}/${splits.words.length} 个词；粒度差异 ${divergences.length} 处（cigen 更粗、或它标了本阶段没建模的词根，21 号按规则丢词/放行，不修复）。`)
md += line()
if (divergences.length) {
  md += line(`| 词 | cigen | 本阶段 | 差异 |`)
  md += line(`|---|---|---|---|`)
  for (const d of divergences) {
    const what = d.missing.length ? `缺 ${d.missing.join('/')}` : `多 ${d.extra.join('/')}`
    md += line(`| ${d.word} | ${d.cigen || '—'} | ${d.ours} | ${what} |`)
  }
  md += line()
}
md += line(`## 复核发现的待改项（minor，不阻断）`)
md += line()
const flagged = reviewed.results.filter((r) => r.severity !== 'ok')
if (!flagged.length) md += line('（无）')
for (const r of flagged) for (const issue of r.issues) md += line(`- **${r.id}** ${issue.field}：${issue.problem} → ${issue.suggestedFix}`)

writeFileSync(join(derivedDir, 'report.md'), md)
console.log(`✓ 报告已写出 scripts/.work/report.md`)
console.log(`  词 ${words.length} / 词根 ${roots.length} / 隔离率 ${(quarantineRate * 100).toFixed(1)}% / 漂移 ${(drift.rate * 100).toFixed(1)}% / gzip ${(totalGzip / 1024).toFixed(1)} kB`)
