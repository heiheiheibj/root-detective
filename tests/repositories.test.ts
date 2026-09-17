import { describe, expect, it } from 'vitest'
import { createInitialProfile, words, wordsByRoot, worlds } from '../src/domain/data'
import { loadProfile, PROFILE_VERSION } from '../src/domain/persistence'
import { audioRepository, contentRepository, progressRepository } from '../src/data/repositories'

/**
 * Repository 这层是「将来换成 Supabase 适配器时唯一要动的地方」，
 * 所以这里锁的是契约本身：不与具体实现绑定，但行为要稳定。
 */
describe('repository 本地适配器', () => {
  it('contentRepository 直接复用词库模块，不另外复制一份数据', () => {
    // 用 toBe 而不是 toEqual：几 MB 的词库要是被引擎分叉成两份，内存直接翻倍。
    expect(contentRepository.words).toBe(words)
    expect(contentRepository.wordsByRoot).toBe(wordsByRoot)
    expect(contentRepository.worlds).toBe(worlds)
  })

  it('getWordCore 查得到真实词条，查不到时按既有约定兜底并告警', () => {
    const known = words[0]
    expect(contentRepository.getWordCore(known.id)).toBe(known)
    // 兜底沿用 data.ts 的行为（返回第一个词），这里只保证不返回 undefined，
    // 因为 App 的调用点没处理 undefined。
    expect(contentRepository.getWordCore('绝对不存在的词')).toBeTruthy()
  })

  it('serialize 出来的字符串能被 loadProfile 还原成同一份档案', () => {
    const profile = createInitialProfile()
    const restored = loadProfile(progressRepository.serialize(profile))
    expect(restored).toEqual(profile)
  })

  it('read/save 无论底层存储是否可用都不上抛异常', () => {
    // node 环境没有 localStorage，jsdom 环境有：两种情况下页面都不能崩。
    expect(() => {
      const profile = progressRepository.read()
      progressRepository.save(profile)
    }).not.toThrow()
  })

  it('档案读不出来时退回干净的新档案，而不是空对象', () => {
    const profile = progressRepository.read()
    expect(profile.version).toBe(PROFILE_VERSION)
    expect(Array.isArray(profile.progress)).toBe(true)
  })

  it('audioRepository 在没有语音能力的环境返回 false，而不是抛错', () => {
    if (audioRepository.canSpeak()) {
      expect(audioRepository.speak('test')).toBeTypeOf('boolean')
    } else {
      expect(audioRepository.speak('test')).toBe(false)
    }
  })
})
