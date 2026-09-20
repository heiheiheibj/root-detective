import { describe, expect, it } from 'vitest'
import { deriveStats } from '../src/domain/profileStats'
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

const emptyProfile: PlayerProfile = { version: 1, xp: 0, insightPoints: 0, progress: [], completedWordIds: [], mistakeWordIds: [], activityDays: [], onboardingCompleted: false, helpSeen: false }

describe('deriveStats', () => {
  it('把档案摊平成统计页要展示的数字', () => {
    const stats = deriveStats(activeProfile)
    expect(stats.level).toBe(3) // xp 300 落在 250~450 这一档
    expect(stats.currentStreak).toBe(7) // 连续 7 天、今天在内
    expect(stats.wordsCompleted).toBe(4)
    expect(stats.rootsTouched).toBe(3)
    expect(stats.masteredRoots).toBe(1) // 只有 spect 到了 85
    expect(stats.migrationRatePercent).toBe(71) // (4+1+0)/(5+2+0) ≈ 0.714
    expect(stats.reviewQueueCount).toBe(2) // spect 已 mastered 不进队列，dict/port 进
    expect(stats.bandCounts).toEqual({ building: 1, reviewing: 1, transferring: 0, mastered: 1 })
  })

  it('空档案不会算出 NaN 或负数', () => {
    const stats = deriveStats(emptyProfile)
    expect(stats.level).toBe(1)
    expect(stats.currentStreak).toBe(0)
    expect(stats.masteredRoots).toBe(0)
    expect(stats.reviewQueueCount).toBe(0)
    // 世界默认全解锁（无进入门槛），这里只校验不是 NaN/越界。
    expect(stats.worldsUnlocked).toBeGreaterThanOrEqual(0)
    expect(stats.worldsUnlocked).toBeLessThanOrEqual(stats.worldsTotal)
    expect(stats.bandCounts).toEqual({ building: 0, reviewing: 0, transferring: 0, mastered: 0 })
  })
})
