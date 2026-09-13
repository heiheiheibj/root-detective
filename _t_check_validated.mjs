import { readFileSync } from 'node:fs'

const validated = JSON.parse(readFileSync('scripts/.work/derived/roots.validated.json', 'utf8')).entries
const rejected = JSON.parse(readFileSync('scripts/.work/derived/roots.rejected.json', 'utf8')).entries
const byId = new Map(validated.map((e) => [e.id, e]))

// 1. 手写的 12 个老词素都在吗？
const legacy = ['circum', 'pre', 're', 'in', 'spec', 'dict', 'port', 'vid', 'ion', 'ive', 'able', 'ity']
console.log('== 手写 12 个老词素 ==')
let missingLegacy = 0
for (const id of legacy) {
  const e = byId.get(id)
  if (e) console.log(`  ✓ ${id} (${e.type}, level ${e.level}) ${e.meaningCn}`)
  else {
    console.log(`  ✗ ${id} 不在 validated`)
    missingLegacy++
  }
}

// 2. canary 四大家族的谱系 ids 在 validated 吗？
const familyRoots = {
  spect: ['spec', 'spect', 'circum', 'in', 're', 'ion', 'ive', 'able', 'ity'],
  dict: ['dict', 'pre', 'in', 'ion', 'ive', 'able', 'ity'],
  port: ['port', 'sup', 'im', 're', 'ex', 'er'],
  vid: ['vid', 'vis', 'in', 're', 'ible', 'ibil', 'ity', 'ion'],
}
console.log('\n== canary 家族 ==')
for (const [fam, ids] of Object.entries(familyRoots)) {
  const missing = ids.filter((id) => !byId.has(id))
  console.log(`  ${fam}: 缺 ${missing.length > 0 ? missing.join('、') : '无'}`)
}

// 3. 按词根列出可用的家族规模（供 20 号挑词）
console.log('\n== 词根按例词规模排序（前 40）==')
const rootCounts = validated.filter((e) => e.type === 'root').map((e) => ({ id: e.id, n: (e.examples || []).length, examples: e.examples?.slice(0, 6) }))
rootCounts.sort((a, b) => b.n - a.n)
for (const r of rootCounts.slice(0, 40)) {
  console.log(`  ${String(r.n).padStart(3)}  ${r.id.padEnd(12)} ${(r.examples || []).join(' ')}`)
}

console.log(`\n覆盖情况：validated ${validated.length} 条，rejected ${rejected.length} 条`)
console.log(`前缀数 ${validated.filter((e) => e.type === 'prefix').length}，后缀数 ${validated.filter((e) => e.type === 'suffix').length}`)