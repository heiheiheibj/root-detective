// 探针：为 16 个新词根找「两端都有人的家族」。每个词根试一批词，
// 输出 tag 过滤结果 + difficulty，挑出 d1 和 d5 都 ≥1 的家族。
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

// 每个候选家族：词根 id → 候选词（都是我认得的、词源干净的）
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
  pos: ['position', 'positive', 'compose', 'expose', 'propose', 'oppose', 'deposit', 'dispose', 'composer'],
  pel: ['compel', 'expel', 'propel', 'repel', 'impel', 'expulsion', 'propeller'],
  pend: ['depend', 'independent', 'suspend', 'expense', 'expensive', 'pendulum', 'appendix'],
  phon: ['phone', 'telephone', 'microphone', 'symphony', 'phonetic', 'stereophone'],
  phot: ['photo', 'photograph', 'photography', 'photographic', 'photosynthesis', 'photocopy'],
  graph: ['graph', 'graphic', 'geography', 'biography', 'paragraph', 'telegraph', 'photograph'],
  scrib: ['describe', 'description', 'prescribe', 'subscribe', 'script', 'manuscript', 'transcribe'],
  spir: ['spirit', 'inspire', 'aspire', 'expire', 'conspire', 'inspiration', 'respire'],
  tract: ['attract', 'extract', 'contract', 'distract', 'tractor', 'traction', 'abstract', 'protract'],
  voc: ['voice', 'vocal', 'vocabulary', 'advocate', 'provoke', 'vocation', 'invoke', 'evoke'],
  viv: ['vivid', 'survive', 'revive', 'vital', 'vividly', 'survival', 'vivacity'],
  val: ['value', 'valuable', 'evaluate', 'valid', 'invalid', 'validity', 'prevail'],
  ven: ['come', 'prevent', 'invent', 'convention', 'event', 'adventure', 'convenient', 'revenge'],
  nat: ['nature', 'natural', 'nation', 'national', 'native', 'international', 'innate'],
  man: ['manage', 'manual', 'manufacture', 'manner', 'manuscript', 'manipulate', 'manager'],
  min: ['minute', 'minor', 'minority', 'minimum', 'minister', 'administer', 'diminish'],
  mob: ['mobile', 'automobile', 'mobilize', 'mobility', 'demobilize', 'immobilize'],
  morph: ['morphology', 'amorphous', 'polymorph', 'metamorphosis', 'anthropomorphic'],
  natr: [],
  open: [],
  port: [],
  press: ['pressure', 'express', 'impress', 'depress', 'compress', 'oppress', 'suppress', 'pressing'],
  prob: ['prove', 'approve', 'improve', 'probable', 'probably', 'probe', 'approval', 'probability'],
  reg: ['regular', 'region', 'regulate', 'regulation', 'irregular', 'regime', 'regent'],
  sens: ['sense', 'sensitive', 'sensation', 'sensible', 'sensory', 'consent', 'sentence'],
  serv: ['serve', 'service', 'servant', 'preserve', 'reserve', 'conservation', 'observe'],
  sim: ['similar', 'simply', 'similarity', 'simulate', 'simultaneous', 'resemble', 'assemble'],
  sta: ['stand', 'standard', 'station', 'stability', 'stable', 'establish', 'statue', 'status', 'restaurant'],
  strict: ['strict', 'restrict', 'restriction', 'district', 'constrain', 'restraint', 'stringent'],
  struct: ['structure', 'construct', 'instruction', 'building', 'destruction', 'instructor', 'structural'],
  terr: ['territory', 'terrible', 'terror', 'terrific', 'terrestrial', 'subterranean', 'terrace'],
  tract2: [],
  tele: ['telephone', 'television', 'telegram', 'telescope', 'telecom', 'telepathy'],
  temp: ['temperature', 'temporary', 'tempo', 'contemporary', 'temple'],
  tend: ['attend', 'extend', 'intend', 'tendency', 'contend', 'extensive', 'tension', 'intense', 'extendable'],
  therm: ['thermal', 'thermometer', 'thermos', 'geothermal', 'thermostat'],
  vol: ['volume', 'evolve', 'revolve', 'revolution', 'involve', 'voluntarily', 'volunteer', 'evolution'],
  duct: ['produce', 'introduce', 'conduct', 'reduce', 'deduct', 'induce', 'seduce', 'reproduce', 'product', 'production', 'education', 'introduction'],
  act2: ['action', 'active', 'react', 'interaction', 'transaction', 'counteract', 'activity', 'activate', 'reactor', 'exact'],
  doc2: ['doctor', 'document', 'documentary', 'doctrine', 'conductor'],
  fac2: ['factory', 'factor', 'facility', 'manufacture', 'facilitate', 'faction', 'benefactor', 'defect'],
  gen2: ['general', 'generate', 'generation', 'genetic', 'generous', 'indigenous', 'genesis', 'gender', 'congenital', 'regenerate', 'gene'],
}

const reviewed = JSON.parse(readFileSync('scripts/.work/derived/roots.reviewed.json', 'utf8'))
const rev = (reviewed.entries || reviewed)
const revById = new Map(rev.map((e) => [e.id, e]))

// 需要建模才能切分的词素检查（简化：只查家族主词根在不在 reviewed）
console.log('== 候选家族：可用性 + d1/d5 ==\n')
for (const [root, words] of Object.entries(pools)) {
  const inReviewed = revById.has(root)
  const rows = new Map()
  for (const w of words) {
    if (rows.has(w)) continue
    rows.set(w, null)
  }
  // 从 ECDICT 填数据
  const wantIds = new Set(words)
  const all = []
  for (const line of readFileSync('scripts/.work/raw/ecdict.csv', 'utf8').split('\n')) {
    if (!line.trim()) continue
    const f = parseCsvLine(line)
    const w = (f[0] || '').toLowerCase()
    if (wantIds.has(w)) {
      const tags = (f[7] || '').split(' ').filter(Boolean)
      const collins = Number(f[5] || 0)
      const bnc = Number(f[8] || 0)
      const pass1 = tags.some((t) => ['zk', 'gk', 'cet4', 'cet6'].includes(t))
      const pass4 = (f[5] || f[6]) || (bnc > 0 && bnc < 20000) || (Number(f[9] || 0) > 0 && Number(f[9] || 0) < 20000)
      const easy = tags.includes('zk') || tags.includes('gk') || collins === 5 || (bnc > 0 && bnc < 3000)
      const hard = (tags.includes('cet6') || tags.includes('toefl')) && (bnc > 10000 || bnc === 0)
      const d = easy ? 1 : hard ? 5 : 3
      all.push({ w, d, pass1, pass4, tags: tags.slice(0, 4).join(' '), bnc })
    }
  }
  const ok = all.filter((r) => r.pass1 && r.pass4)
  const d1 = ok.filter((r) => r.d === 1).length
  const d5 = ok.filter((r) => r.d === 5).length
  const pass = d1 > 0 && d5 > 0
  console.log(`${root.padEnd(8)} ${inReviewed ? '✓建模' : '✗未建模'} ${all.length}/${words.length}词 通过(${ok.length}) d1=${d1} d5=${d5} ${pass ? '★可用' : ''}`)
  if (pass) {
    for (const r of ok) console.log(`    ${r.w.padEnd(15)} d${r.d}  tag=${r.tags} bnc=${r.bnc}`)
  }
}