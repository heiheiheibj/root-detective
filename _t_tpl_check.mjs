// 临时诊断（第二轮）：ad+cd / ad+dcsay / vusfromad+iaci / mr+ti 这些怪值从哪来。
// 关键：查出值的**原始形态**（是否含嵌套模板、HTML 标记、特殊字符）。
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

const targets = new Set(['access', 'addict', 'adjective', 'admiration', 'aesthetic'])
const found = new Map()
const CAND = ['surf', 'prefix', 'pre', 'suffix', 'suf', 'confix', 'affix', 'af', 'compound/affix', 'compound', 'com']
const rl = createInterface({ input: createReadStream('scripts/.work/raw/kaikki-English.jsonl', 'utf8'), crlfDelay: Infinity })
for await (const line of rl) {
  let hit = null
  for (const t of targets) if (line.includes(`"word": "${t}"`)) { hit = t; break }
  if (!hit) continue
  let obj
  try { obj = JSON.parse(line) } catch { continue }
  if (obj.word !== hit || obj.lang_code !== 'en') continue
  if (!found.has(hit)) found.set(hit, [])
  const arr = found.get(hit)
  if (arr.length >= 3) continue
  arr.push({ pos: obj.pos, tpls: obj.etymology_templates || [], text: (obj.etymology_text || '').slice(0, 110) })
  if ([...found.values()].reduce((n, a) => n + a.length, 0) >= 12) break
}
for (const [word, entries] of found) {
  for (const e of entries) {
    const cand = e.tpls.filter((t) => CAND.includes(t.name))
    if (!cand.length) { console.log(`\n=== ${word} (${e.pos}) [无候选模板]\n  text: ${e.text}`); continue }
    console.log(`\n=== ${word} (${e.pos})`)
    console.log(`  text: ${e.text}`)
    for (const t of cand) console.log(`  [${t.name}] ${JSON.stringify(t.args)}`)
  }
}
console.log('\n未命中：', [...targets].filter((t) => !found.has(t)).join(', '))
