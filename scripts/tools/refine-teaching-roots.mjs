// S6c 世界划分前置：提纯教学词根。
//
// 「教学词根」现在的判据只有一条 —— 出现在 ≥3 个词里。结果功能词和碎片也混了进来：
//   her(代词) / every / there / any / app(应用程序) / por(abbr.) / sales(形容词)
// 它们出现在 herself、everyday、therefore、anything、apple、report 这些词里，于是被当成词根
// 去挂世界 —— 学生拼 herself 时看到一张「her = 粘住」的卡片就荒谬了。
//
// 判据（两条命中其一即保留）：
//   ① 有 Wiktionary 词素的词条（pos 是 prefix/suffix/root）—— 权威，拉丁希腊词根都在这条
//      （`sist`=stand、`ceed`=go 看着像缩写，其实是词根，只有 Wiktionary 认得出）
//   ② ECDICT 里是**实词**（词性 n/v/a）—— 复合词部件靠这条
//      （day→daytime、book→bookmark、sea→seaside 成立；her/every/there/any 是功能词，剔除）
//
// 跑法：node scripts/tools/refine-teaching-roots.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const derivedDir = join(here, '..', '.work', 'derived')
const rawDir = join(here, '..', '.work', 'raw')
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

function parseCsvLine(line) {
  const out = []; let cur = ''; let inQuote = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1 } else inQuote = false }
      else cur += ch
    } else if (ch === '"') inQuote = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

const FUNCTION_POS = new Set(['pron', 'adv', 'prep', 'conj', 'det', 'num', 'art', 'aux', 'int'])
/** Wiktionary 误收成词条的功能词，按词性拦不住（它们标的是 'affix'），手工排除。 */
const ROOT_BLACKLIST = new Set(['her', 'not'])
const REAL_POS = new Set(['n', 'v', 'vt', 'vi', 'adj', 'a'])
const cleanPos = (p) => p.replace(/\.+$/, '').trim().toLowerCase()
// ECDICT 的 pos 独立字段实测常为空，但 translation 一定以词性开头（"n. 天, 日子" / "pron. 她的"），
// 从它取词性更可靠。
const posOfTranslation = (t) => { const m = String(t || '').match(/^([a-z]+)\.\s/); return m ? m[1].toLowerCase() : '' }

const best = new Map()
for (const line of readFileSync(join(rawDir, 'ecdict.csv'), 'utf8').split('\n').slice(1)) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const w = norm(f[0])
  if (!w || best.has(w)) continue
  best.set(w, {
    raw: String(f[0] || '').trim(),
    pos: String(f[4] || '').trim(),
    translation: String(f[3] || '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim(),
  })
}

const draft = JSON.parse(readFileSync(join(derivedDir, 'morphemes-draft.json'), 'utf8')).morphemes
const lexicon = JSON.parse(readFileSync(join(derivedDir, 'morpheme-lexicon.json'), 'utf8')).lexicon
const lexBySurface = new Map(lexicon.map((m) => [m.surface, m]))
// 权威词素判定来自 lexicon 的 glossSource —— 标着 'affix' 的条目就是 Wiktionary 认下的词根/词缀。
// 不要用 affix-gloss-cache.json：它的 key 是词条原始拼写（带连字符等形式），`dict`/`sist`/`pel`
// 在里面根本查不到，真词根会被当成「无实词证据」误剔。
const affixAuthoritative = (id) => lexBySurface.get(id)?.glossSource === 'affix'
const glossOf = (id) => (lexBySurface.get(id)?.gloss || '').replace(/\s+/g, ' ')

const teaching = draft.filter((m) => m._teaching && m.type === 'root')
const kept = []
const dropped = []
for (const m of teaching) {
  // 少数功能词被 Wiktionary 词缀数据误收成词条（her- / not-），词性却是代词/副词，不是词根。
  // `ten` 不在此列：它的 gloss 是 "to hold"（拉丁 tenere），确实被 ECDICT 的「num. 十」盖住了。
  if (ROOT_BLACKLIST.has(m.id)) { dropped.push({ id: m.id, why: '功能词(黑名单)', words: m._words, gloss: glossOf(m.id) }); continue }
  const e = best.get(m.id)
  const p = e ? posOfTranslation(e.translation) : ''
  const functional = FUNCTION_POS.has(p)
  const realWord = REAL_POS.has(p)
  const affix = affixAuthoritative(m.id)
  const why = affix ? 'wiktionary词根' : realWord ? `实词(${p})` : functional ? `功能词(${p})` : '无实词证据'
  if (affix || realWord) kept.push({ id: m.id, words: m._words, why, gloss: glossOf(m.id), meaning: m.meaningCn })
  else dropped.push({ id: m.id, why, words: m._words, gloss: glossOf(m.id) })
}

console.log(`教学词根 ${teaching.length} → 提纯后 ${kept.length}（剔除 ${dropped.length}）`)
const whyCount = {}
for (const k of kept) whyCount[k.why.startsWith('wiktionary') ? 'Wiktionary 词根词条' : 'ECDICT 实词'] = (whyCount[k.why.startsWith('wiktionary') ? 'Wiktionary 词根词条' : 'ECDICT 实词'] || 0) + 1
for (const [w, n] of Object.entries(whyCount)) console.log(`  保留依据 ${w}：${n}`)
console.log(`\n剔除清单（功能词/碎片，不该挂世界）：`)
for (const d of dropped) console.log(`  ${d.id.padEnd(11)}${String(d.words).padStart(2)}w ${d.why.padEnd(16)} ${d.gloss.slice(0, 34)}`)

const cn = kept.filter((k) => k.meaning)
console.log(`\n提纯后：义项已是中文的 ${cn.length}（复合词部件）｜需译英文 gloss 的 ${kept.length - cn.length}（拉丁/希腊词根）`)

writeFileSync(join(derivedDir, 'teaching-roots.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  kept: kept.sort((a, b) => b.words - a.words),
  dropped,
}, null, 1), 'utf8')
console.log('→ .work/derived/teaching-roots.json')
