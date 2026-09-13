import { readFileSync } from 'node:fs'

const candidates = JSON.parse(readFileSync('scripts/.work/derived/roots.candidates.json', 'utf8'))
const rejected = JSON.parse(readFileSync('scripts/.work/derived/roots.rejected.json', 'utf8')).entries
const validated = JSON.parse(readFileSync('scripts/.work/derived/roots.validated.json', 'utf8')).entries

const legacy = ['circum', 'pre', 're', 'in', 'spec', 'dict', 'port', 'vid', 'ion', 'ive', 'able', 'ity']
const candById = new Map(candidates.entries.map((e) => [e.id, e]))
const rejById = new Map(rejected.map((e) => [e.id, e]))
const valById = new Map(validated.map((e) => [e.id, e]))

console.log('== 老 12 词素在三个阶段的去向 ==')
for (const id of legacy) {
  const cand = candById.get(id)
  const rej = rejById.get(id)
  const val = valById.get(id)
  const state = val ? 'VALIDATED' : rej ? `REJECTED: ${rej.reason}` : 'NOT A CANDIDATE'
  const al = cand ? `allomorphs=${JSON.stringify(cand.allomorphs)}` : ''
  const type = cand ? `type=${cand.type} keep=${cand.keep}` : ''
  console.log(`  ${id.padEnd(8)} ${state}  ${type} ${al}`)
}

console.log('\n== 也查一下 canary 家族会用到的其他词素 ==')
const others = ['sup', 'im', 'ex', 'er', 'vis', 'ible', 'ibil', 'spect', 'visib']
for (const id of others) {
  const cand = candById.get(id)
  const rej = rejById.get(id)
  const val = valById.get(id)
  const state = val ? 'VALIDATED' : rej ? `REJECTED: ${rej.reason}` : cand ? 'in candidates only' : 'NOT A CANDIDATE'
  const al = cand ? `allomorphs=${JSON.stringify(cand.allomorphs)}` : ''
  const type = cand ? `type=${cand.type} keep=${cand.keep} display="${cand.displayText}"` : ''
  console.log(`  ${id.padEnd(8)} ${state}  ${type} ${al}`)
}

// 看看有没有 displayText 与 legacy 冲突的条目（撞 displayText 的 rejected）
console.log('\n== displayText 撞老词素的 rejected 条目 ==')
const legacyDisplay = new Set(['circum-', 'pre-', 're-', 'in- / im-', 'spec / spect', 'dict', 'port', 'vid', '-ion', '-ive', '-able / -ible', '-ity / -ty'])
for (const e of rejected) {
  if ((e.displayText || '') && legacyDisplay.has(e.displayText)) {
    console.log(`  ${e.id}  display="${e.displayText}"  reason=${e.reason}`)
  }
}