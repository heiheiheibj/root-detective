import { useMemo, useState, type ReactNode } from 'react'
import type { PlayerProfile, ReviewProgress, WordCore } from '../domain/types'
import { contentRepository } from '../data/repositories'
import { getLevelInfo, getMasteredRootCount, getRootId, getWorldUnlockStatus, migrationRate } from '../domain/logic'

const { getMorpheme, worlds, words, wordsByRoot } = contentRepository

/** 把一个词拆成「表面片段 + 每段含义」，给词根详情表和单测共用（纯函数，无副作用）。 */
export function describeWordParts(word: WordCore, resolve: (id: string) => { meaningCn: string } = getMorpheme) {
  return {
    surfaces: word.parts.map((part) => part.surface),
    meanings: word.parts.map((part) => resolve(part.morphemeId).meaningCn),
  }
}

/** 子序列模糊匹配：needle 的字符是否按序出现在 haystack 中（容忍漏字母、顺序对即可）。 */
function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (needle[i] === haystack[j]) i++
  }
  return i === needle.length
}

/** 跨全词库搜索：单词拼写（含子序列模糊）/ 中文释义 命中即返回，最多 limit 条。 */
export function searchAllWords(query: string, limit = 80) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const raw = query.trim()
  return words
    .filter((word) => word.word.toLowerCase().includes(q) || word.modernMeaningCn.includes(raw) || isSubsequence(q, word.word.toLowerCase()))
    .slice(0, limit)
}

/** 把文本里与查询连续匹配的子串用 <mark> 高亮（大小写不敏感，命中所有出现位置）。 */
function highlight(text: string, query: string): ReactNode {
  const q = query.trim()
  if (!q) return text
  const lowerText = text.toLowerCase()
  const lowerQ = q.toLowerCase()
  const parts: ReactNode[] = []
  let cursor = 0
  let key = 0
  while (cursor < text.length) {
    const idx = lowerText.indexOf(lowerQ, cursor)
    if (idx === -1) {
      parts.push(text.slice(cursor))
      break
    }
    if (idx > cursor) parts.push(text.slice(cursor, idx))
    parts.push(<mark className="hl" key={key++}>{text.slice(idx, idx + q.length)}</mark>)
    cursor = idx + q.length
  }
  return <>{parts}</>
}

/** 词根单词表：单词 / 如何拆分 / 单词意思 / 学习。词根详情页与搜索结果共用，保证两处完全一致。 */
function RootWordsTable({ words, onStudyWord, query = '' }: {
  words: readonly WordCore[]
  onStudyWord: (wordId: string) => void
  query?: string
}) {
  return (
    <div className="table-scroll">
      <table className="root-words">
        <thead>
          <tr><th>单词</th><th>如何拆分</th><th>单词意思</th><th aria-label="操作" /></tr>
        </thead>
        <tbody>
          {words.map((word) => {
            const { surfaces, meanings } = describeWordParts(word)
            const splitNodes: ReactNode[] = []
            meanings.forEach((meaning, index) => {
              if (index > 0) {
                splitNodes.push(<span className="seg-plus" key={`plus-${index}`} aria-hidden="true">+</span>)
              }
              splitNodes.push(
                <span className="seg-item" key={`m-${index}`}>
                  <span className="seg-part">{surfaces[index]}</span>
                  <span className="seg-mean">({meaning})</span>
                </span>,
              )
            })
            return (
              <tr
                key={word.id}
                className="word-row"
                role="button"
                tabIndex={0}
                onClick={() => onStudyWord(word.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onStudyWord(word.id)
                  }
                }}
              >
                <td className="cell-word">
                  <strong>{highlight(word.word, query)}</strong>
                  <small>{word.phonetic} · {word.partOfSpeech}</small>
                </td>
                <td><div className="cell-seg">{splitNodes}</div></td>
                <td className="cell-def">{highlight(word.modernMeaningCn, query)}</td>
                <td className="cell-action"><span className="result-study" aria-hidden="true">学习 →</span></td>
              </tr>
            )
          })}
          {words.length === 0 && (
            <tr><td colSpan={4} className="empty-row">没有匹配的单词。</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/** 搜索结果列表：按词根分组展示，命中片段高亮，命中上限时给提示。词根地图搜索与全局搜索页共用。 */
function SearchResults({ query, words, onOpenRoot, onStudyWord, limit = 80 }: {
  query: string
  words: WordCore[]
  onOpenRoot: (rootId: string) => void
  onStudyWord: (wordId: string) => void
  limit?: number
}) {
  const hitLimit = words.length >= limit
  const groups = new Map<string, WordCore[]>()
  for (const word of words) {
    const rootId = getRootId(word, getMorpheme)
    const list = groups.get(rootId) ?? []
    list.push(word)
    groups.set(rootId, list)
  }
  const groupList = [...groups.entries()].map(([rootId, list]) => ({ rootId, root: getMorpheme(rootId), words: list }))
  return (
    <>
      {hitLimit && <p className="search-hint">结果较多，已显示前 {limit} 个，可缩小关键词继续查找。</p>}
      <div className="search-groups">
        {groupList.map(({ rootId, root, words: groupWords }) => (
          <div className="search-group" key={rootId}>
            <div className="search-group-head">
              <span className={`morpheme-chip ${root.color}`}>{root.displayText}</span>
              <span className="search-group-meta">{root.meaningCn} · {groupWords.length} 个词</span>
              <button type="button" className="group-root-link" onClick={() => onOpenRoot(rootId)}>看这个词根的全部单词 →</button>
            </div>
            <RootWordsTable words={groupWords} onStudyWord={onStudyWord} query={query} />
          </div>
        ))}
      </div>
    </>
  )
}

function RootDetailView({ rootId, onBack, onStudyWord }: { rootId: string; onBack: () => void; onStudyWord: (wordId: string) => void }) {
  const root = getMorpheme(rootId)
  const wordCores = wordsByRoot.get(rootId) ?? []
  const [filter, setFilter] = useState('')
  const query = filter.trim().toLowerCase()
  const visible = query
    ? wordCores.filter((word) => word.word.toLowerCase().includes(query) || word.modernMeaningCn.includes(filter.trim()))
    : wordCores

  return (
    <section className="page-section root-detail">
      <button type="button" className="back-link" onClick={onBack}>← 返回词根地图</button>
      <div className="section-heading">
        <div>
          <h2>{root.displayText}</h2>
          <p>{root.meaningCn} · 等级 {root.level}</p>
        </div>
        <div className="atlas-count"><strong>{wordCores.length}</strong><span>个单词</span></div>
      </div>
      {root.etymology && <p className="root-etymology">{root.etymology}</p>}
      <input
        type="search"
        className="search-input"
        placeholder="在本词根里筛选单词或释义…"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        aria-label="筛选当前词根的单词"
      />
      <p className="root-hint">没那么多时间玩拼词？直接点任意一行把这个词学掉——这是和拼词游戏并行的另一条线。</p>
      <RootWordsTable words={visible} onStudyWord={(id) => onStudyWord(id)} />
    </section>
  )
}

export function AtlasView({ profile, progressByRoot, selectedRootId, onSelectRoot, onStudyWord }: {
  profile: PlayerProfile
  progressByRoot: ReadonlyMap<string, ReviewProgress>
  selectedRootId: string | null
  onSelectRoot: (rootId: string | null) => void
  onStudyWord?: (wordId: string) => void
}) {
  // 输入框只记录当前文字，按回车或点「搜索」才提交成真正参与检索的词（避免打一个字就自动搜）。
  const [inputValue, setInputValue] = useState('')
  const [committedQuery, setCommittedQuery] = useState('')

  const levelInfo = getLevelInfo(profile.xp)
  const mastered = getMasteredRootCount(profile.progress)
  const rate = Math.round(migrationRate(profile.progress) * 100)
  const overdue = profile.progress.filter((item) => item.state === 'learning' || (item.dueAt !== null && new Date(item.dueAt).getTime() <= Date.now())).length

  const trimmed = committedQuery.trim()
  const searchResults = useMemo(() => searchAllWords(committedQuery, 50), [committedQuery])

  const study = (wordId: string) => onStudyWord?.(wordId)

  if (selectedRootId) {
    return <RootDetailView rootId={selectedRootId} onBack={() => onSelectRoot(null)} onStudyWord={(id) => study(id)} />
  }

  if (trimmed && searchResults.length > 0) {
    return (
      <section className="page-section atlas-page">
        <button type="button" className="back-link" onClick={() => { setInputValue(''); setCommittedQuery('') }}>← 返回词根地图</button>
        <div className="section-heading">
          <div><h2>搜索「{trimmed}」</h2><p>命中 {searchResults.length} 个单词，点任意一行直接把这个词学掉。</p></div>
        </div>
        <SearchResults query={committedQuery} words={searchResults} onOpenRoot={onSelectRoot} onStudyWord={(id) => study(id)} limit={50} />
      </section>
    )
  }

  return (
    <section className="page-section atlas-page">
      <div className="section-heading">
        <div><h2>所有词根，一块一块解锁。</h2><p>词根按意思分组。点开任意一个，能看到它名下所有单词怎么拆（每段用 + 连起来）、整词什么意思；没空玩拼词就直接点单词学掉。</p></div>
        <div className="atlas-count"><strong>{mastered}</strong><span>个词根很熟了</span></div>
      </div>
      <form className="search-form" onSubmit={(event) => { event.preventDefault(); setCommittedQuery(inputValue) }}>
        <input
          type="search"
          className="search-input"
          placeholder="搜索任意单词或释义，回车或点搜索"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          aria-label="搜索单词"
        />
        <button type="submit" className="ghost-button search-submit">搜索</button>
      </form>
      <div className="atlas-overview">
        <span>等级 {levelInfo.level} · {levelInfo.title}</span>
        <span>学了 {profile.completedWordIds.length} 个词</span>
        <span>正确率 {rate}%</span>
        <span className={overdue > 0 ? 'overdue' : ''}>{overdue} 个词根该复习了</span>
      </div>
      <div className="world-grid">
        {worlds.map((world) => {
          const status = getWorldUnlockStatus(world, profile)
          return (
            <article className={`world-card ${status.unlocked ? 'unlocked' : 'locked'}`} key={world.id}>
              <div className="world-card-head"><strong>{status.unlocked ? '已开放' : '还没解锁'}</strong></div>
              <h3>{world.name}</h3>
              <p>{world.description}</p>
              {!status.unlocked && (
                <div className="world-missing">
                  <span>还要做到</span>
                  {status.missing.map((requirement) => <small key={requirement}>{requirement}</small>)}
                </div>
              )}
              <div className="atlas-grid">
                {world.morphemeIds.map((morphemeId) => {
                  const root = getMorpheme(morphemeId)
                  const stability = progressByRoot.get(morphemeId)?.stability ?? 0
                  const label = stability > 0 ? getStabilityBandLabel(stability) : '还没学'
                  return (
                    <div
                      className="atlas-card"
                      key={morphemeId}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectRoot(morphemeId)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onSelectRoot(morphemeId)
                        }
                      }}
                    >
                      <div className="atlas-card-top">
                        <span className={`morpheme-chip ${root.color}`}>词根</span>
                        <span className="atlas-level">等级 {root.level}</span>
                      </div>
                      <h3>{root.displayText}</h3>
                      <p>{root.meaningCn}</p>
                      <div className="mini-track"><i style={{ width: `${stability}%` }} /></div>
                      <small>{label} · {Math.round(stability)}%</small>
                    </div>
                  )
                })}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function SearchView({ query, onBack, onOpenRoot, onStudyWord }: {
  query: string
  onBack: () => void
  onOpenRoot: (rootId: string) => void
  onStudyWord: (wordId: string) => void
}) {
  const trimmed = query.trim()
  const results = searchAllWords(query)
  const rootCount = new Set(results.map((word) => getRootId(word, getMorpheme))).size
  return (
    <section className="page-section atlas-page">
      <button type="button" className="back-link" onClick={onBack}>← 返回</button>
      <div className="section-heading">
        <div>
          <h2>搜索「{trimmed}」</h2>
          <p>命中 {results.length} 个单词{results.length > 0 ? `，分属 ${rootCount} 个词根` : ''}。点任意一行直接把这个词学掉；也可以点组头的链接看该词根的全部单词。</p>
        </div>
      </div>
      {results.length === 0 ? (
        <p className="empty-row">没有匹配「{trimmed}」的单词。</p>
      ) : (
        <SearchResults query={query} words={results} onOpenRoot={onOpenRoot} onStudyWord={onStudyWord} />
      )}
    </section>
  )
}

function getStabilityBandLabel(stability: number): string {
  if (stability >= 80) return '很熟了'
  if (stability >= 50) return '比较熟了'
  if (stability >= 25) return '在复习'
  return '刚开始'
}
