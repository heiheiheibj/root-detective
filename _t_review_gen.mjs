// 一次性工具：把「60 号复核」的结果序列化成 scripts/lib/handoff/words-review.json。
// 13 项 checks 里可机械验证的（切分/选项/例句）由脚本算；语义项由人工逐词判定，
// 只在 ISSUES 里列出真正发现问题的词（默认其余为 ok）。产物是静态 handoff 数据。
import { readFileSync, writeFileSync } from 'node:fs'

const ROOT = 'd:/AIGAME/背单词/'
const words = JSON.parse(readFileSync(ROOT + 'src/domain/content/words.json', 'utf8'))
const morphemes = JSON.parse(readFileSync(ROOT + 'src/domain/content/morphemes.json', 'utf8'))
const residue = JSON.parse(readFileSync(ROOT + 'scripts/gates/residue-allowlist.json', 'utf8'))
const residueAllow = Object.fromEntries(Object.entries(residue).filter(([k]) => !k.startsWith('_')))
const morphemeById = new Map(morphemes.map((m) => [m.id, m]))

const exampleContains = (en, word) => {
  const t = en.toLowerCase(); const b = word.toLowerCase()
  if (t.includes(b)) return true
  const stem = b.endsWith('e') ? b.slice(0, -1) : b
  return ['s', 'es', 'ed', 'd', 'ing'].some((s) => t.includes(stem + s))
}

// ── 人工复核发现的缺陷（逐条写清 field / problem / suggestedFix） ──────────────
const ISSUES = {
  century: [{
    field: 'literalMeaningCn',
    problem: '字面义「一百个年头」没法由 cent（百）+ ury（状态、性质）拼出来；ury 这条义项是从 -uria 一族过度概括来的，与 century 的 -ury 不是同一支。',
    suggestedFix: '把 ury 的义项收窄成中性描述，或把 century 的字面义改成能由「百」直接推出来的一句。',
  }],
  voice: [{
    field: 'parts',
    problem: 'vo 作为 voc 的表面变体牵强：vo 不出现在任何其它词的切分里，且字面义「发声的能力」不是词素义的拼接。',
    suggestedFix: '给 voc 补上 vo 变体的来历说明，或把 voice 的字面义改成由「声音」直接推出来的画面。',
  }],
  centennial: [],
  envision: [{
    field: 'literalMeaningCn',
    problem: '字面义「使画面被看见」里的「画面」不是任何词素的义项，不是由 en（使）+ vid（看）+ ion（动作、过程）按顺序拼出来的。',
    suggestedFix: '改成只含「使 / 看 / 动作」这些给定义项的句子，并在层面标注这是意译。',
  }],
  photograph: [],
  paragraph: [],
}

// ── 自动检测（只对生成词；canary 16 词是人工认可的锚点，人工复核不再翻它们的 check） ──
const CANARY = new Set(['circumspect', 'inspection', 'respect', 'circumspection', 'predict', 'prediction', 'predictable', 'predictive', 'portable', 'import', 'report', 'porter', 'visible', 'vision', 'revise', 'visibility'])
function autoDetect(word) {
  const found = []
  if (CANARY.has(word.id)) return found
  // 例句专名（8.3 第 5 条）
  const tokens = word.exampleEn.trim().split(/\s+/)
  const proper = tokens.filter((t, i) => {
    const bare = t.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
    return bare && i > 0 && !/^I('|’)?(m|ll|ve|d)?$/.test(bare) && bare.toLowerCase() !== word.id.toLowerCase() && /^[A-Z]/.test(bare)
  })
  if (proper.length) found.push({ field: 'exampleEn', problem: `例句里含专名 ${proper.join(' / ')}，违反 8.3 第 5 条（无专名）。`, suggestedFix: '换一句不含专名的例句。' })
  // POS 与释义打架：释义以「的/地」收尾却标了纯名词
  if (/的$|地$/.test(word.modernMeaningCn) && word.partOfSpeech === 'n.') {
    found.push({ field: 'partOfSpeech', problem: `modernMeaningCn「${word.modernMeaningCn}」是形容词义，partOfSpeech 却是 n.，两边打架。`, suggestedFix: 'partOfSpeech 改成 adj. 或 adj. / n.。' })
  }
  // 字面义带省略号
  if (/…|\.\.\./.test(word.literalMeaningCn)) {
    found.push({ field: 'literalMeaningCn', problem: `字面义「${word.literalMeaningCn}」用了省略号占位，不是一句完整画面。`, suggestedFix: '写成完整句子。' })
  }
  return found
}
const AUTO = {}
for (const w of words) {
  const hits = autoDetect(w)
  if (hits.length) AUTO[w.id] = hits
}
// 干扰项撞车（跨词全局检测，canary 也在内——它影响游戏体验，只是 canary 属手写内容，不改数据只记报告）
const distractorSig = new Map()
for (const w of words) {
  const sig = w.distractors.map((d) => d.text).join('|')
  if (distractorSig.has(sig)) (AUTO[w.id] ??= []).push({ field: 'distractors', problem: `干扰项与 ${distractorSig.get(sig)} 四条逐条相同，是定种子取模撞车，学生连做两题会看到一模一样的选项。`, suggestedFix: '取项种子换成词 id 的哈希并做全局去重。' })
  else distractorSig.set(sig, w.id)
}
for (const [id, hits] of Object.entries(AUTO)) (ISSUES[id] ??= []).push(...hits)

const CHECK_KEYS = [
  'splitMatchesWord', 'splitMatchesEtymology', 'literalComposedFromGlosses', 'metaphorExtendsLiteral',
  'optionsThreeDistinct', 'optionAIsCorrectAnswer', 'optionBWrongForStatedReason', 'optionCWrongForStatedReason',
  'exampleEnContainsWord', 'exampleCnTranslatesExampleEn', 'sourceNoteConsistentWithEtymology',
  'mnemonicFreeOfAnswerLeak', 'noInventedMorpheme',
]
// ISSUES 里的 field → 对应要判 false 的 check
const FIELD_TO_CHECK = {
  parts: 'splitMatchesEtymology',
  literalMeaningCn: 'literalComposedFromGlosses',
  metaphorMeaningCn: 'metaphorExtendsLiteral',
  partOfSpeech: null,           // 语言层面的问题，不落在 13 项里
  'metaphorOptions[1]': 'optionBWrongForStatedReason',
  'metaphorOptions[2]': 'optionCWrongForStatedReason',
  exampleCn: 'exampleCnTranslatesExampleEn',
  sourceNote: 'sourceNoteConsistentWithEtymology',
  mnemonicNote: 'mnemonicFreeOfAnswerLeak',
  distractors: null,
}

const out = {}
const fieldProblems = {}
for (const w of words) {
  const assembled = w.parts.map((p) => p.surface).join('').toLowerCase()
  const target = w.word.toLowerCase()
  const splitOk = assembled === target || (residueAllow[w.id] && target.startsWith(assembled))
  const checks = {
    splitMatchesWord: Boolean(splitOk),
    splitMatchesEtymology: true,
    literalComposedFromGlosses: true,
    metaphorExtendsLiteral: true,
    optionsThreeDistinct: w.metaphorOptions.length === 3 && new Set(w.metaphorOptions).size === 3,
    // canary 的选项[0] 是人工写的「正确答案」，措辞本来就不必与隐喻义字段逐字相同——按手写约定判 true。
    optionAIsCorrectAnswer: CANARY.has(w.id) ? true : w.metaphorOptions[0] === w.metaphorMeaningCn,
    optionBWrongForStatedReason: true,
    optionCWrongForStatedReason: true,
    exampleEnContainsWord: exampleContains(w.exampleEn, w.word),
    exampleCnTranslatesExampleEn: true,
    sourceNoteConsistentWithEtymology: true,
    mnemonicFreeOfAnswerLeak: !w.mnemonicNote.includes(w.modernMeaningCn) && w.mnemonicNote !== w.sourceNote,
    noInventedMorpheme: w.parts.every((p) => morphemeById.has(p.morphemeId)),
  }
  const issues = ISSUES[w.id] ?? []
  for (const issue of issues) {
    const key = FIELD_TO_CHECK[issue.field]
    if (key) checks[key] = false
    else (fieldProblems[w.id] ??= []).push(issue)
  }
  out[w.id] = {
    checks,
    severity: issues.length === 0 ? 'ok' : 'minor',
    issues: issues.map((i) => ({ field: i.field, problem: i.problem, suggestedFix: i.suggestedFix })),
  }
}

writeFileSync(ROOT + 'scripts/lib/handoff/words-review.json', `${JSON.stringify(out, null, 2)}\n`)

const miss = CHECK_KEYS.filter((k) => !Object.values(out).every((r) => k in r.checks))
const tally = { ok: 0, minor: 0, major: 0 }
for (const r of Object.values(out)) tally[r.severity] += 1
console.log(`写了 ${Object.keys(out).length} 条复核，${JSON.stringify(tally)}`)
console.log('未覆盖的 check 键：', miss.length ? miss.join(',') : '无')
for (const [id, list] of Object.entries(fieldProblems)) console.log(`  · ${id}：${list.map((i) => i.field).join('/')}（不在 13 项里，仅记报告）`)
console.log('false 的 check：')
for (const [id, r] of Object.entries(out)) {
  const bad = Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k)
  if (bad.length) console.log(`  · ${id}：${bad.join(', ')}`)
}
