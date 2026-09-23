/**
 * 浏览历史：记录用户最近打开查看过的词条。
 * 存在浏览器 localStorage，纯本地、不进学习档案、不同步云端——
 * 它只是个「刚才看过什么」的便利入口，丢了也无所谓。
 */
const STORAGE_KEY = 'rootdeck-history-v1'
const MAX_ENTRIES = 200

export type HistoryEntry = { id: string; ts: number }

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : []
  } catch {
    return []
  }
}

/** 记录一次浏览。同一个词重复看只保留最新一条（置顶），不会刷屏。 */
export function recordHistory(id: string): void {
  if (!id) return
  const next = loadHistory().filter((entry) => entry.id !== id)
  next.unshift({ id, ts: Date.now() })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, MAX_ENTRIES)))
  } catch {
    /* 隐私模式或空间不足时静默降级，不影响主流程 */
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
