import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { normalizeMorphemeKey } from './domain/contentRules'
import nonTeachingRoots from './domain/content/non-teaching-roots.json'
import { audioRepository, contentRepository, progressRepository } from './data/repositories'
import { createInitialProfile } from './domain/data'
import { computeAchievements, getUnlockedCount } from './domain/achievements'
import { deriveStats } from './domain/profileStats'
import { loadSettings, saveSettings, type Settings } from './data/settings'
import { applyCompletedCase, applyIncorrectAttempt, applyMatchReview, assimilationHint, createMetaphorDiagnosis, createSplitDiagnosis, getContinuationMode, getCurrentStreak, getLevelInfo, getLocalDayKey, getMistakeEventId, getReviewBoard, getReviewQueue, getRootId, getStabilityBand, isDuplicateSubmit, isSplitCorrect, pickNextWord, shuffledMetaphorOptions, shuffle } from './domain/logic'
// 按需分割：这三个视图与帮助浮层的代码从首屏包移出，用到时才下载（都来自同一 chunk，只请求一次）
const AtlasView = lazy(() => import('./views/atlas').then((m) => ({ default: m.AtlasView })))
const SearchView = lazy(() => import('./views/atlas').then((m) => ({ default: m.SearchView })))
const RootWordsTable = lazy(() => import('./views/atlas').then((m) => ({ default: m.RootWordsTable })))
const HelpOverlay = lazy(() => import('./HelpOverlay'))
import { isCloudConfigured, pushProfile } from './data/cloud'
import { loadProfile } from './domain/persistence'
import { loadHistory, recordHistory, clearHistory, type HistoryEntry } from './data/history'

// 页面只认 repository 接口：把接口成员解构成本文件一直在用的那些名字，
// 调用点一个字都不用改，将来换成 Supabase 适配器时这里也不用动。
const { createRootProgress, findMorpheme, getFamilyWords, getMorpheme, getWordCore, getWordDetailSync, loadWordDetail, words, wordsByRoot } = contentRepository

// 结构性缺门的词根（家族里连一个入门词都没有）：到期了也排在队列最后，见 logic.getReviewQueue。
const DEPRIORITIZED_ROOTS = new Set<string>(nonTeachingRoots.demotedRootIds)
import type { CaseMode, CaseRun, DebugDiagnosis, Morpheme, PlayerProfile, PuzzleStage, RewardSummary, ReviewProgress, Word, WordCore, WordDetail } from './domain/types'

const navItems = [
  { id: 'today', label: '今天', icon: '⌁' },
  { id: 'case', label: '拼单词', icon: '▣' },
  { id: 'regression', label: '复习', icon: '↻' },
  { id: 'weak', label: '错词', icon: '✕' },
  { id: 'history', label: '历史', icon: '🕘' },
  { id: 'atlas', label: '词根地图', icon: '◈' },
  { id: 'stats', label: '统计', icon: '◳' },
  { id: 'achievements', label: '成就', icon: '★' },
  { id: 'settings', label: '设置', icon: '⚙' },
]

const visibleSteps = [
  { key: 'build', label: '拼单词' },
  { key: 'forge', label: '猜词义' },
  { key: 'reward', label: '看结果' },
] as const

/** 连续答错到第几次后，提示里直接给出正确答案 */
const ASSIST_AFTER_ATTEMPTS = 2

const stageCopy: Record<PuzzleStage, { eyebrow: string; description: string }> = {
  build: { eyebrow: '第一步 · 拼单词', description: '从下面的卡片里，点出组成这个词的部分。' },
  forge: { eyebrow: '第二步 · 猜词义', description: '已经拼出来了。猜猜它今天是什么意思。' },
  reward: { eyebrow: '第三步 · 看结果', description: '这个词已经记到词根的熟练度里了。' },
}

function difficultyLabel(difficulty: Word['difficulty']) {
  return difficulty === 1 ? '简单' : difficulty === 3 ? '一般' : '有点难'
}

function makeCaseRun(wordId: string, mode: CaseMode, profile: PlayerProfile, originMode?: CaseMode): CaseRun {
  const word = getWordCore(wordId)
  const rootId = getRootId(word, getMorpheme)
  const current = profile.progress.find((item) => item.morphemeId === rootId)
  const normalizedMode = mode === 'debugger' ? 'debugger' : mode
  return { id: `${normalizedMode}-${wordId}-${Date.now()}`, wordId, rootId, mode: normalizedMode, originMode: originMode === 'regression' ? 'regression' : originMode === 'compiler' ? 'compiler' : undefined, wasNewWord: !current?.testedWordIds.includes(wordId), hadMistake: false, startedStability: current?.stability ?? 0 }
}

function App() {
  const [profile, setProfile] = useState<PlayerProfile>(() => {
    return progressRepository.read()
  })
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  function updateSettings(next: Settings) {
    setSettings(next)
    saveSettings(next)
  }
  // 发音开关：关掉后所有喇叭按钮都变灰，等价于没有朗读能力。
  const effectiveAudio = settings.soundEnabled
    ? audioRepository
    : { canSpeak: () => false, speak: () => false }
  const cloudConfigured = isCloudConfigured()
  const [activeView, setActiveView] = useState('today')
  // 词根地图里当前展开的词根详情；提升到这层，这样从详情页去学一个词再回来仍停在原词根（直接学习线保留上下文）。
  const [atlasRootId, setAtlasRootId] = useState<string | null>(null)
  // 侧栏/底部导航再点一次「词根地图」时用它强制重挂载：清掉词根详情与页内搜索的残留状态，回到地图首页
  const [atlasResetKey, setAtlasResetKey] = useState(0)
  // 刚从词根表直接学完的那个词；学完回到词根表时让它高亮并滚动到视口。
  const [lastStudiedWordId, setLastStudiedWordId] = useState<string | null>(null)
  // 听写模式：拼词时遮住单词拼写，只放发音，逼用户回忆怎么拼。
  const [maskWord, setMaskWord] = useState(false)
  // 侧边栏全局搜索词；回车或点搜索才提交为结果页的检索词。
  const [searchQuery, setSearchQuery] = useState('')
  const [wordId, setWordId] = useState('circumspect')
  const [stage, setStage] = useState<PuzzleStage>('build')
  const [selected, setSelected] = useState<string[]>([])
  const [buildFeedback, setBuildFeedback] = useState<'idle' | 'wrong'>('idle')
  const [buildAttempts, setBuildAttempts] = useState(0)
  const [forgeChoice, setForgeChoice] = useState<number | null>(null)
  const [forgeFeedback, setForgeFeedback] = useState<'idle' | 'wrong' | 'correct'>('idle')
  const [forgeAttempts, setForgeAttempts] = useState(0)
  const [caseRun, setCaseRun] = useState<CaseRun>(() => makeCaseRun('circumspect', 'compiler', profile))
  const [diagnosis, setDiagnosis] = useState<DebugDiagnosis | null>(null)
  const [rewardSummary, setRewardSummary] = useState<RewardSummary | null>(null)
  const [toast, setToast] = useState('')
  const [helpOpen, setHelpOpen] = useState(() => !profile.helpSeen)
  const seenEventIds = useRef(new Set<string>())
  // 猜义选项在词条详情就绪后由下面的 useEffect 生成；首帧详情还没到，先空着。
  const [shuffledOptions, setShuffledOptions] = useState<Array<{ text: string; correct: boolean }>>([])

  // 词根涨到几百条后档案序列化有好几十 KB，每次 setState 都写会卡手；停手 500ms 再落盘。
  const latestProfile = useRef(profile)
  latestProfile.current = profile
  function writeProfile() {
    const snapshot = latestProfile.current
    progressRepository.save(snapshot)
    // 云同步开启且已配置 Supabase 时，本地落盘后顺手推一份到远端；失败静默降级。
    if (settings.cloudSyncEnabled && isCloudConfigured()) void pushProfile(snapshot)
  }
  useEffect(() => {
    const timer = window.setTimeout(writeProfile, 500)
    return () => window.clearTimeout(timer)
  }, [profile])
  useEffect(() => {
    // 关标签页时补写没落盘的那一次，否则最后 500ms 内学到的进度会丢。
    window.addEventListener('pagehide', writeProfile)
    return () => { window.removeEventListener('pagehide', writeProfile); writeProfile() }
  }, [])

  // 词条分两层：索引层同步可得；详情分片懒加载，就绪前 word 为 null，拼词区渲染占位。
  const { word, failed: wordFailed } = useWord(wordId)
  const root = getMorpheme(caseRun.rootId || (word ? getRootId(word, getMorpheme) : ''))
  // 词根涨到几百条后，逐个 find 会把地图页变成 O(world×root×progress)；先建一次 Map 传下去。
  const progressByRoot = useMemo(() => new Map(profile.progress.map((item) => [item.morphemeId, item])), [profile.progress])
  const currentProgress = progressByRoot.get(root.id) ?? createRootProgress(root.id)
  const reviewQueue = useMemo(() => getReviewQueue(profile.progress, undefined, { deprioritizedRootIds: DEPRIORITIZED_ROOTS }), [profile.progress])
  const availableCards = useMemo(() => (word ? getAvailableCards(word) : []), [word])
  const family = useMemo(() => (word ? getFamilyWords(word) : []), [word])
  const hint = useMemo(() => (word ? assimilationHint(word, getMorpheme) : null), [word])
  const levelInfo = getLevelInfo(profile.xp)
  const currentStreak = getCurrentStreak(profile.activityDays)
  const completedSet = useMemo(() => new Set(profile.completedWordIds), [profile.completedWordIds])

  // 详情一到就生成猜义选项；换词后 word 变化时同样会重算一次。
  useEffect(() => {
    if (word) setShuffledOptions(shuffledMetaphorOptions(word))
  }, [word])

  function chooseWord(nextWordId: string, mode: CaseMode = 'compiler', originMode?: CaseMode, masked = false) {
    const stableMode = mode === 'debugger' ? originMode === 'regression' ? 'regression' : 'compiler' : mode
    recordHistory(nextWordId)
    setWordId(nextWordId)
    setCaseRun(makeCaseRun(nextWordId, mode, profile, stableMode))
    setMaskWord(masked)
    setDiagnosis(null)
    setStage('build')
    setSelected([])
    setBuildFeedback('idle')
    setBuildAttempts(0)
    setForgeChoice(null)
    setForgeFeedback('idle')
    setForgeAttempts(0)
    setRewardSummary(null)
    setActiveView('case')
  }

  function startFirstWord() {
    chooseWord('circumspect')
  }

  /** 听写练习：从已学过的词里随机抽一个（没学过就随便抽），遮住拼写只放发音，逼用户回忆怎么拼。 */
  function startDictation() {
    const pool = profile.completedWordIds.length > 0 ? profile.completedWordIds : words.map((item) => item.id)
    const pick = pool[Math.floor(Math.random() * pool.length)]
    chooseWord(pick, 'compiler', undefined, true)
  }

  /** 首页搜索提示里的「试试搜 environmental」：直接跳到搜索结果页。 */
  function startSearch(query: string) {
    setSearchQuery(query)
    setActiveView('search')
  }

  /** 清空进度：保留发音等设置，只丢学习数据。危险操作，确认在 SettingsView 里完成。 */
  function handleResetProgress() {
    setProfile({ ...createInitialProfile(), helpSeen: profile.helpSeen })
  }

  /** 导出进度：把当前学习档案序列化成 JSON 下载，Supabase 没接之前用来备份。 */
  function handleExportProgress() {
    const json = progressRepository.serialize(profile)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `rootdeck-progress-${getLocalDayKey(new Date())}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  /** 导入进度：读用户选的 JSON 备份，校验后整体替换当前档案。 */
  function handleImportProgress(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = loadProfile(String(reader.result))
        setProfile(imported)
        setToast('进度已导入')
        window.setTimeout(() => setToast(''), 2800)
      } catch {
        setToast('导入失败：文件不是有效的进度备份')
        window.setTimeout(() => setToast(''), 2800)
      }
    }
    reader.readAsText(file)
  }

  /** 切换云同步开关（真正联网推送仍要求已配置 Supabase）。 */
  function handleToggleCloud(on: boolean) {
    updateSettings({ ...settings, cloudSyncEnabled: on })
  }

  /** 手动把当前进度推到云端（设置里「立即同步」用）。 */
  function handleSyncNow() {
    if (!cloudConfigured) {
      setToast('未配置 Supabase，无法同步')
      window.setTimeout(() => setToast(''), 2800)
      return
    }
    void pushProfile(profile).then((ok) => {
      setToast(ok ? '已同步到云端' : '同步失败，稍后重试')
      window.setTimeout(() => setToast(''), 2800)
    })
  }

  function closeHelp() {
    setHelpOpen(false)
    setProfile((current) => ({ ...current, helpSeen: true }))
  }

  function startFromHelp() {
    closeHelp()
    startFirstWord()
  }

  /**
   * 导航切换。点到「词根地图」时必须一并复位：否则若当前正处于某个词根详情页
   * （activeView 已是 atlas），只切 activeView 等于什么都没发生，用户会以为返回按钮失灵。
   */
  function goToView(id: string) {
    setActiveView(id)
    if (id === 'atlas') {
      setAtlasRootId(null)
      setAtlasResetKey((k) => k + 1)
    }
  }

  /** 拼词学完后回到词根表：停在刚学的那个词根，并让刚学的词高亮定位。 */
  function backToAtlas() {
    setAtlasRootId(caseRun.rootId)
    setActiveView('atlas')
  }

  /** 今天页主按钮：文案是「先复习」就该真去复习，是「接着学」就该接着学。 */
  function startTodayPrimary() {
    if (!profile.onboardingCompleted) return startFirstWord()
    if (reviewQueue.length > 0) return setActiveView('regression')
    nextWord()
  }

  function selectCard(id: string) {
    if (stage !== 'build' || !word) return
    setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : items.length >= word.parts.length ? items : [...items, id])
    setBuildFeedback('idle')
    setDiagnosis(null)
  }

  /** 检查拼写。答错原地提示，不换页面。 */
  function submitBuild() {
    if (!word) return
    if (isSplitCorrect(word, selected)) {
      setDiagnosis(null)
      setBuildFeedback('idle')
      setStage('forge')
      return
    }
    setBuildFeedback('wrong')
    setBuildAttempts((count) => count + 1)
    setDiagnosis(createSplitDiagnosis(word, selected, getMorpheme))
    setCaseRun((current) => ({ ...current, hadMistake: true }))
    const mistakeEventId = getMistakeEventId(caseRun.id, 'build', selected.join('|'))
    if (!isDuplicateSubmit(mistakeEventId, seenEventIds.current)) {
      setProfile((current) => applyIncorrectAttempt(current, word, getMorpheme))
    }
  }

  function selectForgeOption(index: number) {
    if (stage !== 'forge' || forgeFeedback === 'correct') return
    setForgeChoice(index)
    setForgeFeedback('idle')
    setDiagnosis(null)
  }

  /** 确认词义。答错原地重选。 */
  function submitForge() {
    if (forgeChoice === null || !word) return
    const correct = shuffledOptions[forgeChoice]?.correct ?? false
    if (correct) {
      setDiagnosis(null)
      setForgeFeedback('correct')
      return
    }
    setForgeFeedback('wrong')
    setForgeAttempts((count) => count + 1)
    setDiagnosis(createMetaphorDiagnosis(word, forgeChoice, shuffledOptions))
    setCaseRun((current) => ({ ...current, hadMistake: true }))
    const mistakeEventId = getMistakeEventId(caseRun.id, 'forge', String(forgeChoice))
    if (!isDuplicateSubmit(mistakeEventId, seenEventIds.current)) {
      setProfile((current) => applyIncorrectAttempt(current, word, getMorpheme))
    }
  }

  function finishWord() {
    if (!word) return
    const eventId = `${caseRun.id}:complete`
    if (isDuplicateSubmit(eventId, seenEventIds.current)) return
    const result = applyCompletedCase(profile, caseRun, word, getMorpheme)
    setProfile({ ...result.profile, onboardingCompleted: true })
    setRewardSummary(result.reward)
    setStage('reward')
    setDiagnosis(null)
    setLastStudiedWordId(caseRun.wordId)
    setToast(`+${result.reward.xp} 经验 · +${result.reward.insightPoints} 洞察点`)
    window.setTimeout(() => setToast(''), 2800)
  }

  /** 下一个词不能是当前这个，否则「再学一个同词根的词」会原地打转。 */
  function pickSiblingWordId(rootId: string, testedWordIds: string[], currentWordId: string): string {
    const others = (wordsByRoot.get(rootId) ?? []).filter((candidate) => candidate.id !== currentWordId)
    const next = pickNextWord(rootId, testedWordIds, new Map([[rootId, others]]))
    return next?.id ?? words.find((candidate) => candidate.id !== currentWordId)?.id ?? words[0].id
  }

  function nextWord() {
    if (!word) return
    chooseWord(pickSiblingWordId(root.id, currentProgress.testedWordIds, word.id), getContinuationMode(caseRun), undefined, maskWord)
  }

  /** 配对复习结算：熟练度、经验和活动日一次性写回档案。 */
  function finishMatchReview(results: Array<{ rootId: string; correct: boolean }>) {
    const next = applyMatchReview(profile, results)
    setProfile(next)
    const gained = next.xp - profile.xp
    setToast(gained > 0 ? `复习结算 +${gained} 经验` : '复习结算完成')
    window.setTimeout(() => setToast(''), 2800)
    setActiveView('today')
  }

  const navCount = reviewQueue.length
  const weakCount = profile.mistakeWordIds.length
  const navBadge = (id: string) => (id === 'regression' ? navCount : id === 'weak' ? weakCount : 0)
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup"><div className="brand-mark">R</div><div><strong>词根</strong><span>背单词</span></div></div>
      <div className="sidebar-kicker">按词根记单词</div>
      <form className="sidebar-search" onSubmit={(event) => { event.preventDefault(); if (searchQuery.trim()) setActiveView('search') }}>
        <input
          type="search"
          className="sidebar-search-input"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="搜索全部单词…"
          aria-label="搜索全部单词"
        />
        <button type="submit" className="sidebar-search-btn">搜索</button>
      </form>
      <p className="sidebar-search-hint">想知道一个词怎么拼成？输单词就能查：词根或复合词都行（试试 eyeball、ballpark）</p>
      <nav className="main-nav" aria-label="主导航">{navItems.map((item) => <button className={`nav-item ${activeView === item.id ? 'active' : ''}`} aria-current={activeView === item.id ? 'page' : undefined} key={item.id} onClick={() => goToView(item.id)}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>{navBadge(item.id) > 0 && <b className="nav-count">{navBadge(item.id)}</b>}</button>)}</nav>
      <button className="help-button" onClick={() => setHelpOpen(true)}>怎么玩？</button>
      <div className="sidebar-spacer" />
      <div className="streak-card"><div className="streak-top"><span className="eyebrow">连续学习</span><span className="streak-flame" aria-hidden="true">✦</span></div><strong>{currentStreak} <small>天</small></strong><div className="streak-track" role="progressbar" aria-label="连续学习天数" aria-valuemin={0} aria-valuemax={7} aria-valuenow={Math.min(7, currentStreak)}><span style={{ width: `${Math.min(100, currentStreak / 7 * 100)}%` }} /></div><p>{currentStreak >= 7 ? '连着一周了，别断。' : '今天学一个，连续天数就不会断。'}</p></div>
      <div className="profile-button"><span className="avatar" aria-hidden="true">R</span><span><strong>我的进度</strong><small>等级 {levelInfo.level} · {levelInfo.title}</small></span></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><span className="eyebrow">{formatToday()}</span><h1>{activeView === 'search' ? '搜索' : navItems.find((item) => item.id === activeView)?.label ?? '今天'}</h1></div><div className="top-actions"><div className="points"><span className="points-dot" aria-hidden="true">✦</span><strong>{profile.insightPoints}</strong><span>洞察点</span></div></div></header>
      <Suspense fallback={<section className="page-section"><div className="empty-state"><span className="eyebrow">加载中</span><h3>正在装载…</h3></div></section>}>
      {activeView === 'today' && <TodayView profile={profile} levelInfo={levelInfo} currentStreak={currentStreak} reviewCount={navCount} onboardingCompleted={profile.onboardingCompleted} onStart={startTodayPrimary} onContinue={() => setActiveView('case')} onReview={() => setActiveView('regression')} onDictation={startDictation} onSearch={startSearch} />}
      {activeView === 'case' && (word ? <CaseRoom word={word} root={root} currentProgress={currentProgress} diagnosis={diagnosis} stage={stage} selected={selected} availableCards={availableCards} hint={hint} buildFeedback={buildFeedback} buildAttempts={buildAttempts} shuffledOptions={shuffledOptions} forgeChoice={forgeChoice} forgeFeedback={forgeFeedback} forgeAttempts={forgeAttempts} rewardSummary={rewardSummary} family={family} onSelectCard={selectCard} onSubmitBuild={submitBuild} onSelectForge={selectForgeOption} onSubmitForge={submitForge} onFinish={finishWord} onNextWord={nextWord} onReview={() => setActiveView('regression')} onChooseWord={(id) => chooseWord(id, getContinuationMode(caseRun))} maskWord={maskWord} sound={effectiveAudio} onBackToAtlas={backToAtlas} /> : <section className="page-section case-page"><div className="empty-state">{wordFailed ? <><span className="eyebrow">加载失败</span><h3>词条详情没加载出来</h3><p>分片没能取到，重新加载一次试试。</p><button className="primary-button" onClick={() => window.location.reload()}>重新加载</button></> : <><span className="eyebrow">装载中</span><h3>词条详情马上就到</h3><p>详情按需加载，只这一瞬。</p></>}</div></section>)}
      {activeView === 'regression' && <ReviewView profile={profile} onFinishRound={finishMatchReview} />}
      {activeView === 'atlas' && <AtlasView key={atlasResetKey} profile={profile} progressByRoot={progressByRoot} selectedRootId={atlasRootId} onSelectRoot={setAtlasRootId} onStudyWord={(id) => chooseWord(id)} sound={effectiveAudio} completedWordIds={completedSet} highlightWordId={lastStudiedWordId} />}
      {activeView === 'weak' && <WeakView profile={profile} onStudyWord={(id) => chooseWord(id)} sound={effectiveAudio} completedWordIds={completedSet} />}
      {activeView === 'history' && <HistoryView onStudyWord={(id) => chooseWord(id)} sound={effectiveAudio} completedWordIds={completedSet} />}
      {activeView === 'search' && <SearchView query={searchQuery} onBack={() => setActiveView('atlas')} onOpenRoot={(id) => { setAtlasRootId(id); setActiveView('atlas') }} onStudyWord={(id) => chooseWord(id)} sound={effectiveAudio} completedWordIds={completedSet} onPartClick={(p) => setSearchQuery(p)} />}
      {activeView === 'stats' && <StatsView stats={deriveStats(profile)} />}
      {activeView === 'achievements' && <AchievementsView profile={profile} unlockedCount={getUnlockedCount(profile)} />}
      {activeView === 'settings' && <SettingsView settings={settings} onToggleSound={(on) => updateSettings({ ...settings, soundEnabled: on })} onResetProgress={handleResetProgress} onExportProgress={handleExportProgress} onImportProgress={handleImportProgress} onToggleCloud={handleToggleCloud} onSyncNow={handleSyncNow} cloudConfigured={cloudConfigured} />}
      </Suspense>
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      {helpOpen && <Suspense fallback={null}><HelpOverlay onClose={closeHelp} onFinish={startFromHelp} /></Suspense>}
    </main>
    <nav className="bottom-nav" aria-label="底部导航">
      {navItems.map((item) => (
        <button key={item.id} className={`bottom-nav-item ${activeView === item.id ? 'active' : ''}`} aria-current={activeView === item.id ? 'page' : undefined} onClick={() => goToView(item.id)}>
          <span className="nav-icon" aria-hidden="true">{item.icon}</span>
          <span className="bottom-nav-label">{item.label}</span>
          {navBadge(item.id) > 0 && <b className="bottom-nav-count">{navBadge(item.id)}</b>}
        </button>
      ))}
    </nav>
  </div>
}

export default App

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="stat-card"><span className="eyebrow">{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>
}

function StatsView({ stats }: { stats: ReturnType<typeof deriveStats> }) {
  const bandTotal = Math.max(1, stats.rootsTouched)
  const bandRows: Array<[string, number]> = [
    ['刚开始', stats.bandCounts.building],
    ['在复习', stats.bandCounts.reviewing],
    ['比较熟了', stats.bandCounts.transferring],
    ['很熟了', stats.bandCounts.mastered],
  ]
  return (
    <section className="page-section stats-page">
      <div className="section-heading"><div><h2>你的学习概览</h2><p>每次拆词、猜义、复习都会记在这里。</p></div></div>
      <div className="stats-grid">
        <StatCard label="等级" value={`${stats.level}`} sub={stats.levelTitle} />
        <StatCard label="连续学习" value={`${stats.currentStreak}`} sub="天" />
        <StatCard label="已学单词" value={`${stats.wordsCompleted}`} sub="个" />
        <StatCard label="熟词根" value={`${stats.masteredRoots}`} sub={`触及 ${stats.rootsTouched} 个`} />
        <StatCard label="迁移正确率" value={`${stats.migrationRatePercent}%`} sub="举一反三" />
        <StatCard label="待复习" value={`${stats.reviewQueueCount}`} sub="个词根" />
        <StatCard label="待巩固" value={`${stats.weakCount}`} sub="个错词" />
        <StatCard label="世界" value={`${stats.worldsUnlocked}/${stats.worldsTotal}`} sub="已解锁" />
        <StatCard label="洞察点" value={`${stats.insightPoints}`} sub="累计" />
      </div>
      <div className="stats-level">
        <span>距离下一级</span>
        <div className="level-track"><i style={{ width: `${stats.levelProgressPercent}%` }} /></div>
        <small>{stats.nextLevelXp === null ? '已满级' : `还差 ${Math.max(0, stats.nextLevelXp - stats.xp)} 经验`}</small>
      </div>
      <div className="band-breakdown">
        <h3>词根熟练度分布</h3>
        {bandRows.map(([label, count]) => (
          <div className="band-row" key={label}><span>{label}</span><div className="band-track"><i style={{ width: `${Math.round((count / bandTotal) * 100)}%` }} /></div><em>{count}</em></div>
        ))}
      </div>
    </section>
  )
}

function AchievementsView({ profile, unlockedCount }: { profile: PlayerProfile; unlockedCount: number }) {
  const items = computeAchievements(profile)
  return (
    <section className="page-section achievements-page">
      <div className="section-heading"><div><h2>成就</h2><p>解锁条件都来自你真实的学习数据。</p></div><div className="atlas-count"><strong>{unlockedCount}</strong><span>已解锁 / {items.length}</span></div></div>
      <div className="achievements-grid">
        {items.map((item) => (
          <article className={`achievement-card ${item.unlocked ? 'unlocked' : 'locked'}`} key={item.def.id}>
            <span className="achievement-mark" aria-hidden="true">{item.unlocked ? '★' : '☆'}</span>
            <div><strong>{item.def.title}</strong><p>{item.def.description}</p></div>
            <div className="achievement-progress"><i style={{ width: `${Math.round(item.progress * 100)}%` }} /></div>
          </article>
        ))}
      </div>
    </section>
  )
}

function WeakView({ profile, onStudyWord, sound, completedWordIds }: { profile: PlayerProfile; onStudyWord: (id: string) => void; sound?: { canSpeak(): boolean; speak(text: string, lang?: string): boolean }; completedWordIds?: ReadonlySet<string> }) {
  const weakWords = profile.mistakeWordIds
    .map((id) => getWordCore(id))
    .filter((entry): entry is WordCore => Boolean(entry))
  return (
    <section className="page-section weak-page">
      <div className="section-heading"><div><h2>错词本</h2><p>这些词你答错过。点任意一行回去再练一次，学对就自动移出。</p></div><div className="atlas-count"><strong>{weakWords.length}</strong><span>个待巩固</span></div></div>
      {weakWords.length === 0
        ? <div className="empty-state"><span className="eyebrow">干净了</span><h3>暂时没有需要巩固的词</h3><p>答错的词会出现在这里，直到你学对一次。</p></div>
        : <RootWordsTable words={weakWords} onStudyWord={onStudyWord} sound={sound} completedWordIds={completedWordIds} />}
    </section>
  )
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  return `${day} 天前`
}

function HistoryView({ onStudyWord, sound, completedWordIds }: { onStudyWord: (id: string) => void; sound?: { canSpeak(): boolean; speak(text: string, lang?: string): boolean }; completedWordIds?: ReadonlySet<string> }) {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => loadHistory().slice(0, 50))
  function handleClear() {
    clearHistory()
    setEntries([])
  }
  return (
    <section className="page-section history-page">
      <div className="section-heading"><div><h2>浏览历史</h2><p>你最近看过的词，最多保留 50 条。点任意一条回去再学。</p></div><div className="atlas-count"><strong>{entries.length}</strong><span>条记录</span></div></div>
      {entries.length === 0
        ? <div className="empty-state"><span className="eyebrow">还没有</span><h3>暂时没有浏览记录</h3><p>开始学一个词，或者去搜索框查词，记录就会出现在这里。</p></div>
        : <>
            <div className="history-actions"><button type="button" className="secondary-button" onClick={handleClear}>清空历史</button></div>
            <ul className="history-list">
              {entries.map((entry) => {
                const w = getWordCore(entry.id)
                if (!w) return null
                return (
                  <li key={`${entry.id}-${entry.ts}`}>
                    <button className="family-word" onClick={() => onStudyWord(w.id)}>
                      <span className="history-time">{relativeTime(entry.ts)}</span>
                      <span><strong>{w.word}</strong><small>{w.modernMeaningCn}</small></span>
                      <span className="family-arrow">↗</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>}
    </section>
  )
}

function SettingsView({ settings, onToggleSound, onResetProgress, onExportProgress, onImportProgress, onToggleCloud, onSyncNow, cloudConfigured }: { settings: Settings; onToggleSound: (on: boolean) => void; onResetProgress: () => void; onExportProgress: () => void; onImportProgress: (file: File) => void; onToggleCloud: (on: boolean) => void; onSyncNow: () => void; cloudConfigured: boolean }) {
  const [confirming, setConfirming] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  return (
    <section className="page-section settings-page">
      <div className="section-heading"><div><h2>设置</h2><p>发音用浏览器自带的语音合成，不需要联网录音。</p></div></div>
      <div className="settings-list">
        <div className="settings-row">
          <div><strong>发音</strong><p>答题时点击喇叭用浏览器朗读单词和例句。</p></div>
          <button type="button" className={`toggle ${settings.soundEnabled ? 'on' : ''}`} onClick={() => onToggleSound(!settings.soundEnabled)} aria-pressed={settings.soundEnabled}>{settings.soundEnabled ? '开' : '关'}</button>
        </div>
        <div className="settings-row">
          <div><strong>云同步（Supabase）</strong><p>{cloudConfigured ? '已检测到 Supabase 配置，开启后进度会同步到云端，换设备也能接着学。' : '需在项目 .env 里配置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY 才能启用。'}</p></div>
          <div className="row-actions">
            {cloudConfigured && <button type="button" className="secondary-button" onClick={onSyncNow}>立即同步</button>}
            <button type="button" className={`toggle ${settings.cloudSyncEnabled ? 'on' : ''}`} onClick={() => onToggleCloud(!settings.cloudSyncEnabled)} aria-pressed={settings.cloudSyncEnabled} disabled={!cloudConfigured} title={cloudConfigured ? '' : '未配置 Supabase'}>{settings.cloudSyncEnabled ? '开' : '关'}</button>
          </div>
        </div>
        <div className="settings-row">
          <div><strong>备份进度</strong><p>把学习档案导出成 JSON 文件；换新设备或清缓存前先备份。Supabase 同步接入前这是唯一的保全手段。</p></div>
          <div className="row-actions">
            <button type="button" className="secondary-button" onClick={onExportProgress}>导出进度</button>
            <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>导入进度</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onImportProgress(file)
                event.target.value = ''
              }}
            />
          </div>
        </div>
        <div className="settings-row danger">
          <div><strong>清空进度</strong><p>删除所有已学单词、词根熟练度和连续天数，且无法撤销。</p></div>
          {confirming
            ? <div className="confirm-banner"><span>确定清空？</span><button type="button" className="danger-button" onClick={() => { onResetProgress(); setConfirming(false) }}>确定清空</button><button type="button" className="secondary-button" onClick={() => setConfirming(false)}>取消</button></div>
            : <button type="button" className="secondary-button" onClick={() => setConfirming(true)}>清空进度</button>}
        </div>
      </div>
    </section>
  )
}

function formatToday() {
  return new Intl.DateTimeFormat('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
}

/**
 * 词条分两层：索引层同步可得，详情按分片懒加载。详情没到就返回 null，调用方渲染占位；
 * logic.ts 的领域函数拿到的始终是合成好的完整 Word——领域层不知道分层存在。
 * loaded 记下 id：换词的那一帧 core 已是新词、detail 还是旧词，靠 id 校验挡住错配。
 */
function useWord(wordId: string): { word: Word | null; failed: boolean } {
  const core = getWordCore(wordId)
  const [loaded, setLoaded] = useState<{ id: string; detail: WordDetail } | null>(() => {
    const cached = getWordDetailSync(wordId)
    return cached ? { id: wordId, detail: cached } : null
  })
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    const cached = getWordDetailSync(wordId)
    setLoaded(cached ? { id: wordId, detail: cached } : null)
    setFailed(false)
    loadWordDetail(wordId)
      .then((detail) => { if (alive) setLoaded({ id: wordId, detail }) })
      .catch(() => { if (alive) setFailed(true) }) // 不白屏：占位区给「重新加载」
    return () => { alive = false }
  }, [wordId])
  // 合成结果必须引用稳定：每次渲染都造新对象会把「word 变了」的 effect 变成死循环，
  // 猜义选项会被反复重洗。core 来自 wordById、loaded 来自 state，引用都稳定。
  const word = useMemo(
    () => (loaded && loaded.id === core.id ? { ...core, ...loaded.detail } : null),
    [core, loaded],
  )
  return { word, failed }
}

/** 未建模的干扰项（形近变体、同化变体等）用干扰类型作副标题，避免把词形重复显示两遍。 */
const DISTRACTOR_LABELS: Record<Word['distractors'][number]['type'], string> = { form: '长得像，但不是', meaning: '意思像，但不是', random: '这个词用不到' }

/** 卡片只用到这几个字段，所以未建模的干扰项也能凑出一张牌来渲染。 */
type CardMorpheme = Pick<Morpheme, 'id' | 'displayText' | 'type' | 'meaningCn' | 'color'>

/**
 * 干扰项的 text 是指向词素表的软外键。老的切片里允许出现没建模的干扰项（spic、vise），
 * 这里显式判空，而不是把 `getMorpheme` 的兜底混进来——否则一个数据错误会静默画出别的词素。
 */
function getAvailableCards(word: Word) {
  const expected: CardMorpheme[] = word.parts.map((part) => getMorpheme(part.morphemeId))
  // 干扰项只找 id，不找变体：`spic` 是 spec 的变体，若把它解析成 spec 就会画出一张
  // 「看」意思正确的干扰牌，玩家点它反而算对。解析不到就画合成牌，只显示干扰类型。
  const distractors: CardMorpheme[] = word.distractors.map((item) => findMorpheme(normalizeMorphemeKey(item.text))
    ?? { id: normalizeMorphemeKey(item.text), displayText: item.text, type: 'root', meaningCn: DISTRACTOR_LABELS[item.type], color: 'orange' })
  return [...expected.map((morpheme) => ({ morpheme, kind: 'correct' as const })), ...distractors.map((morpheme) => ({ morpheme, kind: 'distractor' as const }))]
}

function TodayView({ profile, levelInfo, currentStreak, reviewCount, onboardingCompleted, onStart, onContinue, onReview, onDictation, onSearch }: { profile: PlayerProfile; levelInfo: ReturnType<typeof getLevelInfo>; currentStreak: number; reviewCount: number; onboardingCompleted: boolean; onStart: () => void; onContinue: () => void; onReview?: () => void; onDictation?: () => void; onSearch?: (query: string) => void }) {
  const actionLabel = !onboardingCompleted ? '开始学第一个词' : reviewCount > 0 ? '先复习' : '接着学'
  return <section className="page-section today-page"><section className="hero-band"><div><h2>先拆词。再猜意思。<em>最后看对不对。</em></h2><p>每个英语单词都能拆成前缀、词根、后缀。拼一遍，就知道它为什么是这个意思。</p></div><div className="case-stamp"><span>已学</span><strong>{String(profile.completedWordIds.length).padStart(4, '0')}<br />个词</strong><small>别怕忘</small></div></section>
    <section className="intro-band">
      <div className="intro-head"><span className="eyebrow">为什么按词根 / 复合词记</span><h3>记「结构」，比死背整词省力得多</h3></div>
      <ul className="intro-benefits">
        <li><b>长词其实有结构</b><p>前缀 + 词根 + 后缀，每一段都有意思。记住几段，就不用对着一长串字母硬背。</p></li>
        <li><b>一个词根串一串词</b><p>认识 spect（看），inspect、respect、circumspect 的意思都好懂——学一个顶一串。</p></li>
        <li><b>复合词也能拆</b><p>两个单词拼成的词（eyeball = eye + ball）拆开看，拼写一下就记住了。</p></li>
      </ul>
      <div className="intro-tip">
        <span className="tip-mark">提示</span>
        <p>遇到不好记的长词？用<button type="button" className="tip-link" onClick={() => onSearch?.('environmental')}>左侧的搜索框</button>搜一下，会给出拆解和释义。比如 <button type="button" className="tip-example" onClick={() => onSearch?.('environmental')}>environmental</button> 看着吓人，但拆成 environ（包围）+ ment（行为 / 结果）+ al，就好记了。</p>
      </div>
    </section>
    {!onboardingCompleted && <div className="onboarding-card"><div><span className="eyebrow">第一次来？</span><h3>三步学会一个词</h3><p>不用背答案。先拼出单词，再猜它的意思，最后对答案。</p></div><div className="briefing-steps"><span><b>01</b>拼单词</span><span><b>02</b>猜词义</span><span><b>03</b>看结果</span></div></div>}<div className="today-grid"><button className="primary-button hero-cta" onClick={onStart}>{actionLabel}<span>→</span></button><button className="secondary-button" onClick={onContinue}>去拼单词</button>{onDictation && <button className="secondary-button" onClick={onDictation}>听写练习 <span>🔊</span></button>}</div><div className="profile-summary"><div><span className="eyebrow">我的进度</span><strong>等级 {levelInfo.level} · {levelInfo.title}</strong><p>{profile.xp} 经验 · 连续学习 {currentStreak} 天</p></div>{reviewCount > 0 ? <button type="button" className="summary-cta" onClick={onReview}><span className="eyebrow">该复习了</span><strong>{reviewCount} 个词根到时间了</strong><p>点这里去复习 · 复习的是词根，不用重背整个单词。</p></button> : <div><span className="eyebrow">该复习了</span><strong>暂时没有</strong><p>学过的词根都还熟着。</p></div>}</div></section>
}

function StepBar({ stage }: { stage: PuzzleStage }) {
  const currentIndex = stage === 'reward' ? visibleSteps.length : visibleSteps.findIndex((step) => step.key === stage)
  return <ol className="case-steps" aria-label="学习步骤">{visibleSteps.map((step, index) => <li className={index === currentIndex ? 'current' : index < currentIndex ? 'done' : ''} key={step.key} aria-current={index === currentIndex ? 'step' : undefined}><span>{index < currentIndex ? '✓' : index + 1}</span><strong>{step.label}</strong><small>{index < currentIndex ? '做完了' : index === currentIndex ? '正在做' : '还没到'}</small></li>)}</ol>
}

function DiagnosisBar({ diagnosis, showAnswer }: { diagnosis: DebugDiagnosis; showAnswer: boolean }) {
  const isBuild = diagnosis.stage === 'build'
  return <aside className="diagnosis-bar" role="status" aria-live="polite"><strong>{diagnosis.title}</strong><p>{diagnosis.summary}</p><span>{diagnosis.fix}</span>{showAnswer && <dl><div><dt>{isBuild ? '你拼的' : '你选的'}</dt><dd>{diagnosis.selected}</dd></div><div><dt>正确答案</dt><dd>{diagnosis.expected}</dd></div></dl>}</aside>
}

function LiteralEquation({ word }: { word: Word }) {
  return <div className="literal-equation">{word.parts.map((part) => <span key={part.position}><b>{getMorpheme(part.morphemeId).meaningCn}</b>{part.position < word.parts.length - 1 && <i>+</i>}</span>)}<i>=</i><strong>{word.literalMeaningCn}</strong></div>
}

function CaseRoom({ word, root, currentProgress, diagnosis, stage, selected, availableCards, hint, buildFeedback, buildAttempts, shuffledOptions, forgeChoice, forgeFeedback, forgeAttempts, rewardSummary, family, onSelectCard, onSubmitBuild, onSelectForge, onSubmitForge, onFinish, onNextWord, onReview, onChooseWord, sound, onBackToAtlas, maskWord = false }: { word: Word; root: ReturnType<typeof getMorpheme>; currentProgress: ReviewProgress; diagnosis: DebugDiagnosis | null; stage: PuzzleStage; selected: string[]; availableCards: ReturnType<typeof getAvailableCards>; hint: string | null; buildFeedback: string; buildAttempts: number; shuffledOptions: Array<{ text: string; correct: boolean }>; forgeChoice: number | null; forgeFeedback: string; forgeAttempts: number; rewardSummary: RewardSummary | null; family: WordCore[]; onSelectCard: (id: string) => void; onSubmitBuild: () => void; onSelectForge: (index: number) => void; onSubmitForge: () => void; onFinish: () => void; onNextWord: () => void; onReview: () => void; onChooseWord: (id: string) => void; sound: { canSpeak(): boolean; speak(text: string, lang?: string): boolean }; onBackToAtlas: () => void; maskWord?: boolean }) {
  const missing = Math.max(0, word.parts.length - selected.length)
  const forged = forgeFeedback === 'correct'
  const stepIndex = stage === 'reward' ? 2 : visibleSteps.findIndex((step) => step.key === stage)
  // 听写模式：遮住拼写只放发音，逼用户回忆怎么拼；reveal 让用户实在想不起时看一眼。
  const [revealSpelling, setRevealSpelling] = useState(false)
  useEffect(() => { setRevealSpelling(false) }, [word.id])
  useEffect(() => {
    if (maskWord && sound.canSpeak()) {
      const timer = window.setTimeout(() => sound.speak(word.word), 350)
      return () => window.clearTimeout(timer)
    }
  }, [word.id, maskWord, sound])
  const masked = stage === 'build' && maskWord && !revealSpelling
  return <section className="workspace-grid case-page"><div className="detective-panel"><div className="panel-head"><div><span className="eyebrow">{stageCopy[stage].eyebrow} · {difficultyLabel(word.difficulty)}</span>{masked ? (<div className="word-line"><button className="sound-button" onClick={() => sound.speak(word.word)} disabled={!sound.canSpeak()} aria-label="再听一次发音">🔊</button><div><span className="eyebrow">听写模式</span><h3>听发音，拼出你听到的词</h3></div></div>) : (<div className="word-line"><h3>{word.word}</h3><button className="sound-button" onClick={() => sound.speak(word.word)} disabled={!sound.canSpeak()} aria-label={`朗读 ${word.word}`} title="听发音">🔊</button></div>)}{!masked && <span className="phonetic">{word.phonetic} · {word.partOfSpeech}</span>}<p className="mode-description">{stageCopy[stage].description}</p></div><span className="progress-pip">{stepIndex + 1} / 3</span></div><StepBar stage={stage}/>{diagnosis && <DiagnosisBar diagnosis={diagnosis} showAnswer={stage === 'build' ? buildAttempts >= ASSIST_AFTER_ATTEMPTS : forgeAttempts >= ASSIST_AFTER_ATTEMPTS} />}
  {stage === 'build' && <div className="stage-content"><div className="instruction"><span className="step-number">01</span><div><strong>点出组成这个词的部分</strong><p>按从左到右的顺序放进方框。点一下放进去，再点一下拿出来。</p></div></div>{masked && <button type="button" className="secondary-button" onClick={() => setRevealSpelling(true)} style={{ marginLeft: 40 }}>看拼写（实在想不起时）</button>}<div className={`assembly-slots ${buildFeedback === 'wrong' ? 'shake' : ''}`} key={`slots-${word.id}-${buildAttempts}`} aria-label="拼装槽">{word.parts.map((_, index) => { const selectedPart = word.parts.find((part) => part.morphemeId === selected[index]); return <div className={`assembly-slot ${selected[index] ? 'filled' : ''}`} key={`${word.id}-slot-${index}`}>{selected[index] ? selectedPart?.surface ?? getMorpheme(selected[index]).displayText : <span>第 {index + 1} 个</span>}</div> })}</div><div className="subhead hand-label"><span>可以用的卡片</span><small>{availableCards.length} 张，有几张是干扰项</small></div><div className="morpheme-grid">{availableCards.map(({ morpheme, kind }, index) => { const isSelected = selected.includes(morpheme.id); return <button key={`${morpheme.id}-${index}`} aria-pressed={isSelected} className={`morpheme-card ${morpheme.color} ${isSelected ? 'selected' : ''} ${kind === 'distractor' ? 'distractor' : ''}`} onClick={() => onSelectCard(morpheme.id)}><span className="card-type">{morpheme.type === 'prefix' ? '前缀' : morpheme.type === 'suffix' ? '后缀' : '词根'}</span><strong>{morpheme.displayText}</strong><small>{morpheme.meaningCn}</small><em>{isSelected ? '已选中' : '未选中'}</em></button> })}</div><div className="hint-row"><span>提示</span>{hint ? <p><strong>拼写会变：</strong>{hint}。</p> : <p>后缀通常决定这个词是名词、动词还是形容词。</p>}</div><button className="primary-button" disabled={missing > 0} onClick={onSubmitBuild}>{missing > 0 ? `还差 ${missing} 个` : '拼好了，看看对不对'} <span>→</span></button></div>}
  {stage === 'forge' && <div className="stage-content inference-stage"><div className="instruction"><span className="step-number">02</span><div><strong>猜猜它现在的意思</strong><p>先把上面每个部分的意思连成一句话，再选最接近的答案。</p></div></div><div className="assembly-slots solved" aria-label="已拼好的部分">{word.parts.map((part, index) => <div className="assembly-slot filled" key={`${word.id}-solved-${index}`}>{part.surface}</div>)}</div><LiteralEquation word={word} />{!forged && <><div className={`option-list ${forgeFeedback === 'wrong' ? 'shake' : ''}`} key={`forge-${word.id}-${forgeAttempts}`}>{shuffledOptions.map((option, index) => { const isSelected = forgeChoice === index; return <button aria-pressed={isSelected} className={`semantic-option ${isSelected ? 'selected' : ''}`} key={option.text} onClick={() => onSelectForge(index)}><span>{String.fromCharCode(65 + index)}</span><strong>{option.text}</strong><b>{isSelected ? '已选择' : '未选择'}</b></button> })}</div><button className="primary-button" disabled={forgeChoice === null} onClick={onSubmitForge}>就选这个 <span>→</span></button></>}{forged && <><div className="reveal-box"><span className="reveal-label">它的意思是</span><h4>{word.modernMeaningCn}</h4><p>{word.metaphorMeaningCn}</p></div><div className="proof-grid"><div><span>这个词怎么来的</span><p>{word.sourceNote}</p></div><div><span>怎么记</span><p>{word.mnemonicNote}</p></div></div><div className="example-box"><span>例句</span><button className="speak-inline" onClick={() => sound.speak(word.exampleEn)} disabled={!sound.canSpeak()}>🔊 听例句</button><p>{word.exampleEn}</p><small>{word.exampleCn}</small></div><button className="primary-button" onClick={onFinish}>学会了 <span>→</span></button></>}</div>}
  {stage === 'reward' && <div className="stage-content reward-stage"><div className="reward-orbit"><span>✦</span><strong>学会<br/>一个</strong></div><span className="eyebrow">看结果</span><h3>你又学会一个带 {root.displayText} 的词。</h3><p>词根 {root.displayText}（{root.meaningCn}）的熟练度从 <strong>{Math.round(rewardSummary?.stabilityBefore ?? currentProgress.stability)}%</strong> 变成 <strong>{Math.round(rewardSummary?.stabilityAfter ?? currentProgress.stability)}%</strong>，现在{getStabilityBand(rewardSummary?.stabilityAfter ?? currentProgress.stability).label}。</p><div className="reward-points"><strong>+{rewardSummary?.xp ?? 0} 经验</strong><span>+{rewardSummary?.insightPoints ?? 0} 洞察点</span></div><div className="reward-breakdown"><span>学完一个词 +{rewardSummary?.baseXp ?? 40}</span>{rewardSummary?.firstAttemptXp ? <span>一次就拼对 +{rewardSummary.firstAttemptXp}</span> : null}{rewardSummary?.migrationXp ? <span>第一次见就学会 +{rewardSummary.migrationXp}</span> : null}{rewardSummary && !rewardSummary.firstAttemptXp && !rewardSummary.migrationXp ? <span>这次只有基础分</span> : null}</div><div className="reward-actions"><button className="primary-button" onClick={onNextWord}>{maskWord ? '再来一个听写' : '再学一个同词根的词'}</button><button className="secondary-button" onClick={onBackToAtlas}>回到词根表 <span>→</span></button><button className="secondary-button" onClick={onReview}>以后再说 <span>→</span></button></div></div>}
  </div><aside className="evidence-panel"><div className="panel-head compact"><div><span className="eyebrow">词根卡</span><h3>这个词的词根</h3></div></div><div className="root-card"><div className="root-card-top"><span className={`morpheme-chip ${root.color}`}>词根</span><span className="level-chip">等级 {root.level}</span></div><p>{root.displayText} = {root.meaningCn}</p><div className="root-bar"><span style={{ width: `${Math.max(8, currentProgress.stability)}%` }}/></div><div className="root-meta"><span>熟练度 {Math.round(currentProgress.stability)}%</span><span>{getStabilityBand(currentProgress.stability).label}</span></div></div><div className="family-section"><div className="subhead"><span>同样带这个词根</span><small>{family.length} 个词</small></div>{family.map((familyWord) => <button className={`family-word ${familyWord.id === word.id ? 'current' : ''}`} key={familyWord.id} onClick={() => onChooseWord(familyWord.id)}><span className="family-status">{familyWord.id === word.id ? '●' : '○'}</span><span><strong>{familyWord.word}</strong><small>{familyWord.modernMeaningCn}</small></span><span className="family-arrow">↗</span></button>)}</div></aside></section>
}

/** 配对复习：左边点单词，右边点意思。配错的那一对记在左边词根头上。 */
function ReviewView({ profile, onFinishRound }: { profile: PlayerProfile; onFinishRound: (results: Array<{ rootId: string; correct: boolean }>) => void }) {
  const [board] = useState(() => getReviewBoard(profile.progress, wordsByRoot))
  const [leftOrder] = useState(() => shuffle(board.map((entry) => entry.rootId)))
  const [rightOrder] = useState(() => shuffle(board.map((entry) => entry.rootId)))
  const [pickedLeft, setPickedLeft] = useState<string | null>(null)
  const [pickedRight, setPickedRight] = useState<string | null>(null)
  const [matched, setMatched] = useState<string[]>([])
  const [wrongPair, setWrongPair] = useState<{ left: string; right: string } | null>(null)
  const [mistakes, setMistakes] = useState<Record<string, number>>({})
  const byRoot = new Map(board.map((entry) => [entry.rootId, entry]))
  const dueCount = board.filter((entry) => entry.due).length
  const allMatched = board.length > 0 && matched.length === board.length
  const results = board.map((entry) => ({ rootId: entry.rootId, correct: (mistakes[entry.rootId] ?? 0) === 0 }))

  function resolve(left: string | null, right: string | null) {
    if (!left || !right) return
    if (left === right) {
      setMatched((current) => [...current, left])
      setPickedLeft(null)
      setPickedRight(null)
      return
    }
    setWrongPair({ left, right })
    setMistakes((current) => ({ ...current, [left]: (current[left] ?? 0) + 1 }))
    window.setTimeout(() => {
      setWrongPair(null)
      setPickedLeft(null)
      setPickedRight(null)
    }, 620)
  }

  function pick(rootId: string, side: 'left' | 'right') {
    if (wrongPair || matched.includes(rootId)) return
    if (side === 'left') {
      setPickedLeft(rootId)
      resolve(rootId, pickedRight)
      return
    }
    setPickedRight(rootId)
    resolve(pickedLeft, rootId)
  }

  const heading = <div className="section-heading"><div><h2>把词和意思配起来。</h2><p>左边点一个单词，右边点它的意思。配错了会记一笔，配对成功的词根熟练度就往上涨。</p></div><div className="queue-total"><strong>{dueCount}</strong><span>个词根到时间了</span></div></div>
  if (board.length === 0) return <section className="page-section review-page">{heading}<div className="empty-state"><span className="eyebrow">暂时没有</span><h3>还没有可以配对的词</h3><p>先学几个词，这里就会摆出配对面板。</p></div></section>

  if (allMatched) return <section className="page-section review-page">{heading}<div className="match-result"><span className="eyebrow">这一轮配完了</span><h3>{results.every((item) => item.correct) ? '全对，一个都没配错。' : '配完了，错的已经记到词根上。'}</h3><ul className="match-summary">{board.map((entry) => <li key={entry.rootId}><span className={`morpheme-chip ${getMorpheme(entry.rootId).color}`}>词根</span><strong>{getMorpheme(entry.rootId).displayText}</strong><span>{getMorpheme(entry.rootId).meaningCn}</span><em>{results.find((item) => item.rootId === entry.rootId)?.correct ? '一次配对成功' : '配错过'}</em></li>)}</ul><button className="primary-button" onClick={() => onFinishRound(results)}>记下来 <span>→</span></button></div></section>

  return <section className="page-section review-page">{heading}<div className="match-board">
    <div className="match-column" role="group" aria-label="单词" style={{ display: 'contents' }}>{leftOrder.map((rootId, index) => { const entry = byRoot.get(rootId); if (!entry) return null; const isMatched = matched.includes(rootId); const isWrong = wrongPair?.left === rootId; return <button className={`match-tile word ${isMatched ? 'matched' : ''} ${isWrong ? 'shake' : ''} ${pickedLeft === rootId ? 'picked' : ''}`} key={rootId} aria-pressed={pickedLeft === rootId} disabled={isMatched} onClick={() => pick(rootId, 'left')} style={{ gridColumn: 1, gridRow: index + 1 }}><small>{getMorpheme(rootId).displayText}</small><strong>{entry.word.word}</strong>{isMatched && <em className="match-mark" aria-hidden="true">✓</em>}</button> })}</div>
    <div className="match-column" role="group" aria-label="意思" style={{ display: 'contents' }}>{rightOrder.map((rootId, index) => { const entry = byRoot.get(rootId); if (!entry) return null; const isMatched = matched.includes(rootId); const isWrong = wrongPair?.right === rootId; return <button className={`match-tile meaning ${isMatched ? 'matched' : ''} ${isWrong ? 'shake' : ''} ${pickedRight === rootId ? 'picked' : ''}`} key={rootId} aria-pressed={pickedRight === rootId} disabled={isMatched} onClick={() => pick(rootId, 'right')} style={{ gridColumn: 2, gridRow: index + 1 }}><strong>{entry.word.modernMeaningCn}</strong>{isMatched && <em className="match-mark" aria-hidden="true">✓</em>}</button> })}</div>
  </div></section>
}


