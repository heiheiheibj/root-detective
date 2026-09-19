import { getLevelInfo, getMasteredRootCount, getReviewQueue, getStabilityBand, getWorldUnlockStatus, getCurrentStreak, migrationRate } from './logic'
import { worlds } from './data'
import type { PlayerProfile, StabilityBandKey } from './types'

/**
 * 把 PlayerProfile 摊平成统计页要展示的数字。抽成独立的纯函数：
 * 一来统计页和成就页都要用，二来能在 Node 里直接测，不用挂 React。
 */
export interface ProfileStats {
  level: number
  levelTitle: string
  xp: number
  currentLevelXp: number
  nextLevelXp: number | null
  levelProgressPercent: number
  currentStreak: number
  wordsCompleted: number
  rootsTouched: number
  masteredRoots: number
  migrationRatePercent: number
  reviewQueueCount: number
  worldsTotal: number
  worldsUnlocked: number
  insightPoints: number
  bandCounts: Record<StabilityBandKey, number>
}

export function deriveStats(profile: PlayerProfile): ProfileStats {
  const levelInfo = getLevelInfo(profile.xp)
  const bandCounts: Record<StabilityBandKey, number> = { building: 0, reviewing: 0, transferring: 0, mastered: 0 }
  for (const item of profile.progress) bandCounts[getStabilityBand(item.stability).key] += 1
  return {
    level: levelInfo.level,
    levelTitle: levelInfo.title,
    xp: profile.xp,
    currentLevelXp: levelInfo.currentLevelXp,
    nextLevelXp: levelInfo.nextLevelXp,
    levelProgressPercent: levelInfo.progressPercent,
    currentStreak: getCurrentStreak(profile.activityDays),
    wordsCompleted: profile.completedWordIds.length,
    rootsTouched: profile.progress.length,
    masteredRoots: getMasteredRootCount(profile.progress),
    migrationRatePercent: Math.round(migrationRate(profile.progress) * 100),
    reviewQueueCount: getReviewQueue(profile.progress).length,
    worldsTotal: worlds.length,
    worldsUnlocked: worlds.filter((world) => getWorldUnlockStatus(world, profile).unlocked).length,
    insightPoints: profile.insightPoints,
    bandCounts,
  }
}
