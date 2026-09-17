import distractorRaw from '../scripts/gates/unmodeled-distractor-allowlist.json'
import residueRaw from '../scripts/gates/residue-allowlist.json'
import gapRaw from '../scripts/gates/a23-d5-structural-gap.json'
import gapD1Raw from '../scripts/gates/a23-d1-structural-gap.json'

/**
 * 白名单文件里下划线开头的是注释键，不是条目。测试和 scripts/validate-content.mjs
 * 读的是同一个文件、同一条过滤规则——否则会出现「测试放行、闸门拦下」的鬼故事。
 */
function stripComments(raw: Record<string, string>) {
  return Object.fromEntries(Object.entries(raw).filter(([key]) => !key.startsWith('_')))
}

export const residueAllowlist = stripComments(residueRaw as Record<string, string>)
export const unmodeledDistractorAllowlist = stripComments(distractorRaw as Record<string, string>)
/** A23「教学词根缺 d5」的结构性缺口；生成脚本见 scripts/tools/build-a23-d5-gap.mjs。 */
export const rootD5StructuralGap = stripComments(gapRaw as Record<string, string>)
/** A23「教学词根缺 d1」的结构性缺口；与 d5 同一生成脚本、同一口径。 */
export const rootD1StructuralGap = stripComments(gapD1Raw as Record<string, string>)
