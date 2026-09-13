import type { Morpheme, Word } from './types'

/**
 * 词库内容规则：测试和离线闸门（`scripts/validate-content.mjs`）跑的是同一份实现，
 * 免得「测试说没问题」和「校验器说没问题」其实不是一回事。
 *
 * ⚠️ 这个文件被 Node 直接加载（`node scripts/validate-content.mjs`），而 Node 的剥类型
 * 只认可擦除语法：不能有 enum / namespace / 参数属性，也不能有**带值的无扩展名 import**
 * （实测 `import { x } from './y'` 会 ERR_MODULE_NOT_FOUND）。所以这里只有 `import type`
 * ——它在装载时被整段删掉，不参与路径解析。加规则时请守住这条。
 */

export type FindingLevel = 'error' | 'warning'

export interface Finding {
  level: FindingLevel
  /** 规则编号，和计划书里的 A1–A27 对应，报告里靠它定位。 */
  rule: string
  /** 出问题的词条 / 词素 id；全局性问题用 '—'。 */
  target: string
  message: string
}

export interface ContentRuleOptions {
  /** 允许出现、但没建模的词尾残留：`{ 词 id: 书面理由 }`。没有理由等于没有白名单。 */
  residueAllowlist?: Record<string, string>
  /** 允许出现、但解析不到词素的干扰项：`{ 归一化文本: 书面理由 }`。 */
  unmodeledDistractorAllowlist?: Record<string, string>
  /**
   * 是不是生成出来的词条。手写的 canary 切片（现在这 16 个词）没有 provenance，
   * 依赖生成契约的规则会整体跳过，报告里记一行「跳过」，而不是假装通过了。
   */
  generated?: boolean
  /**
   * 手写词条 id 集合。即便整体 generated=true（有 provenance），这些词仍按手写对待：
   * A12（错项复用真实义项）、超长样式错误降级为 warning。canary 16 词在这里。
   */
  handwrittenIds?: Set<string>
}

/** 产物里应当有多少个词。测试和闸门都读它，避免两边各说各话。 */
export const TARGET_WORD_COUNT = 300
/** 聚合类规则在样本太小时只会报噪声（4 个词根当然铺不满三档难度），到 Stage 2 才启用。 */
export const AGGREGATE_MIN_WORDS = 50
export const MIN_WORDS_PER_ROOT = 3

const PART_OF_SPEECH_BASE = ['n.', 'v.', 'adj.', 'adv.', 'prep.', 'conj.', 'pron.', 'num.', 'art.', 'int.']
const COLOR_BY_TYPE: Record<Morpheme['type'], Morpheme['color']> = { prefix: 'blue', root: 'orange', suffix: 'green' }

const MAX_GLOSS_HANZI = 8
const MAX_LITERAL_HANZI = 12
const MAX_METAPHOR_HANZI = 20
const MAX_MNEMONIC_CHARS = 40
const MAX_SOURCE_NOTE_CHARS = 60
const MAX_OPTION_SIMILARITY = 0.5
const MIN_EXAMPLE_WORDS = 4
const MAX_EXAMPLE_WORDS = 20

const HANZI_PATTERN = /[一-鿿]/g
const LATIN_PATTERN = /[A-Za-z]/
/** 量相似度时要先扔掉标点，否则「，」会把两句话人为拉近。 */
const PUNCTUATION_PATTERN = /[\s，。、；：（）()「」《》…—·,.!?;:'"-]/g

/**
 * A28：元话语和占位符。干扰项必须是一个「错的画面」，不能是「这是哪个词素的意思」这种
 * 解释自己的句子，也不能留着模板里的省略号。这套管线第一版就栽在这上面——102 个干扰项
 * 全是「讲的其实是X / 说的还是Y」，机械闸门（A10/A11/A12/A13）一条都拦不住。
 */
const META_OPTION_PATTERN = /讲的是|说的是|指的是|其实是|讲的还是|说的还是|…/

export function normalizeMorphemeKey(text: string) {
  return text.replace(/^-+/, '').replace(/-+$/, '')
}

export function countHanzi(text: string) {
  return (text.match(HANZI_PATTERN) ?? []).length
}

/** 字的二元组集合，用来量两句话「长得像不像」。 */
export function bigrams(text: string) {
  const chars = [...text.replace(PUNCTUATION_PATTERN, '')]
  const grams = new Set<string>()
  for (let index = 0; index + 1 < chars.length; index += 1) grams.add(chars[index] + chars[index + 1])
  return grams
}

/** Jaccard 相似度；抓的是「干扰项其实是正确答案换了个说法」，字符串相等抓不到这种。 */
export function jaccard(a: string, b: string) {
  const left = bigrams(a)
  const right = bigrams(b)
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const gram of left) if (right.has(gram)) shared += 1
  return shared / (left.size + right.size - shared)
}

/** 词素义项池：把 meaningCn 按顿号切开，长于一个字的才算「认得出的义项」。 */
export function glossPool(morphemes: readonly Morpheme[]) {
  const pool = new Set<string>()
  for (const morpheme of morphemes) {
    for (const gloss of splitGlosses(morpheme.meaningCn)) pool.add(gloss)
  }
  return pool
}

function splitGlosses(meaningCn: string) {
  return meaningCn
    .replace(/（[^）]*）/g, '')
    .split(/[、；;，,]/)
    .map((part) => part.trim())
    .filter((part) => countHanzi(part) >= 2)
}

function hasLatin(text: string) {
  return LATIN_PATTERN.test(text)
}

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * 例句里出现的是不是这个词。允许常见变位：直接包含、去尾 e 后加 s/es/ed/d/ing。
 * 复杂变位（y→ies、双写辅音）交给生成环节的 ECDICT exchange 兜底，这里只做保守判断。
 */
export function exampleContainsWord(exampleEn: string, word: string) {
  const text = exampleEn.toLowerCase()
  const bare = word.toLowerCase()
  if (text.includes(bare)) return true
  const stem = bare.endsWith('e') ? bare.slice(0, -1) : bare
  return ['s', 'es', 'ed', 'd', 'ing'].some((suffix) => text.includes(stem + suffix))
}

/**
 * 全量内容闸门。返回所有问题，不抛异常——闸门要一次报全，而不是修一个跑一次。
 */
export function validateContent(morphemes: readonly Morpheme[], words: readonly Word[], options: ContentRuleOptions = {}): Finding[] {
  const findings: Finding[] = []
  const generated = options.generated === true
  const isHandwritten = (id: string) => options.handwrittenIds?.has(id) ?? false
  // 生成内容有提示词契约兜着，超长就是真失败；手写内容超长只是排版问题，降成警告。
  const levelForWord = (id: string): FindingLevel => (generated && !isHandwritten(id)) ? 'error' : 'warning'
  const say = (level: FindingLevel, rule: string, target: string, message: string) => findings.push({ level, rule, target, message })

  const morphemeById = new Map(morphemes.map((morpheme) => [morpheme.id, morpheme]))
  const wordIds = new Set(words.map((word) => word.id))
  const rootIds = new Set(morphemes.filter((morpheme) => morpheme.type === 'root').map((morpheme) => morpheme.id))
  const pool = glossPool(morphemes)
  // 变体是否真被用到，只有在词根家族铺开之后才有意义。
  const usedSurfaces = new Set<string>()
  const wordsPerRoot = new Map<string, Word[]>()
  for (const word of words) {
    for (const part of word.parts) {
      usedSurfaces.add(`${part.morphemeId}:${part.surface}`)
      const family = wordsPerRoot.get(part.morphemeId)
      if (family) family.push(word)
      else wordsPerRoot.set(part.morphemeId, [word])
    }
  }

  // ---------- 逐词 ----------

  const seenWordIds = new Set<string>()
  for (const word of words) {
    const at = word.id || word.word || '?'

    if (seenWordIds.has(word.id)) say('error', 'A17', at, `词条 id 重复`)
    seenWordIds.add(word.id)
    if (word.id !== word.word) say('error', 'A17', at, `id（${word.id}）必须等于 word（${word.word}）`)

    const required: Array<[string, string]> = [
      ['word', word.word], ['phonetic', word.phonetic], ['partOfSpeech', word.partOfSpeech],
      ['modernMeaningCn', word.modernMeaningCn], ['literalMeaningCn', word.literalMeaningCn],
      ['metaphorMeaningCn', word.metaphorMeaningCn], ['exampleEn', word.exampleEn],
      ['exampleCn', word.exampleCn], ['sourceNote', word.sourceNote], ['mnemonicNote', word.mnemonicNote],
    ]
    for (const [field, value] of required) {
      if (typeof value !== 'string' || value.trim() === '') say('error', 'A1', at, `字段 ${field} 为空`)
    }

    if (!/^\/.+\/$/.test(word.phonetic)) say('error', 'A1', at, `phonetic 必须写成 /.../，现在是 ${word.phonetic}`)

    const posParts = word.partOfSpeech.split('/').map((part) => part.trim()).filter(Boolean)
    if (posParts.length === 0 || posParts.some((part) => !PART_OF_SPEECH_BASE.includes(part))) {
      say('error', 'A1', at, `partOfSpeech 不在闭集内：${word.partOfSpeech}`)
    }

    if (word.difficulty !== 1 && word.difficulty !== 3 && word.difficulty !== 5) {
      // 落在闭集外会让 DIFFICULTY_MULTIPLIER[difficulty] 查到 undefined，熟练度算成 NaN。
      say('error', 'A2', at, `difficulty 只能是 1/3/5，现在是 ${word.difficulty}`)
    }

    if (word.parts.length === 0) say('error', 'A3', at, 'parts 为空')
    word.parts.forEach((part, index) => {
      if (part.position !== index) say('error', 'A3', at, `parts[${index}].position 应为 ${index}，现在是 ${part.position}`)
      if (!morphemeById.has(part.morphemeId)) say('error', 'A4', at, `parts[${index}] 引用了没建模的词素 ${part.morphemeId}`)
    })

    // A5：最强的一条反幻觉闸门。拼出来必须正好是这个单词，只允许末尾有白名单里的残留。
    const assembled = word.parts.map((part) => part.surface).join('').toLowerCase()
    const target = word.word.toLowerCase()
    if (assembled !== target) {
      const reason = options.residueAllowlist?.[word.id]
      if (!reason) {
        say('error', 'A5', at, `parts 拼出来是「${assembled}」，和单词「${target}」对不上（残留要么补齐词素，要么写进 residue-allowlist）`)
      } else if (!target.startsWith(assembled)) {
        say('error', 'A5', at, `残留只能挂在词尾：「${assembled}」不是「${target}」的前缀`)
      }
    }

    // A6：表面形式和该词素的变体表必须对得上。
    word.parts.forEach((part, index) => {
      const morpheme = morphemeById.get(part.morphemeId)
      if (!morpheme) return
      const allowed = new Set([...morpheme.allomorphs, normalizeMorphemeKey(morpheme.displayText)])
      if (!allowed.has(part.surface)) {
        say('error', 'A6', `parts[${index}]`, `${at} 用了表面形式「${part.surface}」表示词素 ${morpheme.id}，但它不在 ${morpheme.id}.allomorphs（${morpheme.allomorphs.join('、')}）里`)
      }
    })

    // A18：没有词根 part 的词，getRootId 会退回 parts[0]（往往是前缀），结算时找不到进度记录，静默给 0 经验。
    if (!word.parts.some((part) => rootIds.has(part.morphemeId))) {
      say('error', 'A18', at, '没有任何 type 为 root 的 part，结算经验会静默变成 0')
    }

    if (!exampleContainsWord(word.exampleEn, word.word)) say('error', 'A7', at, `exampleEn 里没出现「${word.word}」`)
    if (!HANZI_PATTERN.test(word.exampleCn)) say('error', 'A8', at, 'exampleCn 没有中文')
    HANZI_PATTERN.lastIndex = 0
    if (hasLatin(word.exampleCn)) say('error', 'A8', at, `exampleCn 里还有拉丁字母：${word.exampleCn}`)
    const exampleWords = countWords(word.exampleEn)
    if (exampleWords < MIN_EXAMPLE_WORDS || exampleWords > MAX_EXAMPLE_WORDS) {
      say('error', 'A9', at, `exampleEn 有 ${exampleWords} 个词，应在 ${MIN_EXAMPLE_WORDS}–${MAX_EXAMPLE_WORDS} 之间`)
    }

    if (word.metaphorOptions.length !== 3) {
      say('error', 'A10', at, `metaphorOptions 应有 3 个，现在有 ${word.metaphorOptions.length} 个`)
    } else if (new Set(word.metaphorOptions).size !== 3) {
      say('error', 'A10', at, 'metaphorOptions 里有重复项')
    }

    // A11：正确答案和干扰项不能是同一句话换了个说法。
    const answer = word.metaphorOptions[0]
    word.metaphorOptions.slice(1).forEach((option, index) => {
      const similarity = jaccard(answer, option)
      if (similarity >= MAX_OPTION_SIMILARITY) {
        say('error', 'A11', at, `metaphorOptions[${index + 1}] 和正确答案的相似度 ${similarity.toFixed(2)}，超过 ${MAX_OPTION_SIMILARITY}（像是复述）`)
      }
    })

    // A12：错项得是「有具体理由地错」——复用别处的真实义项，而不是随便编一句。
    if (generated && !isHandwritten(word.id)) {
      const ownGlosses = new Set(word.parts.flatMap((part) => {
        const morpheme = morphemeById.get(part.morphemeId)
        return morpheme ? splitGlosses(morpheme.meaningCn) : []
      }))
      const foreign = [...pool].filter((gloss) => !ownGlosses.has(gloss))
      word.metaphorOptions.slice(1).forEach((option, index) => {
        if (!foreign.some((gloss) => option.includes(gloss))) {
          say('error', 'A12', at, `metaphorOptions[${index + 1}] 没有用到任何本词以外的真实义项，错得没有依据`)
        }
      })
    }

    for (const [field, value] of [['literalMeaningCn', word.literalMeaningCn], ['metaphorMeaningCn', word.metaphorMeaningCn]] as Array<[string, string]>) {
      if (hasLatin(value)) say('error', 'A13', at, `${field} 里不能有拉丁字母：${value}`)
    }
    word.metaphorOptions.forEach((option, index) => {
      if (hasLatin(option)) say('error', 'A13', at, `metaphorOptions[${index}] 里不能有拉丁字母：${option}`)
      if (META_OPTION_PATTERN.test(option)) {
        say('error', 'A28', at, `metaphorOptions[${index}] 是元话语或占位符，不是画面：${option}`)
      }
    })
    if (word.metaphorMeaningCn === word.literalMeaningCn) say('error', 'A13', at, 'metaphorMeaningCn 和 literalMeaningCn 一字不差')

    // A14：提示里不能把答案原样念一遍。
    for (const [field, value] of [['mnemonicNote', word.mnemonicNote], ['sourceNote', word.sourceNote]] as Array<[string, string]>) {
      if (word.modernMeaningCn && value.includes(word.modernMeaningCn)) {
        say('error', 'A14', at, `${field} 里逐字包含了释义「${word.modernMeaningCn}」，等于直接给答案`)
      }
    }
    if (word.mnemonicNote === word.sourceNote) say('error', 'A14', at, 'mnemonicNote 和 sourceNote 完全一样')

    if (word.distractors.length < 3 || word.distractors.length > 5) {
      say('error', 'A15', at, `distractors 应有 3–5 个，现在有 ${word.distractors.length} 个`)
    }
    for (const distractor of word.distractors) {
      if (!['form', 'meaning', 'random'].includes(distractor.type)) say('error', 'A15', at, `干扰项类型非法：${distractor.type}`)
      const key = normalizeMorphemeKey(distractor.text)
      const resolves = morphemeById.has(key) || morphemes.some((morpheme) => morpheme.allomorphs.includes(key))
      if (!resolves && !options.unmodeledDistractorAllowlist?.[key]) {
        say('error', 'A15', at, `干扰项「${distractor.text}」既不是词素 id，也不是任何词素的变体`)
      }
    }

    if (word.familyWordIds.length < 2 || word.familyWordIds.length > 8) {
      say('error', 'A16', at, `familyWordIds 应有 2–8 个，现在有 ${word.familyWordIds.length} 个`)
    }
    const ownParts = new Set(word.parts.map((part) => part.morphemeId))
    for (const familyId of word.familyWordIds) {
      if (familyId === word.id) { say('error', 'A16', at, 'familyWordIds 里有它自己'); continue }
      if (!wordIds.has(familyId)) { say('error', 'A16', at, `familyWordIds 里的 ${familyId} 不存在`); continue }
      const related = words.find((candidate) => candidate.id === familyId)
      if (related && !related.parts.some((part) => ownParts.has(part.morphemeId))) {
        say('error', 'A16', at, `familyWordIds 里的 ${familyId} 和本词不共享任何词素`)
      }
    }

    if (countHanzi(word.literalMeaningCn) > MAX_LITERAL_HANZI) say(levelForWord(word.id), 'A13', at, `literalMeaningCn ${countHanzi(word.literalMeaningCn)} 字，超过 ${MAX_LITERAL_HANZI}`)
    if (countHanzi(word.metaphorMeaningCn) > MAX_METAPHOR_HANZI) say(levelForWord(word.id), 'A13', at, `metaphorMeaningCn ${countHanzi(word.metaphorMeaningCn)} 字，超过 ${MAX_METAPHOR_HANZI}`)
    word.metaphorOptions.forEach((option, index) => {
      if (countHanzi(option) > MAX_METAPHOR_HANZI) say(levelForWord(word.id), 'A13', at, `metaphorOptions[${index}] ${countHanzi(option)} 字，超过 ${MAX_METAPHOR_HANZI}`)
    })
    if (word.mnemonicNote.length > MAX_MNEMONIC_CHARS) say(levelForWord(word.id), 'A14', at, `mnemonicNote ${word.mnemonicNote.length} 字，超过 ${MAX_MNEMONIC_CHARS}`)
    if (word.sourceNote.length > MAX_SOURCE_NOTE_CHARS) say(levelForWord(word.id), 'A14', at, `sourceNote ${word.sourceNote.length} 字，超过 ${MAX_SOURCE_NOTE_CHARS}`)
  }

  // ---------- 逐词素 ----------

  const seenMorphemeIds = new Set<string>()
  const seenDisplayTexts = new Set<string>()
  for (const morpheme of morphemes) {
    const at = morpheme.id || '?'
    if (!/^[a-z]+$/.test(morpheme.id)) say('error', 'A20', at, `词素 id 只能是小写字母：${morpheme.id}`)
    if (seenMorphemeIds.has(morpheme.id)) say('error', 'A20', at, '词素 id 重复')
    seenMorphemeIds.add(morpheme.id)
    if (seenDisplayTexts.has(morpheme.displayText)) say('error', 'A20', at, `displayText「${morpheme.displayText}」重复`)
    seenDisplayTexts.add(morpheme.displayText)
    if (COLOR_BY_TYPE[morpheme.type] !== morpheme.color) {
      say('error', 'A20', at, `${morpheme.type} 配 ${morpheme.color} 不对，应该是 ${COLOR_BY_TYPE[morpheme.type]}`)
    }
    if (!Number.isInteger(morpheme.level) || morpheme.level < 1 || morpheme.level > 5) {
      say('error', 'A20', at, `level 应在 1–5：${morpheme.level}`)
    }
    const glossHanzi = countHanzi(morpheme.meaningCn)
    if (glossHanzi < 1 || glossHanzi > MAX_GLOSS_HANZI) {
      say((generated ? 'error' : 'warning'), 'A20', at, `meaningCn 有 ${glossHanzi} 个汉字，应在 1–${MAX_GLOSS_HANZI}`)
    }
    if (morpheme.allomorphs.length === 0) say('error', 'A20', at, 'allomorphs 为空，surface 就无从校验')
  }

  // ---------- 聚合（样本足够大才跑）----------

  if (words.length >= AGGREGATE_MIN_WORDS) {
    for (const morpheme of morphemes) {
      for (const variant of morpheme.allomorphs) {
        if (!usedSurfaces.has(`${morpheme.id}:${variant}`)) {
          say('warning', 'A22', morpheme.id, `变体「${variant}」没有任何词用到，是死变体`)
        }
      }
    }
    for (const rootId of rootIds) {
      const family = wordsPerRoot.get(rootId) ?? []
      if (family.length < MIN_WORDS_PER_ROOT) {
        say('error', 'A23', rootId, `只有 ${family.length} 个词，少于 ${MIN_WORDS_PER_ROOT} 个`)
        continue
      }
      // 难度档位决定熟练度涨多快，一个词根全落在同一档会把奖励曲线压平。
      for (const difficulty of [1, 5]) {
        if (!family.some((word) => word.difficulty === difficulty)) say('error', 'A23', rootId, `没有 difficulty-${difficulty} 的词`)
      }
    }
  }

  return findings
}

/** 世界定义与词根表的交叉检查；调色板之外的部分单独放，因为它收的是 data.ts 的 worlds。 */
export function validateWorlds(morphemes: readonly Morpheme[], worlds: ReadonlyArray<{ id: string; morphemeIds: readonly string[] }>): Finding[] {
  const findings: Finding[] = []
  const modeled = new Set(morphemes.map((morpheme) => morpheme.id))
  const rootIds = morphemes.filter((morpheme) => morpheme.type === 'root').map((morpheme) => morpheme.id)
  const covered = new Set<string>()
  const seenWorldIds = new Set<string>()
  for (const world of worlds) {
    if (seenWorldIds.has(world.id)) findings.push({ level: 'error', rule: 'A24', target: world.id, message: '世界 id 重复' })
    seenWorldIds.add(world.id)
    if (world.morphemeIds.length === 0) findings.push({ level: 'error', rule: 'A24', target: world.id, message: '世界没有挂任何词根' })
    for (const morphemeId of world.morphemeIds) {
      if (!modeled.has(morphemeId)) findings.push({ level: 'error', rule: 'A24', target: world.id, message: `引用了没建模的词素 ${morphemeId}` })
      covered.add(morphemeId)
    }
  }
  for (const rootId of rootIds) {
    if (!covered.has(rootId)) findings.push({ level: 'error', rule: 'A24', target: rootId, message: '这个词根不属于任何世界，地图页上永远看不到它' })
  }
  return findings
}

/** 汇总成人话，给脚本和测试共用。 */
export function summarize(findings: readonly Finding[]) {
  return {
    errors: findings.filter((finding) => finding.level === 'error'),
    warnings: findings.filter((finding) => finding.level === 'warning'),
  }
}
