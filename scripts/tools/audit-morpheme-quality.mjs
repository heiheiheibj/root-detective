// S6c：审计词素质量，把 2,458 个词素分成「义项已有」和「需要补义项」两类，并产出待办队列。
//
// 背景：零件词素的义项靠 `deriveMeaning` 从 ECDICT 自动推（找以它开头的最短词），实测把
// **专有名词**（asia→亚洲）、**缩略语**（so→自旋轨道分裂、wf→滤水器）和**作单词与作词素义项
// 不同的拉丁词根**（vis→医力）都当成了词素。这些会作为拼词卡片进产品，所以必须分级处理。
//
// 关键决策：**不剔除词，改成补义项**。`absorb(ab+sorbe)` 的 sorbe、`agenda(ag+enda)` 的 enda
// 看着像碎片，但 absorb/agenda 本身是好词，直接剔掉会连带废掉 225 个考试词（7.4%）。
// 正确做法是让 LLM/人工给这些词素写义项（sorbe→"吸"、enda→"待做之事"），
// 只有**确实说不出义项**的才剔词。
//
// 等级：
//   A1 义项直接可用   ECDICT 里的英语实词（day/book/according），卡片义项就是它的中文
//   A2 有权威来源待翻译 lexicon 教学词素 / Wiktionary 词素词条（gloss 是英文，要译）
//   A3 需 LLM 释义    出现在 ≥2 个词里、但哪儿都查不到（sorb/cumul/jacent 这类拉丁词根）
//   A4 需 LLM 释义    只出现在 1 个词里（最可疑，释义失败就剔该词）
//
// 跑法：node scripts/tools/audit-morpheme-quality.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCanon } from '../lib/id-canon.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const derivedDir = join(here, '..', '.work', 'derived')
const rawDir = join(here, '..', '.work', 'raw')
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

// ── ECDICT：同名多行时挑「最像实词」的一行 ──
// 原实现只保留第一行，而 ECDICT 里 `SO`（缩略语）可能排在 `so` 前面，于是缩略语释义被当成词素义项。
const tagRank = (t) => (/zk/.test(t) ? 4 : /gk/.test(t) ? 3 : /cet4/.test(t) ? 2 : /cet6/.test(t) ? 1 : 0)
const rankOf = (v) => { const n = Number(v || 0) || 0; return n > 0 ? n : 0 }
const best = new Map()
const score = (r) => tagRank(r.tag) * 1000 + r.collins * 10
  + (r.bnc ? Math.max(0, 30000 - r.bnc) / 100 : 0)
  + (r.proper ? -500 : 0) + (r.abbr ? -200 : 0)
for (const line of readFileSync(join(rawDir, 'ecdict.csv'), 'utf8').split('\n').slice(1)) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const raw = String(f[0] || '').trim()
  const w = norm(raw)
  if (!w) continue
  const translation = String(f[3] || '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (!translation) continue
  const rec = {
    raw, translation,
    tag: String(f[7] || '').trim().toLowerCase(),
    collins: Number(f[5] || 0) || 0,
    bnc: rankOf(f[8]),
    frq: rankOf(f[9]),
    proper: /^[A-Z]/.test(raw) && raw !== raw.toUpperCase(), // 首字母大写：专有名词
    abbr: raw.length <= 5 && raw === raw.toUpperCase() && /[A-Z]/.test(raw), // 全大写短词：缩略语
  }
  const prev = best.get(w)
  if (!prev || score(rec) > score(prev)) best.set(w, rec)
}

// 「英语实词」：有考试/词频标记，且不是专有名词或缩略语。
// 必须带 bnc/frq —— 否则 according 这种无 tag 无 collins 的常用词会被误杀。
const COMMON_RANK = 20000
const isRealWord = (r) => !!r && !r.proper && !r.abbr
  && (tagRank(r.tag) > 0 || r.collins >= 1 || (r.bnc > 0 && r.bnc <= COMMON_RANK) || (r.frq > 0 && r.frq <= COMMON_RANK))

const lexicon = JSON.parse(readFileSync(join(derivedDir, 'morpheme-lexicon.json'), 'utf8')).lexicon
const lexBySurface = new Map(lexicon.map((m) => [m.surface, m]))
const affixGloss = new Map(Object.entries(JSON.parse(readFileSync(join(derivedDir, 'affix-gloss-cache.json'), 'utf8'))))
const kaikkiGloss = (s) => {
  const l = affixGloss.get(s)
  return l && l.length && /^(prefix|suffix|root)$/.test(l[0].pos) ? l[0] : null
}
const draft = JSON.parse(readFileSync(join(derivedDir, 'morphemes-draft.json'), 'utf8')).morphemes
const merged = JSON.parse(readFileSync(join(derivedDir, 'splits-merged.json'), 'utf8')).splits

// ── id 归一化 + 词数重建 ──
// canon 必须由**未归一化的切分 id**构建：draft 已归一化，拿它当输入算不出映射，
// 于是 wordsById 会用原 id（generate）建键，与 draft 的 gener 对不上，词数凭空少掉。
const splitIds = new Set()
for (const info of Object.values(merged)) for (const p of info.parts) splitIds.add(p.id)
const canon = buildCanon(splitIds)
const wordsById = new Map()
for (const [w, info] of Object.entries(merged)) {
  for (const p of info.parts) {
    const c = canon.get(p.id) || p.id
    if (!wordsById.has(c)) wordsById.set(c, new Set())
    wordsById.get(c).add(w)
  }
}

// ── 分级 ──
const verdict = new Map()
const seen = new Set()
for (const m of draft) {
  const id = canon.get(m.id) || m.id
  if (seen.has(id)) continue
  seen.add(id)
  const lex = lexBySurface.get(id)
  const kg = kaikkiGloss(id)
  const r = best.get(id)
  const words = [...(wordsById.get(id) || new Set())]
  let tier; let why
  if (isRealWord(r)) { tier = 'A1'; why = `ecdict:${r.raw}` }
  else if (lex && lex.glossSource === 'affix') { tier = 'A2'; why = 'lexicon-affix' }
  else if (kg) { tier = 'A2'; why = 'wiktionary' }
  else if (lex) { tier = 'A2'; why = 'lexicon' }
  else if (words.length >= 2) { tier = 'A3'; why = r ? (r.proper ? 'proper' : r.abbr ? 'abbr' : 'lowfreq') : 'no-entry' }
  else { tier = 'A4'; why = r ? (r.proper ? 'proper' : r.abbr ? 'abbr' : 'lowfreq') : 'no-entry' }
  verdict.set(id, { tier, why, type: lex ? lex.type : 'root', meaning: m.meaningCn, gloss: lex?.gloss || kg?.gloss || '', words: words.length, sample: words.slice(0, 6) })
}

// ── 统计 + 队列落盘 ──
const byTier = {}
for (const [, v] of verdict) byTier[v.tier] = (byTier[v.tier] || 0) + 1
const needWork = [...verdict].filter(([, v]) => v.tier !== 'A1')
const a34 = needWork.filter(([, v]) => v.tier === 'A3' || v.tier === 'A4')
const a34Words = new Set()
for (const [id] of a34) for (const w of wordsById.get(id) || []) a34Words.add(w)

console.log(`词素 ${verdict.size}（归一化前 ${draft.length}，合并 ${canon.size} 个变体 id）`)
console.log('等级：')
console.log(`  A1 义项可用    ${String(byTier.A1 || 0).padStart(4)}   ECDICT 实词，直接取中文`)
console.log(`  A2 待翻译      ${String(byTier.A2 || 0).padStart(4)}   有权威来源（教学词素 / Wiktionary），gloss 要译成中文`)
console.log(`  A3 待释义      ${String(byTier.A3 || 0).padStart(4)}   出现在 ≥2 词但查不到，需 LLM 写词素义项`)
console.log(`  A4 待释义      ${String(byTier.A4 || 0).padStart(4)}   只出现 1 词，最可疑；释义失败就剔该词`)
console.log(`\n词 ${Object.keys(merged).length}：含 A3/A4 词素的 ${a34Words.size} 词，补上义项即可全保留`)
console.log('\nA3/A4 样例（词素 → 样例词）：')
for (const [id, v] of a34.slice(0, 18)) console.log(`  ${id.padEnd(12)} ${v.tier} ${String(v.words).padStart(2)}词  ${v.sample.join(', ').slice(0, 60)}`)

writeFileSync(join(derivedDir, 'morpheme-quality.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  canon: Object.fromEntries(canon),
  stats: byTier,
  verdict: Object.fromEntries(verdict),
}, null, 1), 'utf8')
writeFileSync(join(derivedDir, 'morpheme-tasks.json'), JSON.stringify({
  _comment: 'S6c 待办：A2 把英文 gloss 译成中文（1-8 汉字）；A3/A4 由 LLM 写出词素义项（1-8 汉字），写不出的报 undefined 以便剔词',
  translations: needWork.filter(([, v]) => v.tier === 'A2').map(([id, v]) => ({ id, type: v.type, gloss: v.gloss, words: v.words })),
  definitions: a34.map(([id, v]) => ({ id, type: v.type, words: v.words, sample: v.sample })),
}, null, 1), 'utf8')
console.log('\n→ .work/derived/morpheme-quality.json（分级）')
console.log('→ .work/derived/morpheme-tasks.json（翻译 + 释义队列）')
