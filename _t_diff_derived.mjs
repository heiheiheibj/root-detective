// 同配置两次全量重跑的产物对比（忽略 generatedAt 时间戳）。含 src/domain/content。
import { existsSync, readFileSync } from 'node:fs'

const pairs = [
  ['words.candidates.json', 'words.candidates.json'],
  ['words.splits.json', 'words.splits.json'],
  ['words.examples.json', 'words.examples.json'],
  ['words.prose.json', 'words.prose.json'],
  ['words.reviewed.json', 'words.reviewed.json'],
  ['drift.json', 'drift.json'],
  ['report.md', 'report.md'],
  ['../src/domain/content/morphemes.json', 'morphemes.json'],
  ['../src/domain/content/words.json', 'words.json'],
  ['../src/domain/content/worlds.json', 'worlds.json'],
  ['../src/domain/data.ts', 'data.ts'],
]
const norm = (t) => t.replace(/"generatedAt": "[^"]+"/g, '"generatedAt": "-"').replace(/> 生成于 [^，]+，/g, '> 生成于 -，')
let bad = 0
for (const [aPath, bPath] of pairs) {
  const a = existsSync(`scripts/.work/derived_run1/${aPath}`) ? readFileSync(`scripts/.work/derived_run1/${aPath}`, 'utf8') : null
  const b = existsSync(`scripts/.work/derived/${bPath}`) ? readFileSync(`scripts/.work/derived/${bPath}`, 'utf8') : null
  if (a === null || b === null) { console.log(`${aPath}：缺失`); bad += 1; continue }
  const same = norm(a) === norm(b)
  if (!same) bad += 1
  console.log(`${aPath}：${same ? '一致' : '不一致'}`)
}
console.log(bad === 0 ? '\n✓ 同配置两次全量重跑，产物逐字节一致（可复现）' : `\n✗ ${bad} 个文件不一致`)
