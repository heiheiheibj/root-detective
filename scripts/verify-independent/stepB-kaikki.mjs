// 计算 B：kaikki 权威词素提取（文档第 3 节）
// 用法: node stepB-kaikki.mjs [limitLines]   （不传 limit 则全量）
// 流式逐行读取（readline），绝不 readFileSync
import fs from 'node:fs';
import readline from 'node:readline';
import { norm } from './lib.mjs';

const FILE = 'scripts/.work/raw/kaikki-English.jsonl';
const limit = Number(process.argv[2]) || Infinity; // 采样：200001
const tag = Number.isFinite(limit) ? `-sample${limit - 1}` : '-full';
const OUT_SPLITS = `scripts/verify-independent/out/splits${tag}.json`;
const OUT_MORPHS = `scripts/verify-independent/out/morpheme-words${tag}.json`;

// 3.2 模板优先级（第一个命中者胜出）
const TEMPLATE_PRIORITY = [
  'surf', 'prefix', 'pre', 'suffix', 'suf', 'confix', 'affix', 'af',
  'compound/affix', 'compound', 'com',
];

// 3.4 文本解析正则（按序，第一个匹配且片段含 '+' 的胜出）
const TEXT_RES = [
  /equivalent to ([^.;]+)/i,
  /surface analysis,?\s*([^.;]+)/i,
  /^From ([^.;]*\+[^.;]*)/i,
  /from ([^.;]*\+[^.;]*?)(?:[.;]|$)/i,
];

let scanned = 0;            // 扫描行数
let parseOk = 0;            // 含子串且 JSON.parse 成功
const splits = new Map();   // word -> parts[]
const morphemeWords = new Map(); // morpheme -> Set<word>

/** 3.3 从模板 args 取词素：纯数字键（跳过 "1"），按数字升序 */
function partsFromTemplate(tpl) {
  const entries = Object.entries(tpl.args || {})
    .filter(([k]) => /^\d+$/.test(k) && k !== '1')
    .map(([k, v]) => [Number(k), v])
    .sort((a, b) => a[0] - b[0]);
  const parts = [];
  for (const [, v] of entries) {
    const p = norm(v);
    if (p) parts.push(p);
  }
  return parts;
}

/** 3.4 文本解析，成功返回 ≥2 词素数组，否则 null */
function partsFromText(obj) {
  const text = obj.etymology_text;
  if (typeof text !== 'string') return null;
  for (const re of TEXT_RES) {
    const m = text.match(re);
    if (!m) continue;
    const fragment = m[1];
    if (!fragment.includes('+')) continue; // 不含 + 则继续试下一个正则
    const pieces = fragment.split('+')
      .map(seg => norm(String(seg).replace(/\([^)]*\)/g, ' ')))
      .filter(p => p.length >= 2 && p.length <= 20 && /^[a-z]+$/.test(p));
    if (pieces.length >= 2) return pieces;
    return null; // 含 + 的首个片段胜出；其结果 <2 个则整体放弃
  }
  return null;
}

const rl = readline.createInterface({
  input: fs.createReadStream(FILE, { encoding: 'utf8' }),
  crlfDelay: Infinity,
});

for await (const line of rl) {
  scanned++;
  if (scanned > limit) break;
  if (!line.includes('"etymology_templates"')) continue;
  let obj;
  try { obj = JSON.parse(line); } catch { continue; }
  parseOk++;
  if (obj.lang_code !== 'en') continue;
  const word = norm(obj.word);
  if (!word) continue;
  // 3.5 每个词只记第一条成功拆分
  // VI_RAWKEY=1 时 splits 以原始 obj.word 为键（验证文档分歧的假设）
  const splitKey = process.env.VI_RAWKEY ? String(obj.word) : word;
  if (splits.has(splitKey)) continue;

  // 3.2/3.3 模板路径：取优先级中第一个命中的模板，不足 2 个则转文本解析
  let parts = null;
  let source = null;
  const tpls = obj.etymology_templates;
  if (Array.isArray(tpls)) {
    for (const name of TEMPLATE_PRIORITY) {
      const tpl = tpls.find(t => t.name === name);
      if (tpl) {
        const p = partsFromTemplate(tpl);
        if (p.length >= 2) { parts = p; source = 'tpl'; }
        break; // 无论是否拿到 ≥2，第一个命中的模板即止
      }
    }
  }
  // 3.4 文本路径（模板拿不到 ≥2 个时）
  if (!parts) {
    const p = partsFromText(obj);
    if (p) { parts = p; source = 'text'; }
  }
  if (!parts || parts.length < 2) continue;

  splits.set(splitKey, { parts, source });
  for (const m of new Set(parts)) {
    if (!morphemeWords.has(m)) morphemeWords.set(m, new Set());
    morphemeWords.get(m).add(word);
  }
}

// 分档统计（对 morphemeWords 的词集合大小）
const buckets = { 1: 0, 2: 0, '3-4': 0, '5-9': 0, '10-19': 0, '20-49': 0, '50+': 0 };
let ge3 = 0, ge5 = 0, ge10 = 0;
for (const [, ws] of morphemeWords) {
  const n = ws.size;
  if (n === 1) buckets[1]++;
  else if (n === 2) buckets[2]++;
  else if (n <= 4) buckets['3-4']++;
  else if (n <= 9) buckets['5-9']++;
  else if (n <= 19) buckets['10-19']++;
  else if (n <= 49) buckets['20-49']++;
  else buckets['50+']++;
  if (n >= 3) ge3++;
  if (n >= 5) ge5++;
  if (n >= 10) ge10++;
}

// 最高频词素
let topM = '-', topN = 0;
for (const [m, ws] of morphemeWords) if (ws.size > topN) { topM = m; topN = ws.size; }

fs.mkdirSync('scripts/verify-independent/out', { recursive: true });
fs.writeFileSync(OUT_SPLITS, JSON.stringify(Object.fromEntries(splits)));
fs.writeFileSync(OUT_MORPHS,
  JSON.stringify(Object.fromEntries([...morphemeWords].map(([m, ws]) => [m, [...ws]]))));

const label = Number.isFinite(limit) ? `前 ${limit - 1} 行采样` : '全量';
console.log(`=== 计算 B（${label}）===`);
console.log(`扫描行数: ${scanned - (scanned > limit ? 1 : 0)}`);
console.log(`含 "etymology_templates" 且解析成功: ${parseOk}`);
console.log(`拿到 ≥2 词素拆分的词数: ${splits.size}`);
console.log(`词素总数: ${morphemeWords.size}`);
console.log(`分档 1/2/3-4/5-9/10-19/20-49/50+: ${buckets[1]} / ${buckets[2]} / ${buckets['3-4']} / ${buckets['5-9']} / ${buckets['10-19']} / ${buckets['20-49']} / ${buckets['50+']}`);
console.log(`≥3 词: ${ge3} / ≥5 词: ${ge5} / ≥10 词: ${ge10}`);
console.log(`最高频词素: ${topM} = ${topN} 词`);
console.log(`输出: ${OUT_SPLITS}, ${OUT_MORPHS}`);
