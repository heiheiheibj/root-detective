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
import { FALLBACK_MEANINGS, hasHanzi, INJECT_MORPHEMES, OVERRIDE_DISPLAY, OVERRIDE_MEANINGS } from '../lib/morpheme-fallback.mjs'

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

// ── 整条切分替换 ──────────────────────────────────────────────────────────────
// WORD_PART_FIX 只能改 part.id（表面形式不变），救不了「切分本身就切错」的词：
//   wander   = wandn[化暗杆内螺纹] + rn[r]     → 两个碎片，义项都是词典垃圾
//   whether  = whet[磨] + her[她]               → whet 的义项是从 "whet" 这个词查来的
//   carrot   = car[汽车] + rot[轮转]             → 两张卡片的义项都指不到「胡萝卜」
//   isolate  = iso[相等] + late[携带]            → iso- 是「相等」，跟「隔离」无关
//   delivery = deli[熟食店] + very[真正的]       → 同上
// 每一对被替换掉的碎片都只服务这一条词（在别处没有任何用处），所以换掉不会误伤别人；
// 而库里本来就有 15 个单部件词（porter/audio/grade/judge/script…），整词当词根是既定形态。
// 改在这里而不是批次源文件里：批次文件是 build-batch-config 的产物，手改下次重建就没了。
const SPLIT_REPLACE = {
  wander: [{ id: 'wander', surface: 'wander' }],
  whether: [{ id: 'whether', surface: 'whether' }],
  carrot: [{ id: 'carrot', surface: 'carrot' }],
  isolate: [{ id: 'isol', surface: 'isol' }, { id: 'ate', surface: 'ate' }],
  delivery: [{ id: 'delivery', surface: 'delivery' }],
  // ── 二轮复核：切分指错词素/把无关词素接进来（详见 docs/复核修复进度）────────
  company: [{ id: 'com', surface: 'com' }, { id: 'pan', surface: 'pan' }, { id: 'y', surface: 'y' }], // com+panis(面包)，原 comp+any
  healthy: [{ id: 'heal', surface: 'heal' }, { id: 'th', surface: 'th' }, { id: 'y', surface: 'y' }], // health+y，原 heal+thy(你的)
  wealthy: [{ id: 'weal', surface: 'weal' }, { id: 'th', surface: 'th' }, { id: 'y', surface: 'y' }], // 同上，weal+thy
  neighborhood: [{ id: 'neighbor', surface: 'neighbor' }, { id: 'hood', surface: 'hood' }], // 原 neighborh+ood(红的)
  command: [{ id: 'com', surface: 'com' }, { id: 'mand', surface: 'mand' }], // com+mandare(托付)，原 comm+and(和)
  improve: [{ id: 'im', surface: 'im' }, { id: 'prove', surface: 'prove' }], // en+prou(有利)，原 imp+rove
  translate: [{ id: 'trans', surface: 'trans' }, { id: 'late', surface: 'late' }], // trans+latum(带)，原 tran+slate
  transport: [{ id: 'trans', surface: 'trans' }, { id: 'port', surface: 'port' }], // trans+portare(搬)，原 tran+sport(运动!)
  decline: [{ id: 'de', surface: 'de' }, { id: 'cline', surface: 'cline' }], // de+clinare(倾)，原 dec(十)+line
  incline: [{ id: 'in', surface: 'in' }, { id: 'cline', surface: 'cline' }], // 同上
  nowhere: [{ id: 'ne', surface: 'no' }, { id: 'where', surface: 'where' }], // na(不)+hwær，原 now(现在)+here(她!)
  woollen: [{ id: 'wool', surface: 'wooll' }, { id: 'en', surface: 'en' }], // wool(l)+en(由…制成)，原 wool+len(羊毛)
  deliberate: [{ id: 'de', surface: 'de' }, { id: 'liber', surface: 'liber' }, { id: 'ate', surface: 'ate' }], // de+librare(称量)，原 deli(熟食店)+berate
  electron: [{ id: 'electr', surface: 'electr' }, { id: 'on', surface: 'on' }], // elektron(琥珀→电)，原 elect(当选人)+ron
  farther: [{ id: 'far', surface: 'far' }, { id: 'ther', surface: 'ther' }], // far 比较级，原 fart(远?)+her(她)
  reproach: [{ id: 're', surface: 're' }, { id: 'roach', surface: 'proach' }], // re+proche(近)，原 rep(棱纹平布)
  denounce: [{ id: 'de', surface: 'de' }, { id: 'nounce', surface: 'nounce' }], // de+nuntiare(宣告)，原 den(兽穴)+ounce(盎司)
  descent: [{ id: 'de', surface: 'de' }, { id: 'scent', surface: 'scent' }], // de+scendere(爬下)，原 des+cent(百)
  emigrate: [{ id: 'e', surface: 'e' }, { id: 'migr', surface: 'migr' }, { id: 'ate', surface: 'ate' }], // e+migrare(迁移)，原 emi+grate(高兴、感激!)
  refrain: [{ id: 're', surface: 're' }, { id: 'frain', surface: 'frain' }], // re+fraindre(勒住)，原 ref+rain(雨!)
  terrain: [{ id: 'terr', surface: 'terr' }, { id: 'ain', surface: 'ain' }], // terrenum(土地)，原 ter(三次)+rain(雨!)
  lemonade: [{ id: 'lemon', surface: 'lemon' }, { id: 'ade', surface: 'ade' }], // lemon+-ade(饮料)，原挂在 ad-(朝向) 上
  river: [{ id: 'river', surface: 'river' }], // 整词（riparia），原 rive(岸)+r
  liver: [{ id: 'liver', surface: 'liver' }], // 整词（lifer），原 live(活)+r —— 肝脏与「生活」无关
  hover: [{ id: 'hover', surface: 'hover' }], // 整词（hoven），原 hove(heave 的过去式)+r
  rather: [{ id: 'rather', surface: 'rather' }], // 整词（hrathor 比较级），原 rathe(较普通时刻时期早)+r
  slippery: [{ id: 'slippery', surface: 'slippery' }], // 整词（slip+-ery 双写），原挂在 er[ery] 上
  peer: [{ id: 'peer', surface: 'peer' }], // 整词（per/par），原 pee(英便士)+r
  taper: [{ id: 'taper', surface: 'taper' }], // 整词（tapur），原 tape(带子)+r
  later: [{ id: 'late', surface: 'lat' }, { id: 'comper', surface: 'er' }], // late+比较级 -er，原当施事 -er
  miner: [{ id: 'mine', surface: 'mine' }, { id: 'er', surface: 'r' }], // mine(矿)+施事 -er，原挂在 min(小) 上
  // ── -ate 组：动词/形容词后缀 -ate 原先被并进了介词 at(向、至)，字面义成了「向……」 ──
  accumulate: [{ id: 'ac', surface: 'ac' }, { id: 'cumul', surface: 'cumul' }, { id: 'ate', surface: 'ate' }],
  appreciate: [{ id: 'ap', surface: 'ap' }, { id: 'preci', surface: 'preci' }, { id: 'ate', surface: 'ate' }],
  candidate: [{ id: 'candid', surface: 'candid' }, { id: 'ate', surface: 'ate' }],
  concentrate: [{ id: 'con', surface: 'con' }, { id: 'centre', surface: 'centr' }, { id: 'ate', surface: 'ate' }],
  considerate: [{ id: 'consider', surface: 'consider' }, { id: 'ate', surface: 'ate' }],
  fortunate: [{ id: 'fortune', surface: 'fortun' }, { id: 'ate', surface: 'ate' }],
  anticipate: [{ id: 'anti', surface: 'anti' }, { id: 'cip', surface: 'cip' }, { id: 'ate', surface: 'ate' }],
  motivate: [{ id: 'motive', surface: 'motiv' }, { id: 'ate', surface: 'ate' }],
  originate: [{ id: 'origin', surface: 'origin' }, { id: 'ate', surface: 'ate' }],
  aggravate: [{ id: 'ag', surface: 'ag' }, { id: 'grav', surface: 'grav' }, { id: 'ate', surface: 'ate' }],
  assassinate: [{ id: 'assassin', surface: 'assassin' }, { id: 'ate', surface: 'ate' }],
  assimilate: [{ id: 'as', surface: 'as' }, { id: 'simil', surface: 'simil' }, { id: 'ate', surface: 'ate' }],
  formulate: [{ id: 'formula', surface: 'formul' }, { id: 'ate', surface: 'ate' }],
  insulate: [{ id: 'insula', surface: 'insul' }, { id: 'ate', surface: 'ate' }],
  illuminate: [{ id: 'il', surface: 'il' }, { id: 'lumin', surface: 'lumin' }, { id: 'ate', surface: 'ate' }],
  irritate: [{ id: 'ir', surface: 'ir' }, { id: 'rit', surface: 'rit' }, { id: 'ate', surface: 'ate' }],
  modulate: [{ id: 'module', surface: 'modul' }, { id: 'ate', surface: 'ate' }],
  permeate: [{ id: 'per', surface: 'per' }, { id: 'me', surface: 'me' }, { id: 'ate', surface: 'ate' }],
  subordinate: [{ id: 'sub', surface: 'sub' }, { id: 'ordin', surface: 'ordin' }, { id: 'ate', surface: 'ate' }],
  tabulate: [{ id: 'table', surface: 'tabul' }, { id: 'ate', surface: 'ate' }],
  precipitate: [{ id: 'pre', surface: 'pre' }, { id: 'cipit', surface: 'cipit' }, { id: 'ate', surface: 'ate' }],
  certificate: [{ id: 'certify', surface: 'certif' }, { id: 'ic', surface: 'ic' }, { id: 'ate', surface: 'ate' }],
  // ── 中间层：拆回「词根 + -ate」三段 ──
  intermediate: [{ id: 'inter', surface: 'inter' }, { id: 'medi', surface: 'medi' }, { id: 'ate', surface: 'ate' }],
  // ── D 组 ──
  independence: [{ id: 'in', surface: 'in' }, { id: 'de', surface: 'de' }, { id: 'pend', surface: 'pend' }, { id: 'ence', surface: 'ence' }],
  heroine: [{ id: 'heroine', surface: 'heroine' }], // 整词：id 归一化会把 ine 并回 in，立不住后缀
  routine: [{ id: 'routine', surface: 'routine' }], // 同上
  preface: [{ id: 'preface', surface: 'preface' }], // 整词：praefatio 是「说」，不能挂 fac
  automation: [{ id: 'automat', surface: 'automat' }, { id: 'ion', surface: 'ion' }],
  wide: [{ id: 'wide', surface: 'wide' }], // wid 整词，原 wi+de 两张「宽」
  already: [{ id: 'all', surface: 'al' }, { id: 'ready', surface: 'ready' }], // all(全)+ready，原挂在形容词后缀 al 上
  altogether: [{ id: 'all', surface: 'al' }, { id: 'together', surface: 'together' }], // 同上
  allocate: [{ id: 'ad', surface: 'al' }, { id: 'locate', surface: 'locate' }], // ad-(朝向) 同化，原挂在形容词后缀 al 上
  another: [{ id: 'ad', surface: 'an' }, { id: 'other', surface: 'other' }], // an(one) 的古拼法经 a- 误析，原挂在 -an 后缀上
  announce: [{ id: 'ad', surface: 'an' }, { id: 'nounce', surface: 'nounce' }], // ad+nuntiare(宣告)，同上
}
const replacedSplits = []
for (const [word, parts] of Object.entries(SPLIT_REPLACE)) {
  const before = allSplits[word]
  if (!before) { errors.push(`SPLIT_REPLACE 的 ${word} 不在切分表里`); continue }
  replacedSplits.push(`${word}: ${before.map((p) => `${p.id}[${p.surface}]`).join('+')} → ${parts.map((p) => `${p.id}[${p.surface}]`).join('+')}`)
  allSplits[word] = parts.map((p) => ({ ...p }))
}
if (replacedSplits.length) console.log(`整条切分替换 ${replacedSplits.length} 处：\n  ${replacedSplits.join('\n  ')}`)

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
  vis: 'vid', // advise/supervise 落在 vis（义项被 ECDICT 缩写词条污染成「医力」）；vid 已经是归并后的「看」，变体表里有 vise
}

// 切分修正：把词指回**正确的**词根（不是合并记录）。
// `not` 家族混了两个词源 —— notice/notation 是词根 not-（知道），neither/notwithstanding 是
// 副词 not（不）。四个词原先都挂在 not 下，一张卡得同时管「知道」和「不」两种意思。
// notice/notation 改挂 note（知道、标记）之后，两条记录各自都正确，也就没有「同一词根两张卡」。
const WORD_PART_FIX = {
  notice: { not: 'note' },
  notation: { not: 'note' },
  // cor- 在 r 前是 com- 的同化形式（加强语气），不是词根 cor(心)。correct ← com+regere，
  // 与 courage/cordial 的 cor(心) 是两个词源。挂到 corr 上（见 INJECT_MORPHEMES），
  // cor 家族就只剩真正表「心」的词。
  correct: { cor: 'corr' },
  correlate: { cor: 'corr' },
  // missing ← 古英语 missan（错过、未命中），不是拉丁 mittere(送)。表面「miss」在两个词源里
  // 都出现，所以新开 missan，让 mit(送) 继续服务 missile/mission/permissible。
  // ⚠️ 这里必须写**切分表里的原始 id**（`miss`），不是 MERGE 之后的目标 id —— 改写只在
  // 每个 part 上做一次，写 `mit` 会匹配不上，然后被 MORPHEME_MERGE 抢走（静默失效）。
  missing: { miss: 'missan' },
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
// 见下面 touched 集合里的说明：这些词素的变体表要按「切分里实际用到的表面」重算。
const ALLOMORPH_TOUCH = [
  'er', // 施事名词静音 e：driver = drive + r
  'late', // later = lat + er
  'ence', // residence = reside + nce（词干以 e 收尾，-ence 只剩 nce）
  'ent', // resident = reside + nt
  'ary', // contrary = contra + ry
  'fac', // surface = sur + face
  'al', // ideal = idea + l
  'ven', // intervene = inter + vene
  'ob', // omit = ob + mit（ob- 在 m 前只留 o）
  'itude', // multitude = multi + tude
  'vid', // divide = di + vide
  'formula', // formulate = formul + ate
  'insula', // insulate = insul + ate
  // 批次 06：常用词根族的同化变体（A6 要求 part.surface ∈ allomorphs）
  'ad', // aspect = a（ad- 在 s 前脱落辅音）
  'ex', // event/evidence/educate = e、effect = ef（ex- 在辅音前的弱化与同化）
  'duct', // educate = duc
  'decide', // decision = decis + ion
  'dis', // distant/distance = di（dis- 在 st 前脱落 s）
  'scend', // descend = de + scend（上游变体表只收了 cend）
  'main', // permanent = per + man（manere「留下」，与 maintain 的 manu 不是同源词形）
  'tend', // tension/extension = tens（拉丁分词干 tentus 的变体）
  'pend', // pension = pens（pendere 的分词干）
  // 注：spec 的 pect 变体（expect/suspect）在 legacy-morphemes.json 里补 ——
  //   spec 属于 legacy 12 词素，本函数只重算 extraMorphemes，改这里不生效。
]

const touched = new Set([
  ...Object.keys(MORPHEME_MERGE),
  ...Object.values(MORPHEME_MERGE),
  ...Object.keys(DISPLAY_FIX),
  // WORD_PART_FIX 的两侧都要收：改挂之后源词素会掉一个变体（notation 走了，not 的 `notat`
  // 就没人用了），目标词素会多一个 —— 只收目标那一侧会漏掉前者。
  ...Object.values(WORD_PART_FIX).flatMap((fix) => [...Object.keys(fix), ...Object.values(fix)]),
  // SPLIT_REPLACE 会在既有词素上启用新表面（another 的 ad[an]、nowhere 的 ne[no]、
  // reproach 的 roach[proach]、woollen 的 wool[wooll]、farther 的 far……），这些词素的
  // 变体表同样要重算，否则 21 号 A6 拒收。
  ...Object.values(SPLIT_REPLACE).flatMap((parts) => parts.map((p) => p.id)),
  // 变体表补录：切分里确实用到、上游变体表却没收的表面。典型是施事名词的静音 e ——
  // driver = drive + r（词干留下不发音的 e，后缀只剩 r），计算机/橡皮/经理这批常用词
  // 全卡在 er 的变体表缺 'r' 上，被 21 号 A6 拦了几十个。
  ...ALLOMORPH_TOUCH,
])
const usedSurfaces = new Map()
for (const parts of Object.values(allSplits)) {
  for (const part of parts) {
    if (!touched.has(part.id)) continue
    if (!usedSurfaces.has(part.id)) usedSurfaces.set(part.id, new Set())
    usedSurfaces.get(part.id).add(part.surface)
  }
}
// 词性改判：company 的 pan 本是「平锅/面包」整词根（companio 共享面包的人），cigen 把它
// 当成了前缀；wide 是「宽」整词根（古英语 wid），同理。不是任何家族的 root，改 root
// 不触发挂世界要求，但能让 21 号 A18（至少一个 root part）放行 company / wide。
const TYPE_FIX = {
  pan: 'root', wide: 'root', where: 'root',
  // duct 上游被登记成 suffix，但它是「引导」的拉丁词根（duct 服务 conduct/product/educate；
  // 同根的 duce 已是 root）。改判 root 只增不减，A18 才能收下 conduct/educate 这批常用词。
  // 注：不碰 spect —— 线上 inspection 等词把它当后缀用，改型会动到已发行卡片；
  //   expect/inspect/aspect 一律挂已有的 root spec（变体补 pect）。
  duct: 'root',
  // 批次 06b：collect/select/election/lecture 的 lect（上游登记成 suffix）、compare/prepare 的
  // par（上游是 prefix，变体只收 pare）、renew 的 new（上游是 prefix）都要当词根用。
  lect: 'root', par: 'root', new: 'root',
  manu: 'root', // manual ← manus(手)；上游登记成 prefix，manual 缺词根过不了 A18
  // se 上游被登记成 suffix、义项是「计栈空」（ECDICT 把 SE 当缩写查了）；select 里它是
  // 拉丁 se-(分开、离开)，在词首。改回 prefix 并配上按类型的颜色。
  se: 'prefix',
  // ── 批次 08+：把「被误标成词缀的自由词基 / 结合形词根」改判为 root ──
  // 这些词素本是常见名词/动词作复合基（man=人、way=路、land=土地、work=工作…），
  // 或希腊/拉丁结合形词根（tele=远、geo=地、astro=星、bio=生命…，与 spec/port/dict/vid 同属
  // 受约束词根），上游数据源错登记成 prefix/suffix，导致 A18 把成批复合词整批丢了。
  // 改判 root 后即可进词库；它们都不在任何家族（fam=n），不触发 A24。
  // 自由词基：
  land: 'root', man: 'root', side: 'root', long: 'root', way: 'root', set: 'root',
  soft: 'root', head: 'root', work: 'root', kind: 'root', time: 'root', home: 'root',
  son: 'root', safe: 'root', ship: 'root', end: 'root', ball: 'root', wise: 'root',
  worth: 'root', friend: 'root', sphere: 'root', wave: 'root', back: 'root', off: 'root',
  self: 'root', person: 'root', lord: 'root', path: 'root', nap: 'root', lock: 'root',
  fold: 'root', scape: 'root', tropic: 'root', bury: 'root', corn: 'root', cost: 'root',
  cast: 'root', meter: 'root', gram: 'root', phone: 'root', type: 'root', free: 'root',
  most: 'root', speak: 'root', fix: 'root',
  // 结合形词根（与 spec/port/dict/vid 同为受约束词根）：
  tele: 'root', micro: 'root', eco: 'root', geo: 'root', astro: 'root', auto: 'root',
  photo: 'root', bio: 'root', hydro: 'root', therm: 'root', psycho: 'root', neuro: 'root',
  philo: 'root', phil: 'root', chron: 'root', stereo: 'root', atmo: 'root', helico: 'root',
  ethno: 'root', techno: 'root', socio: 'root', logo: 'root', graph: 'root', scope: 'root',
  phon: 'root', nom: 'root', cata: 'root',
}
const TYPE_COLOR = { root: 'orange', prefix: 'blue', suffix: 'green' }
for (const m of extraMorphemes) {
  if (DISPLAY_FIX[m.id]) Object.assign(m, DISPLAY_FIX[m.id])
  if (TYPE_FIX[m.id]) { m.type = TYPE_FIX[m.id]; m.color = TYPE_COLOR[m.type] ?? 'orange' }
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

// ── 新增词素记录 ──────────────────────────────────────────────────────────────
// 重切分（SPLIT_REPLACE）与词素拆分（WORD_PART_FIX）之后需要独立建模的词根，来源见
// morpheme-fallback.mjs 的 INJECT_MORPHEMES 注释。上游数据源里没有这些 id —— 手改批次文件
// 会在下次 build-batch-config 时被覆盖，所以统一在这里注入。
const injected = []
for (const m of INJECT_MORPHEMES) {
  if (extraMorphemes.some((existing) => existing.id === m.id)) {
    errors.push(`注入词素 ${m.id} 与已有词素 id 重复`)
    continue
  }
  extraMorphemes.push({ ...m })
  injected.push(m.id)
}
if (injected.length) console.log(`注入词素 ${injected.length} 个：${injected.join('、')}`)

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

// 显示名修正：id 是内部标识，卡片上画的是 displayText（`wf` 直接显示出来就是一张写着
// 「wf＝女人」的牌）。改在这里，理由与义项覆盖一致 —— 产物字段只在收敛点统一改。
const displayFixed = []
for (const m of extraMorphemes) {
  const target = OVERRIDE_DISPLAY[m.id]
  if (target && m.displayText !== target) {
    displayFixed.push(`${m.id}：「${m.displayText}」->「${target}」`)
    m.displayText = target
  }
}
if (displayFixed.length) console.log(`词素显示名修正 ${displayFixed.length} 处：${displayFixed.join('、')}`)

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
// 二轮复核：TYPE_FIX 改判成 root 的词素（pan/wide/where）不在任何家族里，
// 配置层的「家族 root 必须挂世界」检查拦不到它们，但 validate 的 A24（教学词根
// ≥3 词必须挂世界）会拦。按词义挂进主题相配的世界：pan→炉火坊（炊具）、
// wide→度量台（宽窄）、where→四方塔（方位）。
const WORLD_ADD = {
  'hearth-forge': ['pan', 'photo'], // photo(光) 与 light 同族
  // ⚠️ 这个对象是字面量，key 重复会静默后者胜出 —— 早先给 measure-terrace 补 centre 时
  // 重写了整条，把 wide 顶掉了（A24 立刻报警才被发现）。新增词根一律往已有数组里加。
  'measure-terrace': ['wide', 'centre', 'count', 'circ', 'most', 'micro', 'long'], // wide(宽窄)+centre(中心)+count(计算)+circ(圆)+most(最)+micro(微小)+long(长)
  'compass-tower': ['where', 'back', 'tele', 'side'], // back(背/回) tele(远) side(边) 方位
  // Group A 施事名词（-er 补 'r' 变体后入表）把三个词干顶成了教学词根（家族 ≥3 词），
  // 得按词义挂进世界：produce(带出来)→货运码头、write(写)→手稿画室、trade(买卖)→市集巷。
  'cargo-dock': ['produce', 'duct', 'duce', 'ship'], // 批次 06：duc/duct/duce(引导) + ship(船)
  'script-atelier': ['write', 'new', 'gram'], // new(新的) + gram(写)
  'market-lane': ['trade', 'compete'], // 市集巷：trade(买卖) + compete(相争)
  // 批次 06：新词根与改判 root 的词素挂世界（A24：教学词根要出现在地图上）
  'growth-lab': ['cre'], // 成长实验室：cre(创造、生长) 与 bio/gen/nat 同族
  'motion-yard': ['sta', 'cess', 'stance', 'stant', 'motive', 'way', 'end', 'off'], // 行止院 + way(路) end(末端) off(离开)
  'discern-hall': ['sect', 'tail', 'kind'], // 明辨堂：sect/tail(切) + kind(种类) 与 gener 同族
  'build-site': ['struct', 'ser', 'stable', 'rupt'], // 营造场：struct(堆叠、构造)、ser(放置、连接)、stable(稳固)、rupt(破裂，与 break 同族)
  // 批次 06b：新改判 root 与注入的词素挂世界
  'reading-loft': ['lect', 'sci'], // 识读阁：lect(收集、选) + sci(知道)
  'craft-works': ['par', 'apply'], // 工匠铺：par(相等)、apply(涂、施用) 与 equ 同族
  'message-port': ['nect', 'nounce', 'script'], // 传送门：nect(连接)、nounce(讲述)、script(写) 与 port/dict 同族
  'lumber-store': ['ordin', 'set'], // 杂物仓：ordin(顺序) + set(放置) 与 organ 同族
  'office-house': ['mand'], // 职事馆：mand(托付) 与 mission/employ 同族
  'action-forge': ['fic', 'fect', 'fact', 'son', 'phone'], // 行动工坊：fic/fect/fact(做、成) + son(声) phone(声音) 与 ject/mob 同族
  'justice-hall': ['viola', 'terror'], // 正义殿堂：viola(越界、施暴)、terror(恐怖) 与 jud/vinc 同族
  'council-chamber': ['tribu', 'sid', 'claim', 'liber'], // 议事厅：tribu(给予)、sid(坐)、claim(要求、喊)、liber(自由) 与 law/court 同族
  'force-yard': ['grav', 'val'], // 运力场：grav(重)、val(强健) 与 press/fall 同族
  'hold-vault': ['cip', 'sumere', 'safe'], // 持握库：cip/sumere(拿取) + safe(安全/守护) 与 tain/ceive 同族
  'common-lane': ['corr', 'bag', 'well', 'insula', 'solve'], // 寻常巷：corr(共同、加强) + 批次07补收词根 bag/well/insula/solve
  'body-clinic': ['manu', 'man', 'head'], // 身体馆：manu(手) + man(人) head(头) 与 hand/body 同族
  'will-hall': ['pat', 'auto', 'self', 'free'], // 心志堂：pat(忍受) + auto(自动) self(自身) free(自由) 自我/意志
  // ── A24 补齐（批次 08+ 改判 root 但此前未挂世界的孤儿词根）──
  'nature-field': ['geo', 'land', 'astro', 'eco', 'wave'], // 原野：geo(地) land(土地) astro(星) eco(生态) wave(波)
  'day-room': ['home'], // 起居室：home(家) 与 house 同族
  'life-street': ['ball'], // 生活街：ball(球) 与 play 同族
  'livelihood-lane': ['work'], // 生计巷：work(工作)
  'time-vault': ['time'], // 时光库：time(时间)
  'sense-gallery': ['wise'], // 感知廊：wise(智慧) 与 real/mean 同族
  'temper-yard': ['soft'], // 刚柔场：soft(软) 与 intense/mature 同族
  'word-mill': ['type'], // 词语磨坊：type(类型/打字) 与 log/graph 同族
  'critique-hall': ['worth'], // 评议堂：worth(价值) 与 respect 同族
}
for (const [worldId, ids] of Object.entries(WORLD_ADD)) {
  const world = allWorlds.find((w) => w.id === worldId)
  if (!world) { errors.push(`WORLD_ADD 的 ${worldId} 不存在`); continue }
  world.morphemeIds = [...new Set([...world.morphemeIds, ...ids])]
}
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
