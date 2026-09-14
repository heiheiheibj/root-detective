// A28 把 option[0] 里的省略号「…」判为元话语/占位符（不是画面），拦下整条管线。
// 这 5 个词（amongst / characterize / comprise / concerning / regarding）的隐喻义写成
// 「在…之中」这种带空位的模板句，正是 A28 要拦的写法 —— 改成具体措辞。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, '..', 'lib', 'handoff', 'words-prose-stage3')

const FIX = {
  amongst: '在人群当中、置身其间',
  characterize: '描摹特征、以某点为标志',
  comprise: '包含、由若干部分组成',
  concerning: '关于、就某件事而言',
  regarding: '关于、说到某一桩',
}

let total = 0
for (const file of readdirSync(dir).filter((f) => /^batch-\d+\.json$/.test(f))) {
  const path = join(dir, file)
  const data = JSON.parse(readFileSync(path, 'utf8'))
  let dirty = false
  for (const [word, next] of Object.entries(FIX)) {
    const entry = data[word]
    if (!entry) continue
    console.log(`${file} ${word}：「${entry.metaphorMeaningCn}」->「${next}」`)
    entry.metaphorMeaningCn = next
    entry.metaphorOptions[0] = next
    total += 1
    dirty = true
  }
  if (dirty) writeFileSync(path, JSON.stringify(data, null, 1), 'utf8')
}
console.log(`共改 ${total} 处`)
