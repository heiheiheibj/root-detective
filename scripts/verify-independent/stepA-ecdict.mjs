// 计算 A：ECDICT 考试词集合（文档第 2 节）
// 输出中间量：词条数、各 tag 计数、去重考试词数，并落盘考试词集合
import fs from 'node:fs';
import { norm, parseCsvLine } from './lib.mjs';

const CSV = 'scripts/.work/raw/ecdict.csv';
const OUT = 'scripts/verify-independent/out/exam-words.json';

const lines = fs.readFileSync(CSV, 'utf8').split('\n'); // ecdict.csv 约 66MB，可整读
// 首行为表头
let totalRows = 0;          // 含表头前的数据行数（norm 非空、去重前）
const tagCounts = { zk: 0, gk: 0, cet4: 0, cet6: 0 };
const exam = new Set();     // 考试词（去重）
const allWords = new Map(); // norm word -> { tags, collins, oxford, bnc, frq }（供 C/D 使用）

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line) continue;
  const f = parseCsvLine(line);
  const word = norm(f[0]);
  if (!word) continue;
  totalRows++;
  const tags = (f[7] || '').split(/\s+/).filter(Boolean);
  const collins = Number(f[5]) || 0;
  const oxford = Number(f[6]) || 0;
  const bnc = Number(f[8]) || 0;
  const frq = Number(f[9]) || 0;
  if (!allWords.has(word)) allWords.set(word, { tags, collins, oxford, bnc, frq });
  const hit = tags.filter(t => tagCounts[t] !== undefined);
  if (hit.length) {
    for (const t of hit) tagCounts[t]++;
    exam.add(word);
  }
}

fs.mkdirSync('scripts/verify-independent/out', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify([...exam]));
// 全量 ECDICT 索引（供计算 C 的 tag 分母、计算 D 的 pass62 判定使用）
fs.writeFileSync('scripts/verify-independent/out/ecdict-index.json', JSON.stringify(Object.fromEntries(allWords)));

console.log('=== 计算 A：ECDICT 考试词集合 ===');
console.log(`ECDICT 数据行数（norm 非空、去重前）: ${totalRows}`);
console.log(`tag=zk: ${tagCounts.zk}`);
console.log(`tag=gk: ${tagCounts.gk}`);
console.log(`tag=cet4: ${tagCounts.cet4}`);
console.log(`tag=cet6: ${tagCounts.cet6}`);
console.log(`考试词（去重）: ${exam.size}`);
console.log(`allWords 表大小: ${allWords.size}`);
