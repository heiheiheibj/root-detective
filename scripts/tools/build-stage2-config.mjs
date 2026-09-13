// 合并 stage1-content.json + stage2-additions/*.json → stage2-content.json。
// Stage 1 的 families/splits/extraMorphemes/worlds 原样保留（67 词回归锚），增量追加；
// extraMorphemes 的同 id override 以 additions 为准（allomorphs 是超集，兼容旧词）。
// 跑法：node scripts/tools/build-stage2-config.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const libDir = join(here, '..', 'lib')
const addDir = join(libDir, 'stage2-additions')
const load = (p) => JSON.parse(readFileSync(join(addDir, p), 'utf8'))

const base = JSON.parse(readFileSync(join(libDir, 'stage1-content.json'), 'utf8'))
const legacy = JSON.parse(readFileSync(join(libDir, 'legacy-morphemes.json'), 'utf8'))
const residueRaw = JSON.parse(readFileSync(join(here, '..', 'gates', 'residue-allowlist.json'), 'utf8'))
const residueAllowlist = Object.keys(residueRaw).filter((k) => !k.startsWith('_'))
const families = load('families.json')
const force = load('force-include.json')
const worlds = load('worlds.json')
const roots = load('morphemes-roots.json').morphemes
const affixes = load('morphemes-affixes.json')
const splitsA = load('splits-a.json').splits
const splitsB = load('splits-b.json').splits
const splitsC = load('splits-c.json').splits
const splitsD = load('splits-d.json').splits

// ── extraMorphemes：stage1 全量保留，同 id 被 override 替换，再追加新词素 ──
const byId = new Map(base.extraMorphemes.map((m) => [m.id, m]))
for (const m of affixes.overrides) byId.set(m.id, m)
const overrideIds = new Set(affixes.overrides.map((m) => m.id))
const baseKept = base.extraMorphemes.filter((m) => !overrideIds.has(m.id))
const extraMorphemes = [...byId.values(), ...roots, ...affixes.prefixes, ...affixes.suffixes]

// ── 家族 / 保送 / 切分 / 世界：旧 + 新 ──────────────────────────────────────
const allFamilies = { ...base.families, ...families.families }
const allForce = { ...base.forceInclude, ...force.forceInclude }
const allSplits = { ...base.splits, ...splitsA, ...splitsB, ...splitsC, ...splitsD }
const allWorlds = [...base.worlds, ...worlds.worlds]

// ── 完整性自检：每个家族词都有 split；split 引用的词素都已建模 ──────────────
const morphemeIds = new Set([...legacy.morphemes.map((m) => m.id), ...extraMorphemes.map((m) => m.id)])
const errors = []
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

if (errors.length) {
  console.error(`✗ stage2 配置自检失败 ${errors.length} 项：`)
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}

const out = {
  _comment: `Stage 2 内容配置：${Object.keys(allFamilies).length} 家族 / ${usedWords.size + base.canary.length} 词（由 build-stage2-config.mjs 合并生成；源头=stage1-content.json + stage2-additions/*，不要手改本文件）。`,
  families: allFamilies,
  canary: base.canary,
  forceInclude: allForce,
  splits: allSplits,
  extraMorphemes,
  worlds: allWorlds,
}
writeFileSync(join(libDir, 'stage2-content.json'), JSON.stringify(out, null, 1) + '\n')
console.log(`✓ stage2-content.json 生成：${Object.keys(allFamilies).length} 家族、${usedWords.size} 词、${splitCount} 条切分、${extraMorphemes.length} 词素、${allWorlds.length} 世界`)
