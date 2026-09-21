/**
 * 兜底词典：查不在词根词库里的词——调同源的 /Dict.aspx（ASP.NET 接口，POST word=xxx），
 * 拿回「音标 + 中文释义」；查不到时接口会返回前缀建议。任何异常都静默降级。
 *
 * 部署环境（IIS，站点根=dist）下 /Dict.aspx 与前端同源，直接 POST 即可；
 * 本地 npm run dev 时没有 ASP.NET，会降级为「没找到」，不影响主流程。
 */
export type DictEntry = { word: string; phonetic: string; meaning: string }
export type DictResult = { entry: DictEntry | null; suggestions: DictEntry[] }

const ENDPOINT = '/Dict.aspx'

export async function lookupDict(word: string): Promise<DictResult> {
  const q = word.trim()
  if (!q) return { entry: null, suggestions: [] }
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ word: q }).toString(),
    })
    if (!res.ok) return { entry: null, suggestions: [] }
    const data = await res.json() as {
      found?: boolean
      word?: string
      phonetic?: string
      meaning?: string
      suggestions?: DictEntry[]
    }
    if (data.found) {
      return { entry: { word: data.word ?? q, phonetic: data.phonetic ?? '', meaning: data.meaning ?? '' }, suggestions: [] }
    }
    return { entry: null, suggestions: Array.isArray(data.suggestions) ? data.suggestions : [] }
  } catch {
    return { entry: null, suggestions: [] }
  }
}
