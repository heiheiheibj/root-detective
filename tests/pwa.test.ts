import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * PWA 的三个零件散在不同位置（public/ 的 manifest 与 sw.js、根目录的 index.html、
 * src/main.tsx 里的注册逻辑），任何一个漏改动都不会报错，只会「装上不像 App」。
 * 这里用静态检查把它们串起来：字段齐全、图标文件真在、html 有引用、注册被打上生产环境守卫。
 */
const repoRoot = new URL('..', import.meta.url)
const read = (relative: string) => readFileSync(new URL(relative, repoRoot), 'utf8')

const manifest = JSON.parse(read('public/manifest.webmanifest'))
const indexHtml = read('index.html')
const mainTsx = read('src/main.tsx')
const serviceWorker = read('public/sw.js')

describe('PWA 配置', () => {
  it('manifest 具备安装所需的必填字段', () => {
    expect(manifest.name).toBeTruthy()
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.start_url).toBe('./')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.length).toBeGreaterThan(0)
  })

  it('manifest 里声明的图标文件真实存在', () => {
    for (const icon of manifest.icons) {
      expect(() => read(`public/${icon.src.replace('./', '')}`), `图标 ${icon.src} 不存在`).not.toThrow()
    }
  })

  it('index.html 引用了 manifest 并声明了 theme-color', () => {
    expect(indexHtml).toMatch(/<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"/)
    expect(indexHtml).toMatch(/<meta\s+name="theme-color"/)
  })

  it('Service Worker 覆盖安装、激活、拦截三类事件', () => {
    for (const event of ['install', 'activate', 'fetch']) {
      expect(serviceWorker).toContain(`addEventListener('${event}'`)
    }
  })

  it('Service Worker 带版本号，且上线后可以靠它清掉旧缓存', () => {
    expect(serviceWorker).toMatch(/const CACHE_VERSION = '[^']+'/)
    // activate 里必须按版本号清理；只增不清理会让用户一直吃旧资源。
    expect(serviceWorker).toContain('caches.delete(key)')
  })

  it('只在生产构建注册 Service Worker，避免干扰 Vite HMR', () => {
    expect(mainTsx).toContain("navigator.serviceWorker.register('/sw.js')")
    expect(mainTsx).toMatch(/import\.meta\.env\.PROD\s+&&\s+'serviceWorker' in navigator/)
  })
})
