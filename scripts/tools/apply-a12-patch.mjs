// 把 a12-patch.json 的 metaphorOptions 替换应用到 words-prose-stage2/*.json。
// 每个补丁词条替换对应 batch 文件里的同名词目（只换 metaphorOptions，其余字段保留）。
// 跑法：node scripts/tools/apply-a12-patch.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, '..', 'lib', 'handoff', 'words-prose-stage2')
const patch = { ...JSON.parse(readFileSync(join(here, 'a12-patch.json'), 'utf8')), ...JSON.parse(readFileSync(join(here, 'a12-patch2.json'), 'utf8')) }
const applied = new Set()
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.json')) continue
  const p = join(dir, f)
  const data = JSON.parse(readFileSync(p, 'utf8'))
  let n = 0
  for (const [word, opts] of Object.entries(patch)) {
    if (!data[word]) continue
    if (!Array.isArray(opts) || opts.length !== 2) continue
    const old = data[word].metaphorOptions
    data[word].metaphorOptions = [old[0], opts[0], opts[1]]
    applied.add(word)
    n += 1
  }
  if (n > 0) writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8')
}
const missing = Object.keys(patch).filter((k) => !applied.has(k))
console.log(`已应用补丁 ${applied.size} 词${missing.length ? '；未命中：' + missing.join('、') : ''}`)
