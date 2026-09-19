import type { PlayerProfile } from './types'
import { deriveStats, type ProfileStats } from './profileStats'

export interface AchievementDef {
  id: string
  title: string
  description: string
  /** 进度 0..1，用来画进度条；达标即 1。 */
  progress: (profile: PlayerProfile, stats: ProfileStats) => number
  unlocked: (profile: PlayerProfile, stats: ProfileStats) => boolean
}

export interface AchievementStatus {
  def: AchievementDef
  unlocked: boolean
  /** 0..1，已解锁恒为 1。 */
  progress: number
}

/**
 * 成就全部由真实学习数据推导，没有「隐藏彩蛋」式的人为开关。
 * 加新成就只往这个数组里加一项，页面和测试都不用改。
 */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-word', title: '初来乍到', description: '完成第一个单词。', progress: (_, s) => Math.min(1, s.wordsCompleted), unlocked: (_, s) => s.wordsCompleted >= 1 },
  { id: 'words-10', title: '小有积蓄', description: '完成 10 个单词。', progress: (_, s) => Math.min(1, s.wordsCompleted / 10), unlocked: (_, s) => s.wordsCompleted >= 10 },
  { id: 'words-100', title: '百词斩', description: '完成 100 个单词。', progress: (_, s) => Math.min(1, s.wordsCompleted / 100), unlocked: (_, s) => s.wordsCompleted >= 100 },
  { id: 'words-500', title: '千词斩', description: '完成 500 个单词。', progress: (_, s) => Math.min(1, s.wordsCompleted / 500), unlocked: (_, s) => s.wordsCompleted >= 500 },
  { id: 'root-1', title: '词根初体验', description: '让一个词根达到「很熟」。', progress: (_, s) => Math.min(1, s.masteredRoots), unlocked: (_, s) => s.masteredRoots >= 1 },
  { id: 'root-10', title: '词根猎人', description: '让 10 个词根达到「很熟」。', progress: (_, s) => Math.min(1, s.masteredRoots / 10), unlocked: (_, s) => s.masteredRoots >= 10 },
  { id: 'root-50', title: '词根大师', description: '让 50 个词根达到「很熟」。', progress: (_, s) => Math.min(1, s.masteredRoots / 50), unlocked: (_, s) => s.masteredRoots >= 50 },
  { id: 'streak-7', title: '七日打卡', description: '连续学习 7 天。', progress: (_, s) => Math.min(1, s.currentStreak / 7), unlocked: (_, s) => s.currentStreak >= 7 },
  { id: 'streak-30', title: '三十日打卡', description: '连续学习 30 天。', progress: (_, s) => Math.min(1, s.currentStreak / 30), unlocked: (_, s) => s.currentStreak >= 30 },
  { id: 'world-1', title: '世界探索者', description: '解锁第一个世界。', progress: (_, s) => (s.worldsTotal > 0 ? Math.min(1, s.worldsUnlocked) : 0), unlocked: (_, s) => s.worldsUnlocked >= 1 },
  { id: 'world-all', title: '世界公民', description: '解锁所有世界。', progress: (_, s) => (s.worldsTotal > 0 ? Math.min(1, s.worldsUnlocked / s.worldsTotal) : 0), unlocked: (_, s) => s.worldsTotal > 0 && s.worldsUnlocked >= s.worldsTotal },
  { id: 'transfer-80', title: '举一反三', description: '迁移题正确率达到 80%。', progress: (_, s) => Math.min(1, s.migrationRatePercent / 80), unlocked: (_, s) => s.migrationRatePercent >= 80 },
  { id: 'insight-1000', title: '洞察力', description: '累计 1000 洞察点。', progress: (p) => Math.min(1, p.insightPoints / 1000), unlocked: (p) => p.insightPoints >= 1000 },
]

export function computeAchievements(profile: PlayerProfile): AchievementStatus[] {
  const stats = deriveStats(profile)
  return ACHIEVEMENTS.map((def) => ({
    def,
    unlocked: def.unlocked(profile, stats),
    progress: Math.max(0, Math.min(1, def.progress(profile, stats))),
  }))
}

export function getUnlockedCount(profile: PlayerProfile) {
  return computeAchievements(profile).filter((item) => item.unlocked).length
}
