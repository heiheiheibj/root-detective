// 计算 C：考试词覆盖率（文档第 4 节）
// 用法: node stepC-coverage.mjs <splitsJson> <morphemeWordsJson>
import fs from 'node:fs';
import { norm } from './lib.mjs';

const [, , splitsFile, morphsFile] = process.argv;
const examWords = new Set(JSON.parse(fs.readFileSync('scripts/verify-independent/out/exam-words.json', 'utf8')));
const splitsRaw = JSON.parse(fs.readFileSync(splitsFile, 'utf8'));
const morphWords = new Map(Object.entries(JSON.parse(fs.readFileSync(morphsFile, 'utf8'))));

// 4.1 覆盖判定
const covered = new Map(); // exam word -> parts
const byTagCovered = { zk: 0, gk: 0, cet4: 0, cet6: 0 };
// 考试词各 tag 的分母：需要 ECDICT 的 tag 信息 —— 从 A 步骤落盘的全量索引取
const ecdict = JSON.parse(fs.readFileSync('scripts/verify-independent/out/ecdict-index.json', 'utf8'));

for (const w of examWords) {
  const s = splitsRaw[w];
  if (s && s.parts && s.parts.length >= 2) covered.set(w, s.parts);
}

// 各 tag 分母与覆盖数
const tagTotal = { zk: 0, gk: 0, cet4: 0, cet6: 0 };
for (const w of examWords) {
  const info = ecdict[w];
  if (!info) continue;
  for (const t of info.tags) if (t in tagTotal) tagTotal[t]++;
}
for (const w of covered.keys()) {
  const info = ecdict[w];
  if (!info) continue;
  for (const t of info.tags) if (t in byTagCovered) byTagCovered[t]++;
}

// 4.2 词素统计（基于全量 morphemeWords 不行 —— 4.2 只对 covered 词的 parts 重新统计）
const covMorphWords = new Map(); // morpheme -> Set<covered exam word>
const posCount = new Map();      // morpheme -> { head, mid, tail }
for (const [w, parts] of covered) {
  for (let i = 0; i < parts.length; i++) {
    const m = parts[i];
    if (!covMorphWords.has(m)) covMorphWords.set(m, new Set());
    covMorphWords.get(m).add(w);
    const pos = posCount.get(m) || { head: 0, mid: 0, tail: 0 };
    if (i === 0) pos.head++;
    else if (i === parts.length - 1) pos.tail++;
    else pos.mid++;
    posCount.set(m, pos);
  }
}

// 分档
const buckets = { 1: 0, 2: 0, '3-4': 0, '5-9': 0, '10-19': 0, '20-49': 0, '50+': 0 };
for (const [, ws] of covMorphWords) {
  const n = ws.size;
  if (n === 1) buckets[1]++;
  else if (n === 2) buckets[2]++;
  else if (n <= 4) buckets['3-4']++;
  else if (n <= 9) buckets['5-9']++;
  else if (n <= 19) buckets['10-19']++;
  else if (n <= 49) buckets['20-49']++;
  else buckets['50+']++;
}

// 4.3 累计覆盖量
const cumResults = [];
for (const k of [3, 5, 10, 20]) {
  const hit = [...covMorphWords].filter(([, ws]) => ws.size >= k);
  const union = new Set();
  for (const [, ws] of hit) for (const w of ws) union.add(w);
  cumResults.push({ k, morphemes: hit.length, words: union.size });
}

// 前 5 覆盖词素
const top5 = [...covMorphWords]
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 5)
  .map(([m, ws]) => {
    const p = posCount.get(m);
    return `${m}: ${ws.size} (head ${p.head} / mid ${p.mid} / tail ${p.tail})`;
  });

console.log('=== 计算 C：考试词覆盖率 ===');
console.log(`covered（有拆分的考试词）: ${covered.size} / ${examWords.size} = ${(covered.size / examWords.size * 100).toFixed(1)}%`);
console.log(`未覆盖: ${examWords.size - covered.size}`);
for (const t of ['zk', 'gk', 'cet4', 'cet6']) {
  console.log(`${t}: ${byTagCovered[t]} / ${tagTotal[t]} (${(byTagCovered[t] / tagTotal[t] * 100).toFixed(1)}%)`);
}
console.log(`涉及词素数: ${covMorphWords.size}`);
console.log(`分档 1/2/3-4/5-9/10-19/20-49/50+: ${buckets[1]} / ${buckets[2]} / ${buckets['3-4']} / ${buckets['5-9']} / ${buckets['10-19']} / ${buckets['20-49']} / ${buckets['50+']}`);
for (const r of cumResults) {
  console.log(`阈值 ≥${r.k} 词: 词素 ${r.morphemes} → 覆盖考试词 ${r.words}（占已覆盖 ${(r.words / covered.size * 100).toFixed(1)}%）`);
}
console.log('覆盖最多的词素（前 5）:');
for (const line of top5) console.log(`  ${line}`);
