/**
 * 多端同步（M6）远端适配器：把学习档案推到 / 拉取自 Supabase。
 * 纯 fetch 实现，不引入额外依赖；只有当 .env 里配了 VITE_SUPABASE_URL 与
 * VITE_SUPABASE_ANON_KEY 才真正联网，否则 isCloudConfigured() 为 false，调用方应跳过。
 *
 * 远端表（Postgres）约定：
 *   create table profiles (
 *     id text primary key,
 *     data jsonb not null,
 *     updated_at timestamptz not null default now()
 *   );
 * 开启 RLS 时，anonymous key 需配策略允许按 id upsert / select 自己这条。
 */
import type { PlayerProfile } from '../domain/types'
import { serializeProfile } from '../domain/persistence'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const USER_ID_KEY = 'rd:cloudUserId'

export function isCloudConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

function getUserId(): string {
  try {
    const existing = window.localStorage.getItem(USER_ID_KEY)
    if (existing) return existing
    const id = `local-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())}`
    window.localStorage.setItem(USER_ID_KEY, id)
    return id
  } catch {
    return 'anonymous'
  }
}

/** 把当前档案推到远端；未配置或网络失败时返回 false，调用方静默降级到本地。 */
export async function pushProfile(profile: PlayerProfile): Promise<boolean> {
  if (!isCloudConfigured() || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ id: getUserId(), data: JSON.parse(serializeProfile(profile)), updated_at: new Date().toISOString() }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** 从远端拉取档案；未配置 / 网络失败 / 没有记录时返回 null。 */
export async function pullProfile(): Promise<PlayerProfile | null> {
  if (!isCloudConfigured() || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(getUserId())}&select=data`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    })
    if (!res.ok) return null
    const rows = (await res.json()) as Array<{ data: unknown }>
    if (!rows.length) return null
    return JSON.parse(JSON.stringify(rows[0].data)) as PlayerProfile
  } catch {
    return null
  }
}
