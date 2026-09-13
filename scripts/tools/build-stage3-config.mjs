// 合并 stage1-content.json + stage-additions/batch-*/ → stage3-content.json。
//
// 每批一个目录（batch-01 = Stage 2 那批增量片），目录名排序即合并顺序。
// **新增批次只需新建 batch-NN/ 目录，不用改本脚本**——这是 Stage 3 加词流水线的入口约定。
//
// 合并规则：
//   - stage1 的 families/splits/extraMorphemes/worlds 原样保留（67 词回归锚），批次在其上追加
//   - extraMorphemes：stage1 保序 → 各批 overrides 按 id 覆盖 → 各批新词素按批序追加
//   - families/splits/forceInclude：同键后者胜出，但会告警（可能是无意覆盖）
//   - worlds：id 重复直接报错（重复世界会在 40 号产出重复卡片）
//
// 跑法：node scripts/tools/build-stage3-config.mjs
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const libDir = join(here, '..', 'lib')
const addRoot = join(libDir, 'stage-additions')

const errors = []
const warnings = []
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const readOr = (p, fallback) => (existsSync(p) ? readJson(p) : fallback)

// ── 扫描批次目录 ──────────────────────────────────────────────────────────────
const batchNames = existsSync(addRoot)
  ? readdirSync(addRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('batch-'))
      .map((entry) => entry.name)
      .sort()
  : []
if (batchNames.length === 0) {
  console.error(`✗ ${addRoot} 下没有任何 batch-* 目录`)
  process.exit(1)
}
const batches = batchNames.map((name) => {
  const dir = join(addRoot, name)
  // splits 允许拆多片写（单次输出 token 有限），按文件名排序后合并
  const splits = {}
  for (const file of readdirSync(dir).filter((f) => /^splits-.*\.json$/.test(f)).sort()) {
    Object.assign(splits, readJson(join(dir, file)).splits)
  }
  return {
    name,
    families: readOr(join(dir, 'families.json'), { families: {} }).families,
    forceInclude: readOr(join(dir, 'force-include.json'), { forceInclude: {} }).forceInclude,
    worlds: readOr(join(dir, 'worlds.json'), { worlds: [] }).worlds,
    roots: readOr(join(dir, 'morphemes-roots.json'), { morphemes: [] }).morphemes,
    affixes: readOr(join(dir, 'morphemes-affixes.json'), { overrides: [], prefixes: [], suffixes: [] }),
    splits,
  }
})

const base = readJson(join(libDir, 'stage1-content.json'))
const legacy = readJson(join(libDir, 'legacy-morphemes.json'))
const residueAllowlist = Object.keys(readJson(join(here, '..', 'gates', 'residue-allowlist.json')))
  .filter((key) => !key.startsWith('_'))

// ── extraMorphemes：stage1 保序 → 各批 overrides 覆盖 → 各批新词素按批序追加 ──
const morphemeMap = new Map(base.extraMorphemes.map((m) => [m.id, m]))
for (const batch of batches) {
  for (const m of batch.affixes.overrides ?? []) morphemeMap.set(m.id, m)
}
const extraMorphemes = [...morphemeMap.values()]

// ── 家族 / 保送 / 切分 / 世界：base + 各批 ────────────────────────────────────
const allFamilies = { ...base.families }
const allForce = { ...base.forceInclude }
const allSplits = { ...base.splits }
const allWorlds = [...base.worlds]
const worldIds = new Set(allWorlds.map((w) => w.id))
for (const batch of batches) {
  for (const [fam, def] of Object.entries(batch.families)) {
    if (allFamilies[fam]) warnings.push(`${batch.name}：家族 ${fam} 覆盖了已有定义`)
    allFamilies[fam] = def
  }
  for (const [word, note] of Object.entries(batch.forceInclude)) {
    if (allForce[word]) warnings.push(`${batch.name}：保送词 ${word} 覆盖了已有条目`)
    allForce[word] = note
  }
  for (const [word, parts] of Object.entries(batch.splits)) {
    if (allSplits[word]) warnings.push(`${batch.name}：切分 ${word} 覆盖了已有定义`)
    allSplits[word] = parts
  }
  for (const world of batch.worlds) {
    if (worldIds.has(world.id)) {
      errors.push(`${batch.name}：世界 id 重复 ${world.id}`)
      continue
    }
    worldIds.add(world.id)
    allWorlds.push(world)
  }
  for (const m of [...batch.roots, ...(batch.affixes.prefixes ?? []), ...(batch.affixes.suffixes ?? [])]) {
    if (morphemeMap.has(m.id)) {
      errors.push(`${batch.name}：词素 ${m.id} 重复定义`)
      continue
    }
    morphemeMap.set(m.id, m)
    extraMorphemes.push(m)
  }
}

// ── 完整性自检：每个家族词都有 split；split 引用的词素都已建模 ──────────────
const morphemeIds = new Set([...legacy.morphemes.map((m) => m.id), ...extraMorphemes.map((m) => m.id)])
const usedWords = new Set()
let splitCount = 0
for (const [fam, def] of Object.entries(allFamilies)) {
  for (const w of def.words) {
    if (usedWords.has(w)) errors.push(`词「${w}」出现在多个家族（含 ${fam}）`)
    usedWords.add(w)
    if (!allSplits[w]) errors.push(`缺 splits[${w}]（家族 ${fam}）`)
  }
}
for (const [w, parts] of Object.entries(allSplits)) {
  splitCount += 1
  const assembled = parts.map((p) => p.surface).join('').toLowerCase()
  if (assembled !== w.toLowerCase() && !residueAllowlist.includes(w)) errors.push(`A5 ${w}: 拼出「${assembled}」`)
  if (!usedWords.has(w) && !base.canary.includes(w)) errors.push(`split「${w}」不属于任何家族，也不是 canary`)
  for (const p of parts) if (!morphemeIds.has(p.id)) errors.push(`${w}: 引用未建模词素 ${p.id}`)
}
// 世界覆盖：每个 root 都要落在某个世界里
const worldRoots = new Set(allWorlds.flatMap((w) => w.morphemeIds))
const familyRoots = new Set(Object.values(allFamilies).flatMap((f) => f.roots))
for (const r of familyRoots) if (!worldRoots.has(r)) errors.push(`词根 ${r} 不在任何世界`)
for (const r of worldRoots) if (!familyRoots.has(r) && !morphemeIds.has(r)) errors.push(`世界引用了不存在的词根 ${r}`)

if (warnings.length) {
  console.warn(`⚠ 覆盖告警 ${warnings.length} 项（后者胜出，确认是有意为之就忽略）：`)
  for (const w of warnings) console.warn('  - ' + w)
}
if (errors.length) {
  console.error(`✗ stage3 配置自检失败 ${errors.length} 项：`)
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}

const out = {
  _comment: `Stage 3 内容配置：${Object.keys(allFamilies).length} 家族 / ${usedWords.size + base.canary.length} 词（由 build-stage3-config.mjs 合并 ${batchNames.join(' + ')} 生成；源头=stage1-content.json + stage-additions/*，不要手改本文件）。`,
  families: allFamilies,
  canary: base.canary,
  forceInclude: allForce,
  splits: allSplits,
  extraMorphemes,
  worlds: allWorlds,
}
writeFileSync(join(libDir, 'stage3-content.json'), JSON.stringify(out, null, 1) + '\n')
console.log(`✓ stage3-content.json 生成（批次 ${batchNames.join(', ')}）：${Object.keys(allFamilies).length} 家族、${usedWords.size} 词、${splitCount} 条切分、${extraMorphemes.length} 词素、${allWorlds.length} 世界`)
