import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import nonTeachingRoots from '../src/domain/content/non-teaching-roots.json'
import { getReviewQueue } from '../src/domain/logic'
import type { ReviewProgress } from '../src/domain/types'

const repoRoot = new URL('..', import.meta.url)
const d1Gap = JSON.parse(readFileSync(new URL('scripts/gates/a23-d1-structural-gap.json', repoRoot), 'utf8'))

function makeProgress(morphemeId: string, dueAt: string): ReviewProgress {
  return {
    morphemeId,
    state: 'reviewing',
    stability: 40,
    dueAt,
    testedWordIds: [],
    migrationCorrect: 0,
    migrationAttempts: 0,
    streak: 0,
  }
}

describe('非教学词根降级', () => {
  it('清单里每个降级词根都能在 d1 结构性缺口表里找到依据', () => {
    // 防的是「词库变了但清单没重跑」：清单里的词根必须真的是补不出入门词的那些。
    for (const rootId of nonTeachingRoots.demotedRootIds) {
      expect(d1Gap[rootId], `${rootId} 不在 d1 缺口表里，重跑 build-non-teaching-roots.mjs`).toBeTruthy()
    }
  })

  it('降级词根到期了也只是排到队列最后，不会被跳过', () => {
    const now = new Date('2026-09-18T12:00:00.000Z')
    const demoted = nonTeachingRoots.demotedRootIds[0]
    const queue = getReviewQueue(
      [
        makeProgress(demoted, '2026-09-01T00:00:00.000Z'), // 最逾期
        makeProgress('spect', '2026-09-17T00:00:00.000Z'),
        makeProgress('dict', '2026-09-18T00:00:00.000Z'),
      ],
      now,
      { deprioritizedRootIds: new Set(nonTeachingRoots.demotedRootIds) },
    )
    expect(queue.map((item) => item.morphemeId)).toEqual(['spect', 'dict', demoted])
  })

  it('没有降级词根时队列保持原来的到期顺序', () => {
    const now = new Date('2026-09-18T12:00:00.000Z')
    const queue = getReviewQueue(
      [makeProgress('later', '2026-09-17T00:00:00.000Z'), makeProgress('earlier', '2026-09-02T00:00:00.000Z')],
      now,
    )
    expect(queue.map((item) => item.morphemeId)).toEqual(['earlier', 'later'])
  })
})
