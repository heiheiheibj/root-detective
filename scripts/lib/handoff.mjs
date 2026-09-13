// 供 11 / 13 / 30 / 60 四个本应调 LLM 的脚本共用的「handoff 模式」。
//
// 背景：这台机器没有 OPENROUTER_API_KEY，用户明确不要用 OpenRouter，改由执行任务的
// AI 自己写完这些「本应让 LLM 生成」的内容。为了保证管线仍然可复现
// （`rm -rf scripts/.work/derived && npm run content:all` 能全量重跑），这些内容
// 被存成静态文件放到 scripts/handoff/，随仓库保存，不花钱、可反复重跑。
//
// 使用方式（以 11 号为例）：
//   const data = await loadHandoff('roots-llm', async () => { /* 原来的 LLM 逻辑 */ })
//  - scripts/handoff/roots-llm.json 存在 → 直接读，并打上 provenance 标记
//  - 不存在 → 跑传入的 fallback（即原来的 LLM 调用），并把结果写一份到 handoff
//
// 这样：不设环境变量也能全量重跑；将来想换回 API 只需删掉 handoff 文件。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
export const handoffDir = join(here, 'handoff')

export function hasHandoff(name) {
  return existsSync(join(handoffDir, `${name}.json`))
}

/**
 * 加载 handoff 数据。存在则返回 { data, fromHandoff: true }，不存在则跑 fallback，
 * fallback 返回任意数据；若 fallback 返回 null 表示「没有 handoff 也跑不了」。
 */
export async function loadHandoff(name, fallback) {
  const path = join(handoffDir, `${name}.json`)
  if (existsSync(path)) {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    console.log(`[handoff] 命中 scripts/handoff/${name}.json（${Array.isArray(data.entries) ? data.entries.length : Array.isArray(data.words) ? data.words.length : '?'} 条），不调 LLM`)
    return { data, fromHandoff: true }
  }
  const data = await fallback()
  if (data === undefined || data === null) {
    console.error(`[handoff] 没有 scripts/handoff/${name}.json，又没有可用的 fallback。`)
    process.exit(1)
  }
  mkdirSync(handoffDir, { recursive: true })
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
  console.log(`[handoff] 已把结果写进 scripts/handoff/${name}.json，后续重跑免费且一致`)
  return { data, fromHandoff: false }
}

/** 手动保存（供调试/测试用）。 */
export function saveHandoff(name, data) {
  mkdirSync(handoffDir, { recursive: true })
  writeFileSync(join(handoffDir, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`)
}