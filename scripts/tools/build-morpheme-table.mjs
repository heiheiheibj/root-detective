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
import { buildCanon } from '../lib/id-canon.mjs'
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
// ⚠️ 这张表是**兜底**，不是权威：它按 id 去查一个英文词条，而词素的拼法经常正好撞上
// 某个缩写、专名或专业词条（`wf` 撞上 Water Filter、`who` 撞上世界卫生组织、`minim` 撞上
// 药量单位）。所以下面既要过滤「明显不是普通词」的记录，又要剥掉 ECDICT 的领域标记 ——
// 这两件事不做，义项表就会被词典垃圾灌满（实测污染了 165 条，且其中一批是「医山」这种把
// 标记当字头拼进去的拼接串）。真正的把关在 scripts/lib/morpheme-fallback.mjs 的覆盖表。
const ecMeaning = new Map()
const ecWords = []
/** 明显不是「普通英文单词」的记录：全大写缩写、首字母大写的专名、ECDICT 的领域标记条目。 */
const ABBR_RE = /^\s*(abbr|缩写|略)\b|^\s*[\[【][^\]】]*[\]】]/
function isAbbrLike(raw, translation) {
  const t = String(translation || '')
  if (ABBR_RE.test(t)) return true
  // 全大写短词（WF、WHO、DC）在 ECDICT 里就是缩写条目；`I`（我）这类单词例外，用长度 2 起判。
  const name = String(raw || '').trim()
  return name.length >= 2 && name.length <= 6 && name === name.toUpperCase() && /[A-Z]/.test(name)
}
/** 首字母大写且不是全大写 → 专名（Mary、Ceres、Saturn）。 */
function isProperLike(raw) {
  const name = String(raw || '').trim()
  return /^[A-Z]/.test(name) && name !== name.toUpperCase() && !name.includes(' ')
}
for (const line of readFileSync(join(rawDir, 'ecdict.csv'), 'utf8').split('\n').slice(1)) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const w = norm(f[0])
  if (!w || ecMeaning.has(w)) continue
  const translation = String(f[3] || '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (!translation || /前缀|后缀|词根/.test(translation)) continue
  ecWords.push(w)
  ecMeaning.set(w, { raw: String(f[0] || '').trim(), translation, junk: isAbbrLike(f[0], translation) || isProperLike(f[0]) })
}
/**
 * 取第一个义项并砍到 8 个汉字以内（A20 要求 1–8 汉字）。
 * **先剥 ECDICT 的领域标记**「[医] [计] [化] [解] [律]…」：那是词典给词条贴的标签，不是义项。
 * 不剥就会出现「医山」「计硬件描象层」「枪医枪」这类值 —— 有汉字、过得了 A20，但完全不是词素义，
 * 而且是全程最扎眼的一类错（玩家会看到写着「医山」的卡片）。
 */
function shortMeaning(text) {
  const stripped = String(text)
    .replace(/[\[【][^\]】]*[\]】]/g, ' ') // 整段标签去掉（含 [医] 与 [与-lyse 词尾构成动词] 这种长标签）
    .replace(/\s+/g, ' ')
    .trim()
  const first = stripped.split(/[；;，,]/)[0]
    .replace(/^(n|v|vt|vi|adj|adv|prep|conj|pron|int|aux|num|art)\.\s*/i, '')
    // ECDICT 里同一个词性段里还会再挂一个词性（`a. 任何的 pron. 任何一个`），
    // 不在中间切一刀就会拼成「任何的任何」——义项串味就是这么来的。
    .split(/\s+(?:n|v|vt|vi|adj|adv|prep|conj|pron|int|aux|num|art)\.\s/i)[0]
    .trim()
  const hanziOnly = first.replace(/[^\u4e00-\u9fff]/g, '')
  return hanziOnly.slice(0, 8)
}
/**
 * 零件词素/词干的义项：找以它开头的最短 ECDICT 词，取其中文。
 * 撞上缩写/专名条目时**不产出**（宁可留空让覆盖表兜，也不把「滤水器」写进 woman 的词素）。
 */
function deriveMeaning(surface) {
  const direct = ecMeaning.get(surface)
  if (direct && !direct.junk) return shortMeaning(direct.translation)
  if (direct && direct.junk) return ''
  let best = null
  for (const w of ecWords) {
    if (w.length > surface.length && w.startsWith(surface)) {
      const rec = ecMeaning.get(w)
      if (rec.junk) continue
      if (!best || w.length < best.length) best = w
    }
  }
  return best ? shortMeaning(ecMeaning.get(best).translation) : ''
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

// ── id 归一化 ──
// 切分按词形定 id，同一词根会散成多个：absorb→ab+sorbe / adsorb→ad+sorb、
// vision→vis+ion / television→tele+vise+ion。不合并的后果有两层：每个 id 词数都不够（过不了
// 教学价值门槛），且词库里同一词根出两张卡片（sorbe 和 sorb 各一张）。规则见 lib/id-canon.mjs。
const canon = buildCanon([...byId.keys()])
for (const [id, rec] of [...byId]) {
  const target = canon.get(id)
  if (!target) continue
  const t = byId.get(target)
  for (const s of rec.surfaces) t.surfaces.add(s)
  for (const [s, n] of rec.surfaceCount) t.surfaceCount.set(s, (t.surfaceCount.get(s) || 0) + n)
  for (const w of rec.words) t.words.add(w)
  t.head += rec.head
  t.mid += rec.mid
  t.tail += rec.tail
  byId.delete(id)
}
console.log(`id 归一化：${canon.size} 个变体并回词根（${byId.size} 个词素，归一化前 ${byId.size + canon.size}）`)

// ── 功能词不是词根 ──
// `her` 出现在 herself、`every` 出现在 everyday，但它们是代词/限定词 —— 学生拼 herself 时
// 看到一张「her = 粘住」的卡片就荒谬了（那还是 Wiktionary 词缀数据的错配 gloss）。
// ECDICT 的 pos 独立字段实测是空的，词性要从不 translation 开头取（"pron. 她的" / "num. 六"）。
const FUNCTION_POS = new Set(['pron', 'adv', 'prep', 'conj', 'det', 'num', 'art', 'aux', 'int'])
const ROOT_BLACKLIST = new Set(['her', 'not', 'every', 'any', 'there', 'how', 'app', 'por', 'clude'])
const glossOf = (id) => lexBySurface.get(id)?.gloss || ''
const isFunctionalWord = (id) => {
  if (ROOT_BLACKLIST.has(id)) return true
  // gloss 是「词根源义短语」才对（`ten` 的 "to hold"、`dict` 的 "speak, declare"）——
  // `ten` 的 ECDICT 释义是「num. 十」，光看词性会把它误判成数词。
  // 若 gloss 以词性开头（`seven` 的 "num. 七, 七个"），那只是 ECDICT 释义，仍要看词性。
  const g = glossOf(id).trim()
  if (g && !/^[a-z]+\.\s/.test(g) && /[,\s]/.test(g)) return false
  const m = ecMeaning.get(id)?.translation.match(/^([a-z]+)\.\s/)
  return m ? FUNCTION_POS.has(m[1].toLowerCase()) : false
}

// 查不到中文义项、但确实是词素的那些：Wiktionary 有词素词条（gloss 是英文）的拉丁词根，
// 和一些常见前后缀。A20 要求 meaningCn 是 1–8 汉字，空着过不了闸门。
// ⚠️ 这张表**只有一份**：scripts/lib/morpheme-fallback.mjs 的 FALLBACK_MEANINGS。
// 以前这里内嵌了一份，与共用模块各自生长 —— 实测内嵌份漏了六级批新增（kin/let/safe/
// acquisite…），导致 152 个词素在草稿里义项为空、整批过不了 A20。
import { FALLBACK_MEANINGS } from '../lib/morpheme-fallback.mjs'

const LANG_CN = { Latin: '拉丁语', Greek: '希腊语', English: '英语', French: '法语', 'Old English': '古英语', Germanic: '日耳曼语', Italian: '意大利语', Spanish: '西班牙语' }
const table = []
const needsTranslation = []
let autoMeaning = 0
for (const [id, rec] of byId) {
  const lex = lexBySurface.get(id)
  const total = rec.head + rec.mid + rec.tail
  // 类型：只认 Wiktionary 词条给的词缀身份（glossSource 'affix'）。lexicon 里
  // `confidence: 'position'` 的条目是按位置猜的 —— day 在 13 个词尾部就被猜成 suffix，
  // book/sea 这类复合词部件也被猜成前缀，实测前缀会虚高到 1,108 个（真前缀应在一两百量级）。
  // 拿不准的一律当词根，同时满足 A18。
  const type = lex && lex.glossSource === 'affix' ? lex.type : (kaikkiPos(id) || 'root')
  // 义项
  let meaningCn = ''
  let meaningSource = 'none'
  if (lex && lex.isCompoundPart) { meaningCn = deriveMeaning(id); meaningSource = 'ecdict' }
  else if (lex && lex.gloss) { needsTranslation.push({ id, type, gloss: lex.gloss, words: rec.words.size }); meaningSource = 'need-translate' }
  if (!meaningCn && meaningSource !== 'need-translate') {
    meaningCn = deriveMeaning(id)
    if (meaningCn) meaningSource = 'ecdict'
  }
  // 判「有没有汉字」而不是「是不是空字符串」：deriveMeaning 有时会填进一串非中文
  // （tele/under 就是这样），那种也算没义项，A20 一样过不了。
  if (!/[一-鿿]/.test(meaningCn || '') && FALLBACK_MEANINGS[id]) {
    meaningCn = FALLBACK_MEANINGS[id]
    meaningSource = 'fallback'
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
    _teaching: Boolean(lex) && !isFunctionalWord(id),
    _meaningSource: meaningSource,
    _origin: originById.get(id) ? (LANG_CN[originById.get(id)] || originById.get(id)) : '',
  })
}
table.sort((a, b) => b._words - a._words)

// displayText 唯一性自检
const dupDisplay = new Map()
for (const m of table) dupDisplay.set(m.displayText, (dupDisplay.get(m.displayText) || 0) + 1)
const dups = [...dupDisplay].filter(([, c]) => c > 1)

// 二次补齐：仍无义项的（多是词干变体，如 abbreviat / absorp），用「包含」匹配找最短词取义。
// 必须限制「包含」的宽松度：不设下限时，`wandn` 会匹配到 insidescrewandnonrisingstem（暗杆内螺纹）、
// `eond` 匹配到 dueondemand（活期）、`ular` 匹配到 gular（咽喉的）—— 兜出来的全是与词根无关的垃圾。
// 要求被匹配的词不超过 id 长度的 2 倍（即 id 至少覆盖那个词的一半），并且跳过缩写/专名条目。
const CONTAIN_RATIO = 2
/** 「包含」兜底出来的义项还要再筛一道：人名/姓氏/复数形/领域标记一律不要。 */
const JUNK_GLOSS_RE = /医|俚|人名|姓氏|男子名|女子名|的复数|量滴|液量单位|^缩写/
let filledByContain = 0
for (const m of table) {
  if (m.meaningCn || m._meaningSource === 'need-translate') continue
  let best = null
  for (const w of ecWords) {
    if (w.length <= m.id.length || w.length > m.id.length * CONTAIN_RATIO) continue
    // 只认「词首/词尾包含」：夹在单词中间对上的多半是巧合（`vis` 落在 avis 里就是「阿维斯女子名」）。
    if (!w.startsWith(m.id) && !w.endsWith(m.id)) continue
    if (ecMeaning.get(w).junk) continue
    if (!best || w.length < best.length) best = w
  }
  if (best) {
    const gloss = shortMeaning(ecMeaning.get(best).translation)
    if (gloss && !JUNK_GLOSS_RE.test(gloss)) {
      m.meaningCn = gloss
      m._meaningSource = `ecdict-contain(${best})`
      filledByContain += 1
    }
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

// 义项体检：兜底出来的义项必须「像一个词素义」，不能是词典标记或人名/缩写残渣。
// 这一层以前没有，于是「医山」「计硬件描象层」「量滴液量单位」这类值一路走到产品里，
// 玩家在拼词盘上看到写着「wf＝滤水器」的卡片。宁可在这里刷屏，也不让它悄悄出厂。
const GLOSS_ARTIFACT_RE = /医|俚|人名|姓氏|男子名|女子名|的复数|量滴|液量单位|词尾|^见$/
const suspicious = table.filter((m) => m.meaningCn && GLOSS_ARTIFACT_RE.test(m.meaningCn))
if (suspicious.length) {
  console.warn(`\n⚠️ 义项可疑 ${suspicious.length} 条（兜底表兜不住的要进 morpheme-fallback.mjs 的 OVERRIDE_MEANINGS）：`)
  for (const m of suspicious) console.warn(`  ${m.id.padEnd(12)} ${m.type.padEnd(7)} → 「${m.meaningCn}」  (${m._meaningSource})`)
}
// 兜不出来的一律**留空**而不是硬塞一个词典垃圾：留空会让 A20 当场报错、逼人来补义项；
// 塞垃圾只是把错误推到产品里，玩家看到的是「wf＝滤水器」这种卡片。所以这里把待补清单落盘。
const noGloss = table.filter((m) => !m.meaningCn)
if (noGloss.length) {
  console.warn(`\n⚠️ 仍无义项 ${noGloss.length} 条 —— 补进 morpheme-fallback.mjs 的 FALLBACK_MEANINGS，否则 A20 会拦下整批：`)
  console.warn(`   ${noGloss.slice(0, 24).map((m) => `${m.id}(${m._words}词)`).join(' ')}`)
  console.warn(`（完整清单见 .work/derived/morphemes-needing-gloss.json）`)
}

writeFileSync(join(derivedDir, 'morphemes-draft.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  stats,
  morphemes: table,
}, null, 1), 'utf8')
writeFileSync(join(derivedDir, 'translate-queue.json'), JSON.stringify({
  note: '教学词素的英文 gloss，待译成 1–8 个汉字的中文义项（对齐现有 155 个词素的风格）',
  items: needsTranslation,
}, null, 1), 'utf8')
writeFileSync(join(derivedDir, 'morphemes-needing-gloss.json'), JSON.stringify({
  note: 'ECDICT 兜底兜不出来的词素（撞上缩写/专名条目，或匹配不到可信的词条）。这类**不能**让管线自己编一个值 —— 必须人工写进 scripts/lib/morpheme-fallback.mjs 的 FALLBACK_MEANINGS / OVERRIDE_MEANINGS',
  items: noGloss.map((m) => ({ id: m.id, type: m.type, words: m._words, source: m._meaningSource })),
}, null, 1), 'utf8')
console.log(`\n已写 .work/derived/morphemes-draft.json、translate-queue.json、morphemes-needing-gloss.json`)
