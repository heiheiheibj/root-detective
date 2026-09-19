import { describe, expect, it } from 'vitest'
import type { WordCore } from '../src/domain/types'
import { getWordCore } from '../src/domain/data'
import { describeWordParts } from '../src/views/atlas'

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
