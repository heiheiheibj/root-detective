import distractorRaw from '../scripts/gates/unmodeled-distractor-allowlist.json'
import residueRaw from '../scripts/gates/residue-allowlist.json'

/**
 * 白名单文件里下划线开头的是注释键，不是条目。测试和 scripts/validate-content.mjs
 * 读的是同一个文件、同一条过滤规则——否则会出现「测试放行、闸门拦下」的鬼故事。
 */
function stripComments(raw: Record<string, string>) {
  return Object.fromEntries(Object.entries(raw).filter(([key]) => !key.startsWith('_')))
}

export const residueAllowlist = stripComments(residueRaw as Record<string, string>)
export const unmodeledDistractorAllowlist = stripComments(distractorRaw as Record<string, string>)
