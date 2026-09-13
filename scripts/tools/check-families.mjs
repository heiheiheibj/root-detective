// Stage 2 家族词表验证器：按 20 号完全一致的 6.2/6.4 规则，
// 对草拟家族逐词输出难度与考试等级，并给每族 A23（≥3 词且 d1/d5 各≥1）判定。
// 只读 ECDICT，不做决策；词表是草稿，反复调整到全绿后抄进 stage2-content.json。
// 跑法：node scripts/tools/check-families.mjs [家族id]
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
function parseCsvLine(line) {
  const out = []; let cur = ''; let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false } else cur += ch }
    else { if (ch === '"') inQ = true; else if (ch === ',') { out.push(cur); cur = '' } else cur += ch }
  }
  out.push(cur); return out
}
const ecdict = new Map()
for (const line of readFileSync(join(here, '..', '.work', 'raw', 'ecdict.csv'), 'utf8').split('\n')) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const word = (f[0] || '').toLowerCase()
  if (!word) continue
  ecdict.set(word, { tag: (f[7] || '').split(' ').filter(Boolean), collins: Number(f[5] || 0), bnc: Number(f[8] || 0), frq: Number(f[9] || 0), pos: f[4] || '', translation: (f[3] || '').split('\\n')[0] })
}
function diff(e) {
  const easy = e.tag.includes('zk') || e.tag.includes('gk') || e.collins === 5 || (e.bnc > 0 && e.bnc < 3000)
  if (easy) return 1
  const hard = (e.tag.includes('cet6') || e.tag.includes('toefl')) && (e.bnc > 10000 || e.bnc === 0)
  return hard ? 5 : 3
}
function exam(e) {
  return ['zk', 'gk', 'cet4', 'cet6'].some((t) => e.tag.includes(t)) ? 'S' : (['toefl', 'ielts', 'gre'].some((t) => e.tag.includes(t)) ? 'E' : '-')
}

// 草稿家族（id: 候选词，含 d5 候补；最终 5-7 个）
const draft = {
  duc: ['produce', 'introduce', 'educate', 'conduct', 'reduce', 'conductor', 'deduction', 'induction', 'reproduce'],
  mit: ['submit', 'admit', 'permit', 'mission', 'dismiss', 'transmit', 'transmission', 'emit', 'admission', 'submission'],
  fer: ['offer', 'prefer', 'differ', 'transfer', 'conference', 'suffer', 'infer', 'preference', 'refer', 'inference'],
  cap: ['capture', 'capable', 'accept', 'concept', 'reception', 'capacity', 'except', 'deceive', 'intercept', 'deception'],
  ced: ['process', 'success', 'succeed', 'proceed', 'access', 'procedure', 'recession', 'concede', 'predecessor', 'recede'],
  cor: ['record', 'core', 'courage', 'encourage', 'accord', 'cordial', 'cardiac', 'discord', 'discourage'],
  vinc: ['victory', 'convince', 'convict', 'conviction', 'province', 'victorious', 'invincible', 'evict'],
  ven: ['prevent', 'event', 'invent', 'adventure', 'convenient', 'convention', 'venture', 'intervention', 'avenue', 'convene'],
  pos: ['position', 'compose', 'deposit', 'postpone', 'opponent', 'expose', 'component', 'propose', 'exponent', 'composition'],
  prim: ['primary', 'prime', 'primitive', 'principal', 'principle', 'primate', 'primarily'],
  vac: ['vacation', 'vacant', 'vacuum', 'evacuate', 'vaccinate', 'vacancy', 'vacate'],
  terr: ['territory', 'terrace', 'mediterranean', 'terrestrial', 'terrain', 'extraterrestrial'],
  mort: ['mortgage', 'mortal', 'immortal', 'mortality', 'mortuary'],
  viv: ['survive', 'vital', 'vivid', 'vitamin', 'revive', 'survival', 'revival', 'vitality', 'viable', 'survivor'],
  scrib: ['describe', 'prescription', 'subscribe', 'script', 'manuscript', 'inscription', 'postscript', 'scripture', 'description', 'subscription'],
  serv: ['serve', 'deserve', 'observe', 'preserve', 'reserve', 'servant', 'observation', 'reservation', 'conservation', 'reservoir'],
  sist: ['exist', 'insist', 'assist', 'resist', 'consist', 'persist', 'resistance', 'consistent', 'assistant', 'persistence'],
  pel: ['pulse', 'compulsory', 'impulse', 'compel', 'repel', 'propel', 'propulsion', 'expel', 'expulsion'],
  flect: ['reflect', 'flexible', 'deflect', 'deflection', 'reflection', 'reflexion', 'inflection', 'inflexible'],
  form: ['transform', 'uniform', 'reform', 'formal', 'formation', 'formula', 'perform', 'transformer', 'formality'],
  fort: ['effort', 'comfort', 'comfortable', 'uncomfortable', 'fortress', 'fortify', 'fortification'],
  fus: ['confuse', 'refuse', 'confusion', 'infusion', 'diffuse', 'fusion', 'transfusion', 'profuse'],
  medi: ['medium', 'immediate', 'media', 'medieval', 'mediate', 'intermediate', 'immediately', 'mediation'],
  metr: ['meter', 'diameter', 'symmetry', 'barometer', 'perimeter', 'metric', 'odometer', 'symmetric'],
  equ: ['equal', 'equation', 'equator', 'adequate', 'equivalent', 'equality', 'equator', 'inadequate'],
  hydr: ['hydrogen', 'hydrant', 'dehydrate', 'hydraulic', 'dehydration', 'carbohydrate'],
  therm: ['thermometer', 'thermos', 'thermal', 'hypothermia', 'thermostat', 'thermodynamics'],
  psych: ['psychology', 'psychological', 'psychiatry', 'psychiatrist', 'psychotherapy', 'psychologist'],
  nerv: ['nerve', 'nervous', 'neural', 'neuron', 'neurotic', 'nervousness', 'neurological'],
  man: ['manual', 'manufacture', 'manuscript', 'manipulate', 'manicure', 'manufacturer', 'manipulation'],
  jud: ['judge', 'justice', 'justify', 'adjust', 'injury', 'judgement', 'judicial', 'justification', 'prejudice'],
  hab: ['habit', 'exhibit', 'prohibit', 'inhabit', 'habitual', 'exhibition', 'prohibition', 'inhibit'],
  labor: ['labour', 'laboratory', 'elaborate', 'collaborate', 'collaboration', 'laborious', 'elaboration'],
  grat: ['grateful', 'congratulate', 'congratulation', 'gratitude', 'gratify', 'gratuitous'],
  mal: ['malfunction', 'malnutrition', 'malaria', 'malice', 'maltreat', 'malpractice', 'malicious'],
  sanct: ['sacrifice', 'sacred', 'saint', 'sanctuary', 'sanction', 'consecrate'],
  tele: ['telephone', 'television', 'telescope', 'telegram', 'telegraph', 'telecommunications', 'telemarketing'],
  phon: ['symphony', 'microphone', 'megaphone', 'saxophone', 'phonetics', 'phonetic', 'symphonic', 'cacophony'],
  struct: ['structure', 'instruct', 'construct', 'destruction', 'infrastructure', 'reconstruct', 'instruction', 'instrument'],
  test: ['protest', 'contest', 'detest', 'testify', 'testimony', 'testament', 'protestor'],
  liter: ['literature', 'literal', 'literacy', 'illiterate', 'obliterate', 'literary', 'literally'],
  lev: ['elevator', 'lever', 'relevant', 'elevate', 'alleviate', 'leverage', 'relevantly'],
  tempor: ['temporary', 'contemporary', 'tempo', 'temporal', 'temporarily', 'contemporaneous'],
  migr: ['immigrant', 'immigration', 'migrant', 'migrate', 'emigrate', 'migratory'],
  mir: ['mirror', 'admire', 'admiration', 'miracle', 'miraculous', 'mirage'],
  soci: ['social', 'society', 'sociology', 'associate', 'sociable', 'sociology'],
  flu: ['influence', 'fluent', 'fluid', 'fluctuate', 'influx', 'influenza', 'fluidity'],
  sci: ['science', 'conscious', 'conscience', 'subconscious', 'omniscient', 'scientific'],
  verb: ['verb', 'verbal', 'adverb', 'proverb', 'verbose', 'verbatim'],
  tact: ['contact', 'intact', 'tangible', 'tactile', 'contagious', 'tangential'],
  path: ['sympathy', 'patient', 'sympathetic', 'pathology', 'empathy', 'pathetic'],
  opt: ['adopt', 'option', 'optimism', 'optical', 'optimum', 'opt', 'adoptive'],
  chron: ['chronic', 'chronology', 'synchronize', 'chronological', 'chronicler', 'anachronism'],
  nov: ['novel', 'novelty', 'innovation', 'renovate', 'novice', 'innovative'],
  polit: ['police', 'policy', 'politics', 'politician', 'political', 'metropolitan'],
  typ: ['typical', 'stereotype', 'archetype', 'typography', 'atypical', 'typically'],
  sal: ['salary', 'salad', 'sauce', 'sausage', 'saucer', 'saline'],
  hum: ['humble', 'humidity', 'humiliate', 'exhume', 'humid', 'humiliation'],
  art: ['artificial', 'artistic', 'artifact', 'artisan', 'artwork', 'artful'],
  calc: ['calculate', 'calculator', 'calculus', 'calcium', 'calculation', 'calcify'],
  phil: ['philosophy', 'philosopher', 'philanthropy', 'philharmonic', 'bibliophile'],
  phys: ['physics', 'physical', 'physician', 'physicist', 'physiology', 'physique'],
  pet: ['compete', 'competition', 'appetite', 'perpetual', 'competitor', 'competitive'],
  aud2: ['audience', 'audio', 'audible', 'audition', 'auditorium', 'inaudible'],
  pend2: ['independent', 'pension', 'expense', 'expenditure', 'appendix', 'compensate'],
}

const only = process.argv[2]
let families = 0, passed = 0, failList = []
for (const [fam, words] of Object.entries(draft)) {
  if (only && fam !== only) continue
  families++
  const rows = words.map((w) => {
    const e = ecdict.get(w)
    if (!e) return { w, miss: true }
    return { w, d: diff(e), x: exam(e), pos: e.pos.slice(0, 12), cn: e.translation.slice(0, 18) }
  })
  const found = rows.filter((r) => !r.miss)
  const d1 = found.filter((r) => r.d === 1).length
  const d5 = found.filter((r) => r.d === 5).length
  const ok = found.length >= 3 && d1 >= 1 && d5 >= 1
  if (ok) passed++
  else failList.push(fam)
  console.log(`${ok ? '✓' : '✗'} ${fam.padEnd(7)} 词${found.length} d1=${d1} d5=${d5}`)
  for (const r of rows) {
    if (r.miss) { console.log(`      ${r.w.padEnd(20)} ✗ 不在 ECDICT`); continue }
    console.log(`      ${r.w.padEnd(20)} d${r.d}${r.x}  ${r.pos.padEnd(12)} ${r.cn}`)
  }
}
console.log(`\n${passed}/${families} 个家族过 A23${failList.length ? '；未过：' + failList.join('、') : ''}`)
