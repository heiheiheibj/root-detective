// 临时探查：kaikki 里词素词条（前缀/后缀/词根）的结构，用于 S2 补义项。
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

const POS = new Set(['prefix', 'suffix', 'root', 'affix', 'confix', 'combining form', 'morpheme'])
const shown = []
const countByPos = new Map()
let lines = 0
const rl = createInterface({ input: createReadStream('scripts/.work/raw/kaikki-English.jsonl', 'utf8'), crlfDelay: Infinity })
for await (const line of rl) {
  lines += 1
  if (lines > 400000 || shown.length >= 6) break
  if (!line.includes('"pos"')) continue
  let obj
  try { obj = JSON.parse(line) } catch { continue }
  if (obj.lang_code !== 'en') continue
  if (!POS.has(obj.pos)) continue
  countByPos.set(obj.pos, (countByPos.get(obj.pos) || 0) + 1)
  if (shown.length < 6 && (obj.pos === 'prefix' || obj.pos === 'suffix')) {
    shown.push({
      word: obj.word,
      pos: obj.pos,
      glosses: (obj.senses || []).slice(0, 2).map((s) => (s.glosses || []).join('; ')).filter(Boolean),
      etymology: (obj.etymology_text || '').slice(0, 80),
    })
  }
}
console.log(`扫描 ${lines} 行｜词素类条目计数：`, JSON.stringify(Object.fromEntries(countByPos)))
for (const s of shown) console.log(`\n${s.word} [${s.pos}]\n  glosses: ${JSON.stringify(s.glosses)}\n  ety: ${s.etymology}`)
