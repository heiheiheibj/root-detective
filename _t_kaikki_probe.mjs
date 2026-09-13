// 临时：探查 kaikki-English.jsonl（Wiktionary 机器可读版，3.2GB）能提供什么。
// 关注：etymology 模板里的真实词素拆分（不靠规则猜），以及覆盖多少考试词。
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

const path = 'scripts/.work/raw/kaikki-English.jsonl'
const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })

let lines = 0
let withEtymology = 0
let withTemplates = 0
let withPrefix = 0
let samples = []
const wanted = new Set(['predict', 'circumspect', 'interrupt', 'television', 'philosophy', 'unhappy', 'inspection'])

for await (const line of rl) {
  lines += 1
  if (lines > 300000) break
  if (!line.startsWith('{')) continue
  let obj
  try { obj = JSON.parse(line) } catch { continue }
  const et = obj.etymology_text || ''
  const tpl = obj.etymology_templates || []
  if (et || tpl.length) withEtymology += 1
  if (tpl.length) withTemplates += 1
  if (tpl.some((t) => /prefix|suffix|compound|confix|affix|root/i.test(t.name || ''))) withPrefix += 1
  if (wanted.has(obj.word)) {
    samples.push({
      word: obj.word,
      pos: obj.pos,
      etymology_text: (et || '').slice(0, 260),
      templates: tpl.slice(0, 8).map((t) => ({ name: t.name, args: t.args })),
    })
    if (samples.length >= 6) break
  }
}

console.log(`扫描 ${lines} 行：有词源 ${withEtymology} / 有模板 ${withTemplates} / 含前缀后缀模板 ${withPrefix}`)
for (const s of samples) {
  console.log(`\n=== ${s.word} (${s.pos}) ===`)
  console.log('text:', s.etymology_text)
  console.log('templates:', JSON.stringify(s.templates).slice(0, 700))
}
