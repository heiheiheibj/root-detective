import { createInitialProfile, morphemes, words } from './data'
import type { PlayerProfile, ReviewProgress, ReviewState } from './types'

export const PROFILE_STORAGE_KEY = 'rootdetective.profile'
export const PROFILE_VERSION = 1

const rootIds = new Set(morphemes.filter((morpheme) => morpheme.type === 'root').map((morpheme) => morpheme.id))
const wordIds = new Set(words.map((word) => word.id))
const reviewStates = new Set<ReviewState>(['new', 'learning', 'reviewing', 'mastered'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.toISOString() === value
}

function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return date.toISOString().slice(0, 10) === value
}

function normalizeProgress(candidate: unknown, fallback: ReviewProgress[]): ReviewProgress[] {
  const source = Array.isArray(candidate) ? candidate : []
  // 先建 Map 再查：词根涨到几百条后，每条记录线性扫一遍输入会变成 O(n²)。
  const byMorphemeId = new Map<string, Record<string, unknown>>()
  for (const entry of source) {
    if (isRecord(entry) && typeof entry.morphemeId === 'string' && !byMorphemeId.has(entry.morphemeId)) {
      byMorphemeId.set(entry.morphemeId, entry)
    }
  }
  return fallback.map((initial) => {
    const item = byMorphemeId.get(initial.morphemeId)
    if (!item || !rootIds.has(initial.morphemeId)) return { ...initial }
    const dueAt = item.dueAt === null
      ? null
      : isIsoDateTime(item.dueAt)
        ? item.dueAt
        : null
    return {
      ...initial,
      state: typeof item.state === 'string' && reviewStates.has(item.state as ReviewState) ? item.state as ReviewState : initial.state,
      stability: clampNumber(item.stability, initial.stability, 0, 100),
      dueAt,
      testedWordIds: Array.isArray(item.testedWordIds) ? [...new Set(item.testedWordIds.filter((id): id is string => typeof id === 'string' && wordIds.has(id)))] : [],
      migrationCorrect: Math.max(0, Math.floor(clampNumber(item.migrationCorrect, 0, 0, Number.MAX_SAFE_INTEGER))),
      migrationAttempts: Math.max(0, Math.floor(clampNumber(item.migrationAttempts, 0, 0, Number.MAX_SAFE_INTEGER))),
      streak: Math.max(0, Math.floor(clampNumber(item.streak, 0, 0, Number.MAX_SAFE_INTEGER))),
    }
  })
}

export function normalizeProfile(candidate: unknown): PlayerProfile {
  const initial = createInitialProfile()
  if (!isRecord(candidate) || candidate.version !== PROFILE_VERSION) return initial
  return {
    version: PROFILE_VERSION,
    xp: Math.floor(clampNumber(candidate.xp, 0, 0, Number.MAX_SAFE_INTEGER)),
    insightPoints: Math.floor(clampNumber(candidate.insightPoints, 0, 0, Number.MAX_SAFE_INTEGER)),
    progress: normalizeProgress(candidate.progress, initial.progress),
    completedWordIds: Array.isArray(candidate.completedWordIds)
      ? [...new Set(candidate.completedWordIds.filter((id): id is string => typeof id === 'string' && wordIds.has(id)))]
      : [],
    activityDays: Array.isArray(candidate.activityDays)
      ? [...new Set(candidate.activityDays.filter((day): day is string => isDayKey(day)))]
      : [],
    onboardingCompleted: candidate.onboardingCompleted === true,
    helpSeen: candidate.helpSeen === true,
  }
}

export function loadProfile(raw: string | null): PlayerProfile {
  if (!raw) return createInitialProfile()
  try {
    return normalizeProfile(JSON.parse(raw))
  } catch {
    return createInitialProfile()
  }
}

export function serializeProfile(profile: PlayerProfile) {
  return JSON.stringify(normalizeProfile(profile))
}
