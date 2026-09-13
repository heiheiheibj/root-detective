// 独立复算公共库：严格按 docs/测算方法说明.md 实现，不参考任何现有脚本。

/** 通用归一化：全小写，只留 a-z（文档第 1 节） */
export function norm(s) {
  return String(s).toLowerCase().replace(/[^a-z]/g, '');
}

/** 正规 CSV 一行的解析（处理双引号包裹、内含逗号、"" 转义） */
export function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } // "" → 字面引号
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { fields.push(cur); cur = ''; }
      else cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

/** ECDICT 难度分档（文档 6.4） */
export function difficulty(tags, collins, bnc) {
  if (tags.includes('zk') || tags.includes('gk') || collins === 5 || (0 < bnc && bnc < 3000)) return 'd1';
  if ((tags.includes('cet6') || tags.includes('toefl')) && (bnc > 10000 || bnc === 0)) return 'd5';
  return 'd3';
}

/** 考试词判定 pass62（文档 6.2） */
export function makeEcdictJudge(rowMap) {
  // rowMap: word -> { tags, collins, oxford, bnc, frq, ... }
  return function judge(word) {
    const e = rowMap.get(word);
    if (!e) return null;
    const passTag = e.tags.some(t => ['zk', 'gk', 'cet4', 'cet6'].includes(t));
    const passCom =
      e.collins > 0 || e.oxford > 0 ||
      (e.bnc > 0 && e.bnc < 20000) ||
      (e.frq > 0 && e.frq < 20000);
    const pass62 = passTag && passCom;
    const canForce = e.tags.includes('toefl') || e.tags.includes('ielts') ||
      e.tags.includes('gre') || e.tags.includes('cet6');
    return { pass62, canForce, ...e };
  };
}
