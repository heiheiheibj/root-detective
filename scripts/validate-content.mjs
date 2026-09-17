// 词库内容闸门。规则实现在 src/domain/contentRules.ts，测试跑的是同一份，
// 所以这里只负责「取数据、套白名单、打印、决定退出码」。
//
// Node 直接加载 .ts 靠的是剥类型，只支持可擦除语法——contentRules.ts 只有 `import type`，
// 装载时整段删掉，所以它不参与无扩展名解析。给那个文件加规则时别引入带值的相对 import。
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createInitialProfile, morphemes, rootMorphemes, worlds } from '../src/domain/data.ts'
import { AGGREGATE_MIN_WORDS, MIN_WORDS_PER_ROOT, normalizeMorphemeKey, summarize, TARGET_WORD_COUNT, validateContent, validateWorlds } from '../src/domain/contentRules.ts'
import { DICT_ARTIFACT_RE, looksLikeDuplicatedGloss } from './lib/morpheme-fallback.mjs'

// 浏览器侧 data.ts 只内联词条索引层（详情按分片懒加载）；校验要查详情字段，
// 所以完整词表从 40 号产物 words.json 直接读——运行时和闸门共享同一份产物。
const words = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'domain', 'content', 'words.json'), 'utf8'))

const here = dirname(fileURLToPath(import.meta.url))
const gatesDir = join(here, 'gates')

/** 下划线开头的键是注释，不是条目。 */
function readAllowlist(name) {
  const path = join(gatesDir, name)
  if (!existsSync(path)) {
    // 白名单文件本身丢了比某一条白名单失效更危险：闸门会静默收紧，然后被人随手放宽。
    console.error(`缺少白名单文件：gates/${name}`)
    process.exit(1)
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  return Object.fromEntries(Object.entries(raw).filter(([key]) => !key.startsWith('_')))
}

const residueAllowlist = readAllowlist('residue-allowlist.json')
const unmodeledDistractorAllowlist = readAllowlist('unmodeled-distractor-allowlist.json')
// A23「教学词根缺 d5」的结构性缺口：由 scripts/tools/build-a23-d5-gap.mjs 从语料算出，
// 只收「翻遍可切分考试词库也没有含该词根的 cet6 词」的词根。没进这张表的缺 d5 词根照常报警。
const rootD5StructuralGap = readAllowlist('a23-d5-structural-gap.json')
const rootD1StructuralGap = readAllowlist('a23-d1-structural-gap.json')

// 有 provenance 边车才说明这批词是管线生成的；没有就是手写的 canary 切片。
const generated = existsSync(join(here, '.work', 'derived', 'provenance.json'))

// canary 清单：无论重新生成多少次，这 16 个词都必须还在。它们是这套玩法唯一的回归锚点。
const canaryWordIds = [
  'circumspect', 'inspection', 'respect', 'circumspection',
  'predict', 'prediction', 'predictable', 'predictive',
  'portable', 'import', 'report', 'porter',
  'visible', 'vision', 'revise', 'visibility',
]
const canarySet = new Set(canaryWordIds)

// A24 只要求「教学词根」挂世界：家族 ≥ MIN_WORDS_PER_ROOT 的才算教学词根。
// 零件词根只出现在拼词卡片里、不上地图，把它们也拉进来会凭空多出 200 多个假错误。
const famSize = new Map()
for (const w of words) for (const p of w.parts) famSize.set(p.morphemeId, (famSize.get(p.morphemeId) || 0) + 1)
const teachingRootIds = new Set([...famSize].filter(([, n]) => n >= MIN_WORDS_PER_ROOT).map(([id]) => id))

const findings = [
  ...validateContent(morphemes, words, { residueAllowlist, unmodeledDistractorAllowlist, generated, handwrittenIds: canarySet, rootD5StructuralGap, rootD1StructuralGap }),
  ...validateWorlds(morphemes, worlds, teachingRootIds),
]

// 干扰项体检要按 id 反查词素，先建一次索引（下面 A20c 用）。
const morphemeById = new Map(morphemes.map((morph) => [morph.id, morph]))

// 「词典兜底痕迹」自检（A20b，只报警不算错）。
// 有一批词素的拼法**正好撞上一个英文缩写或俚语词条**，生成时按 id 去 ECDICT 查义项，拿回来的
// 是那个词条的释义 —— 有汉字、过得了 A20，但意义与词根毫无关系（trah=人名特拉汉、dc=医直电流、
// who=医世界卫生组织、minim=量滴液量单位）。这类值兜底表兜不住，只能人工覆盖 ——
// 见 scripts/lib/morpheme-fallback.mjs 的 OVERRIDE_MEANINGS。
//
// ⚠️ 旧版用的是 `/^医|.../`（行首锚点），于是「枪医枪」「视觉的医视觉的」「必然的事情计计算」
// 这种把标记拼在**中间**的串一条都抓不到 —— 实测漏了 10 条，而闸门报 0 反而让人以为干净。
// 现在两个判据并用：任意位置的词典标记 + 重复片段（词典条目被拼接的形态）。
// 仍判 warning 不判 error：`美`(beauty)、`计`(计算)、`方`(方向) 这类单字都可能是正常义项。
// 规则放在脚本层是因为判据与覆盖表是同一份东西，分到 contentRules.ts（TS、不能带值 import）
// 就得抄一遍 —— 那正是当初义项表抄成两份的起因。
for (const m of morphemes) {
  if (m.meaningCn && (DICT_ARTIFACT_RE.test(m.meaningCn) || looksLikeDuplicatedGloss(m.meaningCn))) {
    findings.push({ level: 'warning', rule: 'A20b', target: m.id, message: `义项「${m.meaningCn}」像是把这个词素当缩写/专名/术语查了，请人工确认` })
  }
}

// 「干扰项牌面上是一张垃圾卡」自检（A20c，只报警不算错）。
// 干扰项的 text 是指向词素表的软外键：App.tsx 的 getAvailableCards 会按 id 查出来，
// 用 displayText + meaningCn 画成一张牌。所以词素义项一脏，受害的不只是它自己那条词 ——
// 它会作为干扰项被抽进别的词的拼词盘（实测：20 个垃圾词素出现在 101 条干扰项里，
// 散布在 99 个词的牌面上，包括 audience 这种和它毫无关系的词）。
// A20b 只看词素表，这条看「玩家实际会在哪些词的盘面上看到垃圾牌」。
const junkDistractorUsers = new Map()
for (const word of words) {
  for (const distractor of word.distractors) {
    const morpheme = morphemeById.get(normalizeMorphemeKey(distractor.text))
    if (!morpheme || !morpheme.meaningCn) continue
    if (!DICT_ARTIFACT_RE.test(morpheme.meaningCn) && !looksLikeDuplicatedGloss(morpheme.meaningCn)) continue
    if (!junkDistractorUsers.has(morpheme.id)) junkDistractorUsers.set(morpheme.id, { gloss: morpheme.meaningCn, words: [] })
    junkDistractorUsers.get(morpheme.id).words.push(word.id)
  }
}
for (const [id, info] of junkDistractorUsers) {
  findings.push({
    level: 'warning',
    rule: 'A20c',
    target: id,
    message: `义项「${info.gloss}」会作为干扰牌出现在 ${info.words.length} 个词的拼词盘上（如 ${info.words.slice(0, 3).join('、')}）`,
  })
}

// 「同一个词素挂在多个世界」（A24b，只报警不算错）。
// 语义上似乎可以两属，但地图页是「一个词根一张卡」，重复挂载会让同一个词根出现在两张卡上
// （实测过一次：`port` 同时挂在传送门与匠作台）。这个词根到底归哪一边是个编辑判断，
// 所以只报警让人去定，不自动择一。
const worldOwner = new Map()
for (const world of worlds) {
  for (const id of world.morphemeIds) {
    if (!worldOwner.has(id)) worldOwner.set(id, [])
    worldOwner.get(id).push(world.name)
  }
}
for (const [id, names] of worldOwner) {
  if (names.length > 1) {
    findings.push({ level: 'warning', rule: 'A24b', target: id, message: `同时挂在 ${names.join('、')} 上，地图上会出多张卡` })
  }
}

const failures = []
const wordIds = new Set(words.map((word) => word.id))
for (const id of canaryWordIds) if (!wordIds.has(id)) failures.push(`canary 词条丢失：${id}`)

// TARGET_WORD_COUNT 是「这一阶段打算有多少个词」，和 canary 清单是两回事：
// canary 保证老的没丢，这个保证新的数量对得上，防止生成器悄悄少产一半。
// Stage 3 起按批次往上铺词，词数只增不减 —— 改成「不少于」的下限检查，
// 既防生成器悄悄少产一半，也不至于每加一批就回来改一次目标值。
if (words.length < TARGET_WORD_COUNT) failures.push(`应不少于 ${TARGET_WORD_COUNT} 个词，实际 ${words.length} 个`)

const progressCount = createInitialProfile().progress.length
if (progressCount !== rootMorphemes.length) failures.push(`初始进度应有 ${rootMorphemes.length} 条，实际 ${progressCount} 条`)

// 还没启用的规则要明说，不能让人以为「跑过了」。
const skipped = []
if (!generated) skipped.push('A12（错项复用真实义项）、A19（provenance 覆盖）、A21（词源措辞与来源一致）、A27（隔离区批准）—— 手写切片没有 provenance')
if (words.length < AGGREGATE_MIN_WORDS) skipped.push(`A22（死变体）、A23（每个词根 ≥3 词且难度铺开）—— 样本 ${words.length} < ${AGGREGATE_MIN_WORDS}`)
skipped.push('A26（world id 联合类型）—— 由 TypeScript 在编译期保证，运行时看不到')

const { errors, warnings } = summarize(findings)
for (const finding of [...errors, ...warnings]) {
  console.log(`${finding.level === 'error' ? '✗' : '!'} [${finding.rule}] ${finding.target}：${finding.message}`)
}
for (const line of failures) console.log(`✗ [script] ${line}`)

// A23 的结构性缺口不进警告（它们补不出来，留着只会变成永远修不完的噪音），
// 但**必须明说**：一行写明放过了多少、依据是哪个文件，免得看着像「A23 跑过了」。
{
  const gapIds = Object.keys(rootD5StructuralGap)
  const stillWarned = findings.filter((f) => f.rule === 'A23' && /difficulty-5/.test(f.message)).map((f) => f.target)
  if (gapIds.length) {
    console.log(`– A23 d5：${gapIds.length} 个教学词根记为「结构性缺口」（全语料里没有含它的 cet6 词，补不出来），不再逐条报警 —— 依据 scripts/gates/a23-d5-structural-gap.json。${stillWarned.length ? `仍在报警 ${stillWarned.length} 个（语料里确有可收的 d5 词）：${stillWarned.join('、')}` : ''}`)
  }
}
{
  const gapIds = Object.keys(rootD1StructuralGap)
  const stillWarned = findings.filter((f) => f.rule === 'A23' && /difficulty-1/.test(f.message)).map((f) => f.target)
  if (gapIds.length) {
    console.log(`– A23 d1：${gapIds.length} 个教学词根记为「结构性缺口」（全语料里没有含它的 zk/gk 入门词，补不出来），不再逐条报警 —— 依据 scripts/gates/a23-d1-structural-gap.json。${stillWarned.length ? `仍在报警 ${stillWarned.length} 个（语料里确有可收的入门词）：${stillWarned.join('、')}` : ''}`)
  }
}

console.log('')
for (const line of skipped) console.log(`– 跳过：${line}`)
console.log('')

if (errors.length + failures.length > 0) {
  console.error(`内容校验失败：${errors.length + failures.length} 个错误，${warnings.length} 个警告。`)
  process.exit(1)
}
console.log(`内容校验通过：${words.length} 个词、${morphemes.length} 个词素（含 ${rootMorphemes.length} 个词根）、${worlds.length} 个世界，${warnings.length} 个警告。`)
