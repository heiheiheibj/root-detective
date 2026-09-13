// 一次性修复：把 words-prose.json 里 51 个词的模板化干扰项（“讲的其实是X / 说的还是Y”）
// 换成真正的「错的画面」。写回前按 contentRules 的同一套口径自检：
//   汉字数 <=20、无拉丁、与正确答案 jaccard < 0.5、且必须含一个本词以外的真实义项（A12）。
import { readFileSync, writeFileSync } from 'node:fs'

const ROOT = 'd:/AIGAME/背单词/'
const prosePath = ROOT + 'scripts/lib/handoff/words-prose.json'

const FIX = {
  dictator: ['把话原样记录下来的人', '靠双肩携带货物的人'],
  deport: ['把货物移动到他处', '把名字记录在册'],
  envision: ['对着景色记录画面', '把绳子悬挂在梁上'],
  audience: ['排成一队向前走的人', '一起记录画面的那伙人'],
  audio: ['被记录下来的一段画面', '从机器里制造出的噪音'],
  audible: ['能在纸上看到的记录', '能把东西移动起来的力量'],
  biology: ['研究怎样制造机器', '研究文字记录的方法'],
  biography: ['按种类排列的清单', '把见闻记录成册'],
  biotech: ['把东西来回移动的本事', '绘画与记录的手艺'],
  century: ['把年份记录成册', '分成好几个种类'],
  percent: ['把东西制造出来', '大家共同分一份'],
  centennial: ['把旧物彻底扔掉', '把日子记录成册'],
  credit: ['把经过记录在册', '把事情分成各种种类'],
  credential: ['写满记录的旧本子', '预先订好的规矩'],
  incredible: ['把两样东西绑在一起', '扛着行李携带上路'],
  gene: ['排在旁边的一小块地方', '干活时顺手的那件器具'],
  generate: ['每一份都分得一样多', '坐在教室旁边听课'],
  genetics: ['研究如何跨越边界', '研究怎样制造机器'],
  grade: ['把两样东西分离开来', '摆放在旁边的架子'],
  graduate: ['把东西悬挂在半空', '收拾行李离开宿舍'],
  degrade: ['自己动手做一遍', '跨过界线继续向前'],
  project: ['最后得出的那个结果', '把东西分成复数几份'],
  reject: ['这种性质很稳定', '自然界里的各种东西'],
  eject: ['把东西分成不同种类', '一直向前走到头'],
  dialogue: ['把重物压在下层', '自己一个人自言自语'],
  logic: ['照着记录一项项抄', '把每一样都做到彻底'],
  catalog: ['最终得到的那个结果', '把东西数成复数几份'],
  mobile: ['随时保持干净的状态', '把货物称量一下重量'],
  mobility: ['大家共同完成一件事', '把东西彻底清空'],
  automobile: ['在房子周围转一圈', '能随身携带的小箱子'],
  nature: ['发出很大的声音', '把对方的说法否定掉'],
  nation: ['自己关起门来过日子', '跨越边境搬过去住'],
  innate: ['照着记录抄写一遍', '在房子周围走一圈'],
  depend: ['一个人出生的地方', '预先准备好的那根拐杖'],
  suspend: ['这种性质很难改变', '自然界里常见的东西'],
  pendulum: ['转动时会发出声音的东西', '一个干脆利落的动作'],
  universe: ['自己一个人待着的屋子', '能被别人听到的声音'],
  version: ['从大门口进入', '彼此相信的两个人'],
  inverse: ['干活用的一件器具', '祖传的一门技艺'],
  vocabulary: ['记录词句的册子', '大家共同使用的工具'],
  voice: ['把说的话记录成文字', '一次冲动的行为'],
  vocation: ['手里那件顺手的器具', '一段被彻底抹去的记忆'],
  paragraph: ['大家共同凑出来的一段', '单一来源的一小段话'],
  photograph: ['把周围景色记录下来', '从门口进入的瞬间'],
  graphite: ['带有某种性质的石头', '向下层层挖出的矿'],
  attract: ['两条线笔直地平行摆着', '把要点记录在纸上'],
  contract: ['一整套办事的过程', '一个人出生的那间屋子'],
  retract: ['彼此之间相互相信', '把嗓子里的声音放出来'],
  factory: ['人们日常的行为习惯', '把材料彻底用完'],
  facility: ['预先安排好的一切', '有生命的一大片林子'],
  benefactor: ['把东西随手移动的人', '在周围照看一切的老人'],
}

// ── 与 contentRules.ts 完全一致的义项池口径 ────────────────────────────────
const HANZI = /[一-鿿]/g
const countHanzi = (s) => (s.match(HANZI) ?? []).length
const hasLatin = (s) => /[A-Za-z]/.test(s)
const PUNCT = /[\s，。、；：（）()「」《》…—·,.!?;:'"-]/g
function bigrams(text) {
  const chars = [...text.replace(PUNCT, '')]
  const set = new Set()
  for (let i = 0; i + 1 < chars.length; i += 1) set.add(chars[i] + chars[i + 1])
  return set
}
function jaccard(a, b) {
  const A = bigrams(a); const B = bigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let shared = 0
  for (const g of A) if (B.has(g)) shared += 1
  return shared / (A.size + B.size - shared)
}
function splitGlosses(meaningCn) {
  return meaningCn.replace(/（[^）]*）/g, '').split(/[、；;，,]/).map((p) => p.trim()).filter((p) => countHanzi(p) >= 2)
}

const legacy = JSON.parse(readFileSync(ROOT + 'scripts/lib/legacy-morphemes.json', 'utf8'))
const cfg = JSON.parse(readFileSync(ROOT + 'scripts/lib/stage1-content.json', 'utf8'))
const byId = new Map()
for (const m of legacy.morphemes) byId.set(m.id, m)
for (const m of cfg.extraMorphemes) if (!byId.has(m.id)) byId.set(m.id, m)
const morphemes = [...byId.values()]

const pool = new Set()
for (const m of morphemes) for (const g of splitGlosses(m.meaningCn)) pool.add(g)
const morphemeGlosses = new Map(morphemes.map((m) => [m.id, splitGlosses(m.meaningCn)]))

const splits = JSON.parse(readFileSync(ROOT + 'scripts/.work/derived/words.splits.json', 'utf8'))
const partsById = new Map(splits.words.map((w) => [w.word, w.parts]))

const prose = JSON.parse(readFileSync(prosePath, 'utf8'))
const problems = []
const covered = new Set()

for (const [word, opts] of Object.entries(FIX)) {
  const p = prose[word]
  if (!p) { problems.push(`${word}: prose 里没有这个词`); continue }
  covered.add(word)
  const own = new Set((partsById.get(word) ?? []).flatMap((part) => morphemeGlosses.get(part.morphemeId) ?? []))
  const foreign = [...pool].filter((g) => !own.has(g))
  const answer = p.metaphorMeaningCn
  const all = [answer, ...opts]
  if (opts.length !== 2) problems.push(`${word}: 需要恰好 2 个干扰项`)
  opts.forEach((o, i) => {
    if (countHanzi(o) > 20) problems.push(`${word}[${i + 1}]: ${countHanzi(o)} 汉字 > 20`)
    if (hasLatin(o)) problems.push(`${word}[${i + 1}]: 含拉丁字母`)
    if (countHanzi(o) === 0) problems.push(`${word}[${i + 1}]: 没有汉字`)
    if (!foreign.some((g) => o.includes(g))) problems.push(`${word}[${i + 1}]「${o}」: 不含任何本词以外的真实义项（A12 会拦）`)
    if (jaccard(answer, o) >= 0.5) problems.push(`${word}[${i + 1}]: 与答案 jaccard=${jaccard(answer, o).toFixed(2)} >= 0.5`)
  })
  if (new Set(all).size !== 3) problems.push(`${word}: 三个选项有重复`)
  if (jaccard(opts[0], opts[1]) >= 0.5) problems.push(`${word}: 两个干扰项互相太像`)
  p.metaphorOptions = all
}

const extra = Object.keys(FIX).filter((w) => !covered.has(w))
if (extra.length) problems.push(`FIX 里有 prose 中不存在的词：${extra.join('、')}`)
const untouched = Object.keys(prose).filter((k) => !k.startsWith('_') && !covered.has(k))
if (untouched.length) problems.push(`prose 里有没被 FIX 覆盖的词：${untouched.join('、')}`)

if (problems.length) {
  console.error('自检未通过，未写盘：')
  for (const p of problems) console.error('  ✗ ' + p)
  process.exit(1)
}

writeFileSync(prosePath, `${JSON.stringify(prose, null, 2)}\n`)
console.log(`✓ 已替换 ${covered.size} 个词的 ${covered.size * 2} 个干扰项`)
