import { describe, expect, it } from 'vitest'
import { computeAchievements } from '../src/domain/achievements'
import type { PlayerProfile } from '../src/domain/types'

/** 生成一组「截止到今天」的连续日期 key，避免测试依赖机器真实时钟。 */
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

const activeProfile: PlayerProfile = {
  version: 1,
  xp: 300,
  insightPoints: 120,
  progress: [
    { morphemeId: 'spect', state: 'mastered', stability: 85, dueAt: null, testedWordIds: ['inspect', 'respect'], migrationCorrect: 4, migrationAttempts: 5, streak: 0 },
    { morphemeId: 'dict', state: 'reviewing', stability: 40, dueAt: '2026-09-01T00:00:00.000Z', testedWordIds: ['dictate'], migrationCorrect: 1, migrationAttempts: 2, streak: 0 },
    { morphemeId: 'port', state: 'learning', stability: 10, dueAt: null, testedWordIds: ['port'], migrationCorrect: 0, migrationAttempts: 0, streak: 0 },
  ],
  completedWordIds: ['inspect', 'respect', 'dictate', 'port'],
  mistakeWordIds: ['port'],
  activityDays: dayKeysEndingToday(7),
  onboardingCompleted: true,
  helpSeen: true,
}

function statusOf(profile: PlayerProfile, id: string) {
  return computeAchievements(profile).find((item) => item.def.id === id)!
}

describe('computeAchievements', () => {
  it('已满足条件的成就解锁，没满足的保持锁定', () => {
    expect(statusOf(activeProfile, 'first-word').unlocked).toBe(true) // 已学 4 词
    expect(statusOf(activeProfile, 'root-1').unlocked).toBe(true) // 熟了 1 个词根
    expect(statusOf(activeProfile, 'streak-7').unlocked).toBe(true) // 连续 7 天
    expect(statusOf(activeProfile, 'words-10').unlocked).toBe(false) // 才 4 个词
    expect(statusOf(activeProfile, 'transfer-80').unlocked).toBe(false) // 正确率 71%
    // 注意：world-* 这类成就依赖世界解锁状态，而世界默认就是全解锁的，不能拿它当「未解锁」断言。
  })

  it('解锁进度落在 0..1，未解锁时等于实际比例', () => {
    const words10 = statusOf(activeProfile, 'words-10')
    expect(words10.unlocked).toBe(false)
    expect(words10.progress).toBeCloseTo(0.4, 5) // 4 / 10
  })

  it('零基础档案里与学习数据绑定的成就全部锁定', () => {
    const empty: PlayerProfile = { version: 1, xp: 0, insightPoints: 0, progress: [], completedWordIds: [], mistakeWordIds: [], activityDays: [], onboardingCompleted: false, helpSeen: false }
    for (const id of ['first-word', 'words-10', 'root-1', 'streak-7', 'transfer-80']) {
      expect(statusOf(empty, id).unlocked, id).toBe(false)
    }
  })
})
