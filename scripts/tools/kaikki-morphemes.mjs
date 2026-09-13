// 从 kaikki-English.jsonl（Wiktionary 机器可读版）提取**权威词素拆分**。
//
// 现有词根表只有 ~406 条（ECDICT 611 + cigen 275 + shiweihappy 61），这是天花板低的根因。
// Wiktionary 里编辑手工标了「表面拆分」模板，等于免费拿到百万级词的真实切分：
//   {{affix|en|tele-|vision}}   → tele + vision
//   {{prefix|en|un|happy}}      → un + happy
//   {{surf|en|philo-|-sophy}}   → philo + sophy   （surface analysis，正是教学要的切分）
//
// 两条提取路径，可信度不同：
//   ① 模板路径  —— 直接读模板参数，**可信**，同时它的词素构成白名单
//   ② 文本路径  —— 解析 "equivalent to X + Y" 等句式，**必须用①的白名单过滤**
//      （不加白名单会出垃圾：ad- + cēdere 被 norm 成 "cd"，跨子句匹配切出 "vusfromad"）
//
// 跑法：
//   node scripts/tools/kaikki-morphemes.mjs                  # 全量（约 3~5 分钟）
//   node scripts/tools/kaikki-morphemes.mjs --limit=200000   # 采样
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
// Wiktionary 常用语言码：出现在参数里的是语言标记，不是词素（surf 模板把语言码放在第 2 位）
const LANG_CODES = new Set([
  'en', 'ang', 'enm', 'fro', 'frm', 'la', 'grc', 'it', 'fr', 'de', 'es', 'nl', 'sv', 'da', 'no',
  'ofs', 'osx', 'non', 'is', 'got', 'ga', 'cy', 'ru', 'pl', 'pt', 'ro', 'gml', 'gmh', 'goh', 'dum',
  'odt', 'nds', 'yi', 'sco', 'fy', 'af', 'fo', 'lt', 'lv', 'el', 'sq', 'hy', 'ka', 'tr', 'ar', 'fa',
  'he', 'hi', 'sa', 'ja', 'zh', 'ko', 'vi', 'th', 'ms', 'tl', 'sw', 'zu', 'ine-pro', 'gem-pro',
  'itc-pro', 'grk-pro', 'sla-pro', 'cel-pro', 'bat-pro', 'gmw-pro', 'gmq-pro', 'ira-pro', 'iir-pro',
])

const splits = new Map()          // word → { pos, parts, source }
const templateMorphemes = new Set() // 模板路径提取到的词素 = 文本路径的白名单
let lines = 0
let parsed = 0

const rl = createInterface({ input: createReadStream(join(rawDir, 'kaikki-English.jsonl'), 'utf8'), crlfDelay: Infinity })
for await (const line of rl) {
  lines += 1
  if (lines > limit) break
  if (!line.includes('"etymology_templates"')) continue
  let obj
  try { obj = JSON.parse(line) } catch { continue }
  parsed += 1
  const word = norm(obj.word)
  if (!word || obj.lang_code !== 'en') continue
  const templates = obj.etymology_templates || []

  // ── ① 模板路径 ──
  // 优先级：surf（surface analysis）→ 各种前后缀 → 复合
  // ⚠️ Wiktionary 大量用缩写别名：af=affix、suf=suffix、pre=prefix、com=compound
  const order = ['surf', 'prefix', 'pre', 'suffix', 'suf', 'confix', 'affix', 'af', 'compound/affix', 'compound', 'com']
  let picked = null
  for (const name of order) {
    const t = templates.find((x) => x.name === name)
    if (t) { picked = t; break }
  }
  let parts = []
  if (picked) {
    // 参数位置约定：
    //   一般模板   {1: 语言码,        2..n: 词素}
    //   surf 模板  {1: "+suf"/"+pre", 2: 语言码, 3..n: 词素}
    const skipKeys = picked.name === 'surf' ? new Set(['1', '2']) : new Set(['1'])
    parts = Object.entries(picked.args || {})
      .filter(([k]) => /^\d+$/.test(k) && !skipKeys.has(k))
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, v]) => norm(String(v).replace(/<[^>]*>/g, ' '))) // 剥掉 ess<id:female> 这类内联注解
      .filter((p) => p.length >= 2 && p.length <= 20 && !LANG_CODES.has(p))
  }
  if (parts.length >= 2) {
    for (const p of parts) templateMorphemes.add(p)
    if (!splits.has(word)) splits.set(word, { pos: obj.pos, parts, source: 'template', template: picked.name })
    continue
  }

  // ── ② 文本路径（稍后用白名单过滤） ──
  // 标准句式："equivalent to king + -dom" / "From tele- + vision" / "surface analysis, port + -able"
  // 字符类必须排除 , . ; ( )，否则会跨子句贪婪匹配（"from A, from B + C" 会连成一片）
  const text = obj.etymology_text || ''
  const patterns = [
    /equivalent to ([^,.;()]{2,40})/i,
    /surface analysis,?\s*([^,.;()]{2,40})/i,
    /^From ([^,.;()]{2,40}\+[^,.;()]{2,40})/i,
    /from ([^,.;()]{2,30}\+[^,.;()]{2,30})(?:[,.;(]|$)/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (!m || !m[1].includes('+')) continue
    const parsedParts = m[1].split('+')
      .map((piece) => norm(piece.replace(/\([^)]*\)/g, ' ')))
      .filter((p) => p.length >= 2 && p.length <= 15 && !LANG_CODES.has(p))
    if (parsedParts.length >= 2) {
      if (!splits.has(word)) splits.set(word, { pos: obj.pos, parts: parsedParts, source: 'text', template: 'text' })
      break
    }
  }
}

// ── 白名单过滤：文本路径的每个词素都必须出自模板路径 ──
let droppedByWhitelist = 0
for (const [word, info] of splits) {
  if (info.source !== 'text') continue
  if (!info.parts.every((p) => templateMorphemes.has(p))) {
    splits.delete(word)
    droppedByWhitelist += 1
  }
}

// ── 统计 ──
const morphemeCount = new Map()
for (const [word, info] of splits) {
  for (const p of new Set(info.parts)) {
    if (!morphemeCount.has(p)) morphemeCount.set(p, new Set())
    morphemeCount.get(p).add(word)
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
const with3 = byFrequency.filter((m) => m.words >= 3).length
const with5 = byFrequency.filter((m) => m.words >= 5).length
const with10 = byFrequency.filter((m) => m.words >= 10).length
const countBySource = {}
for (const [, v] of splits) countBySource[v.source] = (countBySource[v.source] || 0) + 1

console.log(`扫描 ${lines} 行（JSON 解析 ${parsed} 行）｜拿到拆分的词 ${splits.size} 个｜涉及词素 ${byFrequency.length} 个`)
console.log(`来源：模板 ${countBySource.template || 0} / 文本 ${countBySource.text || 0}｜模板白名单词素 ${templateMorphemes.size} 个｜被白名单拒掉的文本拆分 ${droppedByWhitelist} 个`)
console.log(`\n词素供给分档（按能带多少词）：`)
console.log(`  只带 1 词 ${buckets['1']} / 2 词 ${buckets['2']} / 3-4 词 ${buckets['3-4']} / 5-9 词 ${buckets['5-9']} / 10-19 词 ${buckets['10-19']} / 20-49 词 ${buckets['20-49']} / 50+ 词 ${buckets['50+']}`)
console.log(`  → ≥3 词 ${with3} 个 / ≥5 词 ${with5} 个 / ≥10 词 ${with10} 个`)
console.log(`\n最高频的 30 个词素：`)
for (const m of byFrequency.slice(0, 30)) console.log(`  ${m.id.padEnd(14)} ${String(m.words).padStart(5)} 词`)

mkdirSync(derivedDir, { recursive: true })
const outPath = join(derivedDir, limit === Infinity ? 'kaikki-splits.json' : 'kaikki-splits-sample.json')
writeFileSync(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  scannedLines: lines, wordsWithSplit: splits.size, morphemes: byFrequency.length,
  templateMorphemes: templateMorphemes.size, droppedByWhitelist, countBySource,
  buckets, with3, with5, with10,
  topMorphemes: byFrequency.slice(0, 500),
  splits: Object.fromEntries(splits),
}, null, 1), 'utf8')
console.log(`\n已写 ${outPath}`)
