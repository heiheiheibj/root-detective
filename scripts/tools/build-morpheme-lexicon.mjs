// S2：建词素库 —— 类型（prefix/root/suffix）+ 英文义项 + 家族词统计。
//
// 三个输入：
//   ① kaikki 的词素词条（pos=prefix/suffix/root… 自带 glosses，最权威）
//   ② roots.candidates.json（406 条词根的 id/allomorphs/glossEn，用来把表面归并到规范式）
//   ③ splits-merged.json（3,029 个考试词的拆分 → 家族词 + 位置分布 + 难度分布）
//
// 类型判定优先级：kaikki 词条 pos → 候选词根 type → 位置统计（head/tail 占比）
//
// 输出  scripts/.work/derived/morpheme-lexicon.json + docs/词素清单.md
// 跑法：node scripts/tools/build-morpheme-lexicon.mjs
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const rawDir = join(here, '..', '.work', 'raw')
const derivedDir = join(here, '..', '.work', 'derived')
const docsDir = join(here, '..', '..', 'docs')
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

// ── ① kaikki 词素词条（字符串预筛，避免解析全部 149 万行） ──
const AFFIX_POS = ['prefix', 'suffix', 'root', 'affix', 'confix', 'combining form', 'morpheme', 'infix']
const cacheFile = join(derivedDir, 'affix-gloss-cache.json')
let affixGloss = new Map() // surface → [{ pos, gloss }]
if (existsSync(cacheFile)) {
  affixGloss = new Map(Object.entries(JSON.parse(readFileSync(cacheFile, 'utf8'))))
  console.log(`复用词素词条缓存：${affixGloss.size} 个表面（要重扫就删掉 .work/derived/affix-gloss-cache.json）`)
} else {
  let affixEntries = 0
  const rl = createInterface({ input: createReadStream(join(rawDir, 'kaikki-English.jsonl'), 'utf8'), crlfDelay: Infinity })
  let lines = 0
  for await (const line of rl) {
    lines += 1
    if (!AFFIX_POS.some((p) => line.includes(`"pos": "${p}"`))) continue
    let obj
    try { obj = JSON.parse(line) } catch { continue }
    if (obj.lang_code !== 'en' || !AFFIX_POS.includes(obj.pos)) continue
    const surface = norm(obj.word)
    if (surface.length < 2) continue
    const gloss = (obj.senses || []).map((s) => (s.glosses || []).join('; ')).filter(Boolean).slice(0, 3).join(' | ')
    if (!gloss) continue
    affixEntries += 1
    if (!affixGloss.has(surface)) affixGloss.set(surface, [])
    const list = affixGloss.get(surface)
    if (list.length < 5 && !list.some((x) => x.gloss === gloss)) list.push({ pos: obj.pos, gloss: gloss.slice(0, 160) })
  }
  writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(affixGloss)), 'utf8')
  console.log(`kaikki 扫描完成：${lines} 行，词素词条 ${affixEntries} 条 → ${affixGloss.size} 个不同表面（已缓存）`)
}

// ── ② 候选词根：表面 → 规范式 + 义项 ──
const candidates = JSON.parse(readFileSync(join(derivedDir, 'roots.candidates.json'), 'utf8')).entries
const surfaceToId = new Map()
const rootGloss = new Map()
for (const c of candidates) {
  const id = norm(c.id)
  if (!id) continue
  const type = c.type === 'root' ? 'root' : c.type
  surfaceToId.set(id, { id, type })
  if (c.glossEn) rootGloss.set(id, c.glossEn)
  for (const a of c.allomorphs || []) {
    const s = norm(a)
    if (s.length >= 2) surfaceToId.set(s, { id, type })
  }
}

// ── ③ 拆分总表 → 家族词 / 位置 / 难度 ──
const merged = JSON.parse(readFileSync(join(derivedDir, 'splits-merged.json'), 'utf8'))
const splits = merged.splits
// ECDICT 难度
function parseCsvLine(line) {
  const out = []; let cur = ''; let inQuote = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1 } else inQuote = false }
      else cur += ch
    } else if (ch === '"') inQuote = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}
const difficulty = new Map()
const ecMeaning = new Map() // 中文释义，用来给「复合词部件」补义项
for (const line of readFileSync(join(rawDir, 'ecdict.csv'), 'utf8').split('\n').slice(1)) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const w = norm(f[0])
  if (!w || difficulty.has(w)) continue
  const tags = (f[7] || '').split(' ').filter(Boolean)
  const collins = Number(f[5] || 0); const bnc = Number(f[8] || 0)
  let d = 3
  if (tags.includes('zk') || tags.includes('gk') || collins === 5 || (bnc > 0 && bnc < 3000)) d = 1
  else if ((tags.includes('cet6') || tags.includes('toefl')) && (bnc > 10000 || bnc === 0)) d = 5
  difficulty.set(w, d)
  const meaning = String(f[3] || '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (meaning && !/前缀|后缀|词根/.test(meaning)) ecMeaning.set(w, meaning.slice(0, 60))
}

const stats = new Map() // surface → { words:Set, head, mid, tail, d1, d3, d5 }
for (const [word, info] of Object.entries(splits)) {
  const d = difficulty.get(word) ?? 3
  info.parts.forEach((p, i) => {
    const s = p.surface
    if (!stats.has(s)) stats.set(s, { words: new Set(), ids: new Map(), head: 0, mid: 0, tail: 0, d1: 0, d3: 0, d5: 0 })
    const st = stats.get(s)
    st.words.add(word)
    st.ids.set(p.id, (st.ids.get(p.id) || 0) + 1)
    if (i === 0) st.head += 1
    if (i === info.parts.length - 1) st.tail += 1
    if (i > 0 && i < info.parts.length - 1) st.mid += 1
    if (d === 1) st.d1 += 1; else if (d === 5) st.d5 += 1; else st.d3 += 1
  })
}

// ── 合并成词素库 ──
const lexicon = []
for (const [surface, st] of stats) {
  const count = st.words.size
  if (count < 3) continue // 入池门槛：至少带 3 个考试词
  if (surface.length < 2) continue // 单字母表面是切分噪声（如 er 被切成 r）
  const entry = surfaceToId.get(surface)
  const kaikki = affixGloss.get(surface)
  // 类型判定：kaikki pos → 候选 type → 位置统计
  let type = null
  if (kaikki && kaikki.length) {
    const pos = kaikki[0].pos
    type = pos === 'prefix' ? 'prefix' : pos === 'suffix' ? 'suffix' : 'root'
  } else if (entry?.type) {
    type = entry.type
  } else if (st.head >= count * 0.8) type = 'prefix'
  else if (st.tail >= count * 0.8) type = 'suffix'
  else type = 'root'
  const id = entry?.id ?? [...st.ids.entries()].sort((a, b) => b[1] - a[1])[0][0]
  // 义项：kaikki 词素词条 → 候选词根 gloss → 该词自己的中文释义（复合词部件走这条）
  let gloss = kaikki?.map((x) => x.gloss).join(' ／ ') || rootGloss.get(id) || ''
  let glossSource = gloss ? 'affix' : null
  if (!gloss && ecMeaning.has(surface)) { gloss = ecMeaning.get(surface); glossSource = 'word' }
  lexicon.push({
    surface,
    id,
    type,
    confidence: kaikki ? 'kaikki' : entry ? 'candidate' : 'position',
    gloss,
    glossSource,
    // 本身是个实词、只是作为复合词的一部分出现（book+shelf）——产品里它照样能当拼词卡片
    isCompoundPart: glossSource === 'word',
    words: count,
    sample: [...st.words].slice(0, 10),
    positions: { head: st.head, mid: st.mid, tail: st.tail },
    difficulty: { d1: st.d1, d3: st.d3, d5: st.d5 },
  })
}
lexicon.sort((a, b) => b.words - a.words)

const byType = { prefix: 0, root: 0, suffix: 0 }
for (const m of lexicon) byType[m.type] += 1
const withGloss = lexicon.filter((m) => m.gloss).length

console.log(`\n入池词素 ${lexicon.length} 个（≥3 个考试词）｜类型：前缀 ${byType.prefix} / 词根 ${byType.root} / 后缀 ${byType.suffix}`)
console.log(`有义项 ${withGloss} 个（${(withGloss / lexicon.length * 100).toFixed(0)}%）`)
console.log(`义项来源：kaikki 词素词条 ${lexicon.filter((m) => m.confidence === 'kaikki').length} / 候选词根 ${lexicon.filter((m) => m.confidence === 'candidate').length} / 该词自身中文释义 ${lexicon.filter((m) => m.isCompoundPart).length}｜仍缺 ${lexicon.filter((m) => !m.gloss).length}`)
// 注意：覆盖统计必须用 stats 里的完整词集合，不能用 lexicon[].sample（那只有前 10 个）
for (const min of [3, 5, 10, 20]) {
  const hit = lexicon.filter((m) => m.words >= min)
  const words = new Set()
  for (const m of hit) for (const w of stats.get(m.surface).words) words.add(w)
  console.log(`  ≥${String(min).padStart(2)} 考试词：${String(hit.length).padStart(4)} 个词素 → 覆盖 ${words.size} 词`)
}

// 缺义项的（需要 S2 后续补，或直接淘汰）——按词数排序看它们是些什么
const noGloss = lexicon.filter((m) => !m.gloss)
console.log(`\n缺义项 ${noGloss.length} 个（前 30，按词数）：`)
for (const m of noGloss.slice(0, 30)) {
  console.log(`  ${m.surface.padEnd(12)} ${m.type.padEnd(7)} ${String(m.words).padStart(4)} 词  来源=${m.confidence}  :: ${m.sample.slice(0, 4).join(', ')}`)
}

writeFileSync(join(derivedDir, 'morpheme-lexicon.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  summary: { total: lexicon.length, byType, withGloss },
  lexicon,
}, null, 1), 'utf8')

// ── 人工过目用的清单（前 220 个按词数排序） ──
const lines = []
lines.push('# 词素清单（S2 产出，按覆盖考试词数排序）')
lines.push('')
lines.push(`> 生成：${new Date().toISOString().slice(0, 16)}｜共 ${lexicon.length} 个入池词素（门槛：≥3 个考试词）`)
lines.push(`> 类型：前缀 ${byType.prefix} / 词根 ${byType.root} / 后缀 ${byType.suffix}｜有义项 ${withGloss} 个`)
lines.push(`> 义项来源：kaikki 词素词条 ${lexicon.filter((m) => m.confidence === 'kaikki').length} / 候选词根 ${lexicon.filter((m) => m.confidence === 'candidate').length} / 该词自身中文释义 ${lexicon.filter((m) => m.isCompoundPart).length}｜仍缺义项 ${lexicon.filter((m) => !m.gloss).length}`)
lines.push('')
lines.push('| # | 词素 | 规范式 | 类型 | 义项 | 词数 | d1/d3/d5 | 家族样例 |')
lines.push('|---|---|---|---|---|---|---|---|')
lexicon.slice(0, 220).forEach((m, i) => {
  const gloss = (m.gloss || '—').replace(/\|/g, '/').slice(0, 70)
  lines.push(`| ${i + 1} | \`${m.surface}\` | ${m.id === m.surface ? '—' : `\`${m.id}\``} | ${m.type === 'prefix' ? '前缀' : m.type === 'suffix' ? '后缀' : '词根'} | ${gloss} | ${m.words} | ${m.difficulty.d1}/${m.difficulty.d3}/${m.difficulty.d5} | ${m.sample.slice(0, 6).join(', ')} |`)
})
writeFileSync(join(docsDir, '词素清单.md'), lines.join('\n') + '\n', 'utf8')
console.log(`\n已写 .work/derived/morpheme-lexicon.json 与 docs/词素清单.md（前 220 个）`)
