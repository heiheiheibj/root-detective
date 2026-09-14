// 单批释义的契约自检（写 handoff 时用，比跑整条 30 号快得多）。
// 30 号要等全部 1,379 词都写完才会通过，写一批就得先自己查一遍。
//
// 检查与 9.3 契约逐条对应：长度上限、字面义≠隐喻义、选项 3 个且 [0] 同隐喻义、
// 助记/词源里不能逐字出现现代义（A14）。
//
// 跑法：node scripts/tools/check-prose-batch.mjs [批次号或文件名]
//   例：node scripts/tools/check-prose-batch.mjs 8
//       node scripts/tools/check-prose-batch.mjs batch-8
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, '..', 'lib', 'handoff', 'words-prose-stage3')
const cp = (s) => [...String(s || '')].length
const hasHan = (s) => /[\u4e00-\u9fff]/.test(String(s || ''))
const hasLatin = (s) => /[A-Za-z]/.test(String(s || ''))

const arg = process.argv[2]
const files = arg
  ? [`${/^\d+$/.test(arg) ? `batch-${arg}` : arg}.json`]
  : readdirSync(dir).filter((f) => /^batch-\d+\.json$/.test(f)).sort()

let totalWords = 0
let totalBad = 0
for (const file of files) {
  let data
  try {
    data = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  } catch {
    console.error(`${file}：读取失败`)
    continue
  }
  let bad = 0
  let n = 0
  for (const [word, e] of Object.entries(data)) {
    if (word.startsWith('_')) continue
    n++
    const errs = []
    if (!hasHan(e.modernMeaningCn)) errs.push('modernMeaningCn 缺或非中文')
    if (!hasHan(e.literalMeaningCn)) errs.push('literalMeaningCn 缺或非中文')
    else if (cp(e.literalMeaningCn) > 12) errs.push(`literalMeaningCn ${cp(e.literalMeaningCn)} 字 > 12`)
    else if (hasLatin(e.literalMeaningCn)) errs.push('literalMeaningCn 含拉丁')
    if (!hasHan(e.metaphorMeaningCn)) errs.push('metaphorMeaningCn 缺或非中文')
    else if (cp(e.metaphorMeaningCn) > 20) errs.push(`metaphorMeaningCn ${cp(e.metaphorMeaningCn)} 字 > 20`)
    if (e.literalMeaningCn && e.literalMeaningCn === e.metaphorMeaningCn) errs.push('字面义=隐喻义')
    if (!Array.isArray(e.metaphorOptions) || e.metaphorOptions.length !== 3) errs.push('metaphorOptions 不是 3 个')
    else if (e.metaphorOptions[0] !== e.metaphorMeaningCn) errs.push('metaphorOptions[0] 与隐喻义不一致')
    if (!e.mnemonicNote) errs.push('mnemonicNote 空')
    else if (cp(e.mnemonicNote) > 40) errs.push(`mnemonicNote ${cp(e.mnemonicNote)} 字 > 40`)
    if (!e.sourceNote) errs.push('sourceNote 空')
    else if (cp(e.sourceNote) > 60) errs.push(`sourceNote ${cp(e.sourceNote)} 字 > 60`)
    if (e.mnemonicNote && e.modernMeaningCn && e.mnemonicNote.includes(e.modernMeaningCn)) errs.push('助记里逐字含现代义（A14）')
    if (e.sourceNote && e.modernMeaningCn && e.sourceNote.includes(e.modernMeaningCn)) errs.push('词源里逐字含现代义（A14）')
    if (errs.length) {
      bad++
      console.log(`  ✗ ${word}：${errs.join(' | ')}`)
    }
  }
  totalWords += n
  totalBad += bad
  console.log(`${file}：${n} 词，问题 ${bad} 个${bad === 0 ? ' ✓' : ''}`)
}
if (files.length > 1) console.log(`\n合计：${totalWords} 词，问题 ${totalBad} 个`)
