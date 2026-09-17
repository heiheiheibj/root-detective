#!/usr/bin/env node
/**
 * 从 A23 两张结构性缺口表里，算出「不该排在初学者队列前面」的词根，产出非教学词根清单。
 *
 * 策略（改的话只改这个文件，别手改产物）：
 * - 出现在 d1 缺口表 = 家族里连一个 difficulty-1 入门词都没有 → **降级**。
 *   这类词根（tight / script 那种）家族全是高级派生，让新手一上来就啃是不合理的，
 *   所以它们不参与优先复习排序，只在实在没别的到期词根时才出现。
 * - 只出现在 d5 缺口表 = 家族里有简单词、只是没有难词 → **不降级**，仅记录在 _lacksHardWord
 *   里，供后续补数据时参考。理由：入门路径完整就还能教，缺难词只影响进阶挑战题。
 *
 * 产物 src/domain/content/non-teaching-roots.json 由本脚本生成，改动词库后要重跑。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()
const D1_GAP = join(repoRoot, 'scripts', 'gates', 'a23-d1-structural-gap.json')
const D5_GAP = join(repoRoot, 'scripts', 'gates', 'a23-d5-structural-gap.json')
const OUT = join(repoRoot, 'src', 'domain', 'content', 'non-teaching-roots.json')

/** 缺口表里混着三个说明字段，挑真词根时要排掉。 */
function readRoots(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const entries = Object.entries(raw).filter(([key]) => !key.startsWith('_'))
  return { roots: entries.map(([key]) => key), reasons: Object.fromEntries(entries) }
}

const d1 = readRoots(D1_GAP)
const d5 = readRoots(D5_GAP)
const d1Set = new Set(d1.roots)

const demotedRootIds = d1.roots.sort()
// 只在 d5 缺口里（有入门词、没难词）的不降级，单独归类供补数据时看。
const lacksHardWordRootIds = d5.roots.filter((id) => !d1Set.has(id)).sort()

const output = {
  _comment: '由 scripts/tools/build-non-teaching-roots.mjs 生成。词库或上游词表变动后必须重跑，不要手改。',
  _policy: 'd1 结构性缺口（家族没有入门词）→ 降级为非教学词根，复习排序靠后；仅 d5 缺口（有入门词、没难词）→ 不降级，只记录在 _lacksHardWordRootIds。',
  _generatedAt: new Date().toISOString(),
  _source: { d1Gap: d1.roots.length, d5Gap: d5.roots.length },
  demotedRootIds,
  _reasons: d1.reasons,
  _lacksHardWordRootIds: lacksHardWordRootIds,
}

writeFileSync(OUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
console.log(
  `已写出 non-teaching-roots.json：降级 ${demotedRootIds.length} 个词根，仅缺难词 ${lacksHardWordRootIds.length} 个（不降级）。`,
)
