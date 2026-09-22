import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PlayerProfile, ReviewProgress, WordCore } from '../domain/types'
import { contentRepository } from '../data/repositories'
import { getLevelInfo, getMasteredRootCount, getRootId, getWorldUnlockStatus, migrationRate } from '../domain/logic'
import { lookupDict, type DictEntry } from '../data/dictionary'
import { canOpenAsRoot, compoundWordsForPart, getCompoundState, loadCompoundData, searchCompoundWords, type CompoundWord } from '../domain/compounds'

const { getMorpheme, worlds, words, wordsByRoot } = contentRepository

/** 把一个词拆成「表面片段 + 每段含义」，给词根详情表和单测共用（纯函数，无副作用）。 */
export function describeWordParts(word: WordCore, resolve: (id: string) => { meaningCn: string } = getMorpheme) {
  return {
    surfaces: word.parts.map((part) => part.surface),
    meanings: word.parts.map((part) => resolve(part.morphemeId).meaningCn),
  }
}

/** 跨全词库搜索：必须完整包含——单词拼写包含关键词、或中文释义包含关键词、或任一构成词素的含义包含关键词，最多 limit 条。 */
export function searchAllWords(query: string, limit = 80) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const raw = query.trim()
  return words
    .filter(
      (word) =>
        word.word.toLowerCase().includes(q) ||
        word.modernMeaningCn.includes(raw) ||
        word.parts.some((part) => getMorpheme(part.morphemeId).meaningCn.toLowerCase().includes(q)),
    )
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

/**
 * 兜底词典面板：词根词库里查不到时，调 /Dict.aspx 拿这个词的音标与释义。
 * 先精确查；查不到再给前缀建议。接口不可用（如本地 dev）时静默提示「没找到」。
 */
export function DictionaryLookup({ query, sound, onPartClick }: {
  query: string
  sound?: { canSpeak(): boolean; speak(text: string, lang?: string): boolean }
  onPartClick?: (part: string) => void
}) {
  const trimmed = query.trim()
  const [entry, setEntry] = useState<DictEntry | null>(null)
  const [suggestions, setSuggestions] = useState<DictEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    if (!trimmed) { setEntry(null); setSuggestions([]); setLoading(false); return }
    setLoading(true)
    void (async () => {
      const result = await lookupDict(trimmed)
      if (!alive) return
      setEntry(result.entry)
      setSuggestions(result.suggestions)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [trimmed])

  if (!trimmed) return null
  if (loading) return <p className="dict-hint">正在查词典…</p>

  if (entry) {
    return (
      <div className="dict-card">
        <div className="dict-head">
          <strong>{entry.word}</strong>
          {sound?.canSpeak() && (
            <button type="button" className="row-speaker" onClick={() => sound.speak(entry.word)} aria-label={`朗读 ${entry.word}`} title="听发音">🔊</button>
          )}
        </div>
        {entry.phonetic && <span className="phonetic">/{entry.phonetic}/</span>}
        <p className="dict-meaning">{entry.meaning}</p>
        {entry.compound && (
          <p className="dict-compound">
            <span className="dict-method-chip">复合词拆解</span>{' '}
            {entry.compound.parts.map((part, i) => (
              <span key={part}>
                {i > 0 && <span className="dict-compound-plus"> + </span>}
                <button type="button" className="dict-compound-part" onClick={() => onPartClick?.(part)}>{part}</button>
              </span>
            ))}
          </p>
        )}
        <small className="dict-note">词根词库里没有这个词。上面若有拆解，那是按「复合词」（两个独立单词拼成）来看的，不是词根。</small>
      </div>
    )
  }

  if (suggestions.length > 0) {
    return (
      <div className="dict-card">
        <p className="dict-hint">词根词库里没有「{trimmed}」，你是不是想找：</p>
        <ul className="dict-suggest">
          {suggestions.map((item) => (
            <li key={item.word}>
              <span className="dict-suggest-word">
                <strong>{item.word}</strong>
                {sound?.canSpeak() && (
                  <button type="button" className="row-speaker" onClick={() => sound.speak(item.word)} aria-label={`朗读 ${item.word}`} title="听发音">🔊</button>
                )}
              </span>
              {item.phonetic && <span className="phonetic">/{item.phonetic}/</span>}
              <span className="dict-suggest-mean">{item.meaning}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return <p className="dict-hint">词根词库和词典里都没找到「{trimmed}」，检查一下拼写？</p>
}

/**
 * 复合词数据是懒加载的（content/compounds.json，238 KB，单独 chunk）：
 * 打开词根详情、或搜索命中复合词时才拉，拉不到就当作没有这一层，绝不挡住主流程。
 * 返回「是否已结算」，未结算时页面上给一行加载提示。
 */
function useCompoundData(active = true) {
  const [settled, setSettled] = useState(() => getCompoundState() === 'ready' || getCompoundState() === 'failed')
  useEffect(() => {
    if (!active || settled) return
    let alive = true
    void loadCompoundData().then(() => { if (alive) setSettled(true) })
    return () => { alive = false }
  }, [active, settled])
  return settled
}

/**
 * 复合词表：两个独立单词拼成的词（eyeball = eye + ball）。
 * 列和词根表对齐（单词 / 怎么拼 / 意思），但不给「学习」入口——这些词没有学习字段，不进拼词游戏。
 * 拼法里的零件若自己也有词根页（如 ballroom 的 room），点它就能跳过去。
 */
export function CompoundWordsTable({ entries, onOpenRoot, sound, query = '' }: {
  entries: readonly CompoundWord[]
  onOpenRoot?: (rootId: string) => void
  sound?: { canSpeak(): boolean; speak(text: string, lang?: string): boolean }
  query?: string
}) {
  return (
    <div className="table-scroll">
      <table className="root-words compound-words">
        <thead>
          <tr><th>单词</th><th>复合词拆解</th><th>词典释义</th></tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr className="compound-row" key={`${entry.word}+${entry.parts.join('+')}`}>
              <td className="cell-word">
                <span className="word-line">
                  <strong>{highlight(entry.word, query)}</strong>
                  {sound?.canSpeak() && (
                    <button type="button" className="row-speaker" onClick={() => sound.speak(entry.word)} aria-label={`朗读 ${entry.word}`} title="听发音">🔊</button>
                  )}
                </span>
                {entry.phonetic && <small>/{entry.phonetic}/</small>}
              </td>
              <td data-label="如何拆分">
                <div className="cell-seg">
                  <span className="method-chip">复合词</span>
                  {entry.parts.map((part, index) => (
                    <span className="seg-item" key={`${part}-${index}`}>
                      {index > 0 && <span className="seg-plus" aria-hidden="true">+</span>}
                      {onOpenRoot && canOpenAsRoot(part) ? (
                        <button
                          type="button"
                          className="seg-part seg-part-link"
                          onClick={() => onOpenRoot(part)}
                          title={`看 ${part} 自己的词根页`}
                        >{part}</button>
                      ) : (
                        <span className="seg-part">{part}</span>
                      )}
                    </span>
                  ))}
                </div>
              </td>
              <td className="cell-def" data-label="词典释义">{highlight(entry.meaning, query)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** 词根单词表：单词 / 如何拆分 / 单词意思 / 学习。词根详情页与搜索结果共用，保证两处完全一致。 */
export function RootWordsTable({ words, onStudyWord, query = '', sound, completedWordIds, highlightWordId }: {
  words: readonly WordCore[]
  onStudyWord: (wordId: string) => void
  query?: string
  sound?: { canSpeak(): boolean; speak(text: string, lang?: string): boolean }
  completedWordIds?: ReadonlySet<string>
  highlightWordId?: string | null
}) {
  const highlightRef = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => {
    if (highlightWordId) highlightRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlightWordId])
  return (
    <div className="table-scroll">
      <table className="root-words">
        <thead>
          <tr><th>单词</th><th>词根拆解</th><th>单词意思</th><th aria-label="操作" /></tr>
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
                  {/* 含义命中检索词时高亮，让「如何拆分」列也能看出为什么命中 */}
                  <span className="seg-mean">({highlight(meaning, query)})</span>
                </span>,
              )
            })
            const learned = completedWordIds?.has(word.id) ?? false
            return (
              <tr
                key={word.id}
                ref={word.id === highlightWordId ? highlightRef : undefined}
                className={`word-row${word.id === highlightWordId ? ' row-highlight' : ''}${learned ? ' learned' : ''}`}
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
                  <span className="word-line">
                    <strong>{highlight(word.word, query)}</strong>
                    {sound?.canSpeak() && (
                      <button
                        type="button"
                        className="row-speaker"
                        onClick={(event) => { event.stopPropagation(); sound.speak(word.word) }}
                        aria-label={`朗读 ${word.word}`}
                        title="听发音"
                      >🔊</button>
                    )}
                  </span>
                  <small>{word.phonetic} · {word.partOfSpeech}</small>
                  {learned && <span className="learned-badge" title="已学过">✓ 已学</span>}
                </td>
                <td data-label="如何拆分"><div className="cell-seg">{splitNodes}</div></td>
                <td className="cell-def" data-label="单词意思">{highlight(word.modernMeaningCn, query)}</td>
                <td className="cell-action" data-label="学习"><span className="result-study" aria-hidden="true">学习 →</span></td>
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
function SearchResults({ query, words, onOpenRoot, onStudyWord, limit = 80, sound, completedWordIds }: {
  query: string
  words: WordCore[]
  onOpenRoot: (rootId: string) => void
  onStudyWord: (wordId: string) => void
  limit?: number
  sound?: { canSpeak(): boolean; speak(text: string, lang?: string): boolean }
  completedWordIds?: ReadonlySet<string>
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
            <RootWordsTable words={groupWords} onStudyWord={onStudyWord} query={query} sound={sound} completedWordIds={completedWordIds} />
          </div>
        ))}
      </div>
    </>
  )
}

function RootDetailView({ rootId, onBack, onOpenRoot, onStudyWord, sound, completedWordIds, highlightWordId }: {
  rootId: string
  onBack: () => void
  onOpenRoot: (rootId: string) => void
  onStudyWord: (wordId: string) => void
  sound?: { canSpeak(): boolean; speak(text: string, lang?: string): boolean }
  completedWordIds?: ReadonlySet<string>
  highlightWordId?: string | null
}) {
  const root = getMorpheme(rootId)
  const wordCores = wordsByRoot.get(rootId) ?? []
  const compoundReady = useCompoundData()
  // 词根词库之外还有一层：两个独立单词拼成的复合词（ball 名下就有 29 个词库没有的）
  const compoundWords = useMemo(() => (compoundReady ? compoundWordsForPart(rootId) : []), [compoundReady, rootId])
  const [filter, setFilter] = useState('')
  const query = filter.trim().toLowerCase()
  const raw = filter.trim()
  const visible = query
    ? wordCores.filter((word) => word.word.toLowerCase().includes(query) || word.modernMeaningCn.includes(raw))
    : wordCores
  const visibleCompounds = query
    ? compoundWords.filter((entry) => entry.word.toLowerCase().includes(query) || entry.meaning.includes(raw) || entry.parts.some((part) => part.includes(query)))
    : compoundWords
  // 词素 id 就是小写词形（如 ball、circum），标题里去掉可能存在的连字符
  const rootLabel = rootId.replace(/^-+|-+$/g, '')

  return (
    <section className="page-section root-detail">
      <button type="button" className="back-link" onClick={onBack}>← 返回词根地图</button>
      <div className="section-heading">
        <div>
          <h2>{root.displayText}</h2>
          <p>{root.meaningCn} · 等级 {root.level}</p>
        </div>
        <div className="atlas-count">
          <strong>{wordCores.length + compoundWords.length}</strong>
          <span>个单词</span>
          {compoundWords.length > 0 && <span className="atlas-count-break">词根 {wordCores.length} · 复合 {compoundWords.length}</span>}
        </div>
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
      <RootWordsTable words={visible} onStudyWord={(id) => onStudyWord(id)} sound={sound} completedWordIds={completedWordIds} highlightWordId={highlightWordId} />
      {!compoundReady && <p className="root-hint">正在整理含 {rootLabel} 的复合词…</p>}
      {visibleCompounds.length > 0 && (
        <section className="compound-block">
          <div className="compound-head">
            <h3>含 {rootLabel} 的复合词</h3>
            <span className="compound-count">{visibleCompounds.length} 个</span>
          </div>
          <p className="root-hint">
            这些词是两个独立单词拼成的（不是词根），所以不进拼词游戏；但拆开看一样能帮你记住拼写。释义取自词典，只作参考。
          </p>
          <CompoundWordsTable entries={visibleCompounds} onOpenRoot={onOpenRoot} sound={sound} query={raw} />
        </section>
      )}
    </section>
  )
}

export function AtlasView({ profile, progressByRoot, selectedRootId, onSelectRoot, onStudyWord, sound, completedWordIds, highlightWordId }: {
  profile: PlayerProfile
  progressByRoot: ReadonlyMap<string, ReviewProgress>
  selectedRootId: string | null
  onSelectRoot: (rootId: string | null) => void
  onStudyWord?: (wordId: string) => void
  sound?: { canSpeak(): boolean; speak(text: string, lang?: string): boolean }
  completedWordIds?: ReadonlySet<string>
  highlightWordId?: string | null
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
  // 只在真正要用时才拉复合词数据：地图列表页不预取（90 KB gzip），免得多下一份用户可能不看的包
  const compoundReady = useCompoundData(trimmed !== '')
  const compoundResults = useMemo(() => (compoundReady ? searchCompoundWords(committedQuery, 50) : []), [compoundReady, committedQuery])

  const study = (wordId: string) => onStudyWord?.(wordId)

  if (selectedRootId) {
    return <RootDetailView rootId={selectedRootId} onBack={() => onSelectRoot(null)} onOpenRoot={onSelectRoot} onStudyWord={(id) => study(id)} sound={sound} completedWordIds={completedWordIds} highlightWordId={highlightWordId} />
  }

  if (trimmed) {
    return (
      <section className="page-section atlas-page">
        <button type="button" className="back-link" onClick={() => { setInputValue(''); setCommittedQuery('') }}>← 返回词根地图</button>
        <div className="section-heading">
          <div>
            <h2>搜索「{trimmed}」</h2>
            <p>{searchHint(searchResults.length, compoundResults.length)}</p>
          </div>
        </div>
        {searchResults.length > 0 && <SearchResults query={committedQuery} words={searchResults} onOpenRoot={onSelectRoot} onStudyWord={(id) => study(id)} limit={50} sound={sound} completedWordIds={completedWordIds} />}
        {compoundResults.length > 0 && (
          <section className="compound-block">
            <div className="compound-head">
              <h3>复合词命中</h3>
              <span className="compound-count">{compoundResults.length} 个</span>
            </div>
            <p className="root-hint">两个独立单词拼成的词，不进拼词游戏；拆开看帮你记拼写。释义取自词典，只作参考。</p>
            <CompoundWordsTable entries={compoundResults} onOpenRoot={onSelectRoot} sound={sound} query={committedQuery} />
          </section>
        )}
        {searchResults.length === 0 && compoundResults.length === 0 && <DictionaryLookup query={committedQuery} sound={sound} onPartClick={(p) => { setInputValue(p); setCommittedQuery(p) }} />}
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

export function SearchView({ query, onBack, onOpenRoot, onStudyWord, sound, completedWordIds, onPartClick }: {
  query: string
  onBack: () => void
  onOpenRoot: (rootId: string) => void
  onStudyWord: (wordId: string) => void
  sound?: { canSpeak(): boolean; speak(text: string, lang?: string): boolean }
  completedWordIds?: ReadonlySet<string>
  onPartClick?: (part: string) => void
}) {
  const trimmed = query.trim()
  const results = searchAllWords(query)
  const rootCount = new Set(results.map((word) => getRootId(word, getMorpheme))).size
  const compoundReady = useCompoundData()
  const compoundResults = useMemo(() => (compoundReady ? searchCompoundWords(query, 50) : []), [compoundReady, query])
  return (
    <section className="page-section atlas-page">
      <button type="button" className="back-link" onClick={onBack}>← 返回</button>
      <div className="section-heading">
        <div>
          <h2>搜索「{trimmed}」</h2>
          <p>{results.length > 0 ? `命中 ${results.length} 个单词，分属 ${rootCount} 个词根。点任意一行直接把这个词学掉；也可以点组头的链接看该词根的全部单词。` : ''}{compoundResults.length > 0 ? `另有 ${compoundResults.length} 个复合词命中。` : ''}{results.length === 0 && compoundResults.length === 0 ? '词根词库里没有这个词，下面是词典结果。' : ''}</p>
        </div>
      </div>
      {results.length > 0 && <SearchResults query={query} words={results} onOpenRoot={onOpenRoot} onStudyWord={onStudyWord} sound={sound} completedWordIds={completedWordIds} />}
      {compoundResults.length > 0 && (
        <section className="compound-block">
          <div className="compound-head">
            <h3>复合词命中</h3>
            <span className="compound-count">{compoundResults.length} 个</span>
          </div>
          <p className="root-hint">两个独立单词拼成的词，不进拼词游戏；拆开看帮你记拼写。释义取自词典，只作参考。</p>
          <CompoundWordsTable entries={compoundResults} onOpenRoot={onOpenRoot} sound={sound} query={query} />
        </section>
      )}
      {results.length === 0 && compoundResults.length === 0 && (
        <DictionaryLookup query={query} sound={sound} onPartClick={onPartClick} />
      )}
    </section>
  )
}

/** 搜索说明文字：词库命中 / 复合词命中 / 两边都没有（那就走词典兜底）三种情况。 */
function searchHint(libraryHits: number, compoundHits: number): string {
  const parts: string[] = []
  if (libraryHits > 0) parts.push(`词根词库命中 ${libraryHits} 个单词，点任意一行直接把这个词学掉`)
  if (compoundHits > 0) parts.push(`另有 ${compoundHits} 个复合词命中`)
  if (parts.length === 0) return '词根词库里没有这个词，下面是词典结果。'
  return `${parts.join('；')}。`
}

function getStabilityBandLabel(stability: number): string {
  if (stability >= 80) return '很熟了'
  if (stability >= 50) return '比较熟了'
  if (stability >= 25) return '在复习'
  return '刚开始'
}
