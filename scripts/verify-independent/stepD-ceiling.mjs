// 计算 D：旧口径词根天花板（文档第 5 节）
import fs from 'node:fs';
import { norm, difficulty } from './lib.mjs';

// ---- 输入 ----
const candidates = JSON.parse(fs.readFileSync('scripts/.work/derived/roots.candidates.json', 'utf8')).entries;
const cigen = JSON.parse(fs.readFileSync('scripts/.work/raw/cigen-roots_affixes.json', 'utf8'));
const morphynetLines = fs.readFileSync('scripts/.work/raw/morphynet-eng-derivational.tsv', 'utf8').split('\n');
const s3 = JSON.parse(fs.readFileSync('scripts/lib/stage3-content.json', 'utf8'));
const legacy = JSON.parse(fs.readFileSync('scripts/lib/legacy-morphemes.json', 'utf8'));
const ecdict = JSON.parse(fs.readFileSync('scripts/verify-independent/out/ecdict-index.json', 'utf8'));

const roots = candidates.filter(c => c.type === 'root');
console.log(`candidates 总数 ${candidates.length}，type=root 参与计算: ${roots.length}`);

// ---- 5.1 表面形式 ----
function surfacesOf(cand) {
  const set = new Set([norm(cand.id)]);
  for (const a of cand.allomorphs || []) set.add(norm(a));
  for (const s of set) if (s.length < 3) set.delete(s);
  return [...set].filter(s => s.length >= 3);
}

// ---- 字面包含（5.2）----
function containsSurface(word, surface) {
  if (surface.length >= 4) return word.includes(surface);
  return word.startsWith(surface) || word.endsWith(surface); // 长度=3
}

// ---- cigen 倒排索引：morpheme(norm) -> Set<word> ----
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

// ---- morphynet 按第5列(morpheme) 预索引，避免每个候选全表扫 ----
const mnIndex = new Map(); // norm(morpheme) -> [{a, b, col5}]
for (let i = 0; i < morphynetLines.length; i++) {
  const line = morphynetLines[i];
  if (!line) continue;
  const cols = line.split('\t');
  if (cols.length < 6) continue;
  const m = norm(cols[4]);
  if (!m) continue;
  if (!mnIndex.has(m)) mnIndex.set(m, []);
  mnIndex.get(m).push({ a: norm(cols[0]), b: norm(cols[1]) });
}

// ---- ECDICT 判定 ----
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

// ---- 5.4 已用词根 surfaces ----
const usedSurfaces = new Set();
function collectUsed(list) {
  for (const m of list) {
    if (m.type !== 'root') continue;
    usedSurfaces.add(norm(m.id));
    for (const a of m.allomorphs || []) usedSurfaces.add(norm(a));
  }
}
collectUsed(s3.extraMorphemes || []);
collectUsed(legacy.morphemes || []);
console.log(`usedSurfaces 大小: ${usedSurfaces.size}（含 norm 后可能为空的键，判定时会过滤）`);

// ---- 每个候选：家族词 + 三档口径判定 ----
const results = []; // {cand, usable, d1, d5, used, famCount}
for (const cand of roots) {
  const surfaces = surfacesOf(cand);
  const family = new Set();

  for (const s of surfaces) {
    // 来源1: cigen 全等
    const cg = cigenIndex.get(s);
    if (cg) for (const w of cg) family.add(w);
    // 来源2: wordroot 例词 字面包含
    for (const ex of cand.examples || []) {
      const w = norm(ex);
      if (w && containsSurface(w, s)) family.add(w);
    }
    // 来源3: morphynet 第5列全等 + 字面包含 + 词根不在词尾
    for (const row of mnIndex.get(s) || []) {
      for (const w of [row.a, row.b]) {
        if (!w || !containsSurface(w, s)) continue;
        if (w.endsWith(s) && w.length > s.length + 1) continue; // morphynet 额外剔除
        family.add(w);
      }
    }
  }

  // 5.3 难度与合格判定
  // X1 口径的 d1/d5 只数 pass62 词；X2/X3 口径的 d1/d5 数 pass62+canForce 词
  let usableStrict = 0, usableForce = 0, d1S = 0, d5S = 0, d1F = 0, d5F = 0;
  for (const w of family) {
    const j = judge(w);
    if (!j) continue;
    if (j.pass62) {
      usableStrict++; usableForce++;
      if (j.diff === 'd1') { d1S++; d1F++; }
      if (j.diff === 'd5') { d5S++; d5F++; }
    } else if (j.canForce) {
      usableForce++;
      if (j.diff === 'd1') d1F++;
      if (j.diff === 'd5') d5F++;
    }
  }

  const used = surfaces.some(s => usedSurfaces.has(s));
  results.push({ id: cand.id, familySize: family.size, usableStrict, usableForce, d1S, d5S, d1F, d5F, used });
}

// ---- 三档口径 ----
function evaluate(filterA23) {
  let pass = 0, passUnused = 0;
  const fail = { less3: 0, noD1: 0, noD5: 0 }; // 未用候选失败原因
  for (const r of results) {
    const ok = filterA23(r);
    if (ok) { pass++; if (!r.used) passUnused++; }
    else if (!r.used) {
      if (r.usableForce < 3) fail.less3++;
      else if (r.d1 < 1) fail.noD1++;
      else fail.noD5++;
    }
  }
  return { pass, passUnused, fail };
}

// 严格 6.2 + 完整 A23 / 允许保送 + 完整 A23 / 允许保送 + 放宽 d5
const X1 = evaluate(r => r.usableStrict >= 3 && r.d1S >= 1 && r.d5S >= 1);
const X2 = evaluate(r => r.usableForce >= 3 && r.d1F >= 1 && r.d5F >= 1);
const X3 = evaluate(r => r.usableForce >= 3 && r.d1F >= 1);

const usedCount = results.filter(r => r.used).length;
console.log(`已用候选数: ${usedCount} / ${results.length}`);
console.log('=== 计算 D：词根天花板 ===');
for (const [name, x] of [['X1 严格6.2+完整A23', X1], ['X2 允许保送+完整A23', X2], ['X3 允许保送+放宽d5', X3]]) {
  console.log(`${name}: 合格 ${x.pass} / 其中未用 ${x.passUnused} / 天花板 60+${x.passUnused}=${60 + x.passUnused}`);
}
console.log(`未用候选失败原因（按 X2 口径）: 词不足3个 ${X2.fail.less3} / 缺d1 ${X2.fail.noD1} / 缺d5 ${X2.fail.noD5}`);
