// S6b：把 S1~S5 的产物转成管线能吃的批次配置 `scripts/lib/stage-additions/batch-NN/`。
//
// 产物格式对齐 batch-01（每个文件都是 { _comment, xxx } 包装）：
//   splits-*.json          { word: [{ id, surface }] }      每个切片 ≤60 词（Stage 2 有过截断报废的教训）
//   morphemes-roots.json   { morphemes: [...] }             词根
//   morphemes-affixes.json { morphemes: [...] }             前后缀
//   families.json          { families: { rootId: { roots, words } } }
//
// 只产出**增量**（排除 stage3-content.json 里已有的词与词素），否则会撞 A20（id 重复）。
// 世界划分单独做（S6c，需要语义分组与命名）。
//
// 跑法：node scripts/tools/build-batch-config.mjs [批次序号，默认 0=3.1]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCanon } from '../lib/id-canon.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const libDir = join(here, '..', 'lib')
const derivedDir = join(here, '..', '.work', 'derived')
const batchIndex = Number(process.argv[2] || 0)
// 本批之前的批次目录（batch-01 = Stage 2 的 300 词批）。它们是「已有」基准的一部分。
const PREV_BATCHES = Array.from({ length: batchIndex + 1 }, (_, i) => `batch-0${i + 1}`)
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'

const merged = JSON.parse(readFileSync(join(derivedDir, 'splits-merged.json'), 'utf8')).splits
const draft = JSON.parse(readFileSync(join(derivedDir, 'morphemes-draft.json'), 'utf8')).morphemes
const batches = JSON.parse(readFileSync(join(derivedDir, 'batches.json'), 'utf8')).batches

// 「已有」基准必须取**真正的上游**（stage1 + 本批之前的批次），不能取 stage3-content.json ——
// 后者是 build-stage3-config.mjs 的**产物**（已把本批合并进去），拿它当基准会让重跑时增量归零。
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const existing = { families: {}, splits: {}, extraMorphemes: [] }
{
  const b1 = readJson(join(libDir, 'stage1-content.json'))
  Object.assign(existing.families, b1.families)
  Object.assign(existing.splits, b1.splits)
  existing.extraMorphemes.push(...b1.extraMorphemes)
  for (const name of PREV_BATCHES) {
    const dir = join(libDir, 'stage-additions', name)
    if (!existsSync(dir)) continue
    Object.assign(existing.families, readJson(join(dir, 'families.json')).families)
    const af = readJson(join(dir, 'morphemes-affixes.json'))
    existing.extraMorphemes.push(...(af.overrides || []), ...(af.prefixes || []), ...(af.suffixes || []))
    existing.extraMorphemes.push(...readJson(join(dir, 'morphemes-roots.json')).morphemes)
    for (const f of readdirSync(dir).filter((x) => /^splits-.*\.json$/.test(x))) Object.assign(existing.splits, readJson(join(dir, f)).splits)
  }
}

// 词素 id 归一化：切分把同一词根散成 sorbe/sorb、vise/vis、cumulate/cumul。
// 产物必须用归一化后的 id —— 否则产品里同一词根会出两张卡片，拼词时 id 也对不上词素表。
// canon 的输入要同时含两类：
//   ① 切分表里的 id —— 映射的来源，必须是**未归一化**的（draft 已归一化，拿它算不出映射）
//   ② **已有词素表的 id** —— `pos`/`life` 是 Stage 2 人工定义的词素，切分表里不一定出现
//      （Stage 2 的 report 切成 re+port，于是 `pos` 不在 splits 里）。不纳入就算不出 pose→pos，
//      21 号会以「本阶段没拆出这个词根」把 expose/alive 丢掉。
const splitIds = new Set()
for (const info of Object.values(merged)) for (const p of info.parts) splitIds.add(p.id)
for (const m of existing.extraMorphemes) splitIds.add(m.id)
const canon = buildCanon(splitIds)
const cid = (id) => canon.get(id) || id
const draftById = new Map(draft.map((m) => [cid(m.id), m]))

const batch = batches[batchIndex]
if (!batch) { console.error(`没有第 ${batchIndex} 批，batches.json 里只有 ${batches.length} 批`); process.exit(1) }

// ── 增量：排除已有的词与词素 ──
const existingWordIds = new Set(Object.keys(existing.splits))
const existingMorphemeIds = new Set(existing.extraMorphemes.map((m) => m.id))
const newWords = batch.words.filter((w) => !existingWordIds.has(w) && merged[w])
const usedMorphemeIds = new Set()
for (const w of newWords) for (const p of merged[w].parts) usedMorphemeIds.add(cid(p.id))
const newMorphemeIds = [...usedMorphemeIds].filter((id) => !existingMorphemeIds.has(id))

// ── 词素记录（去掉 _ 开头的内部字段）──
const publicMorpheme = (id) => {
  const m = draftById.get(id)
  if (!m) return null
  const { displayText, type, meaningCn, allomorphs, etymology, level, color } = m
  // id 用归一化后的那个：draft 里这条记录的 id 可能是未归一化的 `pose`，而产物要用 `pos`
  // （与 Stage 2 已有的词素对齐），否则 21 号会认为「本阶段没拆出这个词根」而丢词。
  return { id, displayText, type, meaningCn, allomorphs, etymology, level, color }
}
const roots = newMorphemeIds.filter((id) => draftById.get(id)?.type === 'root').map(publicMorpheme).filter(Boolean)
const affixes = newMorphemeIds.filter((id) => draftById.get(id)?.type !== 'root').map(publicMorpheme).filter(Boolean)

// ── 切分（每片 ≤60 词）──
/** 逐词切分修正：{ 词: { 原 id: 新 id } }，只用于 cigen 词源数据与切分表分歧的少数词。 */
const SPLIT_FIX = { alive: { live: 'life' } }
const chunks = []
for (let i = 0; i < newWords.length; i += 60) chunks.push(newWords.slice(i, i + 60))
const splitFiles = chunks.map((words) => {
  const splits = {}
  for (const w of words) splits[w] = merged[w].parts.map((p) => {
    // `alive`：cigen 的词源数据说 alive = a + life（古英语 on life），而切分表给了 a + live，
    // 21 号要求两边一致。不能全局把 live 换 life（lively/living 里 live 是对的），逐词修正这一个。
    const fix = SPLIT_FIX[w]?.[p.id]
    return { id: cid(fix || p.id), surface: p.surface }
  })
  return splits
})

// ── 家族（教学词根的家族词，取本批内的）──
const batchWordSet = new Set(newWords)
const wordsPerMorpheme = new Map()
for (const w of batch.words) {
  if (!merged[w]) continue
  for (const p of new Set(merged[w].parts.map((x) => cid(x.id)))) {
    if (!wordsPerMorpheme.has(p)) wordsPerMorpheme.set(p, [])
    wordsPerMorpheme.get(p).push(w)
  }
}
const families = {}
for (const id of newMorphemeIds) {
  const m = draftById.get(id)
  // 家族只给**教学词根**建。零件词根（`sorbe`/`enda` 这类出现 1-2 次的碎片或变体）建家族没意义，
  // 而 families 的 key 会被 A24 要求「必须挂世界」—— 一并把两百多个碎片拖进世界里就荒唐了。
  if (!m || m.type !== 'root' || !m._teaching) continue
  // 已有家族的词根不再建：`port` 在 Stage 2 就有家族（当时挂了 5 个词），
  // batch-02 若重建只有 2 个词，会把 Stage 2 的家族词整批挤掉。
  if (existing.families[id]) continue
  const words = (wordsPerMorpheme.get(id) || []).filter((w) => batchWordSet.has(w))
  // 本批一个词都没有的词根不建家族：`live` 就是这种情况（alive 归一成了 life），
  // 建了家族会被 A24 要求挂世界，而它又无词可挂，两边打架。
  if (!words.length) continue
  families[id] = { roots: [id], words }
}

// ── 落盘 ──
const outDir = join(libDir, 'stage-additions', `batch-0${batchIndex + 2}`)
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
const label = `${batch.id} ${batch.levelCn}批`
for (let i = 0; i < splitFiles.length; i += 1) {
  const file = `splits-${LETTERS[i]}.json`
  writeFileSync(join(outDir, file), JSON.stringify({ _comment: `${label} 切分 ${LETTERS[i].toUpperCase()}：第 ${i * 60 + 1}–${Math.min((i + 1) * 60, newWords.length)} 词`, splits: splitFiles[i] }, null, 1), 'utf8')
}
writeFileSync(join(outDir, 'morphemes-roots.json'), JSON.stringify({ _comment: `${label} 新增 ${roots.length} 个词根（含零件词素，一律 type=root）`, morphemes: roots }, null, 1), 'utf8')
// 结构必须对齐 batch-01：build-stage3-config.mjs 读的是 overrides/prefixes/suffixes 三个键，
// 写成 `morphemes` 会被静默忽略 —— 123 个前后缀全丢，于是每个含前缀的词都「引用未建模词素」。
writeFileSync(join(outDir, 'morphemes-affixes.json'), JSON.stringify({
  _comment: `${label} 新增 ${affixes.length} 个前后缀（结构对齐 batch-01：prefixes/suffixes 分开）`,
  // 用 !== 'suffix' 兜底：type 缺失的也当前缀收进来，总比整个词素丢掉好
  prefixes: affixes.filter((m) => m.type !== 'suffix'),
  suffixes: affixes.filter((m) => m.type === 'suffix'),
}, null, 1), 'utf8')
writeFileSync(join(outDir, 'families.json'), JSON.stringify({ _comment: `${label} 新增 ${Object.keys(families).length} 个词根家族`, families }, null, 1), 'utf8')

const noMeaning = [...roots, ...affixes].filter((m) => !m.meaningCn).length
console.log(`${label} → ${outDir.replace(join(libDir, '..', '..'), '.')}`)
console.log(`  新增词 ${newWords.length}（本批 ${batch.words.length}，已存在 ${batch.words.length - newWords.length}）`)
console.log(`  新增词素 ${newMorphemeIds.length}（词根 ${roots.length} / 前后缀 ${affixes.length}）`)
console.log(`  切分文件 ${splitFiles.length} 个（每片 ≤60 词）`)
console.log(`  词根家族 ${Object.keys(families).length} 个`)
console.log(`  ⚠️ 缺中文义项的 ${noMeaning} 个（等 translate-queue.json 翻译完再回填）`)
const missing = [...roots, ...affixes].filter((m) => !m.meaningCn).slice(0, 10).map((m) => m.id)
if (missing.length) console.log(`     样例：${missing.join(', ')}`)
