// 临时诊断：fix-distractors 跳过某些词的具体原因（用完即删）
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const morphemes = JSON.parse(readFileSync(join(root, 'src', 'domain', 'content', 'morphemes.json'), 'utf8'))
const cfg = JSON.parse(readFileSync(join(root, 'scripts', 'lib', 'stage3-content.json'), 'utf8'))
const byId = new Map(morphemes.map((m) => [m.id, m]))
const splitGlosses = (s) => String(s || '').replace(/（[^）]*）/g, '').split(/[、；;，,]/).map((p) => p.trim()).filter((p) => [...p].filter((c) => c >= '一' && c <= '鿿').length >= 2)
const pool = new Set()
for (const m of morphemes) for (const g of splitGlosses(m.meaningCn)) pool.add(g)
const PUNCT = /[\s，。、；：（）()「」《》…—·,.!?;:'"-]/g
const bigrams = (t) => { const c = [...t.replace(PUNCT, '')]; const s = new Set(); for (let i = 0; i + 1 < c.length; i++) s.add(c[i] + c[i + 1]); return s }
const jaccard = (a, b) => { const l = bigrams(a); const r = bigrams(b); if (!l.size || !r.size) return 0; let s = 0; for (const g of l) if (r.has(g)) s++; return s / (l.size + r.size - s) }

const noCand = []
const finalFail = []
for (const [word, entry] of Object.entries(Object.assign({}, ...['1', '2', '3', '4', '5', '6', '7'].map((n) => JSON.parse(readFileSync(join(root, 'scripts', 'lib', 'handoff', 'words-prose-stage3', `batch-${n}.json`), 'utf8')))))) {
  if (word.startsWith('_')) continue
  const own = new Set()
  for (const p of cfg.splits[word] || []) { const m = byId.get(p.id); if (m) for (const g of splitGlosses(m.meaningCn)) own.add(g) }
  const foreign = [...pool].filter((g) => !own.has(g))
  const answer = entry.metaphorMeaningCn
  const cands = foreign.filter((g) => jaccard(answer, g) < 0.45)
  if (cands.length < 2) { noCand.push(`${word}(cands=${cands.length}/foreign=${foreign.length}/own=${own.size})`); continue }
  // 终检：用与 fix 相同的模板抽样两个
  const g1 = cands[0]
  const g2 = cands[1]
  const t1 = `${g1}的人`
  const t2 = `${g2}的地方`
  if (jaccard(answer, t1) >= 0.5 || jaccard(answer, t2) >= 0.5 || t1 === t2) finalFail.push(`${word}(j1=${jaccard(answer, t1).toFixed(2)} j2=${jaccard(answer, t2).toFixed(2)})`)
}
console.log(`候选不足的词 ${noCand.length} 个：`)
console.log('  ' + noCand.slice(0, 20).join('  '))
console.log(`\n终检不过的词 ${finalFail.length} 个：`)
console.log('  ' + finalFail.slice(0, 20).join('  '))
