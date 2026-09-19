import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../src/data/settings'

/** Node 环境没有 localStorage，这里给一个内存版，模拟浏览器行为。 */
function installMemoryStorage() {
  const mem = new Map<string, string>()
  const storage = {
    getItem: (key: string) => (mem.has(key) ? mem.get(key)! : null),
    setItem: (key: string, value: string) => void mem.set(key, value),
    removeItem: (key: string) => void mem.delete(key),
  }
  ;(globalThis as { localStorage?: Storage }).localStorage = storage as unknown as Storage
  return mem
}

describe('settings', () => {
  let mem: Map<string, string>
  beforeEach(() => { mem = installMemoryStorage() })
  afterEach(() => { delete (globalThis as { localStorage?: Storage }).localStorage })

  it('没有存档时返回默认值', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('save 之后 load 能还原同一份设置', () => {
    const next: Settings = { soundEnabled: false }
    saveSettings(next)
    expect(loadSettings()).toEqual(next)
    // 旧 key 之外的字段会被默认值补齐，不会因为漏字段而崩溃。
    mem.set('rd:settings', JSON.stringify({ soundEnabled: false }))
    expect(loadSettings()).toEqual({ soundEnabled: false })
  })

  it('存档损坏时不抛错，退回默认', () => {
    mem.set('rd:settings', '{这不是合法 json')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })
})
