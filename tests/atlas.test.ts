import { describe, expect, it } from 'vitest'
import type { WordCore } from '../src/domain/types'
import { getWordCore } from '../src/domain/data'
import { describeWordParts, searchAllWords } from '../src/views/atlas'

const mockWord: WordCore = {
  id: 'x',
  word: 'inspect',
  phonetic: '/ɪnˈspɛkt/',
  partOfSpeech: 'v',
  modernMeaningCn: '检查',
  difficulty: 1,
  parts: [
    { morphemeId: 'in', surface: 'in', position: 0 },
    { morphemeId: 'spect', surface: 'spect', position: 1 },
  ],
}

describe('describeWordParts', () => {
  it('把单词拆成表面片段与每段含义', () => {
    const result = describeWordParts(mockWord, (id) => ({ meaningCn: id === 'in' ? '里' : '看' }))
    expect(result.surfaces).toEqual(['in', 'spect'])
    expect(result.meanings).toEqual(['里', '看'])
  })

  it('真实词条的片段数与 parts 一致', () => {
    const real = getWordCore('circumspect')
    const result = describeWordParts(real)
    expect(result.surfaces.length).toBe(real.parts.length)
    expect(result.meanings.length).toBe(real.parts.length)
  })
})

describe('searchAllWords（全局模糊搜索）', () => {
  it('空查询返回空数组', () => {
    expect(searchAllWords('   ')).toEqual([])
    expect(searchAllWords('')).toEqual([])
  })

  it('按单词拼写子串命中', () => {
    const hits = searchAllWords('vis').map((w) => w.word)
    expect(hits).toContain('vision')
    expect(hits).toContain('visible')
  })

  it('按中文释义命中', () => {
    const hits = searchAllWords('检查').map((w) => w.word)
    expect(hits).toContain('inspect')
  })

  it('支持漏字母的子序列模糊匹配', () => {
    // 输入 vsion（漏了 i）仍能命中 vision
    const hits = searchAllWords('vsion').map((w) => w.word)
    expect(hits).toContain('vision')
  })

  it('不区分大小写', () => {
    const lower = searchAllWords('VIS').map((w) => w.word)
    const upper = searchAllWords('vis').map((w) => w.word)
    expect(lower.sort()).toEqual(upper.sort())
  })
})
