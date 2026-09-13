// 修 A12：干扰项必须「有具体理由地错」—— 文本里要嵌一个本词之外的**真实词素义项**。
// 手写 383 词时漏了这条契约（写成了语义相近的反义词），719 个选项全部被打回。
//
// 修法：从全库义项池里，给每个词挑两个「本词之外」的义项，套进「错的画面」模板。
// 挑选和模板都用词 id 做种子，重复跑结果一致（幂等）。
//
// 契约自查（与 contentRules.ts 对齐）：
//   A12  选项文本 includes 至少一个 foreign 义项
//   A11  与正确答案的二元组相似度 < 0.5
//   A28  不能是元话语/含省略号
//   A13  不能有拉丁字母
//
// 跑法：node scripts/tools/fix-distractors.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const handoffDir = join(root, 'scripts', 'lib', 'handoff', 'words-prose-stage3')

const allMorphemes = JSON.parse(readFileSync(join(root, 'src', 'domain', 'content', 'morphemes.json'), 'utf8'))
const cfg = JSON.parse(readFileSync(join(root, 'scripts', 'lib', 'stage3-content.json'), 'utf8'))
// 模拟 40 号的孤儿词素清理：只有「会留下」的词素的义项才进义项池、才算「本词义项」。
// 否则挑中的义项属于被清理的词素，validate 时的义项池里根本没有它，A12 会误报。
const usedIds = new Set()
// cfg.splits 的格式是 { word: [{ id, surface }, ...] } —— value 直接就是 parts 数组
for (const parts of Object.values(cfg.splits)) {
  for (const p of parts) usedIds.add(p.id)
}
const worldIds = new Set(cfg.worlds.flatMap((w) => w.morphemeIds))
const morphemes = allMorphemes.filter((m) => usedIds.has(m.id) || worldIds.has(m.id))
const morphemeById = new Map(morphemes.map((m) => [m.id, m]))

const splitGlosses = (meaningCn) => String(meaningCn || '')
  .replace(/（[^）]*）/g, '')
  .split(/[、；;，,]/)
  .map((p) => p.trim())
  .filter((p) => [...p].filter((c) => c >= '一' && c <= '鿿').length >= 2)

// ── 义项池 ──
const pool = new Set()
for (const m of morphemes) for (const g of splitGlosses(m.meaningCn)) pool.add(g)

// ── 相似度（与 contentRules 同算法）──
const PUNCT = /[\s，。、；：（）()「」《》…—·,.!?;:'"-]/g
const bigrams = (t) => { const c = [...t.replace(PUNCT, '')]; const s = new Set(); for (let i = 0; i + 1 < c.length; i++) s.add(c[i] + c[i + 1]); return s }
const jaccard = (a, b) => { const l = bigrams(a); const r = bigrams(b); if (!l.size || !r.size) return 0; let s = 0; for (const g of l) if (r.has(g)) s++; return s / (l.size + r.size - s) }
const hasLatin = (t) => /[A-Za-z]/.test(t)
const META = /讲的是|说的是|指的是|其实是|讲的还是|说的还是|…/

// 词 id → 确定性伪随机数（0..1），保证重跑结果一致
const seedOf = (s) => { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) } return ((h >>> 0) % 100000) / 100000 }

// 「错的画面」模板：把外来义项嵌进一句具体的话里
const TEMPLATES = [
  (g) => `${g}的人`,
  (g) => `${g}的地方`,
  (g) => `${g}的工具`,
  (g) => `被${g}的东西`,
  (g) => `${g}的过程`,
  (g) => `一种${g}的习俗`,
  (g) => `${g}的小站`,
  (g) => `把${g}串起来`,
  (g) => `${g}的背面`,
  (g) => `向着${g}去`,
  (g) => `${g}的一角`,
  (g) => `守着${g}过活`,
  (g) => `把${g}翻开`,
  (g) => `${g}的旧事`,
  (g) => `围着${g}转`,
  (g) => `${g}的另一面`,
  (g) => `替${g}操心`,
  (g) => `${g}的影子`,
  (g) => `${g}的来路`,
  (g) => `数着${g}过日子`,
  (g) => `${g}的味道`,
  (g) => `离${g}很远`,
]

let fixed = 0
let skipped = 0
for (const file of ['batch-1', 'batch-2', 'batch-3', 'batch-4', 'batch-5', 'batch-6', 'batch-7']) {
  const path = join(handoffDir, `${file}.json`)
  const data = JSON.parse(readFileSync(path, 'utf8'))
  let changed = false
  for (const [word, entry] of Object.entries(data)) {
    if (word.startsWith('_')) continue
    // 本词词素的义项
    const own = new Set()
    for (const p of cfg.splits[word] || []) {
      const m = morphemeById.get(p.id)
      if (m) for (const g of splitGlosses(m.meaningCn)) own.add(g)
    }
    const foreign = [...pool].filter((g) => !own.has(g))
    if (foreign.length < 4) { skipped++; continue }
    const answer = entry.metaphorMeaningCn
    // 候选：与正确答案够不像；再按种子排序取前若干，保证确定性
    const candidates = foreign
      // A11 的硬线是 0.5，这里留 0.05 余量；定太紧会让不少词挑不到候选而跳过（A12 又过不了）
      .filter((g) => jaccard(answer, g) < 0.45)
      .sort((a, b) => seedOf(word + a) - seedOf(word + b))
    if (candidates.length < 2) { skipped++; continue }
    // 模板组合也按种子挑，避免 383 个词全撞同一个句式
    const t1 = TEMPLATES[Math.floor(seedOf(word + 't1') * TEMPLATES.length)]
    const t2 = TEMPLATES[Math.floor(seedOf(word + 't2') * TEMPLATES.length)]
    const d1 = t1(candidates[0])
    const d2 = t2(candidates[1])
    // 终检：相似度 / 元话语 / 拉丁
    const ok = (d) => jaccard(answer, d) < 0.5 && !META.test(d) && !hasLatin(d)
    if (!ok(d1) || !ok(d2) || d1 === d2) { skipped++; continue }
    if (entry.metaphorOptions[1] !== d1 || entry.metaphorOptions[2] !== d2) {
      entry.metaphorOptions = [answer, d1, d2]
      changed = true
      fixed++
    }
  }
  if (changed) writeFileSync(path, `${JSON.stringify(data, null, 1)}\n`, 'utf8')
}

console.log(`义项池 ${pool.size} 个（≥2 汉字的词素义项）`)
console.log(`干扰项已补：${fixed} 个词｜跳过（义项不足或终检不过）：${skipped} 个词`)
