// 给本批还没有中文义项的词素补上（A20 要求 1–8 汉字）。
// 这些是 Wiktionary 有词素词条、但 gloss 是英文的拉丁词根（sent/act/tain…）
// 和一些常见前后缀（ab-/com-/tele-/-less/-mate…）。只填空值，已有义项的不动。
//
// 跑法：node scripts/tools/fill-morpheme-meanings.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, '..', 'lib', 'stage-additions', 'batch-02')

const MEANINGS = {
  // 词根
  sent: '感觉', act: '做、行动', tain: '持有', quest: '寻求',
  ceive: '拿取', ceed: '行走', prise: '抓取', ten: '持有',
  port: '携带', her: '她', not: '不',
  // 前缀
  ab: '离开', back: '向后', com: '共同', dec: '十', grand: '大、隔一代',
  to: '到、向', ag: '朝向', mis: '错、坏', co: '共同', sur: '在上', after: '在之后',
  tele: '远', under: '在下',
  // 后缀
  ball: '球', ing: '正在', less: '无、不', man: '人', mate: '伙伴',
  ly: '…地', th: '第…', son: '儿子', some: '有点…的', head: '头',
  work: '工作', motor: '发动机', ern: '…方向', ise: '使…化', end: '末端',
}

let filled = 0
for (const file of ['morphemes-roots.json', 'morphemes-affixes.json']) {
  const path = join(dir, file)
  const data = JSON.parse(readFileSync(path, 'utf8'))
  const lists = [data.morphemes, data.prefixes, data.suffixes, data.overrides].filter(Boolean)
  for (const list of lists) {
    for (const m of list) {
      const hasHanzi = [...(m.meaningCn || '')].some((c) => c >= '一' && c <= '鿿')
      if (hasHanzi) continue
      const text = MEANINGS[m.id]
      if (!text) { console.warn(`  ⚠ ${m.id} 没有现成义项，跳过`); continue }
      m.meaningCn = text
      filled++
    }
  }
  writeFileSync(path, `${JSON.stringify(data, null, 1)}\n`, 'utf8')
}

console.log(`已补中文义项：${filled} 个词素`)
