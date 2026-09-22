import { beforeAll, describe, expect, it } from 'vitest'
import { canOpenAsRoot, compoundWordsForPart, getCompoundState, loadCompoundData, searchCompoundWords } from '../src/domain/compounds'
import { words } from '../src/domain/data'

/** 直接读产物，用来校验生成脚本的清洗规则（不走内存缓存）。 */
async function loadPayload() {
  const module = await import('../src/domain/content/compounds.json')
  return (module.default ?? module) as unknown as { words: string[][] }
}

describe('复合词内容层（词根地图的第二层）', () => {
  beforeAll(async () => {
    await loadCompoundData()
  })

  it('构建产物存在且能加载', () => {
    expect(getCompoundState()).toBe('ready')
  })

  it('每条拆法都拼得回原词，且不含空行', async () => {
    const { words: rows } = await loadPayload()
    expect(rows.length).toBeGreaterThan(3000)
    const broken = rows.filter((row) => row[3] + row[4] !== row[0] || row.length !== 5)
    expect(broken).toEqual([])
  })

  it('释义已去噪：无域标注、无词性前缀、不为空', async () => {
    const { words: rows } = await loadPayload()
    const dirty = rows.filter((row) => /[[\]]/.test(row[2]) || /^[a-z]{1,4}[.．]/.test(row[2]) || !row[2].trim())
    expect(dirty.map((row) => row[0])).toEqual([])
  })
})

describe('词根页取复合词', () => {
  beforeAll(async () => {
    await loadCompoundData()
  })

  it('ball 名下补出词库之外的那批（eyeball / ballroom…）', () => {
    const list = compoundWordsForPart('ball').map((entry) => entry.word)
    expect(list.length).toBeGreaterThan(20)
    expect(list).toContain('eyeball')
    expect(list).toContain('ballroom')
    expect(list).toContain('fireball')
  })

  it('词库已有的词不重复列（baseball 走上面那张表）', () => {
    const library = new Set(words.map((word) => word.word.toLowerCase()))
    expect(library.has('baseball')).toBe(true)
    const list = compoundWordsForPart('ball')
    expect(list.map((entry) => entry.word)).not.toContain('baseball')
    expect(list.filter((entry) => library.has(entry.word))).toEqual([])
  })

  it('零件大小写不敏感，且没有这个词的零件返回空数组', () => {
    expect(compoundWordsForPart('BALL').map((e) => e.word)).toEqual(compoundWordsForPart('ball').map((e) => e.word))
    expect(compoundWordsForPart('绝对不存在的零件')).toEqual([])
  })

  it('零件能否点进自己的词根页，跟词库一致', () => {
    expect(canOpenAsRoot('ball')).toBe(true)
    expect(canOpenAsRoot('BALL')).toBe(true)
    // eye 在词典里是词，但不在词素表里，所以点它没地方去
    expect(canOpenAsRoot('eye')).toBe(false)
  })
})

describe('复合词搜索', () => {
  beforeAll(async () => {
    await loadCompoundData()
  })

  it('按词形和释义都能命中', () => {
    expect(searchCompoundWords('ballroom').map((e) => e.word)).toContain('ballroom')
    expect(searchCompoundWords('眼球').map((e) => e.word)).toContain('eyeball')
  })

  it('空查询返回空数组', () => {
    expect(searchCompoundWords('   ')).toEqual([])
  })

  it('不给词库已有的词重复结果（词库结果走 SearchResults）', () => {
    expect(searchCompoundWords('baseball').map((e) => e.word)).not.toContain('baseball')
  })
})
