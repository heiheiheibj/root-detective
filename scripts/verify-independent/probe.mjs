// 探查计算 D 所需输入文件的数据结构（仅读数据文件，不碰被禁脚本）
import fs from 'node:fs';

const out = [];
const cand = JSON.parse(fs.readFileSync('scripts/.work/derived/roots.candidates.json', 'utf8'));
out.push('candidates 顶层: ' + (Array.isArray(cand) ? 'array len ' + cand.length : 'object keys ' + Object.keys(cand).join(',')));
let arr;
if (Array.isArray(cand)) arr = cand;
else {
  for (const k of Object.keys(cand)) {
    if (Array.isArray(cand[k])) { out.push('首个数组键: ' + k + ' len ' + cand[k].length); arr = cand[k]; break; }
  }
}
out.push('条数: ' + arr.length);
out.push('样例1: ' + JSON.stringify(arr[0]).slice(0, 600));
out.push('样例2: ' + JSON.stringify(arr[1]).slice(0, 600));
const types = {};
for (const c of arr) types[c.type] = (types[c.type] || 0) + 1;
out.push('type 分布: ' + JSON.stringify(types));

const cigen = JSON.parse(fs.readFileSync('scripts/.work/raw/cigen-roots_affixes.json', 'utf8'));
out.push('cigen 顶层: ' + (Array.isArray(cigen) ? 'array len ' + cigen.length : JSON.stringify(Object.keys(cigen))));
const cg = Array.isArray(cigen) ? cigen[0] : cigen[Object.keys(cigen)[0]];
out.push('cigen 首条样例: ' + JSON.stringify(cg).slice(0, 500));

const mn = fs.readFileSync('scripts/.work/raw/morphynet-eng-derivational.tsv', 'utf8').split('\n').slice(0, 4);
out.push('morphynet 前4行: ' + JSON.stringify(mn));

const wr = fs.readFileSync('scripts/.work/raw/wordroot.txt', 'utf8').split('\n').slice(0, 4);
out.push('wordroot 前4行: ' + JSON.stringify(wr));

const s3 = JSON.parse(fs.readFileSync('scripts/lib/stage3-content.json', 'utf8'));
out.push('stage3 顶层: ' + JSON.stringify(Object.keys(s3)));
if (s3.morphemes) {
  const m3 = s3.morphemes;
  out.push('stage3.morphemes: ' + (Array.isArray(m3) ? 'array len ' + m3.length : 'object'));
  const sample = Array.isArray(m3) ? m3.find(m => m.type === 'root') : null;
  out.push('stage3 root 样例: ' + JSON.stringify(sample).slice(0, 400));
}
const lm = JSON.parse(fs.readFileSync('scripts/lib/legacy-morphemes.json', 'utf8'));
out.push('legacy 顶层: ' + (Array.isArray(lm) ? 'array len ' + lm.length : JSON.stringify(Object.keys(lm))));
const lmArr = Array.isArray(lm) ? lm : (lm.morphemes || []);
const lmr = lmArr.find(m => m.type === 'root');
out.push('legacy root 样例: ' + JSON.stringify(lmr).slice(0, 400));

const sw = JSON.parse(fs.readFileSync('scripts/.work/raw/shiweihappy-roots.json', 'utf8'));
out.push('shiweihappy 顶层: ' + (Array.isArray(sw) ? 'array len ' + sw.length : JSON.stringify(Object.keys(sw))));

fs.writeFileSync('scripts/verify-independent/probe-structures.txt', out.join('\n'));
console.log('done');
