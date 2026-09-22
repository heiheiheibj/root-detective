import { describe, expect, it, vi } from 'vitest'

// 单开一个文件测降级：vitest 每个测试文件模块图独立，这里的 mock 不会污染正常那份用例。
vi.mock('../src/domain/content/compounds.json', () => {
  throw new Error('模拟 chunk 加载失败（断网 / 旧缓存 / 文件缺失）')
})

describe('复合词数据拉不到时的降级', () => {
  it('不抛异常、状态记为 failed、取词与搜索都返回空数组', async () => {
    const { compoundWordsForPart, getCompoundState, loadCompoundData, searchCompoundWords } = await import('../src/domain/compounds')

    await expect(loadCompoundData()).resolves.toBeUndefined()
    expect(getCompoundState()).toBe('failed')
    // 词根表照常显示，只是没有复合词这一节
    expect(compoundWordsForPart('ball')).toEqual([])
    expect(searchCompoundWords('eyeball')).toEqual([])
    // 反复调用不该反复重试（失败只结算一次）
    await expect(loadCompoundData()).resolves.toBeUndefined()
  })
})
