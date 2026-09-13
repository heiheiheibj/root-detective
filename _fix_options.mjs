// 修复 handoff/words-prose.json 的 metaphorOptions[1][2]：必须复用本词以外的「多字真实义项」（A12）。
// 单字义项（如「说」「看」）会被 splitGlosses 丢弃，不算；所以这里只用 >=2 字义项。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))
const libDir = join(here, 'scripts', 'lib')

const legacy = JSON.parse(readFileSync(join(libDir, 'legacy-morphemes.json'), 'utf8'))
const cfg = JSON.parse(readFileSync(join(libDir, 'stage1-content.json'), 'utf8'))
const splits = JSON.parse(readFileSync(join(here, 'scripts', '.work', 'derived', 'words.splits.json'), 'utf8'))
const handoff = JSON.parse(readFileSync(join(libDir, 'handoff', 'words-prose.json'), 'utf8'))

// 多字义项池
const HANZI = /[一-鿿]/g
function countHanzi(s) { return (s.match(HANZI) ?? []).length }
function splitGlosses(m) {
  return m.replace(/（[^）]*）/g, '').split(/[、；;，,]/).map((p) => p.trim()).filter((p) => countHanzi(p) >= 2)
}
const morphemes = [...legacy.morphemes, ...cfg.extraMorphemes]
const allGlosses = new Set()
for (const m of morphemes) for (const g of splitGlosses(m.meaningCn)) allGlosses.add(g)
const glossByMorpheme = new Map(morphemes.map((m) => [m.id, splitGlosses(m.meaningCn)]))

function bigrams(s) { const a = [...s.replace(/[\s，。、；：（）()「」《》…—·,.!?;:'"-]/g, '')]; const set = new Set(); for (let i = 0; i + 1 < a.length; i++) set.add(a[i] + a[i + 1]); return set }
function jaccard(a, b) { const A = bigrams(a), B = bigrams(b); if (A.size === 0 || B.size === 0) return 0; let s = 0; for (const g of A) if (B.has(g)) s++; return s / (A.size + B.size - s) }

const splitByWord = new Map(splits.words.map((w) => [w.word, w.parts.map((p) => p.morphemeId)]))
const pool = [...allGlosses]

let changed = 0
for (const [word, p] of Object.entries(handoff)) {
  if (word.startsWith('_')) continue
  const own = new Set((splitByWord.get(word) || []).flatMap((id) => glossByMorpheme.get(id) || []))
  const foreign = pool.filter((g) => !own.has(g))
  const opt0 = p.metaphorMeaningCn
  // 选两个不同、且与 opt0 相似度 <0.5 的外来义项
  const picks = []
  let seed = 0; for (const ch of word) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
  for (let attempt = 0; attempt < foreign.length && picks.length < 2; attempt++) {
    const g = foreign[(seed + attempt * 7) % foreign.length]
    if (picks.includes(g)) continue
    if (jaccard(opt0, `讲的其实是${g}`) >= 0.5) continue
    if (picks.some((pg) => jaccard(`说的还是${pg}`, `讲的其实是${g}`) >= 0.5)) continue
    picks.push(g)
  }
  if (picks.length < 2) { console.error(`⚠ ${word} 找不到 2 个合格外来义项`); continue }
  const newOpts = [opt0, `讲的其实是${picks[0]}`, `说的还是${picks[1]}`]
  if (JSON.stringify(newOpts) !== JSON.stringify(p.metaphorOptions)) { p.metaphorOptions = newOpts; changed++ }
}
writeFileSync(join(libDir, 'handoff', 'words-prose.json'), `${JSON.stringify(handoff, null, 2)}\n`)
console.log(`已修复 ${changed} 个词的 metaphorOptions[1][2]（嵌入外来多字义项，满足 A12）`)
