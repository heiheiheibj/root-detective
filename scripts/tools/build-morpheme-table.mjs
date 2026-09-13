// S6a：生成产品用的词素表（morphemes），一次性解掉 S5 量出来的 4 个数据问题：
//   A18 词干类零件要标 type=root（不能全靠位置推断）
//   A6  part.surface 必须在 allomorphs 里 → 把实际用到的表面全部收进 allomorphs
//   A20 displayText 唯一 → 前缀加 `-`、后缀加 `-` 前缀，天然区分同形
//   A22 死变体警告 → **只写实际用到的表面**，不抄候选表的全部变体
//
// 义项（meaningCn）分两档处理：
//   教学词素（377 个，lexicon）：英文 gloss 来自 Wiktionary，**需要人工/LLM 译成中文**
//   零件词素（2,182 个，多为词干）：从 ECDICT 找以它开头的最短词，取中文释义自动填充
//
// 输出  scripts/.work/derived/morphemes-draft.json + 待翻译清单
// 跑法：node scripts/tools/build-morpheme-table.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const rawDir = join(here, '..', '.work', 'raw')
const derivedDir = join(here, '..', '.work', 'derived')
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

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

// ── ECDICT：中文释义（给零件词素自动填义项）──
const ecMeaning = new Map()
const ecWords = []
for (const line of readFileSync(join(rawDir, 'ecdict.csv'), 'utf8').split('\n').slice(1)) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const w = norm(f[0])
  if (!w || ecMeaning.has(w)) continue
  const translation = String(f[3] || '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (!translation || /前缀|后缀|词根/.test(translation)) continue
  ecWords.push(w)
  ecMeaning.set(w, translation)
}
/** 取第一个义项并砍到 8 个汉字以内（A20 要求 1–8 汉字）。 */
function shortMeaning(text) {
  const first = String(text).split(/[；;，,]/)[0].replace(/^(n|v|vt|vi|adj|adv|prep|conj|pron|int|aux|num|art)\.\s*/i, '').trim()
  const hanziOnly = first.replace(/[^\u4e00-\u9fff]/g, '')
  return hanziOnly.slice(0, 8)
}
/** 零件词素/词干的义项：找以它开头的最短 ECDICT 词，取其中文。 */
function deriveMeaning(surface) {
  if (ecMeaning.has(surface)) return shortMeaning(ecMeaning.get(surface))
  let best = null
  for (const w of ecWords) {
    if (w.length > surface.length && w.startsWith(surface)) {
      if (!best || w.length < best.length) best = w
    }
  }
  return best ? shortMeaning(ecMeaning.get(best)) : ''
}

const lexicon = JSON.parse(readFileSync(join(derivedDir, 'morpheme-lexicon.json'), 'utf8')).lexicon
const lexBySurface = new Map(lexicon.map((m) => [m.surface, m]))
// Wiktionary 词素词条（权威 pos）——用来判前后缀
const affixGloss = new Map(Object.entries(JSON.parse(readFileSync(join(derivedDir, 'affix-gloss-cache.json'), 'utf8'))))
const kaikkiPos = (surface) => {
  const list = affixGloss.get(surface)
  if (!list || !list.length) return null
  const pos = list[0].pos
  return pos === 'prefix' || pos === 'suffix' ? pos : pos === 'root' ? 'root' : null
}
const candidates = JSON.parse(readFileSync(join(derivedDir, 'roots.candidates.json'), 'utf8')).entries
const originById = new Map(candidates.filter((c) => c.type === 'root' && c.origin).map((c) => [norm(c.id), c.origin]))
const merged = JSON.parse(readFileSync(join(derivedDir, 'splits-merged.json'), 'utf8'))

// ── 收集：规范 id → { surfaces:Set(实际用到的表面), head/mid/tail, words } ──
const byId = new Map()
for (const [word, info] of Object.entries(merged.splits)) {
  info.parts.forEach((p, i) => {
    const id = p.id
    if (!byId.has(id)) byId.set(id, { surfaces: new Set(), head: 0, mid: 0, tail: 0, words: new Set(), surfaceCount: new Map() })
    const rec = byId.get(id)
    rec.surfaces.add(p.surface)
    rec.surfaceCount.set(p.surface, (rec.surfaceCount.get(p.surface) || 0) + 1)
    rec.words.add(word)
    if (i === 0) rec.head += 1
    if (i === info.parts.length - 1) rec.tail += 1
    if (i > 0 && i < info.parts.length - 1) rec.mid += 1
  })
}

const LANG_CN = { Latin: '拉丁语', Greek: '希腊语', English: '英语', French: '法语', 'Old English': '古英语', Germanic: '日耳曼语', Italian: '意大利语', Spanish: '西班牙语' }
const table = []
const needsTranslation = []
let autoMeaning = 0
for (const [id, rec] of byId) {
  const lex = lexBySurface.get(id)
  const total = rec.head + rec.mid + rec.tail
  // 类型：教学词素用 lexicon 判定；零件词素只认 Wiktionary 的词条类型，其余一律当词根。
  // 不能按位置推断前后缀 —— 那样会把 day/book/sea 这类复合词部件也标成前缀，
  // 实测前缀会虚高到 1,108 个（真前缀应在一两百量级）。词根兜底同时满足 A18。
  const type = lex ? lex.type : (kaikkiPos(id) || 'root')
  // 义项
  let meaningCn = ''
  let meaningSource = 'none'
  if (lex && lex.isCompoundPart) { meaningCn = deriveMeaning(id); meaningSource = 'ecdict' }
  else if (lex && lex.gloss) { needsTranslation.push({ id, type, gloss: lex.gloss, words: rec.words.size }); meaningSource = 'need-translate' }
  if (!meaningCn && meaningSource !== 'need-translate') {
    meaningCn = deriveMeaning(id)
    if (meaningCn) meaningSource = 'ecdict'
  }
  if (meaningSource === 'ecdict') autoMeaning += 1
  const level = lex ? (lex.difficulty.d1 >= lex.difficulty.d3 + lex.difficulty.d5 ? 1 : lex.difficulty.d5 > lex.difficulty.d1 ? 5 : 3)
    : (rec.words.size >= 8 ? 3 : 3)
  table.push({
    id,
    displayText: type === 'prefix' ? `${id}-` : type === 'suffix' ? `-${id}` : id,
    type,
    meaningCn,
    allomorphs: [...rec.surfaces].sort((a, b) => (rec.surfaceCount.get(b) || 0) - (rec.surfaceCount.get(a) || 0)),
    etymology: '',
    level,
    color: type === 'prefix' ? 'blue' : type === 'suffix' ? 'green' : 'orange',
    _words: rec.words.size,
    _teaching: Boolean(lex),
    _meaningSource: meaningSource,
    _origin: originById.get(id) ? (LANG_CN[originById.get(id)] || originById.get(id)) : '',
  })
}
table.sort((a, b) => b._words - a._words)

// displayText 唯一性自检
const dupDisplay = new Map()
for (const m of table) dupDisplay.set(m.displayText, (dupDisplay.get(m.displayText) || 0) + 1)
const dups = [...dupDisplay].filter(([, c]) => c > 1)

// 二次补齐：仍无义项的（多是词干变体，如 abbreviat / absorp），用「包含」匹配找最短词取义
let filledByContain = 0
for (const m of table) {
  if (m.meaningCn || m._meaningSource === 'need-translate') continue
  let best = null
  for (const w of ecWords) {
    if (w.length > m.id.length && w.includes(m.id)) { if (!best || w.length < best.length) best = w }
  }
  if (best) {
    m.meaningCn = shortMeaning(ecMeaning.get(best))
    m._meaningSource = `ecdict-contain(${best})`
    filledByContain += 1
  }
}

const stats = { total: table.length, teaching: table.filter((m) => m._teaching).length, autoMeaning, filledByContain, needTranslate: needsTranslation.length, noMeaning: table.filter((m) => !m.meaningCn).length }
console.log(`词素表草稿 ${stats.total} 条｜教学 ${stats.teaching}｜自动义项 ${stats.autoMeaning}｜待翻译 ${stats.needTranslate}｜仍无义项 ${stats.noMeaning}`)
console.log(`类型分布：前缀 ${table.filter((m) => m.type === 'prefix').length} / 词根 ${table.filter((m) => m.type === 'root').length} / 后缀 ${table.filter((m) => m.type === 'suffix').length}`)
console.log(`displayText 冲突：${dups.length ? dups.map(([t, c]) => `${t}×${c}`).join(' ') : '无'}`)
console.log(`\n待翻译样例（教学词素，前 8）：`)
for (const t of needsTranslation.slice(0, 8)) console.log(`  ${t.id.padEnd(10)} ${t.type.padEnd(7)} gloss=${t.gloss.slice(0, 60)}`)
console.log(`\n自动义项样例（零件词素，前 10）：`)
for (const m of table.filter((x) => x._meaningSource === 'ecdict').slice(0, 10)) console.log(`  ${m.id.padEnd(12)} ${m.type.padEnd(7)} → ${m.meaningCn}  (allomorphs: ${m.allomorphs.slice(0, 3).join(', ')})`)

writeFileSync(join(derivedDir, 'morphemes-draft.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  stats,
  morphemes: table,
}, null, 1), 'utf8')
writeFileSync(join(derivedDir, 'translate-queue.json'), JSON.stringify({
  note: '教学词素的英文 gloss，待译成 1–8 个汉字的中文义项（对齐现有 155 个词素的风格）',
  items: needsTranslation,
}, null, 1), 'utf8')
console.log(`\n已写 .work/derived/morphemes-draft.json 与 .work/derived/translate-queue.json`)
