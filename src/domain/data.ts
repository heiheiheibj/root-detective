import type { Morpheme, PlayerProfile, ReviewProgress, SessionStats, Word, WordCore, WorldDefinition } from './types'

// 垂直切片词素：前缀 4（pre / re / circum / in-im）+ 词根 4（spec / dict / port / vid）+ 后缀 4（ion / ive / able / ity）
export const morphemes: Morpheme[] = [
  { id: 'circum', displayText: 'circum-', type: 'prefix', meaningCn: '周围', allomorphs: ['circum'], etymology: '来自拉丁语 circum，意为 around（周围）', level: 2, color: 'blue' },
  { id: 'pre', displayText: 'pre-', type: 'prefix', meaningCn: '前、预先', allomorphs: ['pre'], etymology: '来自拉丁语 prae，在前面', level: 1, color: 'blue' },
  { id: 're', displayText: 're-', type: 'prefix', meaningCn: '再、回', allomorphs: ['re'], etymology: '来自拉丁语 re-，again / back', level: 1, color: 'blue' },
  { id: 'in', displayText: 'in- / im-', type: 'prefix', meaningCn: '不；进入', allomorphs: ['in', 'im', 'il', 'ir'], etymology: '来自拉丁语 in，表示否定或“进入”；im / il / ir 是同化变体', level: 1, color: 'blue' },
  { id: 'spec', displayText: 'spec / spect', type: 'root', meaningCn: '看', allomorphs: ['spec', 'spect', 'spic'], etymology: '来自拉丁语 specere，看、观察', level: 2, color: 'orange' },
  { id: 'dict', displayText: 'dict / dic', type: 'root', meaningCn: '说', allomorphs: ['dict', 'dic'], etymology: '来自拉丁语 dicere，说、宣布', level: 1, color: 'orange' },
  { id: 'port', displayText: 'port', type: 'root', meaningCn: '携带', allomorphs: ['port'], etymology: '来自拉丁语 portare，携带', level: 1, color: 'orange' },
  // vise 来自拉丁语 videre 的分词 visus，出现在 revise / advise / televise 里。
  { id: 'vid', displayText: 'vid / vis', type: 'root', meaningCn: '看', allomorphs: ['vid', 'vis', 'vise'], etymology: '来自拉丁语 videre，看见', level: 1, color: 'orange' },
  { id: 'ion', displayText: '-ion', type: 'suffix', meaningCn: '动作、过程（名词）', allomorphs: ['tion', 'sion', 'ion'], etymology: '高频名词后缀，标记动作或结果', level: 1, color: 'green' },
  { id: 'ive', displayText: '-ive', type: 'suffix', meaningCn: '具有……性质的（形容词）', allomorphs: ['ive'], etymology: '高频形容词后缀，表示倾向或性质', level: 1, color: 'green' },
  // ibil 是再叠 -ity 时的连接形式（visible → visibility），不是拼错。
  { id: 'able', displayText: '-able / -ible', type: 'suffix', meaningCn: '能够……的（形容词）', allomorphs: ['able', 'ible', 'ibil'], etymology: '高频形容词后缀，表示可能性或能力', level: 1, color: 'green' },
  { id: 'ity', displayText: '-ity / -ty', type: 'suffix', meaningCn: '性质、状态（抽象名词）', allomorphs: ['ity', 'ty'], etymology: '高频抽象名词后缀', level: 2, color: 'green' },
]

// 垂直切片单词：16 词，全部只用上述 12 个词素诚实拆解（遵守“不硬拆”规则）
export const words: Word[] = [
  // ---- spec 家族（看）----
  {
    id: 'circumspect', word: 'circumspect', phonetic: '/ˈsɜːrkəmspekt/', partOfSpeech: 'adj.', modernMeaningCn: '谨慎的；周详的', literalMeaningCn: '从四周观察', metaphorMeaningCn: '多方观察，不轻举妄动',
    metaphorOptions: ['四处张望、防备危险，不轻举妄动', '视力开阔、登高望远', '视线受阻、看不清楚'], exampleEn: 'She was circumspect about making promises.', exampleCn: '她对做出承诺一事十分谨慎。', difficulty: 3,
    parts: [{ morphemeId: 'circum', surface: 'circum', position: 0 }, { morphemeId: 'spec', surface: 'spect', position: 1 }],
    distractors: [{ text: 'pre-', type: 'form' }, { text: 'port', type: 'meaning' }, { text: 'dict', type: 'random' }, { text: 'spic', type: 'form' }], familyWordIds: ['inspection', 'respect', 'circumspection'],
    sourceNote: '词源上来自 circum（周围）+ specere（看）；spect 是 spec 的表面变体。', mnemonicNote: '把它想成先环顾四周再行动的人，因此是谨慎的。',
  },
  {
    id: 'inspection', word: 'inspection', phonetic: '/ɪnˈspekʃən/', partOfSpeech: 'n.', modernMeaningCn: '检查；视察', literalMeaningCn: '看进去的过程', metaphorMeaningCn: '把对象放在视线里逐项核验',
    metaphorOptions: ['逐项核验，确认没有遗漏', '把东西带到远处保存', '把一句话说得更响亮'], exampleEn: 'The bridge passed a safety inspection.', exampleCn: '这座桥通过了安全检查。', difficulty: 1,
    parts: [{ morphemeId: 'in', surface: 'in', position: 0 }, { morphemeId: 'spec', surface: 'spect', position: 1 }, { morphemeId: 'ion', surface: 'ion', position: 2 }],
    distractors: [{ text: 'port', type: 'meaning' }, { text: 'pre-', type: 'random' }, { text: '-ive', type: 'form' }], familyWordIds: ['circumspect', 'respect', 'circumspection'],
    sourceNote: 'in（进入）+ spect（看）+ -ion（过程）：看进去的动作就是检查。', mnemonicNote: 'inspection 是一次系统地“看进去”的检查。',
  },
  {
    id: 'respect', word: 'respect', phonetic: '/rɪˈspekt/', partOfSpeech: 'v. / n.', modernMeaningCn: '尊重；敬意', literalMeaningCn: '回头看、反复看', metaphorMeaningCn: '一次次回望某个人的价值',
    metaphorOptions: ['反复回头注视，心怀敬意', '低头不敢看，感到害怕', '提前看穿对方的心思'], exampleEn: 'I respect her for her honesty.', exampleCn: '我因她的诚实而尊重她。', difficulty: 1,
    parts: [{ morphemeId: 're', surface: 're', position: 0 }, { morphemeId: 'spec', surface: 'spect', position: 1 }],
    distractors: [{ text: 'pre-', type: 'form' }, { text: 'dict', type: 'meaning' }, { text: '-ion', type: 'form' }], familyWordIds: ['circumspect', 'inspection', 'circumspection'],
    sourceNote: 're（回、再）+ spect（看）：回头注视，引申为尊重。词源真实：拉丁语 respicere（回望）。', mnemonicNote: '值得你一次次回头看的人，就是值得尊重的人。',
  },
  {
    id: 'circumspection', word: 'circumspection', phonetic: '/ˌsɜːrkəmˈspekʃən/', partOfSpeech: 'n.', modernMeaningCn: '谨慎；周详', literalMeaningCn: '从四周观察的状态', metaphorMeaningCn: '在行动前多方观察与权衡',
    metaphorOptions: ['经过多方观察后的谨慎状态', '把声音传到很远的地方', '把复杂事情拆成许多小块'], exampleEn: 'His circumspection kept the project on track.', exampleCn: '他的谨慎让项目保持在正轨上。', difficulty: 5,
    parts: [{ morphemeId: 'circum', surface: 'circum', position: 0 }, { morphemeId: 'spec', surface: 'spect', position: 1 }, { morphemeId: 'ion', surface: 'ion', position: 2 }],
    distractors: [{ text: 'dict', type: 'random' }, { text: '-able', type: 'form' }, { text: 'port', type: 'meaning' }], familyWordIds: ['circumspect', 'inspection', 'respect'],
    sourceNote: '在 circumspect 后加入 -ion，将形容词状态名词化。', mnemonicNote: '把谨慎这个品质变成一个持续的状态。',
  },

  // ---- dict 家族（说）----
  {
    id: 'predict', word: 'predict', phonetic: '/prɪˈdɪkt/', partOfSpeech: 'v.', modernMeaningCn: '预测；预言', literalMeaningCn: '提前说出', metaphorMeaningCn: '在事情发生前先给出判断',
    metaphorOptions: ['事前说出可能发生的事', '把物品从一个地方带到另一个地方', '向后退一步再观察'], exampleEn: 'No one can predict the future perfectly.', exampleCn: '没有人能完美预测未来。', difficulty: 1,
    parts: [{ morphemeId: 'pre', surface: 'pre', position: 0 }, { morphemeId: 'dict', surface: 'dict', position: 1 }],
    distractors: [{ text: 're-', type: 'form' }, { text: 'port', type: 'form' }, { text: 'spec', type: 'random' }, { text: 'vid', type: 'meaning' }], familyWordIds: ['prediction', 'predictable', 'predictive'],
    sourceNote: 'pre-（前）+ dict（说）：事先说出即预测。', mnemonicNote: '先把话说出来，就是预测。',
  },
  {
    id: 'prediction', word: 'prediction', phonetic: '/prɪˈdɪkʃən/', partOfSpeech: 'n.', modernMeaningCn: '预测；预言（名词）', literalMeaningCn: '提前说出的内容', metaphorMeaningCn: '对未来做出的具体判断',
    metaphorOptions: ['提前说出的那句判断', '提前带走的一件物品', '反复修改后的话'], exampleEn: 'His prediction came true.', exampleCn: '他的预言成真了。', difficulty: 1,
    parts: [{ morphemeId: 'pre', surface: 'pre', position: 0 }, { morphemeId: 'dict', surface: 'dict', position: 1 }, { morphemeId: 'ion', surface: 'ion', position: 2 }],
    distractors: [{ text: '-able', type: 'form' }, { text: 're-', type: 'form' }, { text: 'port', type: 'meaning' }], familyWordIds: ['predict', 'predictable', 'predictive'],
    sourceNote: 'predict 加 -ion 名词化，指“预测”这件事或内容。', mnemonicNote: 'prediction 是 predict 这个动作说出来的结果。',
  },
  {
    id: 'predictable', word: 'predictable', phonetic: '/prɪˈdɪktəbl/', partOfSpeech: 'adj.', modernMeaningCn: '可预测的；墨守成规的', literalMeaningCn: '能被提前说中的', metaphorMeaningCn: '毫无悬念、一眼望到头的',
    metaphorOptions: ['能提前说中结果的', '完全说不出口的', '回头才能看清的'], exampleEn: 'The movie plot was predictable.', exampleCn: '这部电影情节毫无悬念。', difficulty: 3,
    parts: [{ morphemeId: 'pre', surface: 'pre', position: 0 }, { morphemeId: 'dict', surface: 'dict', position: 1 }, { morphemeId: 'able', surface: 'able', position: 2 }],
    distractors: [{ text: '-ive', type: 'form' }, { text: '-ion', type: 'form' }, { text: 'circum-', type: 'random' }], familyWordIds: ['predict', 'prediction', 'predictive'],
    sourceNote: 'pre + dict + -able：能够被提前说出的。', mnemonicNote: '结局能被你说中，说明它 predictable。',
  },
  {
    id: 'predictive', word: 'predictive', phonetic: '/prɪˈdɪktɪv/', partOfSpeech: 'adj.', modernMeaningCn: '预测性的', literalMeaningCn: '具有提前说出性质的', metaphorMeaningCn: '能根据线索推测未来结果',
    metaphorOptions: ['能根据线索推测结果', '能把物品随身携带', '能从周围看清全部细节'], exampleEn: 'The model has strong predictive power.', exampleCn: '这个模型有很强的预测能力。', difficulty: 3,
    parts: [{ morphemeId: 'pre', surface: 'pre', position: 0 }, { morphemeId: 'dict', surface: 'dict', position: 1 }, { morphemeId: 'ive', surface: 'ive', position: 2 }],
    distractors: [{ text: '-able', type: 'form' }, { text: 'spect', type: 'meaning' }, { text: 'circum-', type: 'random' }], familyWordIds: ['predict', 'prediction', 'predictable'],
    sourceNote: 'pre + dict + -ive：形成“具有预测性质”的形容词。', mnemonicNote: 'predictive 描述的是“能预测的”。',
  },

  // ---- port 家族（携带）----
  {
    id: 'portable', word: 'portable', phonetic: '/ˈpɔːrtəbl/', partOfSpeech: 'adj.', modernMeaningCn: '便携的；可携带的', literalMeaningCn: '能够被携带的', metaphorMeaningCn: '可以轻松带在身边使用',
    metaphorOptions: ['可以带着走、换地方使用', '能提前说出答案', '站在周围观察'], exampleEn: 'The device is small and portable.', exampleCn: '这台设备小巧且便于携带。', difficulty: 1,
    parts: [{ morphemeId: 'port', surface: 'port', position: 0 }, { morphemeId: 'able', surface: 'able', position: 1 }],
    distractors: [{ text: 'pre-', type: 'random' }, { text: 'spec', type: 'meaning' }, { text: '-ion', type: 'form' }], familyWordIds: ['import', 'report', 'porter'],
    sourceNote: 'port（携带）+ -able（能够）：能被携带的。', mnemonicNote: 'portable 就是“能被带着走”的。',
  },
  {
    id: 'import', word: 'import', phonetic: '/ˈɪmpɔːrt/', partOfSpeech: 'v. / n.', modernMeaningCn: '进口；输入', literalMeaningCn: '带进来', metaphorMeaningCn: '把货物从国外带进国内',
    metaphorOptions: ['把东西带进来', '把东西带出去', '提前把东西带走'], exampleEn: 'The country imports most of its oil.', exampleCn: '这个国家大部分石油依赖进口。', difficulty: 1,
    parts: [{ morphemeId: 'in', surface: 'im', position: 0, isAssimilated: true }, { morphemeId: 'port', surface: 'port', position: 1 }],
    distractors: [{ text: 're-', type: 'form' }, { text: '-ion', type: 'form' }, { text: 'vid', type: 'meaning' }], familyWordIds: ['portable', 'report', 'porter'],
    sourceNote: 'im- 是 in- 的同化变体（进入）+ port（携带）：带进来即进口。', mnemonicNote: 'im- 是 in- 在 p 前的变体，带进来就是进口。',
  },
  {
    id: 'report', word: 'report', phonetic: '/rɪˈpɔːrt/', partOfSpeech: 'v. / n.', modernMeaningCn: '报告；报道', literalMeaningCn: '带回来（消息）', metaphorMeaningCn: '把消息从一处带回并告知他人',
    metaphorOptions: ['把消息带回来告诉别人', '把货物带出去卖掉', '提前把答案说出口'], exampleEn: 'She reported the accident to the police.', exampleCn: '她向警方报告了事故。', difficulty: 1,
    parts: [{ morphemeId: 're', surface: 're', position: 0 }, { morphemeId: 'port', surface: 'port', position: 1 }],
    distractors: [{ text: 'pre-', type: 'form' }, { text: 'spec', type: 'meaning' }, { text: '-able', type: 'form' }], familyWordIds: ['portable', 'import', 'porter'],
    sourceNote: 're（回）+ port（携带）：词源为拉丁语 reportare（带回），把消息带回来即报告。', mnemonicNote: '把外面的消息带回来，就是 report。',
  },
  // porter 只考 port 词根拆解；-er 后缀未在本切片建模，故 parts 只含 port
  {
    id: 'porter', word: 'porter', phonetic: '/ˈpɔːrtər/', partOfSpeech: 'n.', modernMeaningCn: '搬运工；门房', literalMeaningCn: '携带的人', metaphorMeaningCn: '以搬运为职业的人',
    metaphorOptions: ['替别人搬东西的人', '提前说出结果的人', '在旁边观看的人'], exampleEn: 'The porter carried our luggage upstairs.', exampleCn: '搬运工把我们的行李搬上了楼。', difficulty: 1,
    parts: [{ morphemeId: 'port', surface: 'port', position: 0 }],
    distractors: [{ text: '-ion', type: 'form' }, { text: 'dict', type: 'meaning' }, { text: 're-', type: 'random' }], familyWordIds: ['portable', 'import', 'report'],
    sourceNote: 'port（携带）+ -er（做…的人）；-er 是施动者后缀，将在后续版本建模。', mnemonicNote: 'porter 是靠“port（搬）”吃饭的人。',
  },

  // ---- vid / vis 家族（看）----
  {
    id: 'visible', word: 'visible', phonetic: '/ˈvɪzəbl/', partOfSpeech: 'adj.', modernMeaningCn: '可见的；看得见的', literalMeaningCn: '能被看见的', metaphorMeaningCn: '清楚地呈现在眼前',
    metaphorOptions: ['眼睛能看到的', '耳朵能听到的', '手能摸到的'], exampleEn: 'The stars are visible tonight.', exampleCn: '今晚能看见星星。', difficulty: 1,
    parts: [{ morphemeId: 'vid', surface: 'vis', position: 0 }, { morphemeId: 'able', surface: 'ible', position: 1 }],
    distractors: [{ text: 'port', type: 'meaning' }, { text: 'pre-', type: 'random' }, { text: '-ion', type: 'form' }], familyWordIds: ['vision', 'revise', 'visibility'],
    sourceNote: 'vis（看，vid 的变体）+ -ible（能够）：能被看见的。', mnemonicNote: 'visible 是“能用眼睛看”的。',
  },
  {
    id: 'vision', word: 'vision', phonetic: '/ˈvɪʒən/', partOfSpeech: 'n.', modernMeaningCn: '视力；愿景', literalMeaningCn: '看的能力或所见', metaphorMeaningCn: '眼睛看东西；心里看到的未来图景',
    metaphorOptions: ['眼睛看；心里想见的未来', '耳朵听到的旋律', '反复拿起放下'], exampleEn: 'She has a clear vision for the company.', exampleCn: '她对公司的未来有清晰的愿景。', difficulty: 1,
    parts: [{ morphemeId: 'vid', surface: 'vis', position: 0 }, { morphemeId: 'ion', surface: 'ion', position: 1 }],
    distractors: [{ text: '-able', type: 'form' }, { text: 'dict', type: 'meaning' }, { text: 'circum-', type: 'random' }], familyWordIds: ['visible', 'revise', 'visibility'],
    sourceNote: 'vis（看）+ -ion（名词化）：看这一能力或所见图景。', mnemonicNote: 'vision 是眼睛和心里的“看”。',
  },
  {
    id: 'revise', word: 'revise', phonetic: '/rɪˈvaɪz/', partOfSpeech: 'v.', modernMeaningCn: '修订；修改', literalMeaningCn: '再看看', metaphorMeaningCn: '回头重新审视并改正',
    metaphorOptions: ['回头再看一遍并修改', '提前看一遍', '把东西带出去看'], exampleEn: 'I need to revise my essay.', exampleCn: '我需要修改我的文章。', difficulty: 1,
    parts: [{ morphemeId: 're', surface: 're', position: 0 }, { morphemeId: 'vid', surface: 'vise', position: 1 }],
    distractors: [{ text: 'pre-', type: 'form' }, { text: 'port', type: 'meaning' }, { text: '-ity', type: 'form' }], familyWordIds: ['visible', 'vision', 'visibility'],
    sourceNote: 're（再）+ vise（看，vid 的变体）：再看一遍即修订。', mnemonicNote: 're- 表示“再”，再看一遍就是修订。',
  },
  {
    id: 'visibility', word: 'visibility', phonetic: '/ˌvɪzəˈbɪləti/', partOfSpeech: 'n.', modernMeaningCn: '能见度；关注度', literalMeaningCn: '能被看见的程度', metaphorMeaningCn: '被公众看到的范围或清晰程度',
    metaphorOptions: ['能被看见的程度', '能被听见的响度', '能被搬动的重量'], exampleEn: 'Fog reduced visibility on the highway.', exampleCn: '大雾降低了高速公路的能见度。', difficulty: 5,
    parts: [{ morphemeId: 'vid', surface: 'vis', position: 0 }, { morphemeId: 'able', surface: 'ibil', position: 1, isAssimilated: true }, { morphemeId: 'ity', surface: 'ity', position: 2 }],
    distractors: [{ text: '-ion', type: 'form' }, { text: 'dict', type: 'meaning' }, { text: 'circum-', type: 'random' }], familyWordIds: ['visible', 'vision', 'revise'],
    sourceNote: 'vis（看）+ -ibil（-ible 变体）+ -ity（抽象名词）：可见的程度。', mnemonicNote: 'visibility 量的是“能被看见多少”。',
  },
]

export const rootMorphemes = morphemes.filter((morpheme) => morpheme.type === 'root')

/** 单个词根的空白进度。词根不在档案里时用它兜底，而不是借用别的词根的记录。 */
export function createRootProgress(morphemeId: string): ReviewProgress {
  return {
    morphemeId,
    state: 'new',
    stability: 0,
    dueAt: null,
    testedWordIds: [],
    migrationCorrect: 0,
    migrationAttempts: 0,
    streak: 0,
  }
}

export function createInitialProgress(): ReviewProgress[] {
  return rootMorphemes.map((morpheme) => createRootProgress(morpheme.id))
}

export const initialProgress = createInitialProgress()

export const initialStats: SessionStats = { insightPoints: 0, rootsMastered: 0, wordsSolved: 0, migrationRate: 0, currentStreak: 0 }

export const worlds = [
  { id: 'observatory', name: '看', description: '先学「看」这一组词根：spec、vid。', morphemeIds: ['spec', 'vid'] },
  {
    id: 'message-port',
    name: '说和带',
    description: '再学「说」和「带」这两组词根：dict、port。',
    morphemeIds: ['dict', 'port'],
    unlockRequirement: { level: 3, completedCases: 3, observationStability: 40, stabilityPolicy: 'max' },
  },
] as const satisfies readonly WorldDefinition[]

/** 世界 id 从上面的列表反推；加新世界只需要改那个列表，这里自动跟上。 */
export type WorldId = (typeof worlds)[number]['id']

export function createInitialProfile(): PlayerProfile {
  return {
    version: 1,
    xp: 0,
    insightPoints: 0,
    progress: createInitialProgress(),
    completedWordIds: [],
    activityDays: [],
    onboardingCompleted: false,
    helpSeen: false,
  }
}

// ---------- 索引 ----------
// 词库涨到几千条后不能再靠 Array.find 逐条扫；下面这几个 Map 在模块加载时建一次。

const wordById = new Map(words.map((word) => [word.id, word]))
const morphemeById = new Map(morphemes.map((morpheme) => [morpheme.id, morpheme]))

/** 词根 id → 含这个词根的所有词。挑词、配对面板都走它，避免每次全表扫。 */
export function buildRootIndex(allWords: readonly WordCore[]): Map<string, WordCore[]> {
  const index = new Map<string, WordCore[]>()
  for (const word of allWords) {
    for (const part of word.parts) {
      const family = index.get(part.morphemeId)
      if (family) {
        if (!family.some((item) => item.id === word.id)) family.push(word)
      } else {
        index.set(part.morphemeId, [word])
      }
    }
  }
  return index
}

export const wordsByRoot = buildRootIndex(words)

/** 缺失时回退到第一条只是为了不让界面崩；数据错误应该在校验脚本里被拦住。 */
function warnMissing(kind: string, id: string, fallbackId: string) {
  if (import.meta.env?.DEV) console.warn(`[content] 找不到${kind} ${id}，回退到 ${fallbackId}`)
}

export function getWord(id: string): Word {
  const found = wordById.get(id)
  if (found) return found
  warnMissing('词条', id, words[0].id)
  return words[0]
}

/**
 * 找不到就返回 undefined——干扰项这类「可能没建模」的引用走这里，不要回退到别的词素。
 * 干扰项的文本归一化（`-ive` / `ive` / `pre-` 三种写法）走 contentRules 的 normalizeMorphemeKey，
 * 那是校验器和运行时唯一的实现。
 */
export function findMorpheme(id: string): Morpheme | undefined {
  return morphemeById.get(id)
}

export function getMorpheme(id: string): Morpheme {
  const found = morphemeById.get(id)
  if (found) return found
  warnMissing('词素', id, morphemes[0].id)
  return morphemes[0]
}

export function getFamilyWords(word: Word): Word[] {
  return word.familyWordIds
    .map((id) => wordById.get(id))
    .filter((item): item is Word => Boolean(item))
}
