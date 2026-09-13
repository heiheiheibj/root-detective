// 工具：把 scripts/handoff/chunks/*.json 合并成 11 号和 13 号读的完整 handoff。
//
// 两类 chunk：
//   roots-llm    来自 01-*.json…08-*.json（按 id 索引的释义片段）→ scripts/handoff/roots-llm.json
//   roots-review 来自 review-*.json（按 id 索引的复核 verdict）  → scripts/handoff/roots-review.json
//
// 生成方式：执行 AI 每写完一批释义/复核，就存成一个 chunk
//   释义   [ { "id": "a", "meaningCn": "不、无", "displayText": "a-", "level": 3, "etymologyZh": "…", "keep": true, "rejectReason": "", "chosenVariant": 0, "variantReason": "" }, ... ]
//   复核   [ { "id": "a", "verdict": "ok|suspect|reject", "issue": "…", "correctedMeaningCn": "…" }, ... ]
//
// 手动跑：node scripts/lib/build-handoff.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { handoffDir } from './handoff.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const chunksDir = join(here, 'handoff', 'chunks')

if (!existsSync(chunksDir)) {
  console.error('缺少 scripts/lib/handoff/chunks/，先放几批释义文件。')
  process.exit(1)
}

/** 读所有 chunk 文件，按 id 建索引，并做 id 唯一性检查。前缀匹配用 `id-prefixed-*.json`。 */
function collect(prefix) {
  const byId = new Map()
  for (const file of readdirSync(chunksDir).filter((f) => f.endsWith('.json') && f.startsWith(prefix)).sort()) {
    const parsed = JSON.parse(readFileSync(join(chunksDir, file), 'utf8'))
    for (const row of parsed) {
      if (byId.has(row.id)) console.warn(`  ⚠️ id「${row.id}」在 ${file} 里重复，后者覆盖。`)
      byId.set(row.id, row)
    }
  }
  return byId
}

// ── 1. roots-llm（11 号词根清洗）───────────────────────────────────────────
{
  const byId = collect('0')
  const candidates = JSON.parse(readFileSync(join(here, '..', '.work', 'derived', 'roots.candidates.json'), 'utf8'))
  const rows = candidates.entries.map((entry) => {
    const row = byId.get(entry.id)
    if (!row) return { entry, result: null }
    return {
      entry,
      result: {
        id: entry.id,
        meaningCn: row.meaningCn,
        displayText: row.displayText,
        level: row.level,
        etymologyZh: row.etymologyZh,
        keep: row.keep,
        rejectReason: row.rejectReason || '',
        chosenVariant: row.chosenVariant ?? 0,
        variantReason: row.variantReason || '',
      },
    }
  })

  mkdirSync(handoffDir, { recursive: true })
  writeFileSync(join(handoffDir, 'roots-llm.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)}\n`)

  const missing = rows.filter((row) => !row.result).length
  console.log(`[roots-llm] 合并 ${rows.length} 条，缺失 ${missing} 条（${rows.length - missing} 条可产出）`)
  if (missing > 0) console.log('缺失 id：', rows.filter((row) => !row.result).map((row) => row.entry.id).join(' '))
}

// ── 2. roots-review（13 号词根复核）─────────────────────────────────────────
{
  const byId = collect('review')
  const validated = JSON.parse(readFileSync(join(here, '..', '.work', 'derived', 'roots.validated.json'), 'utf8'))
  const entries = validated.entries || validated
  const rows = entries.map((entry) => {
    const row = byId.get(entry.id)
    if (!row) return { entry, result: null }
    return {
      entry,
      result: {
        id: entry.id,
        verdict: row.verdict,
        issue: row.issue || '',
        correctedMeaningCn: row.correctedMeaningCn || '',
      },
    }
  })

  mkdirSync(handoffDir, { recursive: true })
  writeFileSync(join(handoffDir, 'roots-review.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)}\n`)

  const missing = rows.filter((row) => !row.result).length
  console.log(`[roots-review] 合并 ${rows.length} 条，缺失 ${missing} 条（${rows.length - missing} 条可产出）`)
  if (missing > 0) console.log('缺失 id：', rows.filter((row) => !row.result).map((row) => row.entry.id).join(' '))
}