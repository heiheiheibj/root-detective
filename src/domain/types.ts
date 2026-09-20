export type MorphemeType = 'prefix' | 'root' | 'suffix'

/** 三步：拼单词 → 猜词义 → 看结果。释义和验证已并入同屏区块，不再各占一屏。 */
export type PuzzleStage = 'build' | 'forge' | 'reward'

export type ReviewState = 'new' | 'learning' | 'reviewing' | 'mastered'

export type Difficulty = 1 | 3 | 5
export type CaseMode = 'compiler' | 'debugger' | 'regression'
export type StableCaseMode = Exclude<CaseMode, 'debugger'>
export type DebugErrorStage = Extract<PuzzleStage, 'build' | 'forge'>
export type StabilityBandKey = 'building' | 'reviewing' | 'transferring' | 'mastered'

/** 世界 id 由 data.ts 的 worlds 列表反推（见那里的 `WorldId`），这里只约束形状。 */
export type WorldId = string

export interface Morpheme {
  id: string
  displayText: string
  type: MorphemeType
  meaningCn: string
  allomorphs: string[]
  etymology: string
  level: number
  color: 'blue' | 'orange' | 'green'
}

export interface WordPart {
  morphemeId: string
  surface: string
  position: number
  isAssimilated?: boolean
}

/**
 * 词条分两层：索引层字段少，列表页、复习面板、挑词只看这些，词库涨到几千时整包也能加载；
 * 详情层只有真正打开某个词才用得上，将来可以按分片懒加载。对外仍然导出合并后的 Word。
 */
export interface WordCore {
  id: string
  word: string
  phonetic: string
  partOfSpeech: string
  modernMeaningCn: string
  difficulty: Difficulty
  parts: WordPart[]
}

export interface WordDetail {
  literalMeaningCn: string
  metaphorMeaningCn: string
  metaphorOptions: string[]
  exampleEn: string
  exampleCn: string
  distractors: Array<{ text: string; type: 'form' | 'meaning' | 'random' }>
  familyWordIds: string[]
  sourceNote: string
  mnemonicNote: string
}

export type Word = WordCore & WordDetail

export interface ReviewProgress {
  morphemeId: string
  state: ReviewState
  stability: number
  dueAt: string | null
  testedWordIds: string[]
  migrationCorrect: number
  migrationAttempts: number
  streak: number
}

export interface SessionStats {
  insightPoints: number
  rootsMastered: number
  wordsSolved: number
  migrationRate: number
  currentStreak: number
}

export interface PlayerProfile {
  version: number
  xp: number
  insightPoints: number
  progress: ReviewProgress[]
  completedWordIds: string[]
  /** 答错过的单词 id（去重）。用于「错词本 / 待巩固」入口，学对一次即移出。 */
  mistakeWordIds: string[]
  activityDays: string[]
  onboardingCompleted: boolean
  /** 新手帮助是否已经看过一遍；看过的就不再自动弹。 */
  helpSeen: boolean
}

export interface CaseRun {
  id: string
  wordId: string
  rootId: string
  mode: CaseMode
  originMode?: StableCaseMode
  wasNewWord: boolean
  hadMistake: boolean
  startedStability: number
}

export interface ModeStrategy {
  mode: CaseMode
  label: string
  eyebrow: string
  description: string
  completionLabel: string
  nextMode: StableCaseMode
  insightPoints: number
  showHints: boolean
}

export interface DebugDiagnosis {
  stage: DebugErrorStage
  title: string
  summary: string
  expected: string
  selected: string
  fix: string
}

export interface RewardSummary {
  xp: number
  baseXp: number
  firstAttemptXp: number
  migrationXp: number
  insightPoints: number
  stabilityBefore: number
  stabilityAfter: number
  stabilityBand: StabilityBandKey
  wasFirstAttempt: boolean
  wasSuccessfulMigration: boolean
}

export interface LevelInfo {
  level: number
  title: string
  xp: number
  currentLevelXp: number
  nextLevelXp: number | null
  progressPercent: number
}

export interface WorldDefinition {
  id: string
  name: string
  description: string
  morphemeIds: readonly string[]
  unlockRequirement?: {
    level: number
    completedCases: number
    observationStability: number
    /** 一组词根怎么折算成「这组练到什么程度」：默认取最高的那个。 */
    stabilityPolicy?: 'max' | 'meanTop'
  }
}

export interface WorldUnlockStatus {
  world: WorldDefinition
  unlocked: boolean
  missing: string[]
}
