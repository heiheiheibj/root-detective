// 两次 content:all 重跑一致性验证：对产物做 SHA256，比对 scripts/.work/rerun-1.json。
// 第一次运行写基线；第二次运行比对并报告。
// 跑法：node scripts/tools/verify-rerun.mjs
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const files = ['src/domain/content/words.json', 'src/domain/content/morphemes.json', 'src/domain/content/worlds.json', 'src/domain/data.ts']
const baselinePath = join(here, '..', '.work', 'rerun-baseline.json')

const sums = {}
for (const f of files) {
  sums[f] = createHash('sha256').update(readFileSync(join(root, f))).digest('hex').slice(0, 16)
}
if (!existsSync(baselinePath)) {
  writeFileSync(baselinePath, JSON.stringify(sums, null, 2) + '\n')
  console.log('基线已写入：')
  for (const [f, h] of Object.entries(sums)) console.log(`  ${h}  ${f}`)
  console.log('再次运行本脚本以比对。')
} else {
  const base = JSON.parse(readFileSync(baselinePath, 'utf8'))
  let same = true
  for (const f of files) {
    const ok = base[f] === sums[f]
    if (!ok) same = false
    console.log(`${ok ? '✓' : '✗'} ${f}  ${base[f]} → ${sums[f]}`)
  }
  unlinkSync(baselinePath)
  console.log(same ? '✓ 两次重跑派生产物逐字节一致' : '✗ 重跑不一致！')
  process.exit(same ? 0 : 1)
}
