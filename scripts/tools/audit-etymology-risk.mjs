#!/usr/bin/env node
/**
 * 词源高风险词审计（M2 清单里那句「对高风险词做人工审核」的机器预筛部分）。
 *
 * 说明白 boundary：机器查不出「词源是不是史实」，只能找出**看起来像标注错误**的词，
 * 供人工复核。所以产物是一份线索清单，不是判定书——每条都要人看过才算数。
 *
 * 检查项
 *  1 语义梯子太短       字面义 ≈ 现代义      → 学习者直接抄近路，推义环节空转
 *  2 助记冒充词源       词源里出现助记话术    → 方案明令禁止「用看起来能拆代替真实词源」
 *  3 词源口径不一致     词源没碰到任何建模成分 → **多为误报**：真实词源常引更深层源头
 *                       （如 critical 引希腊语 krinein，而建模的是 critic），列出来只为了让人核一眼
 *  4 释义雷同           同词根家族释义高度相似 → 一道题会有两个「对」的答案
 *  5 例句不含目标词     例句没出现该单词本身  → 例句挑错了词（A8 的回归项）
 *
 * 产出
 *  - scripts/reports/etymology-risk.json   机器读
 *  - docs/词源审核报告.md                  人读（Top N + 计数）
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()
const words = JSON.parse(readFileSync(join(repoRoot, 'src', 'domain', 'content', 'words.json'), 'utf8'))
const morphemes = JSON.parse(readFileSync(join(repoRoot, 'src', 'domain', 'content', 'morphemes.json'), 'utf8'))

/** 中文没有空格，按字去重后算 Jaccard；短句里这个粒度够用。 */
function jaccard(a, b) {
  const left = new Set([...a].filter((ch) => !/\s/.test(ch)))
  const right = new Set([...b].filter((ch) => !/\s/.test(ch)))
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const char of left) if (right.has(char)) shared += 1
  return shared / (left.size + right.size - shared)
}

// 助记话术的黑名单词：出现这些词的「词源」八成是把助记解释误填进了词源字段。
const MNEMONIC_TELLS = ['记住', '联想', '谐音', '串记', '想象', '好像', '可以记作', '口语']
const semanticLadderThreshold = 0.6
const duplicateFamilyThreshold = 0.6

const morphemeById = new Map(morphemes.map((item) => [item.id, item]))
const findings = []

for (const word of words) {
  const risks = []

  if (word.literalMeaningCn && word.modernMeaningCn && jaccard(word.literalMeaningCn, word.modernMeaningCn) >= semanticLadderThreshold) {
    risks.push({ type: '语义梯子太短', detail: `字面义「${word.literalMeaningCn}」和现代义「${word.modernMeaningCn}」几乎一样` })
  }

  const sourceNote = word.sourceNote ?? ''
  const matchedTell = MNEMONIC_TELLS.find((tell) => sourceNote.includes(tell))
  if (matchedTell) {
    risks.push({ type: '助记冒充词源', detail: `词源里出现了助记话术「${matchedTell}」` })
  }

  // 「词源落地」有两种写法：直接引拉丁语素（spect/-ion），或讲它的中文义（"看"）。
  // 两种都不沾才算可疑；只查拉丁文本会误伤通篇中文讲解的词源，噪声非常大。
  const buildingBlocks = word.parts.flatMap((part) => {
    const morpheme = morphemeById.get(part.morphemeId)
    return [part.surface, ...(morpheme?.allomorphs ?? []), morpheme?.meaningCn].filter(Boolean)
  })
  const candidates = buildingBlocks.filter((item) => item.length >= 2)
  if (sourceNote && candidates.length > 0 && !candidates.some((block) => sourceNote.toLowerCase().includes(block.toLowerCase()))) {
    risks.push({ type: '词源口径不一致', detail: `词源既没提到拉丁语素也没提到其中文义（${candidates.slice(0, 3).join('/')}）` })
  }

  const example = (word.exampleEn ?? '').toLowerCase()
  if (example && !example.includes(word.word.toLowerCase())) {
    risks.push({ type: '例句不含目标词', detail: `例句里找不到单词 ${word.word}` })
  }

  if (risks.length > 0) findings.push({ id: word.id, risks })
}

// 释义雷同要看同词根家族，单独一遍：拿到 first root 的 family 再两两比。
const rootIdOf = (word) => word.parts.find((part) => morphemeById.get(part.morphemeId)?.type === 'root')?.morphemeId
const byRoot = new Map()
for (const word of words) {
  const rootId = rootIdOf(word)
  if (!rootId) continue
  if (!byRoot.has(rootId)) byRoot.set(rootId, [])
  byRoot.get(rootId).push(word)
}
for (const [rootId, family] of byRoot) {
  for (let i = 0; i < family.length; i += 1) {
    for (let j = i + 1; j < family.length; j += 1) {
      const similarity = jaccard(family[i].modernMeaningCn, family[j].modernMeaningCn)
      if (similarity >= duplicateFamilyThreshold) {
        const target = findings.find((item) => item.id === family[i].id) ?? { id: family[i].id, risks: [] }
        if (!findings.includes(target)) findings.push(target)
        target.risks.push({
          type: '家族释义雷同',
          detail: `和 ${family[j].id} 的释义相似度 ${similarity.toFixed(2)}（同词根 ${rootId}）`,
        })
      }
    }
  }
}

mkdirSync(join(repoRoot, 'scripts', 'reports'), { recursive: true })
const counts = new Map()
for (const finding of findings) for (const risk of finding.risks) counts.set(risk.type, (counts.get(risk.type) ?? 0) + 1)

const payload = {
  _comment: '由 scripts/tools/audit-etymology-risk.mjs 生成。机器预筛，每条都要人工复核后才有结论。',
  generatedAt: new Date().toISOString(),
  wordCount: words.length,
  flaggedWordCount: findings.length,
  countsByType: Object.fromEntries([...counts].sort((a, b) => b[1] - a[1])),
  findings: findings.sort((a, b) => b.risks.length - a.risks.length),
}
writeFileSync(join(repoRoot, 'scripts', 'reports', 'etymology-risk.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

const top = payload.findings.slice(0, 40)
const rows = top
  .map((finding) => `| ${finding.id} | ${finding.risks.map((risk) => risk.type).join('、')} | ${finding.risks[0].detail} |`)
  .join('\n')
const markdown = [
  '# 词源高风险词审核报告',
  '',
  `> 由 \`scripts/tools/audit-etymology-risk.mjs\` 于 ${payload.generatedAt} 生成，共扫描 ${payload.wordCount} 个词。`,
  '> **这是机器预筛，不是判定。** 每条线索都要人工翻词典确认后才能改数据。',
  '',
  '## 命中统计',
  '',
  '| 检查项 | 命中词条数 |',
  '|---|---:|',
  ...[...counts].sort((a, b) => b[1] - a[1]).map(([type, count]) => `| ${type} | ${count} |`),
  '',
  `合计 ${payload.flaggedWordCount} 个词至少命中一项。`,
  '',
  '> 可信度分层：**助记冒充词源**、**语义梯子太短**、**家族释义雷同**三项是有效信号，',
  '> 命中就值得翻词典。**词源口径不一致**多数是误报——真实词源常常引更深的源头',
  '> （例如 `critical` 的词源写希腊语 krinein，而建模成分是现代的 critic），列出来仅供核对。',
  '',
  '## 最需要复核的词（按命中项数排序）',
  '',
  '| 词 | 命中检查项 | 首要线索 |',
  '|---|---|---|',
  rows,
  '',
]
writeFileSync(join(repoRoot, 'docs', '词源审核报告.md'), `${markdown.join('\n')}\n`, 'utf8')

console.log(`已扫描 ${payload.wordCount} 个词，标记 ${payload.flaggedWordCount} 个：`)
for (const [type, count] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${type}：${count}`)
console.log('报告 → docs/词源审核报告.md，明细 → scripts/reports/etymology-risk.json')
