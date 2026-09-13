// 从 kaikki-English.jsonl（Wiktionary 机器可读版）提取**权威词素拆分**。
//
// 现有词根表只有 ~406 条（ECDICT 611 + cigen 275 + shiweihappy 61），这是天花板低的根因。
// Wiktionary 里编辑手工标了「表面拆分」模板，等于免费拿到百万级词的真实切分：
//   {{affix|en|tele-|vision}}   → tele + vision
//   {{prefix|en|un|happy}}      → un + happy
//   {{surf|en|philo-|-sophy}}   → philo + sophy   （surface analysis，正是教学要的切分）
//
// 跑法：
//   node scripts/tools/kaikki-morphemes.mjs              # 全量（约 10 分钟）
//   node scripts/tools/kaikki-morphemes.mjs --limit=300000   # 采样试跑
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const rawDir = join(here, '..', '.work', 'raw')
const derivedDir = join(here, '..', '.work', 'derived')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
// 带连字符的词素是 Wiktionary 的写法：tele- / -sophy / -tion
const SPLIT_TEMPLATES = new Set(['affix', 'prefix', 'suffix', 'confix', 'surf', 'compound', 'compound/affix'])
// 排除的命名参数（模板里的元数据，不是词素）
const META_KEYS = new Set(['1', 't', 't1', 't2', 't3', 'alt', 'alt1', 'alt2', 'pos', 'pos1', 'pos2', 'id', 'id1', 'id2', 'nocat', 'lang', 'lang1', 'lang2', 'sc', 'tr', 'ts', 'gloss', 'gloss1', 'gloss2', 'lit', 'g', 'g2', 'g3', 'g4', 'inh', 'der', 'bor', 'cog', 'ncog', 'wp', 'w', 'p', 'n', 'm', 'm1', 'm2', 'm3', 'noicon', 'nodot'])

const splits = new Map()      // word → { pos, parts: [], template }
const morphemeCount = new Map() // morpheme → Set(word)
let lines = 0
let parsed = 0
let withSplit = 0

const rl = createInterface({ input: createReadStream(join(rawDir, 'kaikki-English.jsonl'), 'utf8'), crlfDelay: Infinity })
for await (const line of rl) {
  lines += 1
  if (lines > limit) break
  // 便宜的前置过滤：没这个词就不必 parse
  if (!line.includes('"etymology_templates"')) continue
  let obj
  try { obj = JSON.parse(line) } catch { continue }
  parsed += 1
  const word = norm(obj.word)
  if (!word || obj.lang_code !== 'en') continue
  const templates = obj.etymology_templates || []
  // 优先 surf（surface analysis，最明确），其次 prefix/suffix/affix/confix/compound。
  // ⚠️ Wiktionary 大量使用缩写别名：af=affix、suf=suffix、pre=prefix、com=compound。
  // 漏掉别名是首轮只有 18.9% 覆盖率的主因之一。
  const order = ['surf', 'prefix', 'pre', 'suffix', 'suf', 'confix', 'affix', 'af', 'compound/affix', 'compound', 'com']
  let picked = null
  for (const name of order) {
    const t = templates.find((x) => x.name === name)
    if (t) { picked = t; break }
  }
  let parts = []
  let template = null
  if (picked) {
    parts = Object.entries(picked.args || {})
      .filter(([k]) => /^\d+$/.test(k) && k !== '1' && !META_KEYS.has(k))
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, v]) => norm(v))
      .filter(Boolean)
    template = picked.name
  }
  // 没模板就解析词源文本 —— Wiktionary 的标准句式里直接写着拆分：
  //   "equivalent to king + -dom" / "From tele- + vision" / "By surface analysis, port + -able"
  if (parts.length < 2) {
    const text = obj.etymology_text || ''
    const patterns = [
      /equivalent to ([^.;]+)/i,
      /surface analysis,?\s*([^.;]+)/i,
      /^From ([^.;]*\+[^.;]*)/i,
      /from ([^.;]*\+[^.;]*?)(?:[.;]|$)/i,
    ]
    for (const re of patterns) {
      const m = text.match(re)
      if (!m) continue
      const chunk = m[1]
      if (!chunk.includes('+')) continue
      const parsed = chunk.split('+').map((piece) => norm(piece.replace(/\([^)]*\)/g, ' ')))
        .filter((p) => p.length >= 2 && p.length <= 20 && /^[a-z]+$/.test(p))
      if (parsed.length >= 2) { parts = parsed; template = 'text'; break }
    }
  }
  if (parts.length < 2) continue
  withSplit += 1
  if (!splits.has(word)) {
    splits.set(word, { pos: obj.pos, parts, template })
    for (const p of new Set(parts)) {
      if (!morphemeCount.has(p)) morphemeCount.set(p, new Set())
      morphemeCount.get(p).add(word)
    }
  }
}

const byFrequency = [...morphemeCount.entries()].map(([id, words]) => ({ id, words: words.size })).sort((a, b) => b.words - a.words)
const buckets = { '1': 0, '2': 0, '3-4': 0, '5-9': 0, '10-19': 0, '20-49': 0, '50+': 0 }
for (const m of byFrequency) {
  const n = m.words
  if (n === 1) buckets['1'] += 1
  else if (n === 2) buckets['2'] += 1
  else if (n <= 4) buckets['3-4'] += 1
  else if (n <= 9) buckets['5-9'] += 1
  else if (n <= 19) buckets['10-19'] += 1
  else if (n <= 49) buckets['20-49'] += 1
  else buckets['50+'] += 1
}

console.log(`扫描 ${lines} 行（JSON 解析 ${parsed} 行，有词源模板）｜拿到拆分的词 ${splits.size} 个｜涉及词素 ${byFrequency.length} 个`)
console.log(`\n词素供给分档（按能带多少词）：`)
console.log(`  只带 1 词 ${buckets['1']} / 2 词 ${buckets['2']} / 3-4 词 ${buckets['3-4']} / 5-9 词 ${buckets['5-9']} / 10-19 词 ${buckets['10-19']} / 20-49 词 ${buckets['20-49']} / 50+ 词 ${buckets['50+']}`)
const with3 = byFrequency.filter((m) => m.words >= 3).length
const with5 = byFrequency.filter((m) => m.words >= 5).length
const with10 = byFrequency.filter((m) => m.words >= 10).length
console.log(`  → ≥3 词 ${with3} 个 / ≥5 词 ${with5} 个 / ≥10 词 ${with10} 个`)
console.log(`\n最高频的 30 个词素：`)
for (const m of byFrequency.slice(0, 30)) console.log(`  ${m.id.padEnd(14)} ${String(m.words).padStart(5)} 词`)

mkdirSync(derivedDir, { recursive: true })
const outPath = join(derivedDir, limit === Infinity ? 'kaikki-splits.json' : 'kaikki-splits-sample.json')
writeFileSync(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  scannedLines: lines, wordsWithSplit: splits.size, morphemes: byFrequency.length,
  buckets, with3, with5, with10,
  topMorphemes: byFrequency.slice(0, 500),
  splits: Object.fromEntries(splits),
}, null, 1), 'utf8')
console.log(`\n已写 ${outPath}`)
