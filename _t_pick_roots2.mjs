// 高质量探针：单次读取 ECDICT 建索引，然后对每个候选家族评估 d1/d5+ 可用词。
import { readFileSync } from 'node:fs'

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQ = false
      } else cur += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { out.push(cur); cur = '' }
      else cur += ch
    }
  }
  out.push(cur)
  return out
}

console.log('读 ECDICT 建索引…')
const ecdict = new Map()
for (const line of readFileSync('scripts/.work/raw/ecdict.csv', 'utf8').split('\n')) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const word = (f[0] || '').toLowerCase()
  ecdict.set(word, {
    word, tag: (f[7] || '').split(' ').filter(Boolean), collins: Number(f[5] || 0),
    oxford: Number(f[6] || 0), bnc: Number(f[8] || 0), frq: Number(f[9] || 0),
  })
}
console.log(`索引建好，共 ${ecdict.size} 个词\n`)

const reviewed = JSON.parse(readFileSync('scripts/.work/derived/roots.reviewed.json', 'utf8'))
const revById = new Map((reviewed.entries || reviewed).map((e) => [e.id, e]))

const pools = {
  aud: ['audio', 'audience', 'audible', 'auditorium', 'auditor', 'audition'],
  bio: ['biology', 'biography', 'antibiotic', 'biosphere', 'biologist', 'biotechnology', 'biochemical'],
  cent: ['century', 'percent', 'centimeter', 'centigrade', 'centennial', 'centenary'],
  chron: ['chronic', 'chronicle', 'chronological', 'synchronize', 'synchronized', 'chronology'],
  cred: ['credit', 'credible', 'incredible', 'credential', 'discredit', 'credibility'],
  grad: ['grade', 'graduate', 'gradual', 'degrade', 'upgrade', 'gradation'],
  ject: ['project', 'object', 'reject', 'inject', 'eject', 'subject', 'injection'],
  log: ['logic', 'logical', 'dialogue', 'apology', 'catalog', 'monologue'],
  vers: ['universe', 'version', 'reverse', 'diverse', 'versatile', 'inverse', 'diversify', 'controversy'],
  fer: ['offer', 'prefer', 'refer', 'transfer', 'suffer', 'confer', 'fertile', 'conference', 'reference'],
  pos: ['position', 'positive', 'compose', 'expose', 'propose', 'oppose', 'deposit', 'dispose', 'composer', 'opposition'],
  pel: ['compel', 'expel', 'propel', 'repel', 'impel', 'expulsion', 'propeller'],
  pend: ['depend', 'independent', 'suspend', 'expense', 'expensive', 'pendulum', 'appendix', 'dependence'],
  phon: ['phone', 'telephone', 'microphone', 'symphony', 'phonetic', 'stereo'],
  phot: ['photo', 'photograph', 'photography', 'photographic', 'photosynthesis', 'photocopy'],
  graph: ['graph', 'graphic', 'geography', 'biography', 'paragraph', 'telegraph', 'photograph', 'photography'],
  scrib: ['describe', 'description', 'prescribe', 'subscribe', 'script', 'manuscript', 'transcribe'],
  spir: ['spirit', 'inspire', 'aspire', 'expire', 'conspire', 'inspiration', 'respire', 'spiritual'],
  tract: ['attract', 'extract', 'contract', 'distract', 'tractor', 'traction', 'abstract', 'protract'],
  voc: ['voice', 'vocal', 'vocabulary', 'advocate', 'provoke', 'vocation', 'invoke', 'evoke'],
  viv: ['vivid', 'survive', 'revive', 'vital', 'survival', 'vivacity'],
  val: ['value', 'valuable', 'evaluate', 'valid', 'invalid', 'validity', 'prevail', 'prevalent'],
  ven: ['prevent', 'invent', 'convention', 'event', 'adventure', 'convenient', 'revenge', 'venue'],
  nat: ['nature', 'natural', 'nation', 'national', 'native', 'international', 'innate'],
  man: ['manage', 'manual', 'manufacture', 'manner', 'manuscript', 'manipulate', 'manager', 'manual'],
  min: ['minute', 'minor', 'minority', 'minimum', 'minister', 'administer', 'diminish', 'minimal'],
  mob: ['mobile', 'automobile', 'mobilize', 'mobility', 'immobilize', 'mobilization'],
  morph: ['morphology', 'amorphous', 'polymorph', 'metamorphosis', 'anthropomorphic'],
  press: ['pressure', 'express', 'impress', 'depress', 'compress', 'oppress', 'suppress', 'pressing'],
  prob: ['prove', 'approve', 'improve', 'probable', 'probably', 'probe', 'approval', 'probability'],
  reg: ['regular', 'region', 'regulate', 'regulation', 'irregular', 'regime', 'regent'],
  sens: ['sense', 'sensitive', 'sensation', 'sensible', 'sensory', 'consent', 'sentence'],
  serv: ['serve', 'service', 'servant', 'preserve', 'reserve', 'conservation', 'observe', 'observatory'],
  sim: ['similar', 'simply', 'similarity', 'simulate', 'simultaneous', 'resemble', 'assemble'],
  sta: ['stand', 'standard', 'station', 'stability', 'stable', 'establish', 'statue', 'status', 'restaurant'],
  strict: ['strict', 'restrict', 'restriction', 'district', 'restraint', 'stringent'],
  struct: ['structure', 'construct', 'instruction', 'destruction', 'instructor', 'structural', 'construction'],
  terr: ['territory', 'terrible', 'terror', 'terrific', 'terrestrial', 'subterranean', 'terrace'],
  tele: ['telephone', 'television', 'telegram', 'telescope', 'telecom', 'telepathy'],
  temp: ['temperature', 'temporary', 'tempo', 'contemporary', 'temple'],
  tend: ['attend', 'extend', 'intend', 'tendency', 'contend', 'extensive', 'tension', 'intense', 'extension', 'intention', 'attention'],
  therm: ['thermal', 'thermometer', 'thermos', 'geothermal', 'thermostat'],
  vol: ['volume', 'evolve', 'revolve', 'revolution', 'involve', 'volunteer', 'evolution', 'voluntary'],
  duc2: ['produce', 'introduce', 'conduct', 'reduce', 'deduct', 'induce', 'seduce', 'reproduce', 'product', 'production', 'education', 'introduction', 'conductor', 'deduction'],
  act2: ['action', 'active', 'react', 'interaction', 'transaction', 'counteract', 'activity', 'activate', 'reactor', 'exact'],
  doc2: ['doctor', 'document', 'documentary', 'doctrine'],
  fac2: ['factory', 'factor', 'facility', 'manufacture', 'facilitate', 'faction', 'benefactor', 'defect'],
  gen2: ['general', 'generate', 'generation', 'genetic', 'generous', 'indigenous', 'genesis', 'gender', 'gene'],
  ped: ['pedal', 'pedestrian', 'expedition', 'pediatric', 'centipede'],
  phon2: [],
}

function diff(r) {
  if (!r) return '?'
  const easy = r.tag.includes('zk') || r.tag.includes('gk') || r.collins === 5 || (r.bnc > 0 && r.bnc < 3000)
  const hard = (r.tag.includes('cet6') || r.tag.includes('toefl')) && (r.bnc > 10000 || r.bnc === 0)
  return easy ? 1 : hard ? 5 : 3
}

for (const [root, words] of Object.entries(pools)) {
  const inReviewed = revById.has(root)
  const ok = []
  for (const w of words) {
    const r = ecdict.get(w)
    if (!r) continue
    const pass1 = r.tag.some((t) => ['zk', 'gk', 'cet4', 'cet6'].includes(t))
    const pass4 = (r.collins || r.oxford) || (r.bnc > 0 && r.bnc < 20000) || (r.frq > 0 && r.frq < 20000)
    if (pass1 && pass4) ok.push({ w, d: diff(r), tag: r.tag.slice(0, 5).join(' '), bnc: r.bnc })
  }
  const d1 = ok.some((r) => r.d === 1), d5 = ok.some((r) => r.d === 5)
  const pass = d1 && d5
  if (pass) {
    console.log(`★ ${root.padEnd(8)} ${inReviewed ? '✓建模' : '✗未建模'} 可用${ok.length}词：`)
    for (const r of ok) console.log(`    ${r.w.padEnd(15)} d${r.d}  tag=[${r.tag}] bnc=${r.bnc}`)
  }
}