// 事故恢复：我手动执行 `node scripts/21-split-morphemes.mjs` 时漏了配置参数
// （正确用法是 `node scripts/21-split-morphemes.mjs scripts/lib/stage3-content.json`），
// 它退回默认配置只切出 66 个词并覆盖了 words.splits.json。
// 紧接着 prune-handoff-words.mjs 拿这份坏 splits 反查，把 transmit / adjust 这两个
// 真实存在的词当成「多余词」从 4 个 handoff 里删掉了。
//
// 本脚本用 `git show HEAD:<path>`（只读）把这几个文件恢复到上一次提交的版本，
// 并删掉被污染的 words.splits.json（由管线重新生成）。
import { execFileSync } from 'node:child_process'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

const FILES = [
  'scripts/lib/handoff/words-review.json',
  'scripts/lib/handoff/words-examples-stage2.json',
  'scripts/lib/handoff/words-prose-stage3/batch-1.json',
  'scripts/lib/handoff/words-prose-stage3/batch-6.json',
]

for (const rel of FILES) {
  const content = execFileSync('git', ['show', `HEAD:${rel}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  writeFileSync(join(root, rel), content, 'utf8')
  console.log(`已恢复 ${rel}（${content.length} 字节）`)
}

const splitsPath = join(root, 'scripts', '.work', 'derived', 'words.splits.json')
if (existsSync(splitsPath)) {
  unlinkSync(splitsPath)
  console.log('已删除被污染的 words.splits.json（管线会重新生成）')
}

// 核对：这两个词应当重新出现在 handoff 里
for (const [rel, word] of [
  ['scripts/lib/handoff/words-review.json', 'transmit'],
  ['scripts/lib/handoff/words-review.json', 'adjust'],
]) {
  const data = JSON.parse(execFileSync('git', ['show', `HEAD:${rel}`], { cwd: root, encoding: 'utf8' }))
  console.log(`${rel} 里 ${word} 存在？ ${word in data}`)
}
