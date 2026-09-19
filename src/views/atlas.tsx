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
      <div className="table-scroll">
        <table className="root-words">
          <thead>
            <tr><th>单词</th><th>如何拆分</th><th>单词意思</th><th aria-label="操作" /></tr>
          </thead>
          <tbody>
            {visible.map((word) => {
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
                    <strong>{word.word}</strong>
                    <small>{word.phonetic} · {word.partOfSpeech}</small>
                  </td>
                  <td className="cell-seg">{splitNodes}</td>
                  <td className="cell-def">{word.modernMeaningCn}</td>
                  <td className="cell-action"><span className="result-study" aria-hidden="true">学习 →</span></td>
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr><td colSpan={4} className="empty-row">没有匹配的单词。</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
  const searchResults = useMemo(() => {
    if (!trimmed) return []
    return words
      .filter((word) => word.word.toLowerCase().includes(trimmed.toLowerCase()) || word.modernMeaningCn.includes(trimmed))
      .slice(0, 50)
  }, [trimmed])

  const study = (wordId: string) => onStudyWord?.(wordId)

  if (selectedRootId) {
    return <RootDetailView rootId={selectedRootId} onBack={() => onSelectRoot(null)} onStudyWord={(id) => study(id)} />
  }

  if (trimmed && searchResults.length > 0) {
    return (
      <section className="page-section atlas-page">
        <button type="button" className="back-link" onClick={() => { setInputValue(''); setCommittedQuery('') }}>← 返回词根地图</button>
        <div className="section-heading">
          <div><h2>搜索「{trimmed}」</h2><p>命中 {searchResults.length} 个单词，点卡片看它属于哪个词根的全部单词。</p></div>
        </div>
        <ul className="search-results">
          {searchResults.map((word) => {
            const rootId = getRootId(word, getMorpheme)
            const root = getMorpheme(rootId)
            return (
              <li key={word.id}>
                <button type="button" className="search-result" onClick={() => onSelectRoot(rootId)}>
                  <span className="result-word"><strong>{word.word}</strong><small>{word.phonetic}</small></span>
                  <span className="result-def">{word.modernMeaningCn}</span>
                  <span className={`morpheme-chip ${root.color}`}>{root.displayText}</span>
                  {study && <span className="result-study" onClick={(event) => { event.stopPropagation(); study(word.id) }}>学习 →</span>}
                </button>
              </li>
            )
          })}
        </ul>
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

function getStabilityBandLabel(stability: number): string {
  if (stability >= 80) return '很熟了'
  if (stability >= 50) return '比较熟了'
  if (stability >= 25) return '在复习'
  return '刚开始'
}
