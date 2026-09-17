// 22 号：选例句。确定性，不调 LLM（Stage 1 红线：零成本、无 OpenRouter）。
//
// 输入  scripts/.work/derived/words.splits.json        （67 词，已切分）
//        scripts/.work/raw/tatoeba-eng-sentences.tsv   （id \t eng \t text）
//        scripts/.work/raw/tatoeba-cmn-sentences.tsv   （id \t cmn \t text）
//        scripts/.work/raw/links.csv                    （id1 \t id2，对称配对）
// 输出  scripts/.work/derived/words.examples.json
//
// 规则（文档 8.2 / 8.3 / A7 / A8 / A9）：
//   - 例句必须包含该词（A7），中文译文有汉字且无拉丁字母（A8），英文 4–20 词（A9）。
//   - 优先选「有对应中文译文」的 Tatoeba 句子（通过 links 连到 cmn 句）。
//   - 找不到就留空并标 exampleSource:"pending-llm"（本阶段无 LLM，跑完统计缺多少）。
import { createReadStream } from 'node:fs'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const derivedDir = join(here, '.work', 'derived')
const rawDir = join(here, '.work', 'raw')

const splits = JSON.parse(readFileSync(join(derivedDir, 'words.splits.json'), 'utf8'))
const words = splits.words
const targetWords = words.map((w) => w.word)

// 手写兜底例句（handoff）：本阶段无 LLM，缺中文对照的词由静态数据补，零成本。
// 分层：Stage 1 → Stage 2 → Stage 3 → 复核轮（3b），同名词以更晚的为准。
// 3b 是 2026-09 全表复核轮加的：那 811 条 Tatoeba 里没有中文对照的例句，由复核 AI
// 逐条翻译补齐（exampleEn 原样保留，只补 exampleCn）。
const handoffPaths = ['words-examples.json', 'words-examples-stage2.json', 'words-examples-stage3.json', 'words-examples-stage3b.json', 'words-examples-stage3c.json']
  .map((name) => join(here, 'lib', 'handoff', name))
// 追加读取 stage3d（批量补收词的手写例句），与既有层同序、同名词后者胜出
handoffPaths.push(join(here, 'lib', 'handoff', 'words-examples-stage3d.json'))
const handoff = new Map()
for (const p of handoffPaths) {
  if (!existsSync(p)) continue
  for (const [k, v] of Object.entries(JSON.parse(readFileSync(p, 'utf8')))) if (!k.startsWith('_')) handoff.set(k, v)
}
// handoff 兜底数据也要过同一道专名闸：静态数据坏了比 Tatoeba 挑不到更糟（它优先级最高）。
for (const [word, entry] of handoff) {
  if (word.startsWith('_')) continue
  if (hasProperNoun(entry.exampleEn, word)) {
    console.error(`❌ handoff 兜底例句含专名「${word}」：${entry.exampleEn}`)
    process.exit(1)
  }
}

// 每词一个整词匹配正则（大小写不敏感）
const wordRe = new Map(targetWords.map((w) => [w, new RegExp(`\\b${w}\\b`, 'i')]))

// 8.3 第 5 条：跳过含专名的句子。句首、代词 I、以及目标词本身除外，
// 其它大写开头的词一律视为专名（Tom / Indian / US 这类，学生会当成生词）。
function hasProperNoun(text, target) {
  const tokens = text.trim().split(/\s+/)
  return tokens.some((token, index) => {
    const bare = token.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
    if (!bare) return false
    if (/^I('|’)?(m|ll|ve|d)?$/.test(bare)) return false
    if (bare.toLowerCase() === target.toLowerCase()) return false
    if (index === 0) return false
    return /^[A-Z]/.test(bare)
  })
}

const CAP = 3000 // 每词最多缓存多少候选英文句（控内存；实测调到 15000 也救不回缺中文的那 811 条 —— Tatoeba 里确实没有对照句，白花 8 分钟）
const candidates = new Map(targetWords.map((w) => [w, []])) // word -> [{id, text}]
const candIdsByWord = new Map(targetWords.map((w) => [w, new Set()]))

function ingestEngLine(line) {
  // 1276\teng\tLet's try something.
  const tab = line.indexOf('\t')
  if (tab < 0) return
  const id = line.slice(0, tab)
  const rest = line.slice(tab + 1)
  if (!rest.startsWith('eng\t')) return
  const text = rest.slice(4)
  const lower = text.toLowerCase()
  for (const w of targetWords) {
    if (lower.includes(w) && wordRe.get(w).test(text)) {
      const arr = candidates.get(w)
      if (arr.length < CAP) { arr.push({ id, text }); candIdsByWord.get(w).add(id) }
    }
  }
}

// ── Pass A：扫英文句，收集候选 ────────────────────────────────────────────────
console.log('Pass A：扫描英文句…')
{
  const stream = createReadStream(join(rawDir, 'tatoeba-eng-sentences.tsv'), { encoding: 'utf8' })
  let buf = ''
  for await (const chunk of stream) {
    buf += chunk
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1)
      if (line) ingestEngLine(line)
    }
  }
  if (buf) ingestEngLine(buf)
}
const totalCand = [...candidates.values()].reduce((n, a) => n + a.length, 0)
console.log(`  候选英文句 ${totalCand} 条`)

// ── Pass B：装中文句 id->text ────────────────────────────────────────────────
console.log('Pass B：装载中文句…')
const cmnMap = new Map()
{
  const stream = createReadStream(join(rawDir, 'tatoeba-cmn-sentences.tsv'), { encoding: 'utf8' })
  let buf = ''
  for await (const chunk of stream) {
    buf += chunk
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1)
      if (!line) continue
      const tab = line.indexOf('\t')
      if (tab < 0) continue
      const id = line.slice(0, tab)
      const rest = line.slice(tab + 1)
      if (!rest.startsWith('cmn\t')) continue
      cmnMap.set(id, rest.slice(4))
    }
  }
  if (buf) {
    const tab = buf.indexOf('\t'); if (tab >= 0 && buf.slice(tab + 1).startsWith('cmn\t')) cmnMap.set(buf.slice(0, tab), buf.slice(tab + 5))
  }
}
console.log(`  中文句 ${cmnMap.size} 条`)

// ── Pass C：扫 links，建立 eng候选id -> cmn id ────────────────────────────────
console.log('Pass C：扫描 links 建立中英对照…')
const engCandAll = new Set()
for (const s of candIdsByWord.values()) for (const id of s) engCandAll.add(id)
const link = new Map() // engId -> cmnId
{
  const stream = createReadStream(join(rawDir, 'links.csv'), { encoding: 'utf8' })
  let buf = ''
  for await (const chunk of stream) {
    buf += chunk
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1)
      if (!line) continue
      const t = line.indexOf('\t')
      if (t < 0) continue
      const a = line.slice(0, t); const b = line.slice(t + 1)
      if (cmnMap.has(a) && engCandAll.has(b)) link.set(b, a)
      else if (cmnMap.has(b) && engCandAll.has(a)) link.set(a, b)
    }
  }
  if (buf) {
    const t = buf.indexOf('\t'); if (t >= 0) {
      const a = buf.slice(0, t); const b = buf.slice(t + 1)
      if (cmnMap.has(a) && engCandAll.has(b)) link.set(b, a)
      else if (cmnMap.has(b) && engCandAll.has(a)) link.set(a, b)
    }
  }
}
console.log(`  有中文对照的英文句 ${link.size} 条`)

// ── Pass D：每词挑一句 ────────────────────────────────────────────────────────
function wordCount(s) { return s.trim().split(/\s+/).filter(Boolean).length }
const out = []
let missing = 0
for (const w of words) {
  // handoff 优先：有静态兜底例句（含中文）就直接用它，保证 exampleCn 不为空。
  // 这一步必须放在 Tatoeba 池判断之前——候选池为空的词也要能用兜底数据。
  if (handoff.has(w.word)) {
    const h = handoff.get(w.word)
    out.push({ word: w.word, exampleEn: h.exampleEn, exampleCn: h.exampleCn, exampleSource: 'handoff', sentenceId: h.sentenceId || '', translationId: '' })
    continue
  }
  const cands = candidates.get(w.word)
  if (!cands) {
    out.push({ word: w.word, exampleEn: '', exampleCn: '', exampleSource: 'pending-llm', sentenceId: '', translationId: '' })
    missing++; continue
  }
  const inRange = (c) => wordCount(c.text) >= 4 && wordCount(c.text) <= 20
  // 优先有中文对照，且英文 4–20 词、无专名；在同范围内挑最短的（更干净）
  const linked = cands.filter((c) => link.has(c.id) && inRange(c) && !hasProperNoun(c.text, w.word))
  const pool = linked.length > 0 ? linked : cands.filter((c) => inRange(c) && !hasProperNoun(c.text, w.word))
  if (pool.length === 0) {
    out.push({ word: w.word, exampleEn: '', exampleCn: '', exampleSource: 'pending-llm', sentenceId: '', translationId: '' })
    missing++; continue
  }
  pool.sort((a, b) => wordCount(a.text) - wordCount(b.text))
  const pick = pool[0]
  const cmnId = link.get(pick.id) || ''
  const cmnText = cmnId ? cmnMap.get(cmnId) : ''
  const source = cmnId ? 'tatoeba' : 'tatoeba-no-cmn'
  out.push({ word: w.word, exampleEn: pick.text.trim(), exampleCn: cmnText || '', exampleSource: source, sentenceId: pick.id, translationId: cmnId })
}

mkdirSync(derivedDir, { recursive: true })
writeFileSync(join(derivedDir, 'words.examples.json'), `${JSON.stringify(out, null, 2)}\n`)

console.log(`\n选例句完成：${out.length - missing} 个有例句，${missing} 个缺（无中文对照或超范围）`)
console.log('已写出 scripts/.work/derived/words.examples.json')
console.log('下一步：node scripts/30-llm-prose.mjs')
