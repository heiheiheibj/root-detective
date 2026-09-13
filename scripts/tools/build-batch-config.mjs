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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCanon } from '../lib/id-canon.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const libDir = join(here, '..', 'lib')
const derivedDir = join(here, '..', '.work', 'derived')
const batchIndex = Number(process.argv[2] || 0)
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'

const merged = JSON.parse(readFileSync(join(derivedDir, 'splits-merged.json'), 'utf8')).splits
const draft = JSON.parse(readFileSync(join(derivedDir, 'morphemes-draft.json'), 'utf8')).morphemes

// 词素 id 归一化：切分把同一词根散成 sorbe/sorb、vise/vis、cumulate/cumul。
// 产物必须用归一化后的 id —— 否则产品里同一词根会出两张卡片，拼词时 id 也对不上词素表。
// canon 必须由**未归一化的切分 id**（splits）构建：draft 已经归一化过，拿它当输入算不出映射，
// 结果是 splits 里的 generate/cumulate 换不成 gener/cumul，与词素表对不上。
const splitIds = new Set()
for (const info of Object.values(merged)) for (const p of info.parts) splitIds.add(p.id)
const canon = buildCanon(splitIds)
const cid = (id) => canon.get(id) || id
const draftById = new Map(draft.map((m) => [cid(m.id), m]))
const batches = JSON.parse(readFileSync(join(derivedDir, 'batches.json'), 'utf8')).batches
const existing = JSON.parse(readFileSync(join(libDir, 'stage3-content.json'), 'utf8'))

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
  const { id: mid, displayText, type, meaningCn, allomorphs, etymology, level, color } = m
  return { id: mid, displayText, type, meaningCn, allomorphs, etymology, level, color }
}
const roots = newMorphemeIds.filter((id) => draftById.get(id)?.type === 'root').map(publicMorpheme).filter(Boolean)
const affixes = newMorphemeIds.filter((id) => draftById.get(id)?.type !== 'root').map(publicMorpheme).filter(Boolean)

// ── 切分（每片 ≤60 词）──
const chunks = []
for (let i = 0; i < newWords.length; i += 60) chunks.push(newWords.slice(i, i + 60))
const splitFiles = chunks.map((words) => {
  const splits = {}
  for (const w of words) splits[w] = merged[w].parts.map((p) => ({ id: cid(p.id), surface: p.surface }))
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
  if (draftById.get(id)?.type !== 'root') continue
  const words = (wordsPerMorpheme.get(id) || []).filter((w) => batchWordSet.has(w))
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
writeFileSync(join(outDir, 'morphemes-affixes.json'), JSON.stringify({ _comment: `${label} 新增 ${affixes.length} 个前后缀`, morphemes: affixes }, null, 1), 'utf8')
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
