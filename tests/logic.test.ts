import { describe, expect, it } from 'vitest'
import type { CaseRun, Difficulty, PlayerProfile, Word, WordCore, WorldDefinition } from '../src/domain/types'
import { getMorpheme, getWordCore, createRootProgress, wordsByRoot } from '../src/domain/data'
import {
  applyCompletedCase,
  applyIncorrectAttempt,
  applyMatchReview,
  createSplitDiagnosis,
  getCurrentStreak,
  getLevelInfo,
  getMasteredRootCount,
  getReviewBoard,
  getReviewQueue,
  getRootId,
  getStabilityBand,
  getWorldUnlockStatus,
  isMetaphorCorrect,
  isSplitCorrect,
  migrationRate,
  pickNextWord,
  shuffledMetaphorOptions,
} from '../src/domain/logic'

/** 生成截止到今天的连续日期 key，避免测试依赖机器真实时钟。 */
function dayKeysEndingToday(n: number): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    out.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }))
  }
  return out
}

const core = getWordCore('circumspect')
const rootId = getRootId(core, getMorpheme)

function makeWord(difficulty: Difficulty, metaphorOptions = ['字面画面A', '字面画面B', '字面画面C']): Word {
  return {
    ...core,
    difficulty,
    literalMeaningCn: '',
    metaphorMeaningCn: '',
    metaphorOptions,
    exampleEn: '',
    exampleCn: '',
    distractors: [],
    familyWordIds: [],
    sourceNote: '',
    mnemonicNote: '',
  }
}

function profileWith(progress: PlayerProfile['progress']): PlayerProfile {
  return { version: 1, xp: 0, insightPoints: 0, progress, completedWordIds: [], activityDays: [], onboardingCompleted: false, helpSeen: false }
}

describe('getStabilityBand', () => {
  it('按阈值给出稳定度档位', () => {
    expect(getStabilityBand(0).key).toBe('building')
    expect(getStabilityBand(30).key).toBe('reviewing')
    expect(getStabilityBand(60).key).toBe('transferring')
    expect(getStabilityBand(85).key).toBe('mastered')
  })
})

describe('getLevelInfo', () => {
  it('xp 落在对应区间给出等级', () => {
    expect(getLevelInfo(0).level).toBe(1)
    expect(getLevelInfo(300).level).toBe(3)
    expect(getLevelInfo(2000).level).toBe(7)
  })
  it('负 xp 不会变成 NaN', () => {
    expect(getLevelInfo(-50).level).toBe(1)
    expect(Number.isNaN(getLevelInfo(-50).progressPercent)).toBe(false)
  })
})

describe('getCurrentStreak', () => {
  it('连续天数含今天', () => {
    expect(getCurrentStreak(dayKeysEndingToday(7))).toBe(7)
  })
  it('中间断一天则只数到断点前', () => {
    const days = dayKeysEndingToday(7)
    days[2] = '2000-01-01' // 把其中一天改掉，制造断点
    expect(getCurrentStreak(days)).toBeLessThan(7)
  })
})

describe('getMasteredRootCount / migrationRate', () => {
  it('熟词根按 stability>=80 计数', () => {
    const profile = profileWith([
      { ...createRootProgress('a'), stability: 85 },
      { ...createRootProgress('b'), stability: 40 },
    ])
    expect(getMasteredRootCount(profile.progress)).toBe(1)
  })
  it('迁移正确率是正确/总次数', () => {
    expect(migrationRate({ migrationCorrect: 4, migrationAttempts: 5 })).toBeCloseTo(0.8, 5)
    expect(migrationRate({ migrationCorrect: 0, migrationAttempts: 0 })).toBe(0)
  })
})

describe('getRootId', () => {
  it('返回的是真·词根（type === root）', () => {
    expect(getMorpheme(getRootId(core, getMorpheme)).type).toBe('root')
  })
})

describe('getReviewQueue', () => {
  it('只收 learning 与到期 reviewing，排除 mastered/new', () => {
    const past = new Date(Date.now() - 86400000).toISOString()
    const future = new Date(Date.now() + 86400000).toISOString()
    const profile = profileWith([
      { ...createRootProgress('a'), state: 'learning' },
      { ...createRootProgress('b'), state: 'reviewing', dueAt: past },
      { ...createRootProgress('c'), state: 'reviewing', dueAt: future },
      { ...createRootProgress('d'), state: 'mastered', dueAt: past },
    ])
    const ids = getReviewQueue(profile.progress).map((item) => item.morphemeId)
    expect(ids).toContain('a')
    expect(ids).toContain('b')
    expect(ids).not.toContain('c')
    expect(ids).not.toContain('d')
  })
  it('缺门词根排到队列最后', () => {
    const past = new Date(Date.now() - 86400000).toISOString()
    const profile = profileWith([
      { ...createRootProgress('normal'), state: 'reviewing', dueAt: past },
      { ...createRootProgress('demoted'), state: 'reviewing', dueAt: past },
    ])
    const ids = getReviewQueue(profile.progress, undefined, { deprioritizedRootIds: new Set(['demoted']) }).map((item) => item.morphemeId)
    expect(ids[ids.length - 1]).toBe('demoted')
  })
})

describe('pickNextWord', () => {
  it('优先返回同词根没学过的词，都没有则返回首词', () => {
    const word = pickNextWord(rootId, [], wordsByRoot)
    expect(word).not.toBeNull()
    const repeat = pickNextWord(rootId, (wordsByRoot.get(rootId) ?? []).map((w) => w.id), wordsByRoot)
    expect(repeat).not.toBeNull() // 都学过就回到首词
  })
  it('不存在的词根返回 null', () => {
    expect(pickNextWord('no-such-root', [], wordsByRoot)).toBeNull()
  })
})

describe('applyCompletedCase', () => {
  it('学成后熟练度只增不减、记录已学词、加经验', () => {
    const word = makeWord(3)
    const base = profileWith([createRootProgress(rootId)])
    const beforeXp = base.xp
    const { profile, reward } = applyCompletedCase(base, { id: 'r', wordId: word.id, rootId, mode: 'compiler', wasNewWord: true, hadMistake: false, startedStability: 0 }, word, getMorpheme)
    const after = profile.progress.find((item) => item.morphemeId === rootId)!
    expect(after.stability).toBeGreaterThan(0)
    expect(reward.stabilityAfter).toBeGreaterThan(reward.stabilityBefore)
    expect(profile.completedWordIds).toContain(word.id)
    expect(after.testedWordIds).toContain(word.id)
    expect(profile.xp).toBe(beforeXp + reward.xp)
  })
  it('词根档案里没有该根时原样返回，不报错', () => {
    const word = makeWord(3)
    const { profile } = applyCompletedCase(profileWith([]), { id: 'r', wordId: word.id, rootId, mode: 'compiler', wasNewWord: true, hadMistake: false, startedStability: 0 }, word, getMorpheme)
    expect(profile).toBeDefined()
  })
})

describe('applyIncorrectAttempt', () => {
  it('答错后熟练度按难度下调', () => {
    const word = makeWord(1) // 难度 1：衰减系数 0.2
    const base = profileWith([{ ...createRootProgress(rootId), stability: 50 }])
    const next = applyIncorrectAttempt(base, word, getMorpheme)
    expect(next.progress.find((item) => item.morphemeId === rootId)!.stability).toBeCloseTo(10, 5)
  })
})

describe('applyMatchReview', () => {
  it('配对全对时词根熟练度上涨并按数量加经验', () => {
    const base = profileWith([{ ...createRootProgress('a'), stability: 0 }, { ...createRootProgress('b'), stability: 0 }])
    const next = applyMatchReview(base, [{ rootId: 'a', correct: true }, { rootId: 'b', correct: true }])
    expect(next.progress.find((item) => item.morphemeId === 'a')!.stability).toBe(12)
    expect(next.xp).toBe(2 * 8)
    expect(next.insightPoints).toBe(2 * 10)
  })
})

describe('getReviewBoard', () => {
  it('到期词根能凑成配对面板', () => {
    const past = new Date(Date.now() - 86400000).toISOString()
    const base = profileWith([{ ...createRootProgress(rootId), state: 'reviewing', dueAt: past }])
    const board = getReviewBoard(base.progress, wordsByRoot)
    expect(board.length).toBeGreaterThan(0)
    expect(board[0].rootId).toBe(rootId)
  })
})

describe('拆解与猜义判分', () => {
  it('按词素 ID 顺序精确匹配', () => {
    expect(isSplitCorrect(makeWord(3), core.parts.map((p) => p.morphemeId))).toBe(true)
    expect(isSplitCorrect(makeWord(3), ['x', 'y'])).toBe(false)
  })
  it('诊断指出第一个错的位置', () => {
    const diag = createSplitDiagnosis(makeWord(3), ['wrong', ...core.parts.slice(1).map((p) => p.morphemeId)], getMorpheme)
    expect(diag.stage).toBe('build')
    expect(diag.title).toBe('拼错了')
  })
  it('隐喻选项只有一个正确，且能被识别', () => {
    const word = makeWord(3)
    const opts = shuffledMetaphorOptions(word)
    const correctIdx = opts.findIndex((o) => o.correct)
    expect(opts.filter((o) => o.correct).length).toBe(1)
    expect(isMetaphorCorrect(word, correctIdx, opts)).toBe(true)
    expect(isMetaphorCorrect(word, (correctIdx + 1) % opts.length, opts)).toBe(false)
  })
})

describe('getWorldUnlockStatus', () => {
  it('没有解锁条件的世界默认开放', () => {
    const world: WorldDefinition = { id: 'w', name: 't', description: '' }
    expect(getWorldUnlockStatus(world, profileWith([])).unlocked).toBe(true)
  })
  it('不满足条件时给出缺失项', () => {
    const world: WorldDefinition = {
      id: 'w', name: 't', description: '', morphemeIds: ['spec'],
      unlockRequirement: { level: 5, completedCases: 10, observationStability: 80 },
    }
    const status = getWorldUnlockStatus(world, profileWith([]))
    expect(status.unlocked).toBe(false)
    expect(status.missing.length).toBeGreaterThan(0)
  })
})
