#!/usr/bin/env node
/**
 * 把 App_Data/dict.db 的 compounds 表（两个独立单词拼成的词，如 eyeball = eye + ball）
 * 导成前端内容层 src/domain/content/compounds.json，供词根地图在词根详情里补一列
 * 「含这个零件的复合词」。
 *
 * 为什么单独一份、不并进 words-index.json：
 *   词根词库的词要进拼词游戏，必须有字面义/隐喻义/干扰项/例句等九个字段（见 40-assemble.mjs），
 *   而分片下标又和 words 数组顺序死绑（DETAIL_SHARD_SIZE=85）。复合词只有「音标 + 释义 + 两段拼法」，
 *   硬塞进去会让学习流程缺字段、分片全表重切。所以它是独立的只读展示层，懒加载，不参与游戏与搜索命中排行。
 *
 * 用法：npm run compounds:build（等同 node scripts/tools/45-build-compounds-content.mjs）
 * 产出：src/domain/content/compounds.json（进仓库，构建时不需要 sqlite）
 * 依赖 node:sqlite：Node 22.13+ / 23.4+ / 24+ 可直接 import；更早的 22.5~22.12 要加 --experimental-sqlite。
 *
 * 注意：脚本不排除「已在词根词库里」的词，去重交给运行时（compounds.ts），
 * 这样以后词库收词变化时不用重新生成数据。
 */
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const dbPath = join(root, 'App_Data', 'dict.db')
const outPath = join(root, 'src', 'domain', 'content', 'compounds.json')

/** 释义里的换行/多空格压平，避免表格里出现不可控高度。 */
const flat = (text) => String(text ?? '').replace(/\s+/g, ' ').trim()

const POS_PREFIX = /^(n|v|a|ad|adj|adv|vt|vi|prep|conj|int|pron|num|aux|art|abbr|pl|s)\s*[.．]\s*/i

/**
 * 词典里有 `vi.vt.`、`vt.&vi.` 这种连着写两个词性的（shoplift、crosscut、daresay），
 * 单次替换只能吃掉第一个，所以循环剥到没有为止。
 */
function stripPos(text) {
  let out = text.trim()
  for (let guard = 0; guard < 6; guard++) {
    const next = out.replace(POS_PREFIX, '').replace(/^[&/]+/, '').trim()
    if (next === out) break
    out = next
  }
  return out
}

/**
 * 词典释义去噪（宁可少不能多）：
 *   1. 去 [医] [俚] [计] 这类域标注
 *   2. 去括号补充（多为「（等于baseball）」「（美）」这类，正文信息量低）
 *   3. 只留第一段义项（后续段基本是别的词性，如 screwball 的 a. 怪僻的）
 *   4. 段内最多两个义项，用「；」连（与词根词库的释义风格一致）
 *   5. 超长截断，避免一条占满整屏
 * 例：`n. 舞厅, 跳舞场` → `舞厅；跳舞场`
 *     `n. [棒](投手投出的)快球` → `快球`
 *     `棒球；棒球运动；棒球(运动)` → `棒球`
 */
function cleanMeaning(raw) {
  const text = flat(raw)
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[（(][^)）]*[)）]/g, '')
  const first = (text.split(/[;；]/)[0] ?? '').trim()
  const items = first
    .split(/[,，、]/)
    .map((item) => stripPos(item))
    .filter(Boolean)
    .slice(0, 2)
  let out = items.join('；').replace(/[。．.、；;，,\s]+$/, '')
  if (!out) out = stripPos(text).slice(0, 28)
  return out.length > 28 ? `${out.slice(0, 27)}…` : out
}

const db = new DatabaseSync(dbPath)

// 词表：拿音标、释义、词频（词频只用来排序，越常见越靠前）
const wordInfo = new Map()
for (const row of db.prepare('SELECT word_lower, phonetic, meaning, frq FROM words').all()) {
  wordInfo.set(row.word_lower, row)
}

const rows = db.prepare('SELECT word_lower, part1, part2 FROM compounds').all()
const entries = []
const seen = new Set()
for (const row of rows) {
  const key = row.word_lower
  if (seen.has(key)) continue // 同词多拆法时只留第一条（表主键是 word+part1+part2）
  const info = wordInfo.get(key)
  if (!info) continue // 词典里没有这个词就跳过（实测为 0）
  const meaning = cleanMeaning(info.meaning)
  if (!meaning) continue
  seen.add(key)
  entries.push({
    word: key,
    phonetic: flat(info.phonetic),
    meaning,
    part1: String(row.part1).toLowerCase(),
    part2: String(row.part2).toLowerCase(),
    frq: Number(info.frq) || 0,
  })
}

// 按词频升序（0 视为未知排最后），同频按词长短、字母序，保证每次生成顺序稳定
entries.sort((a, b) => {
  const fa = a.frq > 0 ? a.frq : Number.MAX_SAFE_INTEGER
  const fb = b.frq > 0 ? b.frq : Number.MAX_SAFE_INTEGER
  if (fa !== fb) return fa - fb
  if (a.word.length !== b.word.length) return a.word.length - b.word.length
  return a.word < b.word ? -1 : a.word > b.word ? 1 : 0
})

// 紧凑落盘：words 用定长数组（字段顺序见 FIELDS）。
// 不存「零件 → 下标」的倒排索引：那要多 30 KB，而运行时扫一遍 3 千条只要几毫秒（见 compounds.ts）。
const FIELDS = ['word', 'phonetic', 'meaning', 'part1', 'part2']
const words = entries.map((e) => FIELDS.map((f) => e[f]))
const byPart = {}
entries.forEach((entry, index) => {
  for (const part of new Set([entry.part1, entry.part2])) {
    ;(byPart[part] ??= []).push(index)
  }
})

const payload = {
  generatedAt: new Date().toISOString(),
  source: 'App_Data/dict.db :: compounds',
  fields: FIELDS,
  total: words.length,
  words,
}
writeFileSync(outPath, `${JSON.stringify(payload)}\n`)

const sizeKb = (statSync(outPath).size / 1024).toFixed(0)
const ball = byPart.ball ?? []
console.log(`复合词 ${words.length} 条 → ${outPath}（${sizeKb} KB）`)
console.log(`涉及零件 ${Object.keys(byPart).length} 个`)
console.log(`ball 名下 ${ball.length} 条：${ball.slice(0, 12).map((i) => words[i][0]).join(', ')}…`)
const top = Object.entries(byPart).sort((a, b) => b[1].length - a[1].length).slice(0, 12)
console.log(`零件 TOP12：${top.map(([k, v]) => `${k}(${v.length})`).join(', ')}`)
console.log(`释义长度：最长 ${Math.max(...words.map((w) => w[2].length))} / 中位 ${(() => {
  const lens = words.map((w) => w[2].length).sort((a, b) => a - b)
  return lens[Math.floor(lens.length / 2)]
})()}`)
console.log('释义抽查：')
for (const i of ball.slice(0, 8)) console.log(`  ${words[i][0]} = ${words[i][3]}+${words[i][4]} → ${words[i][2]}`)
db.close()
