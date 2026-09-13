// 探针 2：cigen 人工切分证据 + ECDICT 词条数据，为选词和差分测试做决策。
import { readFileSync, writeFileSync } from 'node:fs'

function parseCsvLine(line) {
  const out = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else { if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = '' } else cur += c }
  }
  out.push(cur); return out
}

const cigen = JSON.parse(readFileSync('scripts/.work/raw/cigen-roots_affixes.json', 'utf8'))
const entryByWord = new Map()
for (const e of cigen.entries) entryByWord.set(e.word.toLowerCase(), e)
console.log('cigen entries:', cigen.entries.length)

const ecdictList = readFileSync('scripts/.work/raw/ecdict.csv', 'utf8').split('\n').slice(1)
const info = new Map()
for (const line of ecdictList) {
  if (!line.trim()) continue
  const cols = parseCsvLine(line)
  info.set(cols[0].toLowerCase(), cols)
}

// 16 个 canary + dict/port/vid/spec 候选扩展词 + act/form/mob/grad/man/fin 等候选
const CANDIDATE_WORDS = [
  // spec family
  'circumspect', 'inspection', 'respect', 'circumspection', 'inspect', 'spectacle', 'spectator', 'prospect', 'retrospect', 'perspective', 'suspicion', 'suspect',
  // dict family
  'predict', 'prediction', 'predictable', 'predictive', 'dictate', 'dictation', 'dictator', 'dictionary', 'diction', 'indict', 'benediction', 'verdict', 'predictability',
  // port family
  'portable', 'import', 'report', 'porter', 'export', 'transport', 'transportation', 'deport', 'deportation', 'reporter', 'portfolio', 'purport', 'support', 'reportable',
  // vid family
  'visible', 'vision', 'revise', 'visibility', 'visual', 'invisible', 'television', 'envision', 'evident', 'evidence', 'provide', 'provision', 'supervise', 'revision', 'visiblely',
  // act family
  'action', 'active', 'activity', 'actually', 'actor', 'actual', 'react', 'reaction', 'interact', 'interaction', 'counteract', 'radioactive', 'radioactivity', 'reactor', 'transact', 'transaction',
  // form family
  'form', 'former', 'formation', 'formal', 'inform', 'information', 'informative', 'transform', 'transformation', 'reform', 'reformation', 'uniform', 'formula', 'platform', 'conform', 'informal',
  // mob/mov family
  'move', 'movement', 'movie', 'remove', 'removal', 'mobile', 'mobility', 'automobile', 'emotion', 'emotional', 'motion', 'promote', 'promotion', 'remote', 'commotion', 'motor',
  // grad/gre family
  'grade', 'gradual', 'graduate', 'graduation', 'upgrade', 'downgrade', 'degrade', 'aggression', 'aggressive', 'congress', 'progress', 'progress', 'regress', 'transgress',
  // man family
  'man', 'mankind', 'manual', 'manufacture', 'manufacturer', 'manage', 'management', 'manager', 'manner', 'manuscript', 'manly', 'superman', 'human', 'humanity',
  // fin family
  'fine', 'final', 'finally', 'finish', 'finance', 'financial', 'refine', 'refinery', 'finely', 'infinite', 'infinity', 'define', 'definition', 'confine', 'definite',
  // mit/spect? no. Let me add cred/duc/scrib
  'credit', 'credible', 'incredible', 'credential', 'reduce', 'reduction', 'produce', 'production', 'product', 'conduct', 'conductor', 'educate', 'education', 'introduce', 'introduction',
  'script', 'subscript', 'describe', 'description', 'subscribe', 'subscription', 'prescribe', 'prescription', 'transcript', 'manuscript',
]

const out = []
for (const w of CANDIDATE_WORDS) {
  const cols = info.get(w)
  const cg = entryByWord.get(w)
  out.push(`\n== ${w}`)
  out.push(`  ECDICT: tag[${cols?.[7] ?? '未收录'}] pos[${cols?.[4] ?? ''}] bnc[${cols?.[8] ?? ''}] frq[${cols?.[9] ?? ''}] collins[${cols?.[5] ?? ''}] oxford[${cols?.[6] ?? ''}] 译[${(cols?.[3] ?? '').slice(0, 40)}] 换[${(cols?.[10] ?? '').slice(0, 30)}]`)
  if (cg) out.push(`  cigen: ${JSON.stringify(cg.components)}`)
  else out.push(`  cigen: 无切分`)
}
writeFileSync('_t_cigen_probe.txt', out.join('\n'))
console.log('written _t_cigen_probe.txt')