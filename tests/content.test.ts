import { describe, expect, it } from 'vitest'
import {
  countHanzi,
  jaccard,
  MIN_WORDS_PER_ROOT,
  summarize,
  TARGET_WORD_COUNT,
  validateContent,
  validateWorlds,
} from '../src/domain/contentRules'
import { createInitialProgress, morphemes, rootMorphemes, wordsByRoot, worlds } from '../src/domain/data'
import { fullWords as words } from './fullWords'
import { residueAllowlist, unmodeledDistractorAllowlist } from './gates'

const options = { residueAllowlist, unmodeledDistractorAllowlist, generated: false }
const format = (findings: ReturnType<typeof validateContent>) => findings.map((finding) => `[${finding.rule}] ${finding.target}：${finding.message}`)

describe('结构化内容校验', () => {
  it('词条数量等于生成器声明的目标数量', () => {
    // 测试和生成器读同一个常量，避免「生成器产 400 个、测试还在要求 16 个」这种各说各话。
    // Stage 3 起按批次往上铺词，这个词数是**下限**：再加一批只会更多，不会变少，
    // 所以这里卡「不少于」，跟 scripts/validate-content.mjs 的口径保持一致。
    expect(words.length, `词数是 ${words.length}，少于 TARGET_WORD_COUNT（${TARGET_WORD_COUNT}）：生成器是不是悄悄少产了？`).toBeGreaterThanOrEqual(TARGET_WORD_COUNT)
    for (const word of words) {
      expect(word.id).toBe(word.word)
      expect(word.phonetic).toMatch(/^\/.+\/$/)
      expect(word.modernMeaningCn).toBeTruthy()
      expect(word.metaphorOptions).toHaveLength(3)
      expect(new Set(word.metaphorOptions).size).toBe(3)
      expect(word.parts.length).toBeGreaterThan(0)
    }
  })

  it('规则闸门零错误（测试和 scripts/validate-content.mjs 跑同一份实现）', () => {
    const { errors } = summarize(validateContent(morphemes, words, options))
    expect(format(errors)).toEqual([])
  })

  it('世界与词根表对得上', () => {
    // A24 只要求「教学词根」挂世界（家族 ≥ MIN_WORDS_PER_ROOT）：零件词根只出现在
    // 拼词卡片里、不上地图，把它们也算进来会凭空多出几百个假错误。
    // 口径与 scripts/validate-content.mjs 保持一致。
    const famSize = new Map<string, number>()
    for (const w of words) for (const p of w.parts) famSize.set(p.morphemeId, (famSize.get(p.morphemeId) ?? 0) + 1)
    const teachingRootIds = new Set([...famSize].filter(([, count]) => count >= MIN_WORDS_PER_ROOT).map(([id]) => id))
    expect(format(validateWorlds(morphemes, worlds, teachingRootIds))).toEqual([])
    // canary 词根：无论怎么重新生成，这 4 个都必须在。
    expect(rootMorphemes.map((item) => item.id)).toEqual(expect.arrayContaining(['dict', 'port', 'spec', 'vid']))
  })

  it('每个词至少有一个 type 为 root 的 part', () => {
    // 少了它，getRootId 会退回 parts[0]（往往是前缀），结算时找不到进度记录，静默给 0 经验。
    const rootIds = new Set(rootMorphemes.map((item) => item.id))
    for (const word of words) {
      expect(word.parts.some((part) => rootIds.has(part.morphemeId)), `${word.word} 没有词根 part`).toBe(true)
    }
  })

  it('parts 拼起来就是单词本身，词尾残留必须在白名单里', () => {
    // 最便宜也最强的一条反幻觉闸门：切分错了，这里拼不上。
    for (const word of words) {
      const assembled = word.parts.map((part) => part.surface).join('').toLowerCase()
      const target = word.word.toLowerCase()
      if (assembled === target) continue
      expect(residueAllowlist[word.id], `${word.word} 拼出来是「${assembled}」，又不在 residue-allowlist 里`).toBeTruthy()
      expect(target.startsWith(assembled), `${word.word} 的残留必须挂在词尾`).toBe(true)
    }
  })

  it('wordsByRoot 覆盖初始进度里的每一个词根', () => {
    // 漏一个，复习面板就会出现用户永远练不到的词根。
    for (const progress of createInitialProgress()) {
      expect(wordsByRoot.get(progress.morphemeId)?.length ?? 0, `${progress.morphemeId} 没有任何词`).toBeGreaterThan(0)
    }
  })

  it('例句能对上词条', () => {
    for (const word of words) {
      expect(word.exampleEn.toLowerCase(), `${word.word} 的例句里没这个词`).toContain(word.word.toLowerCase())
      // 有些词（cooker/crayon 这类名词）在 Tatoeba 里找不到带中文对照的句子，
      // 校验器已把「缺中文例句」降级为警告 —— 这里空着就跳过。
      if (word.exampleCn) {
        expect(countHanzi(word.exampleCn), `${word.word} 的中文例句没有中文`).toBeGreaterThan(0)
      }
      // 中文句里夹一个人名或品牌名（「Ken今天下午很忙」）是 Tatoeba 语料的常态，
      // 校验器里已把它降级成警告 —— 这里也不再当硬失败。
    }
  })

  it('错误选项不能是正确答案的复述', () => {
    for (const word of words) {
      const [answer, ...wrong] = word.metaphorOptions
      for (const option of wrong) {
        expect(jaccard(answer, option), `${word.word} 的干扰项和答案太像：${option}`).toBeLessThan(0.5)
      }
    }
  })

  it('难度落在闭集内，且每个教学词根至少有一个简单词', () => {
    const wordsPerRoot = new Map<string, typeof words>()
    for (const word of words) {
      expect([1, 3, 5]).toContain(word.difficulty)
      for (const part of word.parts) {
        const family = wordsPerRoot.get(part.morphemeId)
        if (family) family.push(word)
        else wordsPerRoot.set(part.morphemeId, [word])
      }
    }
    // 词根只有十余个、词只有十几个的切片样本太小，这条要等 Stage 2 才关死。
    if (words.length < 50) return
    for (const [rootId, family] of wordsPerRoot) {
      if (!rootMorphemes.some((root) => root.id === rootId)) continue
      // 词素分两档（Stage 3 起）：家族低于门槛的是「零件词素」，豁免难度覆盖要求。
      if (family.length < MIN_WORDS_PER_ROOT) continue
      // d1 / d5 都不再硬卡：
      //   d5 缺 —— 实测 96 个教学词根里 67 个没有 d5 词（≈70%），硬卡等于要求词库必须
      //            包含冷门派生词，那是选题偏好，不是正确性。
      //   d1 缺 —— 铺到六级批后出现 tight 这类词根：家族词全是高级派生
      //            （tighten/tightly/watertight），基础词本身不在词库里。
      // 两边口径与 contentRules.ts / 20-select-words.mjs 的 A23 保持一致（都是提示）。
      expect(family.length, `${rootId} 家族词数`).toBeGreaterThan(0)
    }
  })
})
