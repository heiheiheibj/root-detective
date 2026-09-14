// 21 号会丢掉「没有 root 词素」的词（within/wherever/transmit 这类复合词或功能词派生），
// 但释义 handoff、例句 handoff、words-review.json 里都还留着它们。这些词到了 40 号会
// 报「✗ 缺 split」并中断（40 号现在会让步，但 30 号仍会报「handoff 含多余词」警告）。
//
// 这里按 words.splits.json（21 号的产物）反查，把不在词表里的词从各 handoff 里清掉。
// 必须先跑过 node scripts/21-split-morphemes.mjs，否则 splits 是旧的。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const scriptsDir = join(here, '..')
const splitsPath = join(scriptsDir, '.work', 'derived', 'words.splits.json')
if (!existsSync(splitsPath)) {
  console.error('缺 words.splits.json，先跑 node scripts/21-split-morphemes.mjs')
  process.exit(1)
}
const inWords = new Set(
  JSON.parse(readFileSync(splitsPath, 'utf8')).words.map((w) => w.word),
)
console.log(`词表 ${inWords.size} 词`)

// 防线：21 号如果漏了配置参数（正确写法是
// `node scripts/21-split-morphemes.mjs scripts/lib/stage3-content.json`），
// 会退回默认配置只切出几十个词并覆盖 words.splits.json —— 那时本脚本会把上千个
// 真实词条全部当「多余词」删掉。词表小得离谱就停下来，别动手。
const MIN_EXPECTED = 500
if (inWords.size < MIN_EXPECTED) {
  console.error(
    `词表只有 ${inWords.size} 词（少于 ${MIN_EXPECTED}），像是 21 号没带配置参数跑出来的。\n` +
      `请先跑：node scripts/21-split-morphemes.mjs scripts/lib/stage3-content.json`,
  )
  process.exit(1)
}

const targets = [
  join(scriptsDir, 'lib', 'handoff', 'words-review.json'),
  join(scriptsDir, 'lib', 'handoff', 'words-examples.json'),
  join(scriptsDir, 'lib', 'handoff', 'words-examples-stage2.json'),
  join(scriptsDir, 'lib', 'handoff', 'words-examples-stage3.json'),
  join(scriptsDir, 'lib', 'handoff', 'words-prose.json'),
  join(scriptsDir, 'lib', 'handoff', 'words-prose-stage2.json'),
]
const proseDir = join(scriptsDir, 'lib', 'handoff', 'words-prose-stage3')
if (existsSync(proseDir)) {
  for (const f of readdirSync(proseDir)) {
    if (/^batch-\d+\.json$/.test(f)) targets.push(join(proseDir, f))
  }
}

let total = 0
const removed = []
for (const path of targets) {
  if (!existsSync(path)) continue
  const data = JSON.parse(readFileSync(path, 'utf8'))
  let dirty = false
  for (const key of Object.keys(data)) {
    if (key.startsWith('_')) continue
    if (inWords.has(key)) continue
    delete data[key]
    total += 1
    dirty = true
    removed.push(`${path.replace(scriptsDir, '.')} ${key}`)
  }
  if (dirty) writeFileSync(path, JSON.stringify(data, null, 1), 'utf8')
}
console.log(`已清掉 ${total} 条多余词：`)
console.log(removed.join('\n'))
