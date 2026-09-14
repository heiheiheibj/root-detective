// 查不到中文义项、但确实是词素的那些词素的兜底义项。
//
// 来源两类：
//   1. Wiktionary 有词素词条、但 gloss 是英文的拉丁词根（sent/act/tain/sist/tend…）
//   2. 常见前后缀与功能词（-less / -mate / com- / tele- / be / for / out…）
//
// A20 要求 meaningCn 是 1–8 汉字，空着过不了闸门。这张表被两处引用：
//   scripts/tools/build-morpheme-table.mjs  —— 重建 batch-01/02 的词素表
//   scripts/tools/build-batch-config.mjs     —— 重建 batch-03+ 的词素表
// 抽成共用模块是因为早期只写在前者里，batch-03 的词素（sist/tend/firm…）照样空着，
// 校验报 43 个「meaningCn 有 0 个汉字」。
export const FALLBACK_MEANINGS = {
  // 词根
  sent: '感觉', act: '做、行动', tain: '持有', quest: '寻求',
  ceive: '拿取', ceed: '行走', prise: '抓取', ten: '持有',
  port: '携带', her: '她', not: '不',
  sist: '站立', tend: '伸展', firm: '坚固', found: '奠基', host: '主人',
  late: '携带', main: '主要', miss: '送', fall: '落下', text: '编织',
  // 前缀
  ab: '离开', back: '向后', com: '共同', dec: '十', grand: '大、隔一代',
  to: '到、向', ag: '朝向', mis: '错、坏', co: '共同', sur: '在上', after: '在之后',
  tele: '远', under: '在下', col: '共同', di: '二', down: '向下', by: '在旁边',
  over: '在上', pur: '向前', super: '超', sup: '在下', tran: '越过', up: '向上',
  with: '伴随', on: '在之上', ar: '朝向', ac: '朝向', anti: '反', ap: '朝向',
  as: '朝向', des: '除去', em: '进入', ex: '出', il: '不', im: '不', micro: '微小',
  mid: '中间', mini: '小', sus: '在下', off: '离开',
  // 后缀
  ball: '球', ing: '正在', less: '无、不', man: '人', mate: '伙伴',
  ly: '…地', th: '第…', son: '儿子', some: '有点…的', head: '头',
  work: '工作', motor: '发动机', ern: '…方向', ise: '使…化', end: '末端',
  where: '何处', be: '是', for: '为了', out: '向外', self: '自身', home: '家',
  way: '路', side: '边', ple: '折叠', ling: '指小', ty: '十', teen: '十',
  land: '土地', ward: '朝向', ship: '身份', gram: '写', ever: '无论', ey: '指小',
  le: '小', selves: '自身', et: '指小', ible: '能…的', ium: '元素', ize: '使…化',
  ical: '…的', ish: '…的', hood: '身份', woman: '女人', ee: '被…者', ative: '…的',
  wards: '朝向', etic: '…的', dom: '领域', time: '时间', wide: '广泛', wise: '方式',
  set: '放置', type: '字模', craie: '白垩', technicus: '技艺的', ness: '状态',
  ry: '…的行为', ous: '…的', ery: '场所', tic: '…的', ics: '学问', tion: '名词后缀',
  ter: '三次', ess: '女性',
  // 四级批新增
  verb: '词', just: '公正的', ally: '结盟', meter: '测量',
  st: '站立', est: '最高级', ir: '不', wave: '波浪', ster: '人', stock: '存货',
  // 六级批新增（cigen 词源库带出来的拉丁词干，非英语词根）
  acquisite: '获取', vergere: '倾向', entreprendre: '着手',
  forthcome: '出现', candesco: '变白', revelate: '揭示',
  kin: '指小', let: '指小', safe: '安全', eco: '生态', tri: '三',
}

/** 义项里没有汉字就算缺（deriveMeaning 有时会填进一串英文，那种也过不了 A20）。 */
export const hasHanzi = (text) => /[\u4e00-\u9fff]/.test(String(text || ''))
