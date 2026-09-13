// 验证潜在白名单词能否用「已有词素」切出来（A5/A6）。
import { readFileSync } from 'node:fs'

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false }
      else cur += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { out.push(cur); cur = '' } else cur += ch
    }
  }
  out.push(cur)
  return out
}
// 载入 reviewed 词素
const reviewed = JSON.parse(readFileSync('scripts/.work/derived/roots.reviewed.json', 'utf8'))
const rev = reviewed.entries || reviewed
const morph = new Map(rev.map((e) => [e.id, e]))
// 加上手写的 12 个（目前 data.ts 用的是旧字段 etymology；先不管）
const legacy = {
  circum: { allomorphs: ['circum'] }, pre: { allomorphs: ['pre'] }, re: { allomorphs: ['re'] },
  in: { allomorphs: ['in', 'im', 'il', 'ir'] }, spec: { allomorphs: ['spec', 'spect', 'spic'] },
  dict: { allomorphs: ['dict', 'dic'] }, port: { allomorphs: ['port'] },
  vid: { allomorphs: ['vid', 'vis', 'vise'] }, ion: { allomorphs: ['tion', 'sion', 'ion'] },
  ive: { allomorphs: ['ive'] }, able: { allomorphs: ['able', 'ible', 'ibil'] }, ity: { allomorphs: ['ity', 'ty'] },
}
for (const [k, v] of Object.entries(legacy)) morph.set(k, v)

// 候选分词（手动）：word → [{morphemeId, surface}]
const splits = {
  // duc 家族
  produce: [['pro', 'pro'], ['duc', 'duce']],
  introduce: [['in', 'intro'], ['duc', 'duce']],
  conduct: [['con', 'con'], ['duc', 'duct']],
  reduce: [['re', 're'], ['duc', 'duce']],
  deduce: [['de', 'de'], ['duc', 'duce']],
  product: [['pro', 'pro'], ['duc', 'duct']],
  production: [['pro', 'pro'], ['duc', 'duct'], ['ion', 'ion']],
  education: [['e', 'e'], ['duc', 'duc'], ['ation', 'ation']],
  induction: [['in', 'in'], ['duc', 'duct'], ['ion', 'ion']],
  deduction: [['de', 'de'], ['duc', 'duct'], ['ion', 'ion']],
  // gen 家族
  gene: [['gen', 'gen']],
  general: [['gen', 'gen'], ['eral', 'eral']],
  generate: [['gen', 'gen'], ['er', 'erat'], ['ate', 'ate']],
  generation: [['gen', 'gen'], ['er', 'erat'], ['ation', 'ation']],
  genetic: [['gen', 'gen'], ['et', 'et'], ['ic', 'ic']],
  genetics: [['gen', 'gen'], ['et', 'et'], ['ic', 'ic'], ['s', 's']],
  generous: [['gen', 'gen'], ['er', 'er'], ['ous', 'ous']],
  gene2: [['gen', 'gen']],
  // bio 家族
  biology: [['bio', 'bio'], ['logy', 'logy']],
  biography: [['bio', 'bio'], ['graph', 'graph']],
  biochemistry: [['bio', 'bio'], ['chem', 'chem'], ['ist', 'ist'], ['ry', 'ry']],
  antibiotic: [['anti', 'anti'], ['bio', 'bio'], ['tic', 'tic']],
  biotech: [['bio', 'bio'], ['tech', 'tech']],
  biosphere: [['bio', 'bio'], ['sphere', 'spher']],
  // graph 家族
  graphite: [['graph', 'graph'], ['ite', 'ite']],
  paragraph: [['para', 'para'], ['graph', 'graph']],
  telegraph: [['tele', 'tele'], ['graph', 'graph']],
  photograph: [['photo', 'phot'], ['graph', 'graph']],
  photography: [['photo', 'phot'], ['graph', 'graph'], ['y', 'y']],
  geography: [['geo', 'geo'], ['graph', 'graph'], ['y', 'y']],
  // scrib 家族
  describe: [['de', 'de'], ['scribe', 'scrib']],
  description: [['de', 'de'], ['script', 'scrib'], ['ion', 'ion']],
  prescribe: [['pre', 'pre'], ['scribe', 'scrib']],
  subscribe: [['sub', 'sub'], ['scribe', 'scrib']],
  script: [['scrib', 'script']],
  manuscript: [['manu', 'man'], ['script', 'scrib']],
  transcribe: [['trans', 'trans'], ['cribe', 'scrib']],
  // tele 家族
  telephone: [['tele', 'tele'], ['phone', 'phon']],
  telegraph: [['tele', 'tele'], ['graph', 'graph']],
  telescope: [['tele', 'tele'], ['scope', 'scop']],
  telegram: [['tele', 'tele'], ['gram', 'gram']],
}

const allomorphCache = (id) => {
  const m = morph.get(id)
  return m ? new Set([...(m.allomorphs || []), ...(m.displayText ? [m.displayText.replace(/(^-+|-+$)/g, '')] : [])]) : new Set()
}

let fail = 0
for (const [word, parts] of Object.entries(splits)) {
  const assembled = parts.map((p) => p[1]).join('').toLowerCase()
  const ok = assembled === word.toLowerCase()
  const missingMorphs = parts.filter(([id]) => !morph.has(id)).map(([id]) => id)
  const surfaceBad = parts.filter(([id, sf]) => !allomorphCache(id).has(sf)).map(([id, sf]) => `${id}:${sf}`)
  const rootPart = parts.some(([id]) => morph.get(id)?.type === 'root')
  console.log(`${ok ? '✓' : '✗'} ${word.padEnd(14)} = ${assembled.padEnd(14)} 缺词素=${missingMorphs.join(',') || '无'} 表形不符=${surfaceBad.join(',') || '无'} root=${rootPart}`)
  if (!ok || missingMorphs.length || surfaceBad.length || !rootPart) fail++
}
console.log(`\n失败 ${fail} 个`)