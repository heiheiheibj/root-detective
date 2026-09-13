// d5/d1 候补词核查：为 A23 未过的家族找 d5（或补 d1）。只打印判定，不解释。
// 跑法：node scripts/tools/check-d5.mjs
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
  const w = (f[0] || '').toLowerCase()
  if (!w) continue
  ecdict.set(w, { tag: (f[7] || '').split(' ').filter(Boolean), collins: Number(f[5] || 0), bnc: Number(f[8] || 0), cn: (f[3] || '').split('\\n')[0].slice(0, 14) })
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
const groups = {
  duc: ['misconduct', 'conduction', 'deductive', 'reproduction', 'reproduce', 'educt', 'semiconductor'],
  mit: ['omission', 'intermittent', 'emissary', 'intermission', 'unremitting', 'remission', 'transmit', 'submission', 'admission'],
  fer: ['fertile', 'fertilizer', 'deference', 'referendum', 'transferable', 'inference', 'fertility'],
  cap: ['susceptible', 'recipient', 'captive', 'captivity', 'incipient', 'deception', 'deceptive', 'occupation'],
  ced: ['recession', 'secession', 'cessation', 'accession', 'concession', 'recede', 'conceding', 'necessity'],
  ven: ['intervene', 'intervention', 'advent', 'circumvent', 'supervene', 'convene', 'preventable', 'avenue'],
  viv: ['revival', 'revitalize', 'convivial', 'vivisect', 'vivacity', 'vitality', 'vividness'],
  scrib: ['transcribe', 'transcription', 'conscript', 'circumscribe', 'proscribe', 'postscript', 'inscription', 'ascribe'],
  serv: ['observatory', 'conservationist', 'servitude', 'subservient', 'servile', 'preservation', 'reservoir', 'reservation'],
  sist: ['persistence', 'irresistible', 'subsistence', 'desist', 'resistant', 'irresistibly', 'existence'],
  medi: ['mediocre', 'mediocrity', 'mediation', 'intermediary', 'medieval', 'mediate'],
  metr: ['centimeter', 'centimetre', 'kilometer', 'kilometre', 'millimetre', 'geometrical', 'symmetric', 'optometrist', 'diameter', 'meter', 'metric'],
  psych: ['psychedelic', 'psychosomatic', 'psychoanalytic', 'psychopath', 'psychiatry', 'psychotherapy'],
  nerv: ['neurosis', 'neurology', 'neurosurgery', 'neurological', 'neuron', 'neurotic'],
  man: ['manipulation', 'emancipation', 'manifest', 'manacle', 'mandate', 'manufacture', 'manual'],
  jud: ['judicious', 'adjudicate', 'prejudicial', 'jurisprudence', 'prejudice', 'judicial'],
  mal: ['malady', 'malformed', 'malaise', 'maltreatment', 'malice', 'malicious', 'malnutrition', 'malaria', 'malfunction'],
  tele: ['telecommunications', 'telecast', 'televise', 'telegraphic', 'telex', 'telecommunication'],
  struct: ['infrastructure', 'obstruction', 'reconstruct', 'superstructure', 'instrumental', 'obstruct'],
  sci: ['omniscient', 'prescient', 'plebiscite', 'conscience', 'subconscious', 'scientific', 'science'],
  verb: ['verb', 'verbal', 'adverb', 'proverb', 'verbose', 'verbatim', 'proverbial', 'adverbial', 'verbalize'],
  path: ['pathetic', 'apathy', 'pathology', 'empathy', 'antipathy', 'pathologist', 'sympathy', 'patient'],
  opt: ['optimum', 'optician', 'optometry', 'optimist', 'optimism', 'optimal', 'adopt'],
  chron: ['chronicle', 'chronology', 'synchronize', 'chronological', 'synchronization'],
  polit: ['cosmopolitan', 'polity', 'politicize', 'metropolitan', 'politician', 'politics'],
  typ: ['stereotype', 'typographical', 'archetype', 'atypical', 'typography', 'typically'],
  pet: ['impetus', 'impetuous', 'petulant', 'perpetuity', 'perpetual', 'appetizer'],
  hum: ['humiliate', 'humility', 'posthumous', 'humus', 'humid', 'humidity', 'exhume'],
  phon: ['phonetics', 'phonetic', 'symphony', 'microphone', 'megaphone', 'saxophone', 'phonetician', 'euphony'],
  struct2: ['construct', 'instruction', 'destruction', 'instrument'],
  metr2: ['thermometer', 'speedometer', 'odometer', 'pedometer'],
}
for (const [g, words] of Object.entries(groups)) {
  const line = words.map((w) => {
    const e = ecdict.get(w)
    if (!e) return `${w}:—`
    return `${w}:d${diff(e)}${exam(e)}`
  }).join('  ')
  console.log(`${g.padEnd(8)} ${line}`)
}
