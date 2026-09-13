import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { morphemes, words } from '../src/domain/data'
import { summarize, validateContent } from '../src/domain/contentRules'

/**
 * 第 13 步的三条关键验收：
 *   (a) 四家族差分测试——切分器对人工作品的差分；
 *   (b) 16 个 canary 词逐字节存活；
 *   (c) 残留白名单只剩 porter 一条。
 * 数据源是管线自己的产物，所以这条测试同时盯着「脚本有没有悄悄改锚点」。
 */
const root = dirname(fileURLToPath(import.meta.url))
const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))

const canaryOverrides = readJson('../scripts/overrides/canary-words.json') as Array<Record<string, unknown>>
const stage1 = readJson('../scripts/lib/stage1-content.json') as {
  canary: string[]
  families: Record<string, { roots: string[]; words: string[] }>
}
const splitsFile = readJson('../scripts/.work/derived/words.splits.json') as {
  words: Array<{ id: string; parts: Array<{ morphemeId: string; surface: string; position: number }> }>
}
const shippedById = new Map(words.map((w) => [w.id, w]))
const splitById = new Map(splitsFile.words.map((w) => [w.id, w]))
const canaryIds = stage1.canary

describe('第 13 步 · Stage 1 关键验收', () => {
  it('(a) 四家族差分：切分器对手写锚点词的切分与人工作品 morphemeId/顺序/表面完全一致', () => {
    // spec/dict/port/vid 是手写 16 词的来源；切分器切得不一样就是切分器的 bug，不是手写版的错。
    const fourFamilies = ['spec', 'dict', 'port', 'vid']
    const targets = canaryIds.filter((id) =>
      fourFamilies.some((fam) => stage1.families[fam]?.words.includes(id)),
    )
    expect(targets).toHaveLength(16)
    for (const id of targets) {
      // 只比有语义的四元组：管线一律写 isAssimilated（false 也在），手写版省略 falsy 键。
      const key = (p: { morphemeId: string; surface: string; position: number; isAssimilated?: boolean }) =>
        `${p.morphemeId}|${p.surface}|${p.position}|${p.isAssimilated ? 1 : 0}`
      const generated = (splitById.get(id)?.parts ?? []).map(key)
      const handwritten = (canaryOverrides.find((w) => w.id === id) as { parts: Array<{ morphemeId: string; surface: string; position: number; isAssimilated?: boolean }> }).parts.map(key)
      expect(generated, `${id} 的切分与手写版不一致`).toEqual(handwritten)
    }
  })

  it('(b) 16 个 canary 词逐字节存活', () => {
    expect(canaryIds).toHaveLength(16)
    for (const override of canaryOverrides) {
      const shipped = shippedById.get(override.id as string)
      expect(shipped, `${override.id} 在产物里丢了`).toBeDefined()
      // data.ts 是 JSON 内联生成的，深相等即逐字节相等。
      expect(JSON.parse(JSON.stringify(shipped)), `${override.id} 与 overrides 不一致`).toEqual(override)
    }
  })

  it('(c) 残留白名单只剩 porter 一条', () => {
    const raw = readJson('../scripts/gates/residue-allowlist.json') as Record<string, string>
    const entries = Object.keys(raw).filter((key) => !key.startsWith('_'))
    expect(entries).toEqual(['porter'])
  })

  it('(d) A28：干扰项不能是元话语或占位符', () => {
    // 这条是这一版新加的：第一版 102 个干扰项全是「讲的其实是X / 说的还是Y」，机械闸门全放行。
    const base = words.find((w) => w.id === 'predict')!
    const broken = {
      ...base,
      id: 'predict', word: 'predict',
      metaphorOptions: [base.metaphorOptions[0], '讲的其实是悬挂', '说的还是离开'],
    }
    const { errors } = summarize(validateContent(morphemes, [broken]))
    const a28 = errors.filter((f) => f.rule === 'A28')
    expect(a28).toHaveLength(2)
    expect(a28.every((f) => f.target === 'predict')).toBe(true)
  })
})
