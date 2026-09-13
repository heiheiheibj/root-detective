// 校验例句产物：专名检测与 22 号脚本完全一致（避免 shell 转义造成的误报）。
import { readFileSync } from 'node:fs'

function hasProperNoun(text, target) {
  const tokens = text.trim().split(/\s+/)
  return tokens.some((token, index) => {
    const bare = token.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
    if (!bare) return false
    if (/^I('|’)?(m|ll|ve|d)?$/.test(bare)) return false
    if (bare.toLowerCase() === target.toLowerCase()) return false
    if (index === 0) return false
    return /^[A-Z]/.test(bare)
  })
}

const d = JSON.parse(readFileSync('scripts/.work/derived/words.examples.json', 'utf8'))
const bad = d.filter((e) => e.exampleEn && hasProperNoun(e.exampleEn, e.word))
console.log('仍含专名的例句:', bad.length)
bad.forEach((e) => console.log('  ', e.word, '|', e.exampleEn))
const noCn = d.filter((e) => e.exampleEn && !/[一-鿿]/.test(e.exampleCn))
console.log('无中文对照的词:', noCn.map((e) => e.word).join(','))
