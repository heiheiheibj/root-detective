// 探针：为 vid 家族找一个 d5 词，且切分用的词素都已建模
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))
const ecdictPath = join(here, 'scripts', '.work', 'raw', 'ecdict.csv')
function parseCsvLine(line){const out=[];let cur='';let inQ=false;for(let i=0;i<line.length;i++){const ch=line[i];if(inQ){if(ch==='"'){if(line[i+1]==='"'){cur+='"';i++}else inQ=false}else cur+=ch}else{if(ch==='"')inQ=true;else if(ch===','){out.push(cur);cur=''}else cur+=ch}}out.push(cur);return out}
const ecdict=new Map()
for(const line of readFileSync(ecdictPath,'utf8').split('\n')){if(!line.trim())continue;const f=parseCsvLine(line);const w=(f[0]||'').toLowerCase();if(!w)continue;ecdict.set(w,{word:w,tag:(f[7]||'').split(' ').filter(Boolean),bnc:Number(f[8]||0),frq:Number(f[9]||0),collins:f[5]||'',oxford:f[6]||''})}
function diff(e){const t=e.tag;const col=Number(e.collins||0);const b=e.bnc;const easy=t.includes('zk')||t.includes('gk')||col===5||(b>0&&b<3000);const hard=(t.includes('cet6')||t.includes('toefl'))&&(b>10000||b===0);return easy?1:hard?5:3}
const cands=['visual','invisible','supervise','provision','evident','evidence','revision','visor','visionary','envisage','envision','visage','vista','supervision','revival']
for(const w of cands){const e=ecdict.get(w);if(!e){console.log(`${w}: NOT IN ECDICT`);continue}console.log(`${w.padEnd(12)} d=${diff(e)} tag=[${e.tag.join(' ')}] bnc=${e.bnc} frq=${e.frq}`)}
