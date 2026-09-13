// D 最终口径实验：X1 的 d1/d5 统计范围（仅 pass62 vs 全家族）
import fs from 'node:fs';
import { norm, difficulty } from './lib.mjs';

const candidates = JSON.parse(fs.readFileSync('scripts/.work/derived/roots.candidates.json', 'utf8')).entries;
const cigen = JSON.parse(fs.readFileSync('scripts/.work/raw/cigen-roots_affixes.json', 'utf8'));
const s3 = JSON.parse(fs.readFileSync('scripts/lib/stage3-content.json', 'utf8'));
const legacy = JSON.parse(fs.readFileSync('scripts/lib/legacy-morphemes.json', 'utf8'));
const ecdict = JSON.parse(fs.readFileSync('scripts/verify-independent/out/ecdict-index.json', 'utf8'));
const roots = candidates.filter(c => c.type === 'root');

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
  const canForce = diff === 'd5' && e.tags.some(t => ['toefl', 'ielts', 'gre', 'cet6'].includes(t));
  return { pass62: passTag && passCom, canForce, diff };
}
const usedSurfaces = new Set();
for (const m of [...(s3.extraMorphemes || []), ...(legacy.morphemes || [])]) {
  if (m.type !== 'root') continue;
  usedSurfaces.add(norm(m.id));
  for (const a of m.allomorphs || []) usedSurfaces.add(norm(a));
}

const rows = [];
for (const cand of roots) {
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
        if (w.endsWith(s) && w.length > s.length + 1) continue;
        family.add(w);
      }
    }
  }
  let uS = 0, uF = 0, d1S = 0, d5S = 0, d1F = 0, d5F = 0, d1All = 0, d5All = 0;
  for (const w of family) {
    const j = judge(w);
    if (!j) continue;
    if (j.diff === 'd1') d1All++;
    if (j.diff === 'd5') d5All++;
    if (j.pass62) { uS++; uF++; if (j.diff === 'd1') { d1S++; d1F++; } if (j.diff === 'd5') { d5S++; d5F++; } }
    else if (j.canForce) { uF++; if (j.diff === 'd1') d1F++; if (j.diff === 'd5') d5F++; }
  }
  const used = surfaces.some(s => usedSurfaces.has(s));
  rows.push({ id: cand.id, uS, uF, d1S, d5S, d1F, d5F, d1All, d5All, used });
}
function ev(sel) {
  let p = 0, u = 0;
  for (const r of rows) if (sel(r)) { p++; if (!r.used) u++; }
  return `${p}/${u}`;
}
console.log('X1 (d1/d5=仅pass62): ', ev(r => r.uS >= 3 && r.d1S >= 1 && r.d5S >= 1), ' 目标 49/27');
console.log('X1 (d1/d5=全家族):   ', ev(r => r.uS >= 3 && r.d1All >= 1 && r.d5All >= 1), ' 目标 49/27');
console.log('X1 (可用=pass62,d5=保送口径):', ev(r => r.uS >= 3 && r.d1F >= 1 && r.d5F >= 1), ' 目标 49/27');
console.log('X2:', ev(r => r.uF >= 3 && r.d1F >= 1 && r.d5F >= 1), ' 目标 138/95');
console.log('X3:', ev(r => r.uF >= 3 && r.d1F >= 1), ' 目标 164/116');
// 未用候选失败原因（X2）
const fail = { less3: 0, noD1: 0, noD5: 0 };
for (const r of rows) {
  if (r.used || (r.uF >= 3 && r.d1F >= 1 && r.d5F >= 1)) continue;
  if (r.uF < 3) fail.less3++;
  else if (r.d1F < 1) fail.noD1++;
  else fail.noD5++;
}
console.log('X2 未用失败:', JSON.stringify(fail), ' 目标 209/28/21');
