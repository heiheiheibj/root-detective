import { describe, expect, it } from 'vitest'
import { normalizeMorphemeKey } from '../src/domain/contentRules'
import { createRootProgress, getMorpheme, getWord, initialProgress, morphemes, words, wordsByRoot } from '../src/domain/data'
import type { PlayerProfile, ReviewProgress } from '../src/domain/types'
import {
  assimilationHint,
  applyCompletedCase,
  applyIncorrectAttempt,
  applyMatchReview,
  calculateCaseReward,
  createMetaphorDiagnosis,
  createSplitDiagnosis,
  getContinuationMode,
  getCurrentStreak,
  getModeStrategy,
  getLevelInfo,
  getMistakeEventId,
  getReviewBoard,
  getReviewQueue,
  getStabilityBand,
  getWorldUnlockStatus,
  isDuplicateSubmit,
  isMetaphorCorrect,
  isSplitCorrect,
  migrationRate,
  pickNextWord,
  shuffledMetaphorOptions,
  shuffle,
  updateProgress,
} from '../src/domain/logic'

describe('三种工作模式', () => {
  it('兼容旧模式并提供不同策略', () => {
    expect(getModeStrategy('case').mode).toBe('compiler')
    expect(getModeStrategy('review').mode).toBe('regression')
    expect(getModeStrategy('debugger').showHints).toBe(true)
    expect(getModeStrategy('regression').showHints).toBe(false)
  })

  it('Debugger 完成后回到原稳定模式', () => {
    expect(getContinuationMode({ mode: 'debugger', originMode: 'regression' })).toBe('regression')
    expect(getContinuationMode({ mode: 'debugger' })).toBe('compiler')
    expect(getContinuationMode({ mode: 'regression' })).toBe('regression')
  })

  it('生成可执行的出牌和淬火诊断', () => {
    const word = getWord('predict')
    const build = createSplitDiagnosis(word, ['dict', 'pre'], getMorpheme)
    expect(build.stage).toBe('build')
    expect(build.summary).toContain('第 1 个')
    expect(build.fix).toContain('第 1 个')
    const options = shuffledMetaphorOptions(word)
    const wrongIndex = options.findIndex((option) => !option.correct)
    const forge = createMetaphorDiagnosis(word, wrongIndex, options)
    expect(forge.stage).toBe('forge')
    // 提示不能直接说出答案：只引用字面画面，不引用现代词义
    expect(forge.fix).toContain(word.literalMeaningCn)
    expect(forge.fix).not.toContain(word.modernMeaningCn)
  })

  it('按运行、阶段和答案生成错误事件 ID', () => {
    expect(getMistakeEventId('run-1', 'build', 'dict|pre')).not.toBe(getMistakeEventId('run-1', 'build', 'pre|dict'))
  })
})
describe('词素顺序判定', () => {
  it('只接受精确的词素顺序', () => {
    const word = getWord('predict')
    expect(isSplitCorrect(word, ['pre', 'dict'])).toBe(true)
    expect(isSplitCorrect(word, ['dict', 'pre'])).toBe(false)
    expect(isSplitCorrect(word, ['pre'])).toBe(false)
    expect(isSplitCorrect(word, ['pre', 'dict', 'ion'])).toBe(false)
  })
})

describe('语义方向三选一', () => {
  it('随机化后正确选项恰好一个且内容不丢', () => {
    const word = getWord('circumspect')
    const shuffled = shuffledMetaphorOptions(word)
    expect(shuffled).toHaveLength(word.metaphorOptions.length)
    expect(shuffled.filter((option) => option.correct)).toHaveLength(1)
    expect(shuffled.map((option) => option.text).sort()).toEqual([...word.metaphorOptions].sort())
  })

  it('能正确判定选择的选项是否正确', () => {
    const word = getWord('circumspect')
    const shuffled = shuffledMetaphorOptions(word)
    const correctIndex = shuffled.findIndex((option) => option.correct)
    expect(isMetaphorCorrect(word, correctIndex, shuffled)).toBe(true)
    const wrongIndex = shuffled.findIndex((option) => !option.correct)
    expect(isMetaphorCorrect(word, wrongIndex, shuffled)).toBe(false)
  })
})

describe('同化提示', () => {
  it('import 的 im- 能给出 in- 的变体提示', () => {
    const hint = assimilationHint(getWord('import'), getMorpheme)
    expect(hint).toContain('im')
    expect(hint).toContain('in')
  })

  it('predict 无同化时返回 null', () => {
    expect(assimilationHint(getWord('predict'), getMorpheme)).toBeNull()
  })
})

describe('难度权重修正', () => {
  it('基础词猜对的稳定度增长高于高难词', () => {
    const basic = updateProgress({ ...initialProgress.find((item) => item.morphemeId === 'dict')!, morphemeId: 'dict' }, getWord('predict'), true)
    const advanced = updateProgress({ ...initialProgress.find((item) => item.morphemeId === 'spec')!, morphemeId: 'spec' }, getWord('circumspection'), true)
    expect(basic.stability).toBeGreaterThan(advanced.stability)
  })

  it('基础词猜错的惩罚重于高难词', () => {
    const start: ReviewProgress = { ...createRootProgress('spec'), stability: 50 }
    const basicMiss = updateProgress({ ...start, morphemeId: 'dict' }, getWord('predict'), false)
    const advancedMiss = updateProgress({ ...start, morphemeId: 'spec' }, getWord('circumspection'), false)
    expect(basicMiss.stability).toBeLessThan(advancedMiss.stability)
  })
})

describe('复习与迁移', () => {
  it('记录已测试单词并计算迁移率', () => {
    const progress = initialProgress.find((item) => item.morphemeId === 'port')!
    const next = updateProgress(progress, getWord('portable'), true)
    expect(next.testedWordIds).toContain('portable')
    expect(migrationRate(next)).toBe(1)
  })

  it('连续答对累计 streak，答错清零', () => {
    let progress = initialProgress.find((item) => item.morphemeId === 'port')!
    progress = updateProgress(progress, getWord('portable'), true)
    progress = updateProgress(progress, getWord('import'), true)
    expect(progress.streak).toBe(2)
    progress = updateProgress(progress, getWord('report'), false)
    expect(progress.streak).toBe(0)
  })
})

describe('配对复习', () => {
  const past = '2020-01-01T00:00:00.000Z'
  const future = '2999-01-01T00:00:00.000Z'
  /** 夹具里只用这四个词根——配对面板只认词根进度。 */
  const rootIds = () => ['spec', 'dict', 'port', 'vid']
  const asReviewing = (morphemeId: string, stability: number, dueAt: string): ReviewProgress => ({
    ...createRootProgress(morphemeId), state: 'reviewing', stability, dueAt,
  })

  it('全新档案还没有可以配对的词', () => {
    expect(getReviewBoard(initialProgress, wordsByRoot)).toHaveLength(0)
  })

  it('到期的词根排在前面，且不会出现两个一样的中文意思', () => {
    const progress = rootIds().map((id) => asReviewing(id, id === 'spec' ? 30 : 40, id === 'spec' ? past : future))
    const board = getReviewBoard(progress, wordsByRoot)
    expect(board[0]).toMatchObject({ rootId: 'spec', due: true })
    const meanings = board.map((entry) => entry.word.modernMeaningCn)
    expect(new Set(meanings).size).toBe(meanings.length)
  })

  it('一组都没到期时，用熟练度最低的词根补足开局', () => {
    // 手工夹具：补足顺序由熟练度决定，而不是由词根表的顺序决定——
    // 拿真实 initialProgress 当夹具会把测试钉死在生成顺序上。
    const progress = rootIds().map((id, index) => asReviewing(id, 20 + index * 10, future))
    const board = getReviewBoard(progress, wordsByRoot)
    expect(board).toHaveLength(3)
    expect(board.every((entry) => !entry.due)).toBe(true)
    expect(board.map((entry) => entry.rootId)).toEqual(['spec', 'dict', 'port'])
  })

  it('结算只调对应词根的熟练度、加经验和活动日', () => {
    const now = new Date('2026-09-10T12:00:00.000Z')
    const profile = createProfileForTest()
    const next = applyMatchReview(profile, [{ rootId: 'port', correct: true }, { rootId: 'spec', correct: false }], now)
    const port = next.progress.find((item) => item.morphemeId === 'port')!
    const spec = next.progress.find((item) => item.morphemeId === 'spec')!
    const dict = next.progress.find((item) => item.morphemeId === 'dict')!
    expect(port.stability).toBe(12)
    expect(port.state).toBe('learning')
    expect(spec.stability).toBe(0)
    expect(dict).toEqual(profile.progress.find((item) => item.morphemeId === 'dict'))
    expect(next.xp).toBe(16)
    expect(next.insightPoints).toBe(20)
    expect(next.activityDays).toEqual(['2026-09-10'])
    // 配对复习不改已测词列表
    expect(port.testedWordIds).toEqual([])
  })
})

describe('题池挑选', () => {
  /** 慢参考实现：直接全表过滤。索引版必须和它给出完全一样的结果。 */
  function slowPickNextWord(rootId: string, testedWordIds: string[]) {
    const family = words.filter((word) => word.parts.some((part) => part.morphemeId === rootId))
    if (family.length === 0) return null
    return family.find((word) => !testedWordIds.includes(word.id)) ?? family[0]
  }

  it('优先返回同词根未测试的新词', () => {
    const next = pickNextWord('port', ['portable'], wordsByRoot)
    expect(next).not.toBeNull()
    expect(next!.id).not.toBe('portable')
    expect(next!.parts.some((part) => part.morphemeId === 'port')).toBe(true)
  })

  it('新词耗尽后回退到同词根任意词，无词的词根返回 null', () => {
    const allTested = words.filter((word) => word.parts.some((part) => part.morphemeId === 'port')).map((word) => word.id)
    const fallback = pickNextWord('port', allTested, wordsByRoot)
    expect(fallback).not.toBeNull()
    expect(fallback!.parts.some((part) => part.morphemeId === 'port')).toBe(true)
    expect(pickNextWord('nonexistent-root', [], wordsByRoot)).toBeNull()
  })

  it('索引版和慢参考实现在各种输入下结果一致', () => {
    // 测优化用差分，而不是断言耗时——耗时断言在 CI 上只会带来假失败。
    for (const rootId of [...morphemes.map((item) => item.id), 'nonexistent-root']) {
      const family = words.filter((word) => word.parts.some((part) => part.morphemeId === rootId)).map((word) => word.id)
      const cases = [[], family.slice(0, 1), family.slice(0, 2), family]
      for (const tested of cases) {
        expect(pickNextWord(rootId, tested, wordsByRoot)?.id ?? null, `${rootId} / ${tested.join(',')}`)
          .toBe(slowPickNextWord(rootId, tested)?.id ?? null)
      }
    }
  })
})

describe('成长派生与排程', () => {
  it('在等级门槛处切换称号并计算进度', () => {
    expect(getLevelInfo(-10)).toMatchObject({ level: 1, title: '刚入门', xp: 0, progressPercent: 0 })
    expect(getLevelInfo(100)).toMatchObject({ level: 2, title: '认识几个词根', currentLevelXp: 100, nextLevelXp: 250, progressPercent: 0 })
    expect(getLevelInfo(249)).toMatchObject({ level: 2, progressPercent: 99 })
    expect(getLevelInfo(1400)).toMatchObject({ level: 7, title: '融会贯通', nextLevelXp: null, progressPercent: 100 })
    expect(getLevelInfo(Number.NaN).xp).toBe(0)
  })

  it('按稳定度边界返回词根状态', () => {
    expect(getStabilityBand(0).key).toBe('building')
    expect(getStabilityBand(24.99).key).toBe('building')
    expect(getStabilityBand(25).key).toBe('reviewing')
    expect(getStabilityBand(50).key).toBe('transferring')
    expect(getStabilityBand(80).key).toBe('mastered')
  })

  it('复习队列包含 learning 项并只收录已到期 reviewing 项', () => {
    const now = new Date('2026-09-10T12:00:00.000Z')
    // 显式写 morphemeId，不靠 initialProgress 的下标——那是生成顺序的隐式依赖。
    const queue = getReviewQueue([
      { ...createRootProgress('spec'), state: 'learning', dueAt: null },
      { ...createRootProgress('dict'), state: 'reviewing', dueAt: '2026-09-09T12:00:00.000Z' },
      { ...createRootProgress('port'), state: 'reviewing', dueAt: '2026-09-11T12:00:00.000Z' },
      { ...createRootProgress('vid'), state: 'mastered', dueAt: '2026-09-01T12:00:00.000Z' },
    ], now)
    expect(queue.map((item) => item.morphemeId)).toEqual(['spec', 'dict'])
  })

  it('连续学习按自然日计算，不受时间部分影响', () => {
    expect(getCurrentStreak(['2026-09-08', '2026-09-09', '2026-09-10'], '2026-09-10')).toBe(3)
    expect(getCurrentStreak(['2026-09-08', '2026-09-10'], '2026-09-10')).toBe(1)
    expect(getCurrentStreak(['2026-09-09'], '2026-09-10')).toBe(0)
  })
})

describe('案件结算', () => {
  const now = new Date('2026-09-10T12:00:00.000Z')

  it('按案件模式和错误记录计算奖励', () => {
    expect(calculateCaseReward({ id: '1', wordId: 'predict', rootId: 'dict', mode: 'compiler', wasNewWord: true, hadMistake: false, startedStability: 0 })).toMatchObject({ xp: 80, insightPoints: 24, firstAttemptXp: 20, migrationXp: 20 })
    expect(calculateCaseReward({ id: '2', wordId: 'predict', rootId: 'dict', mode: 'regression', wasNewWord: false, hadMistake: true, startedStability: 20 })).toMatchObject({ xp: 40, insightPoints: 12, firstAttemptXp: 0, migrationXp: 0 })
  })

  it('答错只降低词根稳定度并提前安排复习', () => {
    const profile = createProfileForTest()
    const next = applyIncorrectAttempt(profile, getWord('predict'), getMorpheme, now)
    const progress = next.progress.find((item) => item.morphemeId === 'dict')!
    expect(next.xp).toBe(profile.xp)
    expect(progress.state).toBe('learning')
    expect(progress.dueAt).toBe('2026-09-10T18:00:00.000Z')
    expect(progress.streak).toBe(0)
  })

  it('完成案件增加 XP、洞察点、词根进度和去重后的活动日', () => {
    const profile = createProfileForTest()
    const result = applyCompletedCase(profile, { id: '1', wordId: 'predict', rootId: 'dict', mode: 'compiler', wasNewWord: true, hadMistake: false, startedStability: 0 }, getWord('predict'), getMorpheme, now)
    expect(result.profile.xp).toBe(80)
    expect(result.profile.insightPoints).toBe(24)
    expect(result.profile.completedWordIds).toEqual(['predict'])
    expect(result.profile.activityDays).toEqual(['2026-09-10'])
    expect(result.reward).toMatchObject({ stabilityBefore: 0, stabilityAfter: 18, stabilityBand: 'building' })
  })

  it('世界解锁反馈随档案条件变化', () => {
    const profile = createProfileForTest()
    const locked = getWorldUnlockStatus({ id: 'message-port', name: '传讯港', description: '', morphemeIds: ['dict', 'port'], unlockRequirement: { level: 3, completedCases: 3, observationStability: 40 } }, profile)
    expect(locked.unlocked).toBe(false)
    expect(locked.missing).toHaveLength(3)
    // 门槛看的是这个世界挂的词根（dict / port），把 spec 练到 40 不算数——
    // 旧实现写死了 spec / vid，导致不建在这两个词根上的世界永远解不开。
    const open = getWorldUnlockStatus({ id: 'message-port', name: '传讯港', description: '', morphemeIds: ['dict', 'port'], unlockRequirement: { level: 3, completedCases: 3, observationStability: 40 } }, { ...profile, xp: 250, completedWordIds: ['circumspect', 'inspection', 'respect'], progress: profile.progress.map((item) => item.morphemeId === 'dict' ? { ...item, stability: 40 } : item) })
    expect(open.unlocked).toBe(true)
    expect(open.missing).toEqual([])

    const stillLocked = getWorldUnlockStatus({ id: 'message-port', name: '传讯港', description: '', morphemeIds: ['dict', 'port'], unlockRequirement: { level: 3, completedCases: 3, observationStability: 40 } }, { ...profile, xp: 250, completedWordIds: ['circumspect', 'inspection', 'respect'], progress: profile.progress.map((item) => item.morphemeId === 'spec' ? { ...item, stability: 40 } : item) })
    expect(stillLocked.unlocked).toBe(false)
  })

  it('词根多的世界用 meanTop 折算，不会被一条拖后腿的记录卡死', () => {
    const world = { id: 'wide', name: '大世界', description: '', morphemeIds: ['spec', 'dict', 'port', 'vid'], unlockRequirement: { level: 1, completedCases: 0, observationStability: 50, stabilityPolicy: 'meanTop' as const } }
    // 前一半（4 个里的前 2 个）平均：80 和 60 → 70，够线。
    const spread = { ...createProfileForTest(), progress: [90, 80, 60, 20].map((stability, index) => ({ ...createRootProgress(['spec', 'dict', 'port', 'vid'][index]), stability })) }
    expect(getWorldUnlockStatus(world, spread).unlocked).toBe(true)
    // max 策略只看最高的一条，同样的数据也够线；但只有 40 的时候 max 就过不去了。
    const low = { ...spread, progress: spread.progress.map((item) => ({ ...item, stability: 40 })) }
    expect(getWorldUnlockStatus({ ...world, unlockRequirement: { ...world.unlockRequirement, stabilityPolicy: 'max' } }, low).unlocked).toBe(false)
  })
})

function createProfileForTest(): PlayerProfile {
  return {
    version: 1,
    xp: 0,
    insightPoints: 0,
    progress: initialProgress.map((item) => ({ ...item })),
    completedWordIds: [],
    activityDays: [],
    onboardingCompleted: false,
    helpSeen: false,
  }
}
describe('幂等提交', () => {
  it('同一事件只计一次', () => {
    const seen = new Set<string>()
    expect(isDuplicateSubmit('evt-1', seen)).toBe(false)
    expect(isDuplicateSubmit('evt-1', seen)).toBe(true)
    expect(isDuplicateSubmit('evt-2', seen)).toBe(false)
  })
})

describe('洗牌工具', () => {
  it('不修改原数组且元素不丢失', () => {
    const original = [1, 2, 3, 4, 5]
    const copy = [...original]
    const result = shuffle(original)
    expect(original).toEqual(copy)
    expect([...result].sort()).toEqual(copy)
  })
})

describe('内容完整性（防泄漏答案）', () => {
  it('干扰项的词素 id 不能落在正确答案里', () => {
    // 归一化只有一处实现（contentRules.normalizeMorphemeKey），运行时和测试不会各用一套。
    for (const word of words) {
      const correctIds = word.parts.map((part) => part.morphemeId)
      for (const distractor of word.distractors) {
        expect(correctIds, `${word.word} 的干扰项 ${distractor.text} 泄漏了答案`)
          .not.toContain(normalizeMorphemeKey(distractor.text))
      }
    }
  })

  it('每个词的 familyWordIds 都指向真实存在的词', () => {
    for (const word of words) {
      for (const familyId of word.familyWordIds) {
        expect(words.some((item) => item.id === familyId), `${word.word} 引用了不存在的家族词 ${familyId}`).toBe(true)
      }
    }
  })

  it('每个词引用的词素都已建模，且位置连续', () => {
    for (const word of words) {
      word.parts.forEach((part, index) => {
        expect(morphemes.some((morpheme) => morpheme.id === part.morphemeId), `${word.word} 引用了未建模词素 ${part.morphemeId}`).toBe(true)
        expect(part.position).toBe(index)
      })
    }
  })
})
