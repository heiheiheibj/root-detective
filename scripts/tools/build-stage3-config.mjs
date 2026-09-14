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
import { FALLBACK_MEANINGS, hasHanzi, OVERRIDE_MEANINGS } from '../lib/morpheme-fallback.mjs'

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

// ── 词素 id 合并：同一个词根被登记成两条记录 ──────────────────────────────────────
//
// 21 号按 cigen 给的词根拼法定 id，而 cigen 对不同词给的拼法不一样 —— 同一个拉丁词根会散成
// 两条词素记录，各自带显示名和义项。后果是词详情页里同一词根出现两个名字：拼 distract 显示
// 「trah」、拼 extract 显示「tract」；两条都挂了世界时地图上还会出两张卡。
//
// 只在「两条记录确实是同一个东西」时合并。家族里混了两个词源的不合并（见下面 WORD_PART_FIX）：
// 那是切分指错了词根，该改切分，合并只会把两种意思焊到一张卡上。
const MORPHEME_MERGE = {
  trah: 'tract', // distract/extract 落在 trah，attract/contract 落在 tract —— 同一词根 trah-
  puls: 'pel', // propulsion 落在 puls；pel 的变体表里本来就有 puls/pulse
  dc: 'duce', // induce 落在 dc（cigen 给的缩写）
  aggress: 'gress', // aggression/aggressive 落在 aggress —— 词根本体是 gress（走）
  minimum: 'minim', // minimal 落在 minimum
  minimus: 'minim', // minimize 落在 minimus
  passer: 'pass', // passport 落在 passer —— 词根本体是 pass（经过）
  active: 'act', // activity/radioactive 落在 active —— 词根本体是 act（做）
  // 下面三组两边都挂了世界，原先在地图上各出两张卡（同一词根出现在两个世界）。合并后
  // 要把源 id 从世界列表里摘掉，否则世界会引用一个已不存在的词素。
  courage: 'cor', // discourage/encouragement/courageous 落在 courage，词根本体是 cor（心）
  miss: 'mit', // missile/missing/permissible 落在 miss；mit 的变体表里本来就有 miss
  just: 'jud', // unjust 落在 just；jud 的变体表里本来就有 just
}

// 切分修正：把词指回**正确的**词根（不是合并记录）。
// `not` 家族混了两个词源 —— notice/notation 是词根 not-（知道），neither/notwithstanding 是
// 副词 not（不）。四个词原先都挂在 not 下，一张卡得同时管「知道」和「不」两种意思。
// notice/notation 改挂 note（知道、标记）之后，两条记录各自都正确，也就没有「同一词根两张卡」。
const WORD_PART_FIX = {
  notice: { not: 'note' },
  notation: { not: 'note' },
}

// 「冰」的词素被登记成 id=iced（`ice` 这个 id 被名词后缀 -ice 占着，notice/police/justice 在用）。
// 语义没错，只是显示名 `iced` 不像是「冰」。注意：它现在**没有实际落到产物里** —— 唯一用它的
// 词是 icecream，而 icecream 不在词库里（splits 里有、20 号没选进来），所以这个词素本身也没被
// 40 号产出来。留着这条是给 icecream 将来进词库时预备的，改一行显示名比事后查快。
const DISPLAY_FIX = { iced: { displayText: 'ice' } }

const rewritten = []
for (const [word, parts] of Object.entries(allSplits)) {
  for (const part of parts) {
    const target = WORD_PART_FIX[word]?.[part.id] || MORPHEME_MERGE[part.id]
    if (!target) continue
    rewritten.push(`${word}: ${part.id} → ${target}`)
    part.id = target
  }
}
if (rewritten.length) console.log(`词素 id 合并/改写 ${rewritten.length} 处：\n  ${rewritten.join('\n  ')}`)

// 家族登记表跟着改写：families 是按词根手写的登记表，键与 roots 里写死的是源 id。
// 目标家族通常已经存在（cor / mit / jud），所以是「把源家族的词并进目标、删掉源条目」。
// 不处理这一层的话，下面「每个教学词根都要挂世界」的自检会拦下 courage / miss / just ——
// 它们已经不是词素了，但仍然以家族登记的形式存在。
const mergedFamilies = []
for (const [from, to] of Object.entries(MORPHEME_MERGE)) {
  const source = allFamilies[from]
  if (!source) continue
  // roots 里的源 id 也要跟着改：只并 words 的话，cor 的 roots 会变成 ['cor','courage']，
  // 下面的「每个教学词根都要挂世界」就会拿 courage 去查世界，报一个已经不存在的词根。
  const roots = [...new Set((source.roots ?? []).map((root) => MORPHEME_MERGE[root] ?? root))]
  const words = source.words ?? []
  const target = allFamilies[to]
  if (target) {
    target.words = [...new Set([...(target.words ?? []), ...words])]
    target.roots = [...new Set([...(target.roots ?? []), ...roots])]
  } else {
    allFamilies[to] = { ...source, roots, words }
  }
  delete allFamilies[from]
  mergedFamilies.push(`${from}（${words.length} 词）→ ${to}`)
}
if (mergedFamilies.length) console.log(`家族登记表合并 ${mergedFamilies.length} 处：${mergedFamilies.join('、')}`)

// 受影响词素的变体表重算：目标词素要收下原先落在源 id 上的表面（A6 要求 part.surface ∈
// allomorphs），源 id 上不再被用到的变体也要摘掉（否则 A22 报「死变体」—— notation 改挂 note
// 之后，not 的 `notat` 就是这种）。
const touched = new Set([
  ...Object.keys(MORPHEME_MERGE),
  ...Object.values(MORPHEME_MERGE),
  ...Object.keys(DISPLAY_FIX),
  // WORD_PART_FIX 的两侧都要收：改挂之后源词素会掉一个变体（notation 走了，not 的 `notat`
  // 就没人用了），目标词素会多一个 —— 只收目标那一侧会漏掉前者。
  ...Object.values(WORD_PART_FIX).flatMap((fix) => [...Object.keys(fix), ...Object.values(fix)]),
])
const usedSurfaces = new Map()
for (const parts of Object.values(allSplits)) {
  for (const part of parts) {
    if (!touched.has(part.id)) continue
    if (!usedSurfaces.has(part.id)) usedSurfaces.set(part.id, new Set())
    usedSurfaces.get(part.id).add(part.surface)
  }
}
for (const m of extraMorphemes) {
  if (DISPLAY_FIX[m.id]) Object.assign(m, DISPLAY_FIX[m.id])
  const used = usedSurfaces.get(m.id)
  if (!used) continue
  const kept = m.allomorphs.filter((surface) => used.has(surface))
  m.allomorphs = [...new Set([...kept, ...used])]
}
// 源 id 的记录整条删掉：已经没有任何切分指向它们（下面「完整性自检」会兜底验证这一点）
const droppedIds = new Set(Object.keys(MORPHEME_MERGE).filter((id) => !(id in DISPLAY_FIX)))
for (let i = extraMorphemes.length - 1; i >= 0; i -= 1) {
  if (droppedIds.has(extraMorphemes[i].id)) extraMorphemes.splice(i, 1)
}

// 兜底义项：A20 要求 meaningCn 是 1–8 汉字。词素来自三处（stage1 的 extraMorphemes、
// 各批 morphemes-roots、各批 morphemes-affixes），任何一处都可能带进没义项的词根或前后缀
// （where/be/for/im/sist/tend…）。在这里统一兜一次，比在每个生成器里各补一遍可靠。
for (const m of extraMorphemes) {
  if (!hasHanzi(m.meaningCn) && FALLBACK_MEANINGS[m.id]) m.meaningCn = FALLBACK_MEANINGS[m.id]
}

// 强制覆盖：有一批词素的拼法正好撞上英文缩写/俚语条目，ECDICT 拿回来的是那个条目的释义 ——
// 有汉字、过得了 A20，但意义与词根毫无关系（trah=人名特拉汉、dc=医直电流、minim=量滴液量单位）。
// 这类兜底表兜不住，必须无条件覆盖。用「有汉字也改」体现「值错了也要纠正」。
const overridden = []
for (const m of extraMorphemes) {
  if (OVERRIDE_MEANINGS[m.id]) {
    if (m.meaningCn !== OVERRIDE_MEANINGS[m.id]) overridden.push(`${m.id}：「${m.meaningCn || '空'}」->「${OVERRIDE_MEANINGS[m.id]}」`)
    m.meaningCn = OVERRIDE_MEANINGS[m.id]
  }
}
if (overridden.length) console.log(`词素义项强制覆盖 ${overridden.length} 处：\n  ${overridden.join('\n  ')}`)

// ── 完整性自检：每个家族词都有 split；split 引用的词素都已建模 ──────────────
const morphemeIds = new Set([...legacy.morphemes.map((m) => m.id), ...extraMorphemes.map((m) => m.id)])
const usedWords = new Set()
let splitCount = 0
// 一词可属多家族：`airport` 同为 air 和 port 的家族词、`sunday` 同含 sun 和 day。
// 这对产品无害（reward 屏的「同族词」多列一个），原先当硬错误是过严 —— 降为统计。
const multiFamily = []
for (const [fam, def] of Object.entries(allFamilies)) {
  for (const w of def.words) {
    if (usedWords.has(w)) multiFamily.push(`${w}∈${fam}`)
    usedWords.add(w)
    if (!allSplits[w]) errors.push(`缺 splits[${w}]（家族 ${fam}）`)
  }
}
const orphanSplits = []
for (const [w, parts] of Object.entries(allSplits)) {
  splitCount += 1
  const assembled = parts.map((p) => p.surface).join('').toLowerCase()
  if (assembled !== w.toLowerCase() && !residueAllowlist.includes(w)) errors.push(`A5 ${w}: 拼出「${assembled}」`)
  // split 不一定属于家族：只有教学词根才建家族，`ability`(ab+ility) 这类没有教学词根的普通词
  // 本来就不在任何家族里。原先是硬错误，改为统计后由 70-report 报出来人工审视。
  if (!usedWords.has(w) && !base.canary.includes(w)) orphanSplits.push(w)
  for (const p of parts) if (!morphemeIds.has(p.id)) errors.push(`${w}: 引用未建模词素 ${p.id}`)
}
// 世界覆盖：每个 root 都要落在某个世界里
const worldRoots = new Set(allWorlds.flatMap((w) => w.morphemeIds))
// 家族里一个词都没有的词根不要求挂世界：它无词可学，放进地图也是空的。
// `live` 就是这种情况 —— alive 归一成 life 之后，live 家族空了，
// 逼它挂世界会和 A23（孤儿词素）打架：挂了 A23 报错，不挂 A24 报错。
const familyRoots = new Set()
for (const f of Object.values(allFamilies)) {
  if (!f.words || f.words.length === 0) continue
  for (const r of f.roots) familyRoots.add(r)
}
for (const r of familyRoots) if (!worldRoots.has(r)) errors.push(`词根 ${r} 不在任何世界`)
for (const r of worldRoots) if (!familyRoots.has(r) && !morphemeIds.has(r)) errors.push(`世界引用了不存在的词根 ${r}`)

if (multiFamily.length) console.log(`多家族词 ${multiFamily.length} 个（正常，样例：${multiFamily.slice(0, 4).join(' ')}）`)
if (orphanSplits.length) console.log(`无家族 split ${orphanSplits.length} 个（没有教学词根的普通词，样例：${orphanSplits.slice(0, 4).join(' ')}）`)

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
