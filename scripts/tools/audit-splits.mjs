// 拆分质量抽检：随机取样人工复核，看「表面切分」是否讲得通。
//
// 每批加词/每次改拆分器后都该跑一次。
// 跑法：
//   node scripts/tools/audit-splits.mjs                    # 随机 30 个
//   node scripts/tools/audit-splits.mjs --n=50 --seed=7
//   node scripts/tools/audit-splits.mjs --source=compound  # 只看某个来源
//   node scripts/tools/audit-splits.mjs --aligned          # 只看对齐过的（表面≠规范式）
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const derivedDir = join(here, '..', '.work', 'derived')
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=')[1] : fallback
}
const n = Number(arg('n', 30))
const seed = Number(arg('seed', 42))
const sourceFilter = arg('source', null)
const onlyAligned = process.argv.includes('--aligned')

const fused = JSON.parse(readFileSync(join(derivedDir, 'splits-fused.json'), 'utf8'))
let entries = Object.entries(fused.splits)
if (sourceFilter) entries = entries.filter(([, v]) => v.source.includes(sourceFilter))
if (onlyAligned) entries = entries.filter(([, v]) => v.aligned)

// 确定性抽样（固定种子 → 两边看到同一批样本）
let state = seed
const rand = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff }
const pool = [...entries]
const picked = []
for (let i = 0; i < Math.min(n, pool.length); i += 1) {
  picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0])
}

const joinsOk = (word, parts) => parts.map((p) => p.surface).join('') === word
let badJoin = 0
console.log(`样本 ${picked.length} 个（池子 ${entries.length}，seed=${seed}${sourceFilter ? `，来源含 ${sourceFilter}` : ''}${onlyAligned ? '，仅对齐过的' : ''}）\n`)
for (const [word, info] of picked) {
  const ok = joinsOk(word, info.parts)
  if (!ok) badJoin += 1
  const shown = info.parts.map((p) => (p.id === p.surface ? p.id : `${p.id}→${p.surface}`)).join(' + ')
  console.log(`${word.padEnd(16)} = ${shown.padEnd(44)} [${info.source}${info.aligned ? '/对齐' : ''}]${ok ? '' : '  ✗ 拼不回！'}`)
}
console.log(`\n拼接校验：${picked.length - badJoin}/${picked.length} 通过`)
