// Stage 2 选根核查：对短名单词根逐个输出 A23 状态 + 词池样例（含难度），
// 供人工挑词。只读 supply-analysis.json，不做任何决策。
// 跑法：node scripts/tools/check-shortlist.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(readFileSync(join(here, '..', '.work', 'derived', 'supply-analysis.json'), 'utf8'))
const byId = new Map(data.results.map((r) => [r.id, r]))

const shortlist = process.argv[2]
  ? process.argv[2].split(',')
  : ['mit', 'miss', 'man', 'manu', 'fer', 'tele', 'mon', 'monu', 'neur', 'nerv', 'therm', 'psych', 'hydr',
     'equ', 'metr', 'phon', 'mal', 'medi', 'migr', 'mir', 'mort', 'onym', 'nov', 'opt', 'path', 'pel',
     'pet', 'phil', 'phys', 'polit', 'popul', 'pos', 'prim', 'rupt', 'sanct', 'sacr', 'sal', 'sci',
     'scrib', 'script', 'sect', 'simil', 'sens', 'serv', 'sist', 'soci', 'spir', 'struct', 'tact',
     'tempor', 'terr', 'test', 'typ', 'vac', 'vad', 'ven', 'verb', 'vi', 'vict', 'vit', 'viv', 'vol',
     'anim', 'ann', 'art', 'ben', 'calc', 'cap', 'cept', 'cip', 'cede', 'cess', 'clud', 'clus', 'cord',
     'cor', 'cur', 'dem', 'doc', 'duc', 'duct', 'flect', 'flex', 'flu', 'form', 'fort', 'fus', 'fund',
     'found', 'grat', 'grav', 'hab', 'hibit', 'her', 'hes', 'hum', 'jud', 'judic', 'labor', 'lev',
     'liter', 'merg', 'mers']

const notFound = []
for (const id of shortlist) {
  const r = byId.get(id)
  if (!r) { notFound.push(id); continue }
  const flag = r.qualified ? '✓' : r.d1 >= 1 ? '≈' : '✗'
  const words = r.words.slice(0, 14).map((w) => `${w.word}(d${w.d}${w.used ? '*' : ''}${w.exam === 'extended' ? 'E' : ''})`).join(' ')
  console.log(`${flag} ${r.id.padEnd(7)} 供${String(r.total).padStart(4)} d1=${String(r.d1).padStart(3)} d5=${String(r.d5).padStart(2)}  ${words}`)
}
if (notFound.length) console.log(`\n候选表中无：${notFound.join('、')}`)
console.log('\n标记：* = Stage 1 已用；E = 仅 toefl/ielts/gre（需 forceInclude）')
