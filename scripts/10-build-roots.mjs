// 把三份词根表合并成候选表，进 .work/derived/roots.candidates.json。
//
// 这一步只做「读、归一化、合并、标冲突」，不做任何判断。判断分给后面两步：
//   11-glossary-llm-clean.mjs  写中文释义（LLM，因为英文义项要翻成中文）
//   12-glossary-rules.mjs      确定性闸门（id 合法、长度、变体不冲突……）
//
// ── 三份来源，许可状况不一样，用法也不一样 ──────────────────────────────
//
//   ECDICT wordroot.txt        611 条，英文义 + 拉丁/希腊来源 + 例词。
//                             ECDICT 整体是 MIT，这是**唯一可以放心当权威的来源**。
//   cigen roots_affixes.json   275 个词根 + 953 条人工切分示例（`acentric` → `a + centric`）。
//                             仓库自己贴的是 MIT，但 data 是从新东方 PDF 抽的
//                             （见它的 scripts/extract_pdf_data.py），作者无权给上游内容再授权。
//   shiweihappy roots.json     61 条，同样源自新东方 PDF（scripts/extract_xdf.py）。
//
// 所以：**中文释义一律重写，绝不逐字复制这两家的 meaningZh。** 它们只用来
// (a) 交叉核对词根 id 是否真实存在，(b) 给切分器当人工切分证据。
// cigen 的中文义项本身就不可靠——`un` 被标成「难为情的」，而它其实是「不、否定」。
//
// 跑法：node scripts/10-build-roots.mjs
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const rawDir = join(here, '.work', 'raw')
const derivedDir = join(here, '.work', 'derived')

/** ECDICT 的 class 字段有七八种写法，统一收敛成三种。 */
function normalizeType(rawClass) {
  const text = String(rawClass || '').toLowerCase()
  if (text === 'root') return 'root'
  if (text === 'prefix') return 'prefix'
  if (text.includes('suffix')) return 'suffix'
  return null
}

/**
 * 把表里各种各样的写法收敛成一个 id：只留小写字母。
 *   "-less" → "less"      "a-" → "a"      "-en2" → "en"
 * 末尾的数字是同形异义的编号（ECDICT 里 `-en2` 是另一个后缀），归一化时会撞车，
 * 交给 merge 去标冲突，不要在这里悄悄丢掉。
 */
function normalizeId(text) {
  return String(text || '').toLowerCase().replace(/[^a-z]/g, '')
}

/** 判断 ECDICT 那个数字后缀，用来解释冲突。 */
function homographIndex(rawText) {
  const match = String(rawText || '').match(/(\d+)\s*$/)
  return match ? Number(match[1]) : 0
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** 读一个 JSON 文件，同时记下它的指纹——出厂产物要靠这个说清「这条从哪来」。 */
function loadJson(name) {
  const path = join(rawDir, name)
  if (!existsSync(path)) {
    console.error(`缺少原始数据：.work/raw/${name}`)
    console.error('先跑 scripts/00-fetch-sources.mjs，或按 docs/AI交接说明.md 里的清单手工下载。')
    process.exit(1)
  }
  return { data: JSON.parse(readFileSync(path, 'utf8')), sha256: sha256(path), path }
}

// ── 读三个来源 ────────────────────────────────────────────────────────────

const ecdict = loadJson('wordroot.txt')
const cigen = loadJson('cigen-roots_affixes.json')
const shiweihappy = loadJson('shiweihappy-roots.json')

/**
 * 候选表：key 是归一化后的 id。多个来源指向同一个 id 时合并到一条，
 * 但每家的原始写法单独存着，冲突才看得出来。
 */
const byId = new Map()

function ensureEntry(id, type, displayText) {
  if (!byId.has(id)) {
    byId.set(id, {
      id,
      type,
      displayText,
      allomorphs: [],
      glossEn: '',
      origin: '',
      examples: [],
      /**
       * 同形条目。ECDICT 用编号区分它们：`-al1` 是形容词后缀、`-al2` 是名词后缀，
       * 归一化后都是 `al`。**不能只留第一条**——那样第二条的义项就无声消失了。
       * 全部堆在这里，由 12 号规则 / 11 号 LLM 决定留哪个（最终 id 只能有一个，
       * 因为运行时 morphemeById 是按 id 索引的 Map）。
       */
      variants: [],
      /** 只给 LLM 当参考，**不进产物**。来源许可没盖住上游版权。 */
      zhCandidates: [],
      provenance: [],
      conflicts: [],
    })
  }
  const entry = byId.get(id)
  if (type && entry.type !== type) {
    entry.conflicts.push(`type 冲突：${entry.provenance.join('/') || '已有'} 说是 ${entry.type}，新来源说是 ${type}`)
  }
  return entry
}

// 1) ECDICT wordroot.txt —— 权威来源。键可能是一串同源变体：`pter, ptero, pteryg, pteryx`
for (const [rawKey, value] of Object.entries(ecdict.data)) {
  const forms = String(rawKey).split(',').map((form) => form.trim()).filter(Boolean)
  const id = normalizeId(forms[0])
  if (!id) continue

  const type = normalizeType(value.class)
  if (!type) {
    console.warn(`  跳过未知 class：${rawKey}（class=${value.class}）`)
    continue
  }

  const entry = ensureEntry(id, type, forms[0])
  if (!entry.provenance.includes('ecdict-wordroot')) entry.provenance.push('ecdict-wordroot')

  // 每一个同形条目都留档，不许覆盖。`-al1` 和 `-al2` 是两条不同的记录。
  entry.variants.push({
    surface: forms[0],
    homograph: homographIndex(forms[0]),
    type,
    glossEn: String(value.meaning || ''),
    origin: String(value.origin || ''),
    examples: Array.isArray(value.example) ? value.example : [],
  })

  // 主字段只认第一条（ECDICT 编号里第 1 个通常是最常用的义项）；其余留在 variants 里等人工/规则裁决。
  if (entry.variants.length === 1) {
    entry.glossEn = String(value.meaning || '')
    entry.origin = String(value.origin || '')
    if (Array.isArray(value.example)) entry.examples.push(...value.example)
  } else if (entry.variants[0].glossEn !== String(value.meaning || '')) {
    entry.conflicts.push(`同形异义：已有「${entry.variants[0].glossEn}」，又出现「${value.meaning}」（共 ${entry.variants.length} 条，见 variants）`)
  }

  // 逗号后面的那些是同源变体，不是新词根。`ptero` / `pteryg` / `pteryx` 都归到 pter。
  for (const form of forms.slice(1)) {
    const allomorph = normalizeId(form)
    if (allomorph && allomorph !== id && !entry.allomorphs.includes(allomorph)) entry.allomorphs.push(allomorph)
  }
}

// 2) cigen —— 只管 id 和交叉核对，中文义项只当参考
for (const item of cigen.data.roots || []) {
  const id = normalizeId(item.root)
  if (!id) continue
  const entry = byId.get(id)
  if (!entry) continue // 只认 ECDICT 认过的 id；ECDICT 没有的等 12 号规则决定要不要收
  entry.provenance.push('cigen')
  entry.zhCandidates.push({ source: 'cigen', text: String(item.gloss || '') })
}

// 3) shiweihappy —— 61 条，同样只做交叉核对
for (const item of shiweihappy.data.entries || []) {
  const id = normalizeId(item.root)
  if (!id) continue
  const entry = byId.get(id)
  if (!entry) continue
  entry.provenance.push('shiweihappy')
  // meaningZh 常常是「例词义项: 无中心的；不好社交的」这种从例词倒推的句子，只能当参考
  entry.zhCandidates.push({ source: 'shiweihappy', text: String(item.meaningZh || '') })
}

// ── 输出 ──────────────────────────────────────────────────────────────────

const entries = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))

mkdirSync(derivedDir, { recursive: true })
const outPath = join(derivedDir, 'roots.candidates.json')
writeFileSync(outPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  generator: 'scripts/10-build-roots.mjs',
  sources: {
    'ecdict-wordroot': { file: 'wordroot.txt', sha256: ecdict.sha256, license: 'MIT', use: '权威来源（英文义项、来源语、例词）' },
    cigen: { file: 'cigen-roots_affixes.json', sha256: cigen.sha256, license: '仓库标 MIT，实际源自新东方 PDF——只做 id 交叉核对', use: 'id 交叉核对' },
    shiweihappy: { file: 'shiweihappy-roots.json', sha256: shiweihappy.sha256, license: '仓库标 Apache-2.0，实际源自新东方 PDF——只做 id 交叉核对', use: 'id 交叉核对' },
  },
  entries,
}, null, 2)}\n`)

const byType = { root: 0, prefix: 0, suffix: 0 }
let withOrigin = 0
let withExamples = 0
let crossChecked = 0
const conflicted = []

for (const entry of entries) {
  byType[entry.type] += 1
  if (entry.origin) withOrigin += 1
  if (entry.examples.length > 0) withExamples += 1
  if (entry.provenance.length > 1) crossChecked += 1
  if (entry.conflicts.length > 0) conflicted.push(entry)
}

console.log('')
console.log(`候选词素 ${entries.length} 条：词根 ${byType.root}、前缀 ${byType.prefix}、后缀 ${byType.suffix}`)
console.log(`  有来源语（拉丁/希腊）${withOrigin} 条，有例词 ${withExamples} 条`)
console.log(`  被第二份来源交叉核对过 ${crossChecked} 条`)
console.log(`  标了冲突 ${conflicted.length} 条`)
for (const entry of conflicted.slice(0, 10)) {
  console.log(`    · ${entry.id}（${entry.type}）：${entry.conflicts[0]}`)
}
if (conflicted.length > 10) console.log(`    … 其余 ${conflicted.length - 10} 条见 roots.candidates.json`)
console.log('')
console.log(`已写出 .work/derived/roots.candidates.json`)
console.log('下一步：node scripts/11-glossary-llm-clean.mjs（给每条写中文释义）')
