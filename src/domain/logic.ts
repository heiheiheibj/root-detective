import type { CaseMode, CaseRun, DebugDiagnosis, DebugErrorStage, Difficulty, LevelInfo, ModeStrategy, Morpheme, PlayerProfile, ReviewProgress, ReviewState, StabilityBandKey, StableCaseMode, Word, WordCore, WorldDefinition, WorldUnlockStatus } from './types'

// ---------- 三种工作模式 ----------

/** 仅用于奖励计算和提示显隐；展示文案已经全部走 App.tsx 的 stageCopy，不要再从这里取 label/description。 */
const MODE_STRATEGIES: Record<CaseMode, ModeStrategy> = {
  compiler: {
    mode: 'compiler',
    label: '学新词',
    eyebrow: '',
    description: '',
    completionLabel: '',
    nextMode: 'compiler',
    insightPoints: 24,
    showHints: true,
  },
  debugger: {
    mode: 'debugger',
    label: '改错',
    eyebrow: '',
    description: '',
    completionLabel: '',
    nextMode: 'compiler',
    insightPoints: 12,
    showHints: true,
  },
  regression: {
    mode: 'regression',
    label: '复习',
    eyebrow: '',
    description: '',
    completionLabel: '',
    nextMode: 'regression',
    insightPoints: 12,
    showHints: false,
  },
}

/** 将旧版 mode 值映射到新工作模式；模式不写入档案，因此仅用于运行时兼容。 */
export function normalizeCaseMode(mode: unknown): CaseMode {
  if (mode === 'debugger') return 'debugger'
  if (mode === 'regression' || mode === 'review') return 'regression'
  return 'compiler'
}

export function getModeStrategy(mode: unknown): ModeStrategy {
  return MODE_STRATEGIES[normalizeCaseMode(mode)]
}

export function getContinuationMode(run: Pick<CaseRun, 'mode' | 'originMode'>): StableCaseMode {
  const mode = normalizeCaseMode(run.mode)
  return mode === 'debugger' ? run.originMode ?? 'compiler' : mode
}

export function getMistakeEventId(runId: string, stage: DebugErrorStage, answer = '') {
  return `${runId}:mistake:${stage}:${answer}`
}

// ---------- 调试诊断 ----------

function formatSelectedModules(selected: string[], getMorpheme: (id: string) => Morpheme) {
  return selected.length === 0 ? '还没选' : selected.map((id) => getMorpheme(id).displayText).join(' + ')
}

export function createSplitDiagnosis(word: Word, selected: string[], getMorpheme: (id: string) => Morpheme): DebugDiagnosis {
  const expectedParts = word.parts.map((part) => part.surface).join(' + ')
  const mismatchIndex = selected.findIndex((id, index) => id !== word.parts[index]?.morphemeId)
  const position = mismatchIndex < 0 ? selected.length + 1 : mismatchIndex + 1
  return {
    stage: 'build',
    title: '拼错了',
    summary: `第 ${position} 个位置不对。`,
    expected: expectedParts,
    selected: formatSelectedModules(selected, getMorpheme),
    fix: `把第 ${position} 个位置的卡片拿掉，换一张，让它和这个词的样子对上。`,
  }
}

export function createMetaphorDiagnosis(word: Word, choiceIndex: number, options: Array<{ text: string; correct: boolean }>): DebugDiagnosis {
  const selected = options[choiceIndex]?.text ?? '未选择方向'
  const expected = options.find((option) => option.correct)?.text ?? word.metaphorOptions[0]
  return {
    stage: 'forge',
    title: '猜错了',
    summary: '这个意思和它连不上。',
    expected,
    selected,
    fix: `先记住它的字面画面是「${word.literalMeaningCn}」，从这个画面出发再猜一次。`,
  }
}

// ---------- 拆解判分 ----------

/** 按词素 ID 顺序精确匹配（第 1 阶：词素拼接） */
export function isSplitCorrect(word: Word, selected: string[]) {
  const expected = word.parts.map((part) => part.morphemeId)
  return expected.length === selected.length && expected.every((id, index) => id === selected[index])
}

// ---------- 第 2 阶：语义方向三选一 ----------

/** 正确答案永远是 metaphorOptions[0]，随机打乱后返回带是否正确标记的选项 */
export function shuffledMetaphorOptions(word: Word): Array<{ text: string; correct: boolean }> {
  const options = word.metaphorOptions.map((text, index) => ({ text, correct: index === 0 }))
  return shuffle(options)
}

export function isMetaphorCorrect(word: Word, choiceIndex: number, shuffled: Array<{ text: string; correct: boolean }>) {
  return Boolean(shuffled[choiceIndex]?.correct)
}

// ---------- 同化提示 ----------

/** 返回同化变体说明，如 "im 是 in 的表面变体"；无同化时返回 null */
export function assimilationHint(word: Word, getMorpheme: (id: string) => Morpheme): string | null {
  const part = word.parts.find((item) => item.isAssimilated)
  if (!part) return null
  const main = getMorpheme(part.morphemeId)
  return `${part.surface} 是 ${main.allomorphs[0]} 的表面变体`
}

// ---------- 复习排程（词根为排程对象，难度权重修正） ----------

export function getRootId(word: WordCore, getMorpheme: (id: string) => Morpheme): string {
  return word.parts.find((part) => getMorpheme(part.morphemeId).type === 'root')?.morphemeId ?? word.parts[0].morphemeId
}

export function getStabilityBand(stability: number): { key: StabilityBandKey; label: string } {
  if (stability >= 80) return { key: 'mastered', label: '很熟了' }
  if (stability >= 50) return { key: 'transferring', label: '比较熟了' }
  if (stability >= 25) return { key: 'reviewing', label: '在复习' }
  return { key: 'building', label: '刚开始' }
}

const LEVELS: Array<{ threshold: number; title: string }> = [
  { threshold: 0, title: '刚入门' },
  { threshold: 100, title: '认识几个词根' },
  { threshold: 250, title: '会拆词了' },
  { threshold: 450, title: '能看出规律' },
  { threshold: 700, title: '词根达人' },
  { threshold: 1000, title: '举一反三' },
  { threshold: 1400, title: '融会贯通' },
]

export function getLevelInfo(xp: number): LevelInfo {
  const safeXp = Number.isFinite(xp) ? Math.max(0, xp) : 0
  let index = LEVELS.findIndex((level, levelIndex) => safeXp < (LEVELS[levelIndex + 1]?.threshold ?? Infinity))
  if (index < 0) index = LEVELS.length - 1
  const current = LEVELS[index]
  const next = LEVELS[index + 1]?.threshold ?? null
  return {
    level: index + 1,
    title: current.title,
    xp: safeXp,
    currentLevelXp: current.threshold,
    nextLevelXp: next,
    progressPercent: next === null ? 100 : Math.round(((safeXp - current.threshold) / (next - current.threshold)) * 100),
  }
}

export function getMasteredRootCount(progress: ReviewProgress[]) {
  return progress.filter((item) => item.stability >= 80).length
}

export function migrationRate(progress: ReviewProgress | ReviewProgress[]) {
  const items = Array.isArray(progress) ? progress : [progress]
  const attempts = items.reduce((sum, item) => sum + item.migrationAttempts, 0)
  const correct = items.reduce((sum, item) => sum + item.migrationCorrect, 0)
  return attempts === 0 ? 0 : correct / attempts
}

export function getLocalDayKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getCurrentStreak(activityDays: string[], today = getLocalDayKey()) {
  const days = new Set(activityDays)
  const cursor = new Date(`${today}T12:00:00`)
  let streak = 0
  while (days.has(getLocalDayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

const STABILITY_GAIN = 12
// 键类型收紧成 Difficulty：数据里出现 1/3/5 以外的难度会在调用点就被 TypeScript 拦下，
// 否则会查表得到 undefined 并把熟练度算成 NaN。
const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = { 1: 1.5, 3: 1, 5: 0.5 }
const DIFFICULTY_PENALTY: Record<Difficulty, number> = { 1: 1, 3: 0.7, 5: 0.3 }

/** 熟练度只增不减的规则集中在这里，配对复习和单词结算共用。 */
function nextStability(stability: number, difficulty: Difficulty, correct: boolean) {
  return correct
    ? Math.min(100, stability + STABILITY_GAIN * DIFFICULTY_MULTIPLIER[difficulty])
    : Math.max(0, stability * (1 - 0.8 * DIFFICULTY_PENALTY[difficulty]))
}

function stabilityState(stability: number): ReviewState {
  return stability >= 80 ? 'mastered' : stability >= 25 ? 'reviewing' : 'learning'
}

/** 答对按熟练度往后推，答错 6 小时后再来。 */
function nextDueAt(stability: number, correct: boolean, now: Date) {
  return new Date(now.getTime() + (correct ? Math.max(1, stability / 10) : 0.25) * 24 * 60 * 60 * 1000).toISOString()
}

export function updateProgress(progress: ReviewProgress, word: Word, correct: boolean, now = new Date()): ReviewProgress {
  const stability = nextStability(progress.stability, word.difficulty, correct)
  return {
    ...progress, state: stabilityState(stability), stability, dueAt: nextDueAt(stability, correct, now),
    testedWordIds: [...new Set([...progress.testedWordIds, word.id])],
    migrationCorrect: progress.migrationCorrect + (correct ? 1 : 0),
    migrationAttempts: progress.migrationAttempts + 1,
    streak: correct ? progress.streak + 1 : 0,
  }
}

// ---------- 配对复习 ----------

export const MATCH_REVIEW_XP = 8
export const MATCH_REVIEW_INSIGHT = 10

/** 配对面板最少几组才值得开局；不够就用没到期的词根补齐。 */
const MATCH_MIN_PAIRS = 3

/**
 * 配对面板：到期的词根优先，不足 3 组时用学过但没到期的词根补齐（熟练度低的先上）。
 * 同一个中文意思只出现一次——否则会出现两个都对的选项。
 */
export function getReviewBoard(progress: ReviewProgress[], wordsByRoot: ReadonlyMap<string, readonly WordCore[]>, limit = 6) {
  const due = getReviewQueue(progress)
  const dueIds = new Set(due.map((item) => item.morphemeId))
  const candidates = [...due]
  if (candidates.length < MATCH_MIN_PAIRS) {
    const spare = progress
      .filter((item) => !dueIds.has(item.morphemeId) && item.state !== 'new')
      .sort((a, b) => a.stability - b.stability)
    for (const item of spare) {
      if (candidates.length >= MATCH_MIN_PAIRS) break
      candidates.push(item)
    }
  }
  const entries: Array<{ rootId: string; due: boolean; word: WordCore }> = []
  const seenMeanings = new Set<string>()
  for (const item of candidates.slice(0, limit)) {
    const word = pickNextWord(item.morphemeId, item.testedWordIds, wordsByRoot)
    if (!word || seenMeanings.has(word.modernMeaningCn)) continue
    seenMeanings.add(word.modernMeaningCn)
    entries.push({ rootId: item.morphemeId, due: dueIds.has(item.morphemeId), word })
  }
  return entries
}

/** 配对复习结算：只调词根熟练度，不动已测词列表；难度按「一般」算。 */
export function applyMatchReview(profile: PlayerProfile, results: Array<{ rootId: string; correct: boolean }>, now = new Date()): PlayerProfile {
  const outcome = new Map(results.map((item) => [item.rootId, item.correct]))
  if (outcome.size === 0) return profile
  return {
    ...profile,
    xp: profile.xp + outcome.size * MATCH_REVIEW_XP,
    insightPoints: profile.insightPoints + outcome.size * MATCH_REVIEW_INSIGHT,
    progress: profile.progress.map((item) => {
      const correct = outcome.get(item.morphemeId)
      if (correct === undefined) return item
      const stability = nextStability(item.stability, 3, correct)
      return { ...item, state: stabilityState(stability), stability, dueAt: nextDueAt(stability, correct, now), streak: correct ? item.streak + 1 : 0 }
    }),
    activityDays: [...new Set([...profile.activityDays, getLocalDayKey(now)])],
  }
}

/**
 * 到期的词根队列，按到期时间升序。
 * options.deprioritizedRootIds 里是「结构性缺门」的词根：家族连一个入门词都没有
 * （见 scripts/tools/build-non-teaching-roots.mjs 的策略）。它们**不是不复习**，
 * 而是不该在还有别的到期词根时抢在前面——毕竟新手一上来啃动词根只能拿到高级派生词。
 */
export function getReviewQueue(
  progress: ReviewProgress[],
  now = new Date(),
  options: { deprioritizedRootIds?: ReadonlySet<string> } = {},
) {
  const deprioritized = options.deprioritizedRootIds
  return progress
    .filter((item) => {
      if (item.state === 'new' || item.state === 'mastered') return false
      if (item.state === 'learning') return true
      return Boolean(item.dueAt) && new Date(item.dueAt!).getTime() <= now.getTime()
    })
    .sort((a, b) => {
      if (deprioritized) {
        const diff = Number(deprioritized.has(a.morphemeId)) - Number(deprioritized.has(b.morphemeId))
        if (diff !== 0) return diff
      }
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.NEGATIVE_INFINITY
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.NEGATIVE_INFINITY
      return aDue - bDue
    })
}

export function getReviewCandidate(rootId: string, testedWordIds: string[], wordsByRoot: ReadonlyMap<string, readonly WordCore[]>) {
  return pickNextWord(rootId, testedWordIds, wordsByRoot)
}

export function calculateCaseReward(run: CaseRun) {
  const strategy = getModeStrategy(run.mode)
  const baseXp = run.mode === 'debugger' ? 25 : 40
  const firstAttemptXp = run.mode === 'compiler' && run.wasNewWord && !run.hadMistake ? 20 : 0
  const migrationXp = run.mode !== 'debugger' && run.wasNewWord && !run.hadMistake ? 20 : 0
  return {
    xp: baseXp + firstAttemptXp + migrationXp,
    baseXp,
    firstAttemptXp,
    migrationXp,
    insightPoints: strategy.insightPoints,
    wasFirstAttempt: firstAttemptXp > 0,
    wasSuccessfulMigration: migrationXp > 0,
  }
}

export function applyIncorrectAttempt(profile: PlayerProfile, word: Word, getMorpheme: (id: string) => Morpheme, now = new Date()): PlayerProfile {
  const rootId = getRootId(word, getMorpheme)
  return {
    ...profile,
    progress: profile.progress.map((item) => item.morphemeId === rootId ? updateProgress(item, word, false, now) : item),
  }
}

export function applyCompletedCase(profile: PlayerProfile, run: CaseRun, word: Word, getMorpheme: (id: string) => Morpheme, now = new Date()): { profile: PlayerProfile; reward: ReturnType<typeof calculateCaseReward> & { stabilityBefore: number; stabilityAfter: number; stabilityBand: StabilityBandKey } } {
  const rootId = getRootId(word, getMorpheme)
  const current = profile.progress.find((item) => item.morphemeId === rootId)
  if (!current) return { profile, reward: { ...calculateCaseReward(run), stabilityBefore: 0, stabilityAfter: 0, stabilityBand: 'building' } }
  const next = updateProgress(current, word, true, now)
  const reward = calculateCaseReward(run)
  const nextProfile: PlayerProfile = {
    ...profile,
    xp: profile.xp + reward.xp,
    insightPoints: profile.insightPoints + reward.insightPoints,
    progress: profile.progress.map((item) => item.morphemeId === rootId ? next : item),
    completedWordIds: [...new Set([...profile.completedWordIds, word.id])],
    activityDays: [...new Set([...profile.activityDays, getLocalDayKey(now)])],
  }
  return { profile: nextProfile, reward: { ...reward, stabilityBefore: current.stability, stabilityAfter: next.stability, stabilityBand: getStabilityBand(next.stability).key } }
}

/**
 * 把一个世界的词根折算成一个「这组练到什么程度」的百分比。
 * max 取最高的那个（默认，和词根单人解锁的直觉一致）；meanTop 取前一半的平均，适合词根多的世界。
 */
function groupStability(progress: ReviewProgress[], morphemeIds: readonly string[], policy: 'max' | 'meanTop') {
  const wanted = new Set(morphemeIds)
  const values = progress.filter((item) => wanted.has(item.morphemeId)).map((item) => item.stability)
  if (values.length === 0) return 0
  if (policy === 'meanTop') {
    const top = [...values].sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(values.length / 2)))
    return top.reduce((sum, value) => sum + value, 0) / top.length
  }
  return values.reduce((best, value) => Math.max(best, value), 0)
}

export function getWorldUnlockStatus(world: WorldDefinition, profile: PlayerProfile): WorldUnlockStatus {
  const requirement = world.unlockRequirement
  if (!requirement) return { world, unlocked: true, missing: [] }
  const level = getLevelInfo(profile.xp).level
  // 之前这里写死成 spec / vid，导致不建在这两个词根上的世界永远解不开。
  const reached = groupStability(profile.progress, world.morphemeIds, requirement.stabilityPolicy ?? 'max')
  const missing: string[] = []
  if (level < requirement.level) missing.push(`升到 ${requirement.level} 级（现在 ${level} 级）`)
  if (profile.completedWordIds.length < requirement.completedCases) missing.push(`再学 ${requirement.completedCases - profile.completedWordIds.length} 个新词`)
  if (reached < requirement.observationStability) missing.push(`把「${world.name}」这组词根练到 ${requirement.observationStability}%（现在最高 ${Math.round(reached)}%）`)
  return { world, unlocked: missing.length === 0, missing }
}

// ---------- 题池挑选（M3 前的最小实现） ----------

/**
 * 挑下一个词：优先同词根没学过的，其次任意同词根词，都没有则返回 null。
 * 家族来自调用方传进来的索引（data.ts 的 wordsByRoot），这样领域层不必碰词库，
 * 也不用每次全表扫。
 */
export function pickNextWord(rootId: string, testedWordIds: string[], wordsByRoot: ReadonlyMap<string, readonly WordCore[]>): WordCore | null {
  const family = wordsByRoot.get(rootId)
  if (!family || family.length === 0) return null
  return family.find((word) => !testedWordIds.includes(word.id)) ?? family[0]
}

// ---------- 幂等提交 ----------

/** 同一事件重复提交只计一次奖励；返回是否为重复提交 */
export function isDuplicateSubmit(eventId: string, seenEventIds: Set<string>) {
  if (seenEventIds.has(eventId)) return true
  seenEventIds.add(eventId)
  return false
}

// ---------- 工具 ----------

/** Fisher-Yates 洗牌，返回新数组，不修改原数组 */
export function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
