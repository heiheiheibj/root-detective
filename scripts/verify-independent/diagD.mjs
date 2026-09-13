// 诊断 D：定位与文档分歧的候选（索引进版本）
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
let mnTotal = 0;
for (const l of fs.readFileSync('scripts/.work/raw/morphynet-eng-derivational.tsv', 'utf8').split('\n')) {
  if (!l) continue;
  const cols = l.split('\t');
  if (cols.length < 6) continue;
  mnTotal++;
  const m = norm(cols[4]);
  if (!m) continue;
  if (!mnIndex.has(m)) mnIndex.set(m, []);
  mnIndex.get(m).push({ a: norm(cols[0]), b: norm(cols[1]) });
}
console.log('morphynet 有效数据行:', mnTotal, ' 不同 morpheme 数:', mnIndex.size);

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
  const canForce = e.tags.includes('toefl') || e.tags.includes('ielts') || e.tags.includes('gre') || e.tags.includes('cet6');
  return { pass62: passTag && passCom, canForce, diff: difficulty(e.tags, e.collins, e.bnc) };
}

const usedSurfaces = new Set();
for (const m of [...(s3.extraMorphemes || []), ...(legacy.morphemes || [])]) {
  if (m.type !== 'root') continue;
  usedSurfaces.add(norm(m.id));
  for (const a of m.allomorphs || []) usedSurfaces.add(norm(a));
}

// 变体开关：VI_MN_TAIL=1 启用词尾剔除（文档默认），VI_SRC=cigen|ex|mn|all 控制来源
const OPT = {
  mnNoTail: process.env.VI_MN_NOTAIL !== '1',  // 默认启用「不在词尾」剔除
  surfacesWithShort: process.env.VI_SHORT === '1', // 保留长度<3 surface
};

function collect(cand) {
  const surfaces = surfacesOf(cand).concat(
    OPT.surfacesWithShort ? [...new Set([norm(cand.id), ...(cand.allomorphs || []).map(norm)])].filter(s => s.length > 0 && s.length < 3) : []
  );
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
        if (OPT.mnNoTail && w.endsWith(s) && w.length > s.length + 1) continue;
        family.add(w);
      }
    }
  }
  return family;
}

const rows = [];
for (const cand of roots) {
  const family = collect(cand);
  let uS = 0, uF = 0, d1S = 0, d5S = 0, d1F = 0, d5F = 0;
  for (const w of family) {
    const j = judge(w);
    if (!j) continue;
    if (j.pass62) {
      uS++; uF++;
      if (j.diff === 'd1') { d1S++; d1F++; }
      if (j.diff === 'd5') { d5S++; d5F++; }
    } else if (j.canForce) {
      uF++;
      if (j.diff === 'd1') d1F++;
      if (j.diff === 'd5') d5F++;
    }
  }
  rows.push({
    id: cand.id, fam: family.size, uS, uF,
    d1S, d5S, d1F, d5F, // S=仅 pass62 词; F=pass62+canForce 词
    used: surfacesOf(cand).some(s => usedSurfaces.has(s)),
  });
}

function evaluate(sel) {
  let pass = 0, passUnused = 0;
  for (const r of rows) if (sel(r)) { pass++; if (!r.used) passUnused++; }
  return { pass, passUnused };
}
// X1 严格 6.2 → 可用词/d1/d5 都只算 pass62 词；X2/X3 允许保送 → 算 pass62+canForce 词
const X1 = evaluate(r => r.uS >= 3 && r.d1S >= 1 && r.d5S >= 1);
const X2 = evaluate(r => r.uF >= 3 && r.d1F >= 1 && r.d5F >= 1);
const X3 = evaluate(r => r.uF >= 3 && r.d1F >= 1);
console.log(`开关 mnNoTail=${OPT.mnNoTail} shortSurfaces=${OPT.surfacesWithShort}`);
console.log('X1:', JSON.stringify(X1), '| X2:', JSON.stringify(X2), '| X3:', JSON.stringify(X3));
console.log('已用候选数:', rows.filter(r => r.used).length);

// 失败原因分布（未用）
const fail = { less3: 0, noD1: 0, noD5: 0 };
for (const r of rows) {
  if (r.used) continue;
  if (r.uF >= 3 && r.d1 >= 1 && r.d5 >= 1) continue;
  if (r.uF < 3) fail.less3++;
  else if (r.d1 < 1) fail.noD1++;
  else fail.noD5++;
}
console.log('未用失败:', JSON.stringify(fail), '未用总数:', rows.filter(r => !r.used).length);

fs.writeFileSync('scripts/verify-independent/out/diagD-rows.json', JSON.stringify(rows));
// X2 合格候选 id 列表
console.log('X2 合格(未用)前 20:', rows.filter(r => r.uF >= 3 && r.d1 >= 1 && r.d5 >= 1 && !r.used).slice(0, 20).map(r => `${r.id}(${r.uF}/${r.d1}/${r.d5})`).join(' '));
