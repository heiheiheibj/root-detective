import type { Morpheme, PlayerProfile, ReviewProgress, Word, WordCore, WordDetail, WorldDefinition } from './types'

/**
 * 仓库接口：页面层只认这层，不认 localStorage / Supabase / 具体 JSON。
 * 将来把本地实现换成「本地 + 服务端同步」时，改的是 src/data/ 下的适配器，App 不用动。
 *
 * 为什么全是同步/纯读属性：这是方案第 2 节「离线优先」决策的落地形态——
 * 任何一次读写都要能立刻生效，联网同步是后台补做的事。要是把这里改成 Promise，
 * App 初始化就得多一个「档案还没加载出来」的中间态，收益不抵复杂度。
 *
 * 成员名刻意与原来 data.ts 的导出保持一致，页面可以整包解构接进来，
 * 不用逐个重命名调用点（那样最容易手滑改坏 JSX 里的同名写法）。
 */

/** 词库是只读发布产物，所以只给读方法。 */
export interface ContentRepository {
  readonly words: readonly WordCore[]
  readonly wordsByRoot: ReadonlyMap<string, readonly WordCore[]>
  readonly worlds: readonly WorldDefinition[]
  /** 找不到时返回词表里第一个词素兜底并告警，与旧行为一致。 */
  getMorpheme(id: string): Morpheme
  /** 干扰项这类「可能没建模」的引用走这个，找不到返回 undefined。 */
  findMorpheme(id: string): Morpheme | undefined
  /** 找不到时返回词表里第一个词兜底并告警，与 data.ts 的既有行为一致。 */
  getWordCore(id: string): WordCore
  /** 已经加载过的详情（同步版）；没加载过返回 undefined。 */
  getWordDetailSync(id: string): WordDetail | undefined
  /** 详情分片是动态 import 的，天然异步；已解析过的由适配器内部缓存。 */
  loadWordDetail(id: string): Promise<WordDetail>
  getFamilyWords(word: Word): WordCore[]
  /** 按词表里词根的初始顺序造一份空进度——「有哪些词根要学」只有内容层知道。 */
  createRootProgress(rootId: string): ReviewProgress
}

/** 用户学习状态唯一的出入口。何时落盘由调用方决定，这里只管「存/取」。 */
export interface ProgressRepository {
  /** 读不到或档案损坏时回退到新档案，绝不把异常抛给页面。 */
  read(): PlayerProfile
  /** 序列化成可传输的字符串，将来给 Supabase 同步与备份导出复用同一份格式。 */
  serialize(profile: PlayerProfile): string
  /** 写入失败要静默降级为「仅本次会话有效」，不能让答题中断。 */
  save(profile: PlayerProfile): void
}

/** 发音：优先离线音频文件，取不到再退回浏览器语音合成。 */
export interface AudioRepository {
  canSpeak(): boolean
  speak(text: string, lang?: string): boolean
}
