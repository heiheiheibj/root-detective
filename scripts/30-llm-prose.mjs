// 30 号：生成释义/handoff。本阶段走 handoff 模式（零成本、无 OpenRouter）：
//     静态释义在 scripts/lib/handoff/words-prose.json，这里只校验 9.3 契约并透出。
//
// 输入  scripts/.work/derived/words.splits.json     （67 词，已切分）
//        scripts/lib/handoff/words-prose.json        （51 个非 canary 词的静态释义）
// 输出  scripts/.work/derived/words.prose.json
//
// 9.3 契约：literalMeaningCn<=12字、metaphorMeaningCn<=20字、metaphorOptions 恰3个且[0]=metaphor、
//           mnemonicNote<=40字、sourceNote<=60字、modernMeaningCn 非空且有汉字、字面义≠隐喻义。
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const derivedDir = join(here, '.work', 'derived')
const libDir = join(here, 'lib')

const canary = new Set(['circumspect', 'inspection', 'respect', 'circumspection', 'predict', 'prediction', 'predictable', 'predictive', 'portable', 'import', 'report', 'porter', 'visible', 'vision', 'revise', 'visibility'])
const splits = JSON.parse(readFileSync(join(derivedDir, 'words.splits.json'), 'utf8'))
// handoff 两层：Stage 1 的 words-prose.json + Stage 2 的 words-prose-stage2/*.json（同名以后者为准）
const handoffPath = join(libDir, 'handoff', 'words-prose.json')
const handoff = JSON.parse(readFileSync(handoffPath, 'utf8'))
const stage2Dir = join(libDir, 'handoff', 'words-prose-stage2')
if (existsSync(stage2Dir)) {
  for (const f of readdirSync(stage2Dir)) {
    if (!f.endsWith('.json')) continue
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(join(stage2Dir, f), 'utf8')))) {
      if (!k.startsWith('_')) handoff[k] = v
    }
  }
}

const cpLen = (s) => [...s].length
const hasHan = (s) => /[一-鿿]/.test(s)
const hasLatin = (s) => /[A-Za-z]/.test(s)
function bigrams(s) { const a = [...s]; const set = new Set(); for (let i = 0; i < a.length - 1; i++) set.add(a[i] + a[i + 1]); return set }
function jaccard(a, b) { const A = bigrams(a), B = bigrams(b); if (A.size === 0 && B.size === 0) return 0; let inter = 0; for (const x of A) if (B.has(x)) inter++; return inter / (A.size + B.size - inter) }

let anyFail = false
const out = []
const covered = new Set()
for (const w of splits.words) {
  if (canary.has(w.word)) continue // canary 释义在 overrides 里，跳过
  const p = handoff[w.word]
  if (!p) { console.error(`❌ ${w.word}：handoff 缺释义`); anyFail = true; continue }
  covered.add(w.word)
  const errs = []
  if (!p.modernMeaningCn || !hasHan(p.modernMeaningCn)) errs.push('modernMeaningCn 空或无汉字')
  if (!p.literalMeaningCn || cpLen(p.literalMeaningCn) > 12) errs.push(`literalMeaningCn 超12字(${cpLen(p.literalMeaningCn)})`)
  if (!hasHan(p.literalMeaningCn) || hasLatin(p.literalMeaningCn)) errs.push('literalMeaningCn 需汉字且无拉丁')
  if (!p.metaphorMeaningCn || cpLen(p.metaphorMeaningCn) > 20) errs.push(`metaphorMeaningCn 超20字(${cpLen(p.metaphorMeaningCn)})`)
  if (!hasHan(p.metaphorMeaningCn) || hasLatin(p.metaphorMeaningCn)) errs.push('metaphorMeaningCn 需汉字且无拉丁')
  if (p.metaphorMeaningCn === p.literalMeaningCn) errs.push('字面义=隐喻义（A13）')
  if (!Array.isArray(p.metaphorOptions) || p.metaphorOptions.length !== 3) errs.push('metaphorOptions 必须恰3个')
  else {
    if (p.metaphorOptions[0] !== p.metaphorMeaningCn) errs.push('metaphorOptions[0] 必须等于 metaphorMeaningCn')
    for (let i = 0; i < 3; i++) {
      const o = p.metaphorOptions[i]
      if (cpLen(o) > 20) errs.push(`option[${i}] 超20字`)
      if (hasLatin(o)) errs.push(`option[${i}] 含拉丁`)
      if (hasHan(o) === false) errs.push(`option[${i}] 无汉字`)
    }
    if (new Set(p.metaphorOptions).size !== 3) errs.push('metaphorOptions 有重复')
    if (jaccard(p.metaphorOptions[0], p.metaphorOptions[1]) >= 0.5) errs.push('option[0]与[1]过于相似(A11)')
    if (jaccard(p.metaphorOptions[0], p.metaphorOptions[2]) >= 0.5) errs.push('option[0]与[2]过于相似(A11)')
    // A28：干扰项必须是「错的画面」，不能是「这是哪个词素的意思」这种元话语，也不能带模板省略号。
    for (let i = 0; i < 3; i++) if (/讲的是|说的是|指的是|其实是|讲的还是|说的还是|…/.test(p.metaphorOptions[i])) errs.push(`option[${i}] 是元话语/占位符，不是画面(A28)`)
  }
  if (!p.mnemonicNote || cpLen(p.mnemonicNote) > 40) errs.push(`mnemonicNote 超40字(${cpLen(p.mnemonicNote)})`)
  if (!p.sourceNote || cpLen(p.sourceNote) > 60) errs.push(`sourceNote 超60字(${cpLen(p.sourceNote)})`)
  if (errs.length) { console.error(`❌ ${w.word}：\n     - ${errs.join('\n     - ')}`); anyFail = true; continue }
  out.push({ word: w.word, modernMeaningCn: p.modernMeaningCn, literalMeaningCn: p.literalMeaningCn, metaphorMeaningCn: p.metaphorMeaningCn, metaphorOptions: p.metaphorOptions, mnemonicNote: p.mnemonicNote, sourceNote: p.sourceNote, generated: true })
}

// 反向检查：handoff 里有没有词不在非 canary 集合
const nonCanary = new Set(splits.words.filter((w) => !canary.has(w.word)).map((w) => w.word))
for (const k of Object.keys(handoff)) if (!k.startsWith('_') && !nonCanary.has(k)) console.warn(`⚠ handoff 含多余词「${k}」（应为 canary 或在词表内）`)

if (anyFail) { console.error('\n释义契约未通过，停下修 handoff/words-prose.json。'); process.exit(1) }
mkdirSync(derivedDir, { recursive: true })
writeFileSync(join(derivedDir, 'words.prose.json'), `${JSON.stringify(out, null, 2)}\n`)
console.log(`释义通过 ${out.length} 个非 canary 词（契约全绿）`)
console.log('已写出 scripts/.work/derived/words.prose.json')
console.log('下一步：node scripts/40-assemble.mjs')
