// 40 号：总装。把前面各阶段产物合成最终 content（词素表 / 词表 / 世界），并回写 data.ts。
// 不调 LLM。确定性。
//
// 输入：
//   scripts/lib/legacy-morphemes.json            （12 个垂直切片词素）
//   scripts/lib/stage1-content.json             （extraMorphemes + worlds）
//   scripts/overrides/canary-words.json         （16 个手写锚点词，Last 胜出）
//   scripts/.work/derived/words.candidates.json （67 词：phonetic/difficulty/translation）
//   scripts/.work/derived/words.splits.json     （67 词：parts，含 position/isAssimilated）
//   scripts/.work/derived/words.prose.json      （51 个非 canary 词的释义/隐喻/助记）
//   scripts/.work/derived/words.examples.json   （67 词：例句 EN/CN）
// 输出：
//   src/domain/content/morphemes.json
//   src/domain/content/words.json
//   src/domain/content/worlds.json
//   scripts/.work/derived/provenance.json
//   src/domain/data.ts                          （薄包装，import content 再透出，并保留 helper）
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const libDir = join(here, 'lib')
const derivedDir = join(here, '.work', 'derived')
const overridesDir = join(here, 'overrides')
const contentDir = join(here, '..', 'src', 'domain', 'content')
const dataTsPath = join(here, '..', 'src', 'domain', 'data.ts')
mkdirSync(contentDir, { recursive: true })

const legacy = JSON.parse(readFileSync(join(libDir, 'legacy-morphemes.json'), 'utf8'))
const cfgPath = process.argv[2] || join(libDir, 'stage1-content.json')
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
const canary = JSON.parse(readFileSync(join(overridesDir, 'canary-words.json'), 'utf8'))
const candidates = JSON.parse(readFileSync(join(derivedDir, 'words.candidates.json'), 'utf8'))
const splits = JSON.parse(readFileSync(join(derivedDir, 'words.splits.json'), 'utf8'))
const prose = JSON.parse(readFileSync(join(derivedDir, 'words.prose.json'), 'utf8'))
const examples = JSON.parse(readFileSync(join(derivedDir, 'words.examples.json'), 'utf8'))

// ── 词素表：legacy 12 优先，extraMorphemes 补缺失 id ──────────────────────────
const byId = new Map()
function add(m, priority) {
  const ex = byId.get(m.id)
  if (!ex || priority < ex._p) byId.set(m.id, { ...m, _p: priority })
}
legacy.morphemes.forEach((m) => add(m, 0))
cfg.extraMorphemes.forEach((m) => add(m, 2))
let morphemes = [...byId.values()].map(({ _p, ...m }) => m)
let morphemeIds = new Set(morphemes.map((m) => m.id))

// ── POS 派生：ECDICT 的 pos 列在本数据集为空，POS 藏在中文 translation 前导标签里 ──
const POS_NORM = { a: 'adj.', adj: 'adj.', n: 'n.', v: 'v.', vt: 'v.', vi: 'v.', adv: 'adv.', prep: 'prep.', conj: 'conj.', pron: 'pron.', num: 'num.', art: 'art.', int: 'int.' }
function derivePos(translation, word, parts) {
  const tags = []
  for (const seg of (translation || '').split(/[\n,]/)) {
    const m = seg.trim().match(/^([a-z]+)\./i)
    if (m) {
      const norm = POS_NORM[m[1].toLowerCase()]
      if (norm && !tags.includes(norm)) tags.push(norm)
    }
  }
  if (tags.length) return tags.join(' / ')
  // 回退：用本词自己的后缀词素推断
  const ids = (parts || []).map((p) => p.morphemeId)
  if (ids.some((id) => ['ion', 'ity', 'ence', 'ure', 'ory', 'er', 'or', 'ment', 'ness', 'ship', 'dom', 'ism', 'ist', 'age', 'th', 'ance'].includes(id))) return 'n.'
  if (ids.some((id) => ['able', 'ive', 'ic', 'ile', 'ary', 'ent', 'al', 'ous', 'ful', 'less'].includes(id))) return 'adj.'
  if (ids.some((id) => ['ate', 'ize', 'ify', 'en', 'ise'].includes(id))) return 'v.'
  if (/ion|ment|ness|ity|ance|ence|ship|dom|ism|ist|er|or$/.test(word)) return 'n.'
  if (/able|ible|ive|ic|al|ous|ful|less|ary|ile$/.test(word)) return 'adj.'
  if (/ate|ize|ify|ise|en$/.test(word)) return 'v.'
  return 'n.'
}

// ── 索引 ───────────────────────────────────────────────────────────────────
const canaryMap = new Map(canary.map((w) => [w.id, w]))
const splitMap = new Map(splits.words.map((w) => [w.id, w]))
const proseMap = new Map(prose.map((p) => [p.word, p]))
const exampleMap = new Map(examples.map((e) => [e.word, e]))
const candMap = new Map(candidates.words.map((w) => [w.id, w]))

// ── 组装非 canary 词 ────────────────────────────────────────────────────────
function wrapPhonetic(ph) {
  const s = (ph || '').trim()
  if (!s) return '/??/'
  return s.startsWith('/') && s.endsWith('/') ? s : `/${s}/`
}
const allIds = morphemes.map((m) => m.id)
// 干扰项签名全局去重：同一套四个干扰项出现在多个词上，学生连做几题会看到一模一样的选项。
// canary 的签名也先登记进去，避免生成词跟手写锚点撞车。
const usedDistractorSigs = new Set(canary.map((w) => w.distractors.map((d) => d.text).join('|')))
/** FNV-1a：字符求和做种子太弱（不同词素组合常撞出同一个和），换字符串哈希。 */
function hashId(id) {
  let hash = 2166136261
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
function makeDistractors(ownIds, wordId) {
  const pool = allIds.filter((id) => !ownIds.includes(id))
  const types = ['form', 'meaning', 'random', 'form']
  const base = hashId(wordId)
  for (let bump = 0; bump < pool.length * 25; bump += 1) {
    const start = (base + bump) % Math.max(1, pool.length)
    // 步长维度：固定步长 3 时窗口组合只有词素数种，词一多必然耗尽（300 词就撞上了）。
    // 步长 3–27 变化，且 3×步长 < 池长，保证 4 个取值互不相同；组合数 ≈ 池长×25。
    const stride = 3 + (bump % 25)
    const out = []
    for (let k = 0; k < 4 && pool.length; k += 1) out.push({ text: pool[(start + k * stride) % pool.length], type: types[k % types.length] })
    const sig = out.map((d) => d.text).join('|')
    if (!usedDistractorSigs.has(sig)) {
      usedDistractorSigs.add(sig)
      return out
    }
  }
  return []
}

const generated = []
const missingProse = []
const missingExample = []
const skippedNoSplit = []
for (const c of candidates.words) {
  const id = c.id
  if (canaryMap.has(id)) continue // canary 后面整体并入
  const sp = splitMap.get(id)
  const pr = proseMap.get(id)
  const ex = exampleMap.get(id)
  // 21 号会把「没有 root 词素」的词丢掉（within/wherever/wisdom 这类复合词或功能词派生），
  // 而 20 号的候选列表里没有这个信息 —— 这里缺 split 属于正常筛除，跳过即可。
  if (!sp) { skippedNoSplit.push(id); continue }
  if (!pr) missingProse.push(id)
  if (!ex || !ex.exampleCn) missingExample.push(id)
  const parts = sp.parts.map((p) => ({
    morphemeId: p.morphemeId,
    surface: p.surface,
    position: p.position,
    ...(p.isAssimilated ? { isAssimilated: true } : {}),
  }))
  const ownIds = parts.map((p) => p.morphemeId)
  const word = {
    id, word: id,
    phonetic: wrapPhonetic(c.phonetic),
    partOfSpeech: derivePos(c.translation, id, parts),
    modernMeaningCn: pr?.modernMeaningCn || c.translation || '',
    literalMeaningCn: pr?.literalMeaningCn || '',
    metaphorMeaningCn: pr?.metaphorMeaningCn || '',
    metaphorOptions: pr?.metaphorOptions || [],
    exampleEn: ex?.exampleEn || '',
    exampleCn: ex?.exampleCn || '',
    difficulty: typeof c.difficulty === 'number' ? c.difficulty : 3,
    parts,
    distractors: makeDistractors(ownIds, id),
    familyWordIds: [], // 第二遍填充
    sourceNote: pr?.sourceNote || '',
    mnemonicNote: pr?.mnemonicNote || '',
  }
  generated.push(word)
}
if (missingProse.length) { console.error(`✗ 缺 prose：${missingProse.join(', ')}`); process.exit(1) }
if (missingExample.length) console.warn(`! 缺中文例句：${missingExample.join(', ')}`)

// ── 家族词：共享任一词素，最多 8 个 ──────────────────────────────────────────
// 不设下限：新铺开的词库里很多词根本身只挂 1-2 个词（`alive` 的 `life` 全库就这一个、
// `breakfast` 的 `break` 也一样），凑不满 2 个同族词时 reward 屏不展示家族练习即可，
// 不该让总装失败。canary 的家族词是手写锚点，不参与重算与下限检查。
// 只重算【生成词】。canary 的 familyWordIds 是手写锚点的一部分——逐字节存活的验收
// （13.2b）要求这 16 个词的每个字段都和 overrides 完全一致，重算等于把锚点磨掉。
const allWords = [...canary, ...generated]
for (const w of generated) {
  const own = new Set(w.parts.map((p) => p.morphemeId))
  const fam = allWords.filter((o) => o.id !== w.id && o.parts.some((p) => own.has(p.morphemeId))).map((o) => o.id)
  w.familyWordIds = fam.slice(0, 8)
}
const thinFam = generated.filter((w) => w.familyWordIds.length < 2)
if (thinFam.length) console.log(`! 家族词不足 2 个的词 ${thinFam.length} 个（不展示家族练习，样例：${thinFam.slice(0, 6).map((w) => w.id + '(' + w.familyWordIds.length + ')').join(' ')}）`)
const badFam = generated.filter((w) => w.familyWordIds.length > 8)
if (badFam.length) { console.error(`✗ familyWordIds 超上限：${badFam.map((w) => w.id + '(' + w.familyWordIds.length + ')').join(', ')}`); process.exit(1) }

const words = allWords

// ── 世界：映射 stage1-content.json 的 worlds ────────────────────────────────
const worlds = cfg.worlds.map((w) => ({
  id: w.id,
  name: w.name,
  description: `学习词根：${w.morphemeIds.join('、')}（${w.name}）`,
  morphemeIds: w.morphemeIds,
}))

// 孤儿词素清理：铺库时词素表按「全部已知词素」生成，会带进一批暂未被任何词用到的
// （Stage 3 一批只上一部分词，其余的词在后面的批次）。留着会让校验报 245 个「孤儿词素」；
// 但世界引用的词素要保留，否则 A24 会反过来报「引用了没建模的词素」。
const worldMorphemeIds = new Set(worlds.flatMap((w) => w.morphemeIds))
const usedMorphemeIds = new Set(words.flatMap((w) => w.parts.map((p) => p.morphemeId)))
const morphemesBefore = morphemes.length
morphemes = morphemes.filter((m) => usedMorphemeIds.has(m.id) || worldMorphemeIds.has(m.id))
morphemeIds = new Set(morphemes.map((m) => m.id))
console.log(`孤儿词素清理：${morphemesBefore} → ${morphemes.length}（移除 ${morphemesBefore - morphemes.length} 个暂未被引用的词素）`)
// 清理后重算拼词干扰项：makeDistractors 从 allIds 取样，而 allIds 是清理前算出来的 ——
// 必须按清理后的词素表重算，否则挑出的干扰词素不在词素表里，
// A15 会判「既不是词素 id 也不是变体」（803 个错误就是这么来的）。
// 注意 ownIds 要传数组：makeDistractors 用的是 includes()，Set 上没有这个方法。
allIds.length = 0
allIds.push(...morphemes.map((m) => m.id))
usedDistractorSigs.clear()
for (const w of canary) usedDistractorSigs.add(w.distractors.map((d) => d.text).join('|'))
for (const w of generated) w.distractors = makeDistractors([...new Set(w.parts.map((p) => p.morphemeId))], w.id)

// ── 死变体修剪（A22 归零）─────────────────────────────────────────────────────
// 铺到 2698 词后，legacy 12 个词素与各批各留各的变体表，累计出几十个「没有任何词用到」的
// 死变体（A22 警告）。这里统一修剪一次，落实「allomorphs 只写实际用到的表面」的既定设计。
// 只保留 canary 干扰项用到的表面 —— canary 是手写锚点，干扰项里 `spic` 这类靠变体解析
// （A15），剪掉会让 16 个锚点词的拼词盘直接报错（这条 A22 警告会保留，属已知的误报）。
// **id / displayText 不保留**：A6 允许 displayText 作为表面、A15 按 id 查 morphemeById，
// 都不依赖 allomorphs；而「id 本身是死变体」恰恰是铺库后最常见的形态（rotation 用 rotat、
// consumption 用 consump，id `rot`/`consume` 反而没人用）。放在 40 号而不是收敛点：
// legacy 12 个词素在这里才与 extraMorphemes 合并，只有这里能一次管全。
const canaryDistractorTexts = new Set(canary.flatMap((w) => w.distractors.map((d) => d.text.replace(/^-+|-+$/g, '').toLowerCase())))
const surfacesInUse = new Map()
for (const w of words) for (const p of w.parts) {
  if (!surfacesInUse.has(p.morphemeId)) surfacesInUse.set(p.morphemeId, new Set())
  surfacesInUse.get(p.morphemeId).add(p.surface)
}
let trimmedVariants = 0
for (const m of morphemes) {
  const used = surfacesInUse.get(m.id)
  if (!used) continue
  const kept = m.allomorphs.filter((surface) =>
    used.has(surface)
    || canaryDistractorTexts.has(surface.toLowerCase()))
  if (kept.length !== m.allomorphs.length) {
    trimmedVariants += m.allomorphs.length - kept.length
    m.allomorphs = kept
  }
}
if (trimmedVariants) console.log(`死变体修剪 ${trimmedVariants} 个（A22 警告随之归零，canary 锚点用的除外）`)

// ── 落盘 JSON ───────────────────────────────────────────────────────────────
writeFileSync(join(contentDir, 'morphemes.json'), `${JSON.stringify(morphemes, null, 2)}\n`)
writeFileSync(join(contentDir, 'words.json'), `${JSON.stringify(words, null, 2)}\n`)
writeFileSync(join(contentDir, 'worlds.json'), `${JSON.stringify(worlds, null, 2)}\n`)

// ── 索引/详情分层（Stage 3.0 #2）──────────────────────────────────────────────
// 浏览器首屏只内联索引层（WordCore 七个字段）；详情按 ~85 词一片写进 details/，
// 运行时打开某个词才动态 import 对应分片。Node 侧（校验器/测试）仍直接读 words.json
// 拿完整词条，两条路共享同一份 40 号产物，不会各说各话。
const DETAIL_SHARD_SIZE = 85
const INDEX_FIELDS = ['id', 'word', 'phonetic', 'partOfSpeech', 'modernMeaningCn', 'difficulty', 'parts']
const DETAIL_FIELDS = ['literalMeaningCn', 'metaphorMeaningCn', 'metaphorOptions', 'exampleEn', 'exampleCn', 'distractors', 'familyWordIds', 'sourceNote', 'mnemonicNote']
const wordIndex = words.map((word) => Object.fromEntries(INDEX_FIELDS.map((field) => [field, word[field]])))
writeFileSync(join(contentDir, 'words-index.json'), `${JSON.stringify(wordIndex)}\n`)
const detailsDir = join(contentDir, 'details')
rmSync(detailsDir, { recursive: true, force: true })
mkdirSync(detailsDir, { recursive: true })
let detailShardCount = 0
for (let shard = 0; shard * DETAIL_SHARD_SIZE < words.length; shard++) {
  const slice = words
    .slice(shard * DETAIL_SHARD_SIZE, (shard + 1) * DETAIL_SHARD_SIZE)
    .map((word) => ({ id: word.id, ...Object.fromEntries(DETAIL_FIELDS.map((field) => [field, word[field]])) }))
  writeFileSync(join(detailsDir, `shard-${String(shard).padStart(2, '0')}.json`), `${JSON.stringify(slice)}\n`)
  detailShardCount++
}

const provenance = {
  generatedAt: new Date().toISOString(),
  generator: 'scripts/40-assemble.mjs',
  morphemes: { source: ['legacy-morphemes.json (priority 0)', 'stage1-content.json#extraMorphemes (priority 2)'], count: morphemes.length },
  words: {
    total: words.length,
    canary: canary.length,
    generated: generated.length,
    canarySource: 'scripts/overrides/canary-words.json',
    generatedSources: {
      candidates: 'words.candidates.json (phonetic/difficulty/translation→POS)',
      splits: 'words.splits.json (parts)',
      prose: 'words.prose.json (modern/literal/metaphor/options/mnemonic/source)',
      examples: 'words.examples.json (exampleEn/exampleCn)',
      distractors: 'auto: 4 foreign morpheme ids',
      familyWordIds: 'auto: shared-morpheme, capped 8',
    },
  },
  worlds: { source: 'stage1-content.json#worlds', count: worlds.length },
}
writeFileSync(join(derivedDir, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`)

// ── 回写 data.ts（薄包装：内联 content，附稳定 helper 块） ────────────────────
// 注意：helper 块直接内嵌，不回读 data.ts 再切片——否则重跑时顺序翻转会丢 rootMorphemes。
const HELPERS = `
export const rootMorphemes = morphemes.filter((morpheme) => morpheme.type === 'root')

/** 单个词根的空白进度。词根不在档案里时用它兜底，而不是借用别的词根的记录。 */
export function createRootProgress(morphemeId: string): ReviewProgress {
  return {
    morphemeId,
    state: 'new',
    stability: 0,
    dueAt: null,
    testedWordIds: [],
    migrationCorrect: 0,
    migrationAttempts: 0,
    streak: 0,
  }
}

export function createInitialProgress(): ReviewProgress[] {
  return rootMorphemes.map((morpheme) => createRootProgress(morpheme.id))
}

export const initialProgress = createInitialProgress()

export const initialStats: SessionStats = { insightPoints: 0, rootsMastered: 0, wordsSolved: 0, migrationRate: 0, currentStreak: 0 }

/** 世界 id 从上面的列表反推；加新世界只需要改那个列表，这里自动跟上。 */
export type WorldId = (typeof worlds)[number]['id']

export function createInitialProfile(): PlayerProfile {
  return {
    version: 1,
    xp: 0,
    insightPoints: 0,
    progress: createInitialProgress(),
    completedWordIds: [],
    activityDays: [],
    onboardingCompleted: false,
    helpSeen: false,
  }
}

// ---------- 索引 ----------
// 词库涨到几千条后不能再靠 Array.find 逐条扫；下面这几个 Map 在模块加载时建一次。

const wordById = new Map(words.map((word) => [word.id, word]))
const morphemeById = new Map(morphemes.map((morpheme) => [morpheme.id, morpheme]))

/** 词根 id → 含这个词根的所有词。挑词、配对面板都走它，避免每次全表扫。 */
export function buildRootIndex(allWords: readonly WordCore[]): Map<string, WordCore[]> {
  const index = new Map<string, WordCore[]>()
  for (const word of allWords) {
    for (const part of word.parts) {
      const family = index.get(part.morphemeId)
      if (family) {
        if (!family.some((item) => item.id === word.id)) family.push(word)
      } else {
        index.set(part.morphemeId, [word])
      }
    }
  }
  return index
}

export const wordsByRoot = buildRootIndex(words)

/** 缺失时回退到第一条只是为了不让界面崩；数据错误应该在校验脚本里被拦住。 */
function warnMissing(kind: string, id: string, fallbackId: string) {
  if (import.meta.env?.DEV) console.warn(\`[content] 找不到\${kind} \${id}，回退到 \${fallbackId}\`)
}

export function getWordCore(id: string): WordCore {
  const found = wordById.get(id)
  if (found) return found
  warnMissing('词条', id, words[0].id)
  return words[0]
}

// ---------- 词条详情：分片懒加载 ----------
// 浏览器打开某个词时才拉对应分片并缓存；Node 校验/测试读 content/words.json，不走这里。
// ⚠️ 分片加载失败无法在页内重试：浏览器会把「模块加载失败」记在模块表里，同一 URL 再 import
// 会立即以同一个错误 reject（实测重试零网络请求）。所以 UI 层的重试是整页重新加载。
export const DETAIL_SHARD_SIZE = ${DETAIL_SHARD_SIZE}
const detailCache = new Map<string, WordDetail>()
const detailPromises = new Map<string, Promise<WordDetail>>()
const shardOfWord = new Map(words.map((word, index) => [word.id, Math.floor(index / DETAIL_SHARD_SIZE)]))

/** 详情已经加载过就同步拿到；App 在分片就绪前渲染占位。 */
export function getWordDetailSync(id: string): WordDetail | undefined {
  return detailCache.get(id)
}

export function loadWordDetail(id: string): Promise<WordDetail> {
  const cached = detailCache.get(id)
  if (cached) return Promise.resolve(cached)
  const pending = detailPromises.get(id)
  if (pending) return pending
  const shard = shardOfWord.get(id) ?? 0
  const promise = import(\`./content/details/shard-\${String(shard).padStart(2, '0')}.json\`)
    .then((mod: { default: Array<WordDetail & { id: string }> }) => {
      for (const entry of mod.default) {
        const { id: entryId, ...detail } = entry
        detailCache.set(entryId, detail)
      }
      const detail = detailCache.get(id)
      if (!detail) throw new Error(\`[content] 详情分片里没有词条 \${id}\`)
      return detail
    })
    .finally(() => { detailPromises.delete(id) })
  detailPromises.set(id, promise)
  return promise
}

/**
 * 找不到就返回 undefined——干扰项这类「可能没建模」的引用走这里，不要回退到别的词素。
 * 干扰项的文本归一化（-ive / ive / pre- 三种写法）走 contentRules 的 normalizeMorphemeKey，
 * 那是校验器和运行时唯一的实现。
 */
export function findMorpheme(id: string): Morpheme | undefined {
  return morphemeById.get(id)
}

export function getMorpheme(id: string): Morpheme {
  const found = morphemeById.get(id)
  if (found) return found
  warnMissing('词素', id, morphemes[0].id)
  return morphemes[0]
}

export function getFamilyWords(word: Word): WordCore[] {
  return word.familyWordIds
    .map((id) => wordById.get(id))
    .filter((item): item is WordCore => Boolean(item))
}
`
const header = `import type { Morpheme, PlayerProfile, ReviewProgress, SessionStats, Word, WordCore, WordDetail, WorldDefinition } from './types'\n`
const newData =
  header +
  `// 本文件由 scripts/40-assemble.mjs 生成。词素/词/世界的数据来自 scripts/.work/derived/*.json 与 scripts/overrides/*.json，\n` +
  `// 经 content 闸门校验。改词库请改管线产物并重新 assemble，不要手改这里。\n` +
  `// 词素/世界/词条索引内联（不 import JSON，Node 类型擦除加载无需 JSON 模块开关）；\n` +
  `// 词条详情按 ~85 词一片写进 content/details/，浏览器打开某个词时才动态 import。完整词条\n` +
  `// 的唯一权威副本是 content/words.json——Node 校验器和测试直接读它。\n` +
  `export const morphemes: Morpheme[] = ${JSON.stringify(morphemes)} as Morpheme[]\n\n` +
  `export const words: WordCore[] = ${JSON.stringify(wordIndex)} as WordCore[]\n\n` +
  `export const worlds: WorldDefinition[] = ${JSON.stringify(worlds)} as WorldDefinition[]\n` +
  HELPERS
writeFileSync(dataTsPath, newData)

console.log(`✓ 总装完成：${words.length} 词、${morphemes.length} 词素、${worlds.length} 世界，详情 ${detailShardCount} 片。已回写 data.ts 与 content/*.json。`)
console.log(`  下一步：node scripts/validate-content.mjs`)
