// 探查 cigen.entries 与 stage3 词素结构
import fs from 'node:fs';
const out = [];

const cigen = JSON.parse(fs.readFileSync('scripts/.work/raw/cigen-roots_affixes.json', 'utf8'));
out.push('cigen.roots 类型: ' + (Array.isArray(cigen.roots) ? 'array len ' + cigen.roots.length : JSON.stringify(Object.keys(cigen.roots)).slice(0, 200)));
out.push('cigen.roots 样例: ' + JSON.stringify(Array.isArray(cigen.roots) ? cigen.roots[0] : cigen.roots[Object.keys(cigen.roots)[0]]).slice(0, 500));
out.push('cigen.entries len: ' + cigen.entries.length);
out.push('cigen.entries[0]: ' + JSON.stringify(cigen.entries[0]).slice(0, 500));
out.push('cigen.entries[1]: ' + JSON.stringify(cigen.entries[1]).slice(0, 500));

const s3 = JSON.parse(fs.readFileSync('scripts/lib/stage3-content.json', 'utf8'));
out.push('s3.extraMorphemes 类型: ' + (Array.isArray(s3.extraMorphemes) ? 'array len ' + s3.extraMorphemes.length : typeof s3.extraMorphemes));
if (Array.isArray(s3.extraMorphemes) && s3.extraMorphemes.length) {
  out.push('extraMorphemes[0]: ' + JSON.stringify(s3.extraMorphemes[0]).slice(0, 300));
  const roots = s3.extraMorphemes.filter(m => m.type === 'root');
  out.push('extraMorphemes root 数: ' + roots.length);
}
out.push('s3.families 类型: ' + (Array.isArray(s3.families) ? 'array len ' + s3.families.length : typeof s3.families));
if (s3.families && !Array.isArray(s3.families)) {
  const ks = Object.keys(s3.families);
  out.push('families 键数: ' + ks.length + ' 首键: ' + ks[0] + ' 值: ' + JSON.stringify(s3.families[ks[0]]).slice(0, 300));
}
// stage3 是否另有 morphemes
for (const k of Object.keys(s3)) {
  const v = s3[k];
  if (Array.isArray(v)) out.push(`s3.${k}: array len ${v.length}`);
}

const lm = JSON.parse(fs.readFileSync('scripts/lib/legacy-morphemes.json', 'utf8'));
const rootLm = lm.morphemes.filter(m => m.type === 'root');
out.push('legacy morphemes len: ' + lm.morphemes.length + ' root: ' + rootLm.length);
out.push('legacy root ids: ' + rootLm.map(m => m.id).join(','));

// candidates root 的 allomorphs 情况
const cand = JSON.parse(fs.readFileSync('scripts/.work/derived/roots.candidates.json', 'utf8')).entries;
const roots = cand.filter(c => c.type === 'root');
out.push('candidates root 数: ' + roots.length);
out.push('root 样例: ' + JSON.stringify(roots[0]).slice(0, 500));
out.push('spect 候选: ' + JSON.stringify(roots.find(c => c.id === 'spect')).slice(0, 300));

fs.writeFileSync('scripts/verify-independent/probe2-structures.txt', out.join('\n'));
console.log('done');
