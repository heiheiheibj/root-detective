import { describe, expect, it } from 'vitest'
import { createInitialProfile, createRootProgress, rootMorphemes, words } from '../src/domain/data'
import { loadProfile, normalizeProfile, serializeProfile } from '../src/domain/persistence'

describe('档案持久化', () => {
  it('损坏 JSON 与过期版本安全回退', () => {
    expect(loadProfile('{bad json').xp).toBe(0)
    expect(loadProfile(JSON.stringify({ version: 0, xp: 999 })).xp).toBe(0)
  })

  it('规范化非法数值、未知 ID 与重复项', () => {
    const profile = normalizeProfile({
      version: 1,
      xp: -4.8,
      insightPoints: 2.9,
      progress: [{ morphemeId: 'spec', state: 'learning', stability: 140, dueAt: '2026-01-01T00:00:00.000Z', testedWordIds: ['circumspect', 'circumspect', 'zzz-not-a-word'], migrationCorrect: 2.9, migrationAttempts: -1, streak: 1.8 }, { morphemeId: 'pre', stability: 99 }],
      completedWordIds: ['predict', 'predict', 'zzz-not-a-word'],
      activityDays: ['2026-09-10', '2026-09-10', 'bad-date'],
      onboardingCompleted: true,
    })
    const spec = profile.progress.find((item) => item.morphemeId === 'spec')!
    expect(profile.xp).toBe(0)
    expect(profile.insightPoints).toBe(2)
    expect(spec.stability).toBe(100)
    expect(spec.testedWordIds).toEqual(['circumspect'])
    expect(spec.migrationCorrect).toBe(2)
    expect(spec.migrationAttempts).toBe(0)
    expect(spec.dueAt).toBe('2026-01-01T00:00:00.000Z')
    expect(profile.progress.find((item) => item.morphemeId === 'dict')?.dueAt).toBeNull()
    expect(profile.progress).toHaveLength(rootMorphemes.length)
    expect(profile.completedWordIds).toEqual(['predict'])
    expect(profile.activityDays).toEqual(['2026-09-10'])
    expect(profile.onboardingCompleted).toBe(true)
  })

  it('拒绝无效 ISO 日期并校验自然日边界', () => {
    const profile = normalizeProfile({
      version: 1,
      progress: [
        { morphemeId: 'spec', state: 'learning', dueAt: '2026-02-30T00:00:00.000Z' },
        { morphemeId: 'dict', state: 'learning', dueAt: '2026-01-01' },
        { morphemeId: 'port', state: 'learning', dueAt: '2026-01-01T00:00:00Z' },
      ],
      activityDays: ['2026-02-29', '2026-09-10', '2026-09-31', '2026-9-1'],
    })
    expect(profile.progress.find((item) => item.morphemeId === 'spec')?.dueAt).toBeNull()
    expect(profile.progress.find((item) => item.morphemeId === 'dict')?.dueAt).toBeNull()
    expect(profile.progress.find((item) => item.morphemeId === 'port')?.dueAt).toBeNull()
    expect(profile.activityDays).toEqual(['2026-09-10'])
  })

  it('序列化结果可重新加载', () => {
    const source = createInitialProfile()
    const loaded = loadProfile(serializeProfile(source))
    expect(loaded).toEqual(source)
  })

  it('旧档案载入后，老词根的熟练度保留、没见过的词根归零', () => {
    // 词根从 4 个涨到 300 个时，玩家手里还是老档案。normalizeProfile 按 id 重映射，
    // 所以不需要动 PROFILE_VERSION——这条测试守住那个假设。
    const old = JSON.stringify({
      version: 1,
      xp: 320,
      insightPoints: 48,
      progress: rootMorphemes.map((root) => ({ ...createRootProgress(root.id), state: 'reviewing', stability: 62, dueAt: '2026-09-09T00:00:00.000Z' })),
      completedWordIds: ['circumspect'],
      activityDays: ['2026-09-10'],
      onboardingCompleted: true,
      helpSeen: true,
    })
    const migrated = loadProfile(old)
    expect(migrated.xp).toBe(320)
    expect(migrated.progress).toHaveLength(rootMorphemes.length)
    expect(migrated.progress.filter((item) => item.stability === 62)).toHaveLength(rootMorphemes.length)
    expect(migrated.progress.every((item) => item.dueAt === '2026-09-09T00:00:00.000Z')).toBe(true)
    // 档案里没有的词根（将来的 300 词根表）应当是干净的空记录，而不是借用别人的。
    const unknown = normalizeProfile({ version: 1, progress: [] }).progress
    expect(unknown).toHaveLength(rootMorphemes.length)
    expect(unknown.every((item) => item.stability === 0 && item.state === 'new' && item.testedWordIds.length === 0)).toBe(true)
  })

  it('序列化体积在 localStorage 配额之内', () => {
    // 这条挡住「以后加个字段悄悄撑爆配额」，不是给词库规模设上限。
    // 校准：1995 词 / 1371 词根、每个词根记 2 个已测词条时实测约 258 KB；
    // 浏览器 localStorage 通常给 5 MB，用 400 KB 当跳闸线 ——
    // 手里有 1.5 倍余量，真有人在 progress 里塞个大字段立刻就会被这条拦住。
    const fat = {
      ...createInitialProfile(),
      completedWordIds: [],
      progress: rootMorphemes.map((root, index) => ({
        ...createRootProgress(root.id), state: 'reviewing' as const, stability: 60,
        dueAt: '2026-09-09T00:00:00.000Z',
        // 用真实词条 id——序列化时未知 id 会被过滤掉，假 id 会让这条测试量不准。
        testedWordIds: [words[index % words.length].id, words[(index + 1) % words.length].id],
      })),
    }
    expect(serializeProfile(fat).length).toBeLessThan(400_000)
  })
})
