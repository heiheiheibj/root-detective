/**
 * 用户偏好设置，独立于学习档案（重置进度时设置要保留）。
 * 目前只有「发音开关」一项；将来加主题、动画减弱等都从这里扩。
 */
export interface Settings {
  soundEnabled: boolean
  /** 云同步（Supabase）：开启后进度会在本地保存的同时推送到远端；需配置 VITE_SUPABASE_* 环境变量才真正生效。 */
  cloudSyncEnabled: boolean
}

export const DEFAULT_SETTINGS: Settings = { soundEnabled: true, cloudSyncEnabled: false }

const STORAGE_KEY = 'rd:settings'

function storage(): Storage | undefined {
  return (globalThis as { localStorage?: Storage }).localStorage
}

export function loadSettings(): Settings {
  try {
    const raw = storage()?.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    // 档案坏了不该让页面打不开，设置同理：退回默认。
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 隐私模式写不进也不影响使用。
  }
}
