/*
 * Service Worker：让「首次联网打开之后」断网也能继续学。
 *
 * 缓存策略
 * - 导航请求（打开页面）：网络优先，断网时退回缓存里的 index.html。
 * - 其余同源 GET：缓存优先，没有才请求网络并把响应写回缓存。
 *
 * 内容怎么被缓存：词素/世界/词条索引由 data.ts 内联进主包（构建产物自带 hash），
 * 词条例外——它们按 detail 分片动态 import，第一次打开某个词时才拉对应分片。
 * 所以「打开过的词」断网后能继续加载；没打开过的分片仍需联网。
 *
 * 改完这里要动 CACHE_VERSION，否则老版本缓存不会被清掉。
 */
const CACHE_VERSION = 'v2'
const SHELL_CACHE = `rootdetective-shell-${CACHE_VERSION}`
const RUNTIME_CACHE = `rootdetective-runtime-${CACHE_VERSION}`
const SHELL_URLS = ['./', './index.html', './manifest.webmanifest', './favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // 单个资源失败不能让整个 install 失败，否则 SW 装不上、永远离线不了。
      await Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => undefined)))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE).map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request)
        } catch {
          const cache = await caches.open(SHELL_CACHE)
          const fallback = (await cache.match('./index.html')) ?? (await cache.match('./'))
          if (fallback) return fallback
          return new Response('离线且没有缓存可用', { status: 503, statusText: 'Offline' })
        }
      })(),
    )
    return
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE)
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      // 只缓存同源基础响应；opaque 响应（跨域）体积不可知，不往里放。
      if (response.ok && response.type === 'basic') cache.put(request, response.clone())
      return response
    })(),
  )
})
