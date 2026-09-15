import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * 脚本层闸门（A20b 词典兜底痕迹 / A20c 干扰项牌面 / A24b 多世界挂载）写在
 * `scripts/validate-content.mjs` 里，不在 `contentRules.ts` —— 原因见那个文件顶部的注释：
 * 判据与覆盖表是同一份东西，分到 TS（不能带值 import）就得抄一遍正则，而「义项表抄成两份」
 * 正是当初的病根。
 *
 * 代价是 `npm test` 对这几条**完全无感**：复核时实测 A20b 已经漏了 10 条垃圾义项、
 * 闸门却报 0，靠的只有手动跑 `node scripts/validate-content.mjs`。这里把它当一条测试跑，
 * 让脚本层闸门也进回归。
 */
describe('脚本层闸门（validate-content.mjs）', () => {
  it('退出码为 0（0 错误，警告不拦）', () => {
    const result = spawnSync(process.execPath, [join(here, '..', 'scripts', 'validate-content.mjs')], { encoding: 'utf8' })
    const findings = `${result.stdout}\n${result.stderr}`
      .split('\n')
      .filter((line) => line.includes('[A') || line.includes('[script]'))
      .filter((line) => line.trim().startsWith('✗'))
      .join('\n')
    expect(result.status, `闸门有错误：\n${findings}`).toBe(0)
  }, 60_000)
})
