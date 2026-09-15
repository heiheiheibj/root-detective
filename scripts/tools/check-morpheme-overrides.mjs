// 覆盖表自检：morpheme-fallback.mjs 是「义项错值的唯一修正点」，它自己出错就全盘皆错。
//
// 之前没有这层检查，后果实测过两次：
//   · JS 对象字面量遇到重复 key **静默后者胜出** —— 同一个 id 写两遍，第一条被无声吞掉；
//   · 表里写了一个上游根本不存在的 id（拼错、或 id 已被合并/改名），覆盖静默失效，
//     值还是垃圾值，而没有任何地方会报出来。
//
// 跑法：node scripts/tools/check-morpheme-overrides.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { countHanzi } from '../../src/domain/contentRules.ts'
import { DICT_ARTIFACT_RE, INJECT_MORPHEMES, looksLikeDuplicatedGloss, OVERRIDE_DISPLAY, OVERRIDE_MEANINGS } from '../lib/morpheme-fallback.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const libDir = join(root, 'scripts', 'lib')
const source = readFileSync(join(libDir, 'morpheme-fallback.mjs'), 'utf8')
const legacy = JSON.parse(readFileSync(join(libDir, 'legacy-morphemes.json'), 'utf8'))

// ⚠️ 「上游 id」必须从**源头**算：stage1-content.json + 各批 stage-additions。
// 不能读 stage3-content.json —— 它是 build-stage3-config 的**产物**，里面已经含上一次注入的
// 词素，拿它当基准会让 INJECT_MORPHEMES 每次重跑都报「与上游重复」。
const upstreamMorphemes = [...JSON.parse(readFileSync(join(libDir, 'stage1-content.json'), 'utf8')).extraMorphemes]
const addRoot = join(libDir, 'stage-additions')
for (const dir of readdirSync(addRoot, { withFileTypes: true })) {
  if (!dir.isDirectory() || !dir.name.startsWith('batch-')) continue
  const base = join(addRoot, dir.name)
  for (const file of readdirSync(base)) {
    if (!/^morphemes-.*\.json$/.test(file)) continue
    const data = JSON.parse(readFileSync(join(base, file), 'utf8'))
    upstreamMorphemes.push(...(data.morphemes ?? []), ...(data.overrides ?? []), ...(data.prefixes ?? []), ...(data.suffixes ?? []))
  }
}

const problems = []
const notes = []

// ── 1. 重复 key：从源码文本里数，而不是从对象里（对象已经把重复吞掉了）──
function blockOf(name) {
  const start = source.indexOf(`export const ${name} = {`)
  if (start < 0) return ''
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') { depth -= 1; if (depth === 0) return source.slice(open, i + 1) }
  }
  return ''
}
const overrideBlock = blockOf('OVERRIDE_MEANINGS')
// 一行里可能写多条（`vis: '看', capit: '头',`），所以按 key: ' 全量匹配，不能只取行首。
const keysInSource = [...overrideBlock.matchAll(/([a-z][a-z0-9]*)\s*:\s*'/g)].map((m) => m[1])
const seen = new Map()
for (const key of keysInSource) seen.set(key, (seen.get(key) || 0) + 1)
const duplicated = [...seen].filter(([, n]) => n > 1)
if (duplicated.length) {
  problems.push(`OVERRIDE_MEANINGS 有重复 key（后写的会静默覆盖前一条）：${duplicated.map(([k, n]) => `${k}×${n}`).join('、')}`)
}
const knownIds = new Set([...upstreamMorphemes.map((m) => m.id), ...legacy.morphemes.map((m) => m.id)])

// MORPHEME_MERGE 的源 id 会在收敛点被整条删掉，但它们仍躺在批次源文件里 —— displayText 撞名
// 检查要把这批人豁免掉，否则 missan(=miss) 会误报与 miss 撞名。直接从 build-stage3-config.mjs
// 的源码里提取，避免两处手写名单漂移。
const stage3Source = readFileSync(join(root, 'scripts', 'tools', 'build-stage3-config.mjs'), 'utf8')
function blockKeys(name) {
  const start = stage3Source.indexOf(`const ${name} = {`)
  if (start < 0) return []
  const open = stage3Source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < stage3Source.length; i += 1) {
    if (stage3Source[i] === '{') depth += 1
    else if (stage3Source[i] === '}') { depth -= 1; if (depth === 0) return [...stage3Source.slice(open, i + 1).matchAll(/^\s{2}([a-z][a-z0-9]*)\s*:/gm)].map((m) => m[1]) }
  }
  return []
}
const droppedByMerge = new Set(blockKeys('MORPHEME_MERGE'))
const tableIds = new Set(Object.keys(OVERRIDE_MEANINGS))
if (tableIds.size !== keysInSource.length) {
  notes.push(`源码里 ${keysInSource.length} 条、对象里 ${tableIds.size} 条（差值即被静默吞掉的重复 key）`)
}

// ── 2. 未知 id：覆盖会静默失效。除了「合并后作废」的已知名单 ──
// 这些 id 被 MORPHEME_MERGE 并进了别的记录，产物里已经没有它们；留着覆盖是防合并被回退。
const DROPPED_BY_MERGE = new Set([
  'minimus', 'minimum', 'trah', 'dc', 'puls', 'aggress', 'active', 'passer', 'courage', 'just', 'tard', 'popul',
])
const unknown = [...tableIds].filter((id) => !knownIds.has(id) && !DROPPED_BY_MERGE.has(id))
if (unknown.length) {
  problems.push(`OVERRIDE_MEANINGS 里有 ${unknown.length} 个上游不存在的 id（覆盖不会生效）：${unknown.join('、')}`)
}

// ── 3. 值本身要过 A20（1–8 汉字）并且不再是垃圾 ──
for (const [id, value] of Object.entries(OVERRIDE_MEANINGS)) {
  const hanzi = countHanzi(value)
  if (hanzi < 1 || hanzi > 8) problems.push(`${id}：义项「${value}」有 ${hanzi} 个汉字，A20 要求 1–8`)
  if (DICT_ARTIFACT_RE.test(value)) problems.push(`${id}：义项「${value}」仍带词典标记`)
  if (looksLikeDuplicatedGloss(value)) problems.push(`${id}：义项「${value}」像是词典条目拼接`)
}

// ── 4. 显示名：必须唯一，且不能和别的词素的 displayText 撞 ──
const displayOwner = new Map()
for (const m of upstreamMorphemes) displayOwner.set(m.displayText, m.id)
for (const [id, text] of Object.entries(OVERRIDE_DISPLAY)) {
  if (!knownIds.has(id)) problems.push(`OVERRIDE_DISPLAY 里的 ${id} 上游不存在`)
  const owner = displayOwner.get(text)
  if (owner && owner !== id && !droppedByMerge.has(owner)) {
    problems.push(`OVERRIDE_DISPLAY：${id} 想叫「${text}」，但 ${owner} 已经叫这个名字（A20 displayText 唯一）`)
  }
}

// ── 5. 注入记录：id 不能和上游撞、字段要齐、displayText 不能撞 ──
for (const m of INJECT_MORPHEMES) {
  if (knownIds.has(m.id)) problems.push(`INJECT_MORPHEMES 的 ${m.id} 与上游词素 id 重复`)
  for (const field of ['id', 'displayText', 'type', 'meaningCn', 'allomorphs', 'etymology', 'level', 'color']) {
    if (m[field] === undefined) problems.push(`INJECT_MORPHEMES ${m.id} 缺字段 ${field}`)
  }
  const owner = displayOwner.get(m.displayText)
  if (owner && owner !== m.id && !droppedByMerge.has(owner)) {
    problems.push(`INJECT_MORPHEMES ${m.id} 的 displayText「${m.displayText}」与 ${owner} 撞名`)
  }
  const expectColor = m.type === 'prefix' ? 'blue' : m.type === 'suffix' ? 'green' : 'orange'
  if (m.color !== expectColor) problems.push(`INJECT_MORPHEMES ${m.id}：type=${m.type} 应配 color=${expectColor}`)
  const expectHanzi = countHanzi(m.meaningCn)
  if (expectHanzi < 1 || expectHanzi > 8) problems.push(`INJECT_MORPHEMES ${m.id}：义项有 ${expectHanzi} 个汉字`)
  if (!m.allomorphs?.length) problems.push(`INJECT_MORPHEMES ${m.id}：allomorphs 为空`)
}

console.log(`覆盖表 ${tableIds.size} 条｜显示名修正 ${Object.keys(OVERRIDE_DISPLAY).length} 条｜注入词素 ${INJECT_MORPHEMES.length} 条`)
for (const note of notes) console.log(`  · ${note}`)
if (problems.length) {
  console.error(`\n✗ 覆盖表自检失败 ${problems.length} 项：`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('✓ 覆盖表自检通过')
