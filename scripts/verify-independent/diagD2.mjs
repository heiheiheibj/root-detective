// D 分歧定位：批量开关实验
import fs from 'node:fs';
import { norm, difficulty } from './lib.mjs';

const candidates = JSON.parse(fs.readFileSync('scripts/.work/derived/roots.candidates.json', 'utf8')).entries;
const cigen = JSON.parse(fs.readFileSync('scripts/.work/raw/cigen-roots_affixes.json', 'utf8'));
const s3 = JSON.parse(fs.readFileSync('scripts/lib/stage3-content.json', 'utf8'));
const legacy = JSON.parse(fs.readFileSync('scripts/lib/legacy-morphemes.json', 'utf8'));
const ecdict = JSON.parse(fs.readFileSync('scripts/verify-independent/out/ecdict-index.json', 'utf8'));
const roots = candidates.filter(c => c.type === 'root');

// families 结构探查
const famKeys = Object.keys(s3.families);
const famRoots = new Set();
for (const [k, v] of Object.entries(s3.families)) {
  famRoots.add(norm(k));
  for (const r of v.roots || []) famRoots.add(norm(r));
}
const extraRootIds = new Set((s3.extraMorphemes || []).filter(m => m.type === 'root').map(m => norm(m.id)));
const legacyRootIds = new Set((legacy.morphemes || []).filter(m => m.type === 'root').map(m => norm(m.id)));
console.log('families 键数:', famKeys.length, ' famRoots surface 数:', famRoots.size);
console.log('extraMorphemes root ids:', extraRootIds.size, ' legacy root ids:', legacyRootIds.size);

function surfacesOf(cand) {
  const set = new Set([norm(cand.id)]);
  for (const a of cand.allomorphs || []) set.add(norm(a));
  return [...set].filter(s => s.length >= 3);
}
function containsSurface(word, surface) {
  if (surface.length >= 4) return word.includes(surface);
  return word.startsWith(surface) || word.endsWith(surface);
}

const mnIndex = new Map();
for (const l of fs.readFileSync('scripts/.work/raw/morphynet-eng-derivational.tsv', 'utf8').split('\n')) {
  if (!l) continue;
  const cols = l.split('\t');
  if (cols.length < 6) continue;
  const m = norm(cols[4]);
  if (!m) continue;
  if (!mnIndex.has(m)) mnIndex.set(m, []);
  mnIndex.get(m).push({ a: norm(cols[0]), b: norm(cols[1]) });
}
const cigenIndex = new Map();
for (const e of cigen.entries) {
  const w = norm(e.word);
  if (!w) continue;
  for (const comp of e.components || []) {
    const m = norm(comp.morpheme);
    if (!m) continue;
    if (!cigenIndex.has(m)) cigenIndex.set(m, new Set());
    cigenIndex.get(m).add(w);
  }
}
function judge(word) {
  const e = ecdict[word];
  if (!e) return null;
  const passTag = e.tags.some(t => ['zk', 'gk', 'cet4', 'cet6'].includes(t));
  const passCom = e.collins > 0 || e.oxford > 0 || (e.bnc > 0 && e.bnc < 20000) || (e.frq > 0 && e.frq < 20000);
  const diff = difficulty(e.tags, e.collins, e.bnc);
  // 文档第 1 节：保送 = d5 且 tag 含 toefl/ielts/gre/cet6 之一
  const canForce = diff === 'd5' && e.tags.some(t => ['toefl', 'ielts', 'gre', 'cet6'].includes(t));
  return { pass62: passTag && passCom, canForce, diff };
}

// 预计算每个候选的家族词一次（家族词与 used 开关无关）
const famCache = new Map();
function collect(cand, mnNoTail) {
  const key = cand.id + (mnNoTail ? '|T' : '|F');
  if (famCache.has(key)) return famCache.get(key);
  const surfaces = surfacesOf(cand);
  const family = new Set();
  for (const s of surfaces) {
    const cg = cigenIndex.get(s);
    if (cg) for (const w of cg) family.add(w);
    for (const ex of cand.examples || []) {
      const w = norm(ex);
      if (w && containsSurface(w, s)) family.add(w);
    }
    for (const row of mnIndex.get(s) || []) {
      for (const w of [row.a, row.b]) {
        if (!w || !containsSurface(w, s)) continue;
        if (mnNoTail && w.endsWith(s) && w.length > s.length + 1) continue;
        family.add(w);
      }
    }
  }
  famCache.set(key, family);
  return family;
}

function run({ mnNoTail, usedMode }) {
  const usedSurfaces = new Set();
  if (usedMode === 'extra+legacy') {
    for (const m of [...(s3.extraMorphemes || []), ...(legacy.morphemes || [])]) {
      if (m.type !== 'root') continue;
      usedSurfaces.add(norm(m.id));
      for (const a of m.allomorphs || []) usedSurfaces.add(norm(a));
    }
  } else if (usedMode === 'famRoots') {
    // families 键 ∪ families.roots ∪ 其 allomorphs（从 extraMorphemes/legacy 取 allomorphs）
    const allo = new Map();
    for (const m of [...(s3.extraMorphemes || []), ...(legacy.morphemes || [])]) allo.set(norm(m.id), m.allomorphs || []);
    for (const s of famRoots) {
      usedSurfaces.add(s);
      for (const a of allo.get(s) || []) usedSurfaces.add(norm(a));
    }
  }
  let X1p = 0, X1u = 0, X2p = 0, X2u = 0, X3p = 0, X3u = 0, usedN = 0;
  for (const cand of roots) {
    const family = collect(cand, mnNoTail);
    let uS = 0, uF = 0, d1S = 0, d5S = 0, d1F = 0, d5F = 0;
    for (const w of family) {
      const j = judge(w);
      if (!j) continue;
      if (j.pass62) { uS++; uF++; if (j.diff === 'd1') { d1S++; d1F++; } if (j.diff === 'd5') { d5S++; d5F++; } }
      else if (j.canForce) { uF++; if (j.diff === 'd1') d1F++; if (j.diff === 'd5') d5F++; }
    }
    const surfaces = surfacesOf(cand);
    const used = surfaces.some(s => usedSurfaces.has(s));
    if (used) usedN++;
    if (uS >= 3 && d1S >= 1 && d5S >= 1) { X1p++; if (!used) X1u++; }
    if (uF >= 3 && d1F >= 1 && d5F >= 1) { X2p++; if (!used) X2u++; }
    if (uF >= 3 && d1F >= 1) { X3p++; if (!used) X3u++; }
  }
  console.log(`mnNoTail=${mnNoTail} used=${usedMode} 已用=${usedN} | X1 ${X1p}/${X1u} | X2 ${X2p}/${X2u} | X3 ${X3p}/${X3u}`);
}

run({ mnNoTail: true, usedMode: 'extra+legacy' });
run({ mnNoTail: false, usedMode: 'extra+legacy' });
run({ mnNoTail: true, usedMode: 'famRoots' });
run({ mnNoTail: false, usedMode: 'famRoots' });
console.log('目标: X1 49/27 | X2 138/95 | X3 164/116, 天花板 155');
