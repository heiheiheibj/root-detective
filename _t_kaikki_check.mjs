// 临时诊断：抽查一批派生词在 kaikki 里的词源模板，看提取管线漏了什么。
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

const targets = new Set(['predict', 'prediction', 'inspection', 'portable', 'interrupt', 'extend', 'conclude', 'carefully', 'unhappy', 'kingdom', 'teacher', 'action', 'television', 'import', 'circumspect'])
const found = new Map()
const rl = createInterface({ input: createReadStream('scripts/.work/raw/kaikki-English.jsonl', 'utf8'), crlfDelay: Infinity })
let lines = 0
for await (const line of rl) {
  lines += 1
  if (found.size === targets.size) break
  let hit = null
  for (const t of targets) {
    if (!found.has(t) && line.includes(`"word": "${t}"`)) { hit = t; break }
  }
  if (!hit) continue
  let obj
  try { obj = JSON.parse(line) } catch { continue }
  if (obj.word !== hit || obj.lang_code !== 'en') continue
  if (found.has(hit) && found.get(hit).pos === obj.pos) continue
  const tpl = (obj.etymology_templates || []).map((x) => `${x.name}(${Object.entries(x.args || {}).filter(([k]) => !/^\d+$/.test(k) || Number(k) <= 6).map(([k, v]) => `${k}=${String(v).slice(0, 14)}`).join('|')})`)
  found.set(hit, { pos: obj.pos, text: (obj.etymology_text || '').slice(0, 150), tpl })
}
console.log(`扫描 ${lines} 行，命中 ${found.size}/${targets.size}\n`)
for (const [word, info] of found) {
  console.log(`=== ${word} (${info.pos})`)
  console.log(`  text: ${info.text}`)
  console.log(`  tpl: ${info.tpl.slice(0, 6).join('\n       ')}`)
}
console.log('\n未命中：', [...targets].filter((t) => !found.has(t)).join(', '))
