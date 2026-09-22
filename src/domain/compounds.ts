/**
 * 复合词内容层：两个独立单词拼成的词（eyeball = eye + ball、ballroom = ball + room）。
 *
 * 和「词根词库」是两套东西，别混：
 *   - 词根词库（content/words.json）里的词要进拼词游戏，有字面义/隐喻义/干扰项/例句等九个字段；
 *   - 复合词只有「音标 + 词典释义 + 两段拼法」，不进游戏、不占分词片，只在词根地图里补一列
 *     「含这个零件的复合词」，让人多一条记拼写的线索。
 *
 * 数据由 scripts/tools/45-build-compounds-content.mjs 从 App_Data/dict.db 的 compounds 表导出，
 * 238 KB，整份懒加载（打开词根详情或搜索命中才拉），失败就静默当作没有这一层，绝不影响主流程。
 */
import { words, wordsByRoot } from './data'

export type CompoundWord = {
  word: string
  phonetic: string
  /** 词典释义（已去噪，最多两个义项，见生成脚本的 cleanMeaning） */
  meaning: string
  /** 拼法，恒有 parts[0] + parts[1] === word（生成时已校验） */
  parts: [string, string]
}

type Payload = {
  fields: string[]
  total: number
  /** 定长数组，字段顺序见文件的 fields：[word, phonetic, meaning, part1, part2] */
  words: string[][]
}

let data: Payload | null = null
let loading: Promise<void> | null = null
let state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle'

/** 词根词库里已有的词不再当复合词重复列一遍（上面那张表已经给过，含学习入口）。 */
let libraryWords: Set<string> | null = null
function getLibraryWords() {
  libraryWords ??= new Set(words.map((word) => word.word.toLowerCase()))
  return libraryWords
}

const partCache = new Map<string, CompoundWord[]>()

/**
 * 「零件 → 下标」倒排索引在运行时建（一次 3 千条的扫描，几毫秒），
 * 生成文件里不存它——省 30 KB 传输，且词库覆盖变化时不用重新生成数据。
 */
let byPartIndex: Map<string, number[]> | null = null
function getByPartIndex(): Map<string, number[]> {
  if (byPartIndex || !data) return byPartIndex ?? new Map()
  const index = new Map<string, number[]>()
  data.words.forEach((row, position) => {
    for (const part of new Set([row[3], row[4]])) {
      const list = index.get(part)
      if (list) list.push(position)
      else index.set(part, [position])
    }
  })
  byPartIndex = index
  return byPartIndex
}

export function getCompoundState() {
  return state
}

/** 幂等；失败也只结算一次，调用方按 getCompoundState() 决定要不要显示加载提示。 */
export function loadCompoundData(): Promise<void> {
  if (state === 'ready' || state === 'failed') return Promise.resolve()
  loading ??= import('./content/compounds.json')
    .then((mod) => {
      data = (mod.default ?? mod) as unknown as Payload
      state = 'ready'
    })
    .catch(() => {
      // 拿不到就当作这一层不存在：词根表照常显示，不弹错误
      state = 'failed'
    })
  return loading
}

function toWord(row: string[]): CompoundWord {
  return { word: row[0], phonetic: row[1], meaning: row[2], parts: [row[3], row[4]] }
}

/**
 * 某个零件（词素 id）名下能看到的复合词，按词频从常见到生僻。
 * 未加载完返回空数组——调用方先渲染空的，加载完再重渲染（不会闪错，只是晚一点出现）。
 */
export function compoundWordsForPart(partId: string): CompoundWord[] {
  if (!data) return []
  const key = partId.trim().toLowerCase()
  const cached = partCache.get(key)
  if (cached) return cached
  const library = getLibraryWords()
  const list = (getByPartIndex().get(key) ?? [])
    .map((index) => toWord(data!.words[index]))
    .filter((entry) => !library.has(entry.word))
  partCache.set(key, list)
  return list
}

/** 搜复合词：词形或释义命中即可（与词库搜索的匹配口径一致，词库那边还多一层词素含义）。 */
export function searchCompoundWords(query: string, limit = 50): CompoundWord[] {
  const q = query.trim().toLowerCase()
  if (!q || !data) return []
  const raw = query.trim()
  const library = getLibraryWords()
  const hits: CompoundWord[] = []
  for (const row of data.words) {
    if (library.has(row[0])) continue // 词库里的词走 SearchResults，这里不重复
    if (row[0].includes(q) || row[2].includes(raw)) {
      hits.push(toWord(row))
      if (hits.length >= limit) break
    }
  }
  return hits
}

/** 这个零件能不能点进去看它自己的词根页（词素 id 就是小写词形，见生成管线）。 */
export function canOpenAsRoot(part: string): boolean {
  return wordsByRoot.has(part.trim().toLowerCase())
}
