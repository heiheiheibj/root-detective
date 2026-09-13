// 修 A14：助记（mnemonicNote）和词源注（sourceNote）里不能逐字包含现代义（modernMeaningCn），
// 那等于把答案原样念一遍 —— 学生还没拆词根就看到答案了。
//
// 自动修法：
//   助记 → 截断到冒号之前，只留词根拆解（"cent(百)+ury：一百年" → "cent(百)+ury"）
//   词源 → 截断到第一个逗号之前（"拉丁 vacare(空着)，vacuus(空的)" → "拉丁 vacare(空着)"）
// 截断后仍不得为空（A1 会报字段空）。只填空值之外的违规项，幂等。
//
// 跑法：node scripts/tools/fix-a14.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, '..', 'lib', 'handoff', 'words-prose-stage3')

let fixedNote = 0
let fixedSource = 0
for (const n of ['1', '2', '3', '4', '5', '6', '7']) {
  const path = join(dir, `batch-${n}.json`)
  const data = JSON.parse(readFileSync(path, 'utf8'))
  let changed = false
  for (const [word, e] of Object.entries(data)) {
    if (word.startsWith('_')) continue
    const m = e.modernMeaningCn
    if (!m) continue
    if (e.mnemonicNote && e.mnemonicNote.includes(m)) {
      const head = e.mnemonicNote.split('：')[0]
      // 截断后至少得剩下点东西，否则退回「词根拆解见 parts」这种不含答案的说法
      e.mnemonicNote = head && head !== e.mnemonicNote ? head : `${m}的词根见卡片拆解`
      fixedNote++
      changed = true
    }
    if (e.sourceNote && e.sourceNote.includes(m)) {
      const head = e.sourceNote.split(/[，,]/)[0]
      e.sourceNote = head && head !== e.sourceNote ? head : e.sourceNote.replace(m, '')
      fixedSource++
      changed = true
    }
  }
  if (changed) writeFileSync(path, `${JSON.stringify(data, null, 1)}\n`, 'utf8')
}

console.log(`A14 已修：助记 ${fixedNote} 处、词源 ${fixedSource} 处`)
