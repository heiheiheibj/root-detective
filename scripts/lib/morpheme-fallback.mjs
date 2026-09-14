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

/**
 * 强制覆盖义项：这些词素的 meaningCn **有汉字、但意义完全不对**，兜底表兜不住。
 *
 * 成因：生成词素表时按 id 去 ECDICT 查义项，而很多词根/词干的拼法**正好撞上一个英文缩写或
 * 俚语词条**，于是拿回来的是那个词条的释义 —— 真实存在，但与词根毫无关系：
 *   trah  → 「人名特拉汉」（Trah 人名）      puls → 「的复数普尔阿富汗」（阿富汗货币 pul）
 *   dc    → 「医直电流」（DC 直流电）        who  → 「医世界卫生组织」（WHO）
 *   sci   → 「计串行通信接口」（SCI 接口）    iso  → 「计国际标准化组织」（ISO）
 *   minim → 「量滴液量单位」（minim 药量单位） urbs → 「的复数都市的」
 *   gress → 「人名格雷斯」（Grace 人名）      mons → 「医山」（mons 拉丁解剖术语）
 * 最扎眼的是 `minim`：它挂在「杂物仓」世界，家族词是 minimum —— 玩家会看到一张写着
 * 「minim＝量滴液量单位」的教学卡，然后学 minimum。
 *
 * 与 FALLBACK_MEANINGS 的分工：那张表只在**没有汉字**时兜（A20 空值），这张表是**无条件覆盖**
 * （值错了也要改）。两处都在 build-stage3-config.mjs 的统一收敛点上应用 —— 那里是唯一的
 * 汇合处，比在生成器里各补一遍可靠（词素来自 stage1 + 各批 additions 三处）。
 */
export const OVERRIDE_MEANINGS = {
  // 词根：被当成英文缩写/专名/术语查了
  vis: '看', capit: '头', comp: '共同', sid: '坐', turb: '搅动', dure: '持续',
  eng: '英格', ma: '妈', bag: '袋', handwrite: '手写', ind: '印度', duce: '引导',
  mathematic: '数学', gress: '走、步', mann: '人', eld: '年代', bi: '二', mas: '弥撒',
  apt: '适合', enda: '待办', app: '朝向', awk: '反手', butch: '屠宰', rot: '轮转',
  circ: '圆', barrass: '阻碍', rupt: '破裂', minim: '最小', minimus: '最小',
  minimum: '最小', rn: '走', abs: '离开', yer: '人', cip: '拿取', sci: '知道',
  gas: '气', lus: '戏弄', lig: '捆绑', insula: '岛', soph: '智慧', sprink: '洒',
  urbs: '都市', who: '谁', zeal: '热忱', eous: '…的', trah: '拉、拖', emi: '出去',
  dem: '民众', hospital: '招待', dc: '引导', hal: '仆役', mons: '警示',
  puls: '驱动、推', der: '剩下', tardus: '慢', tard: '慢', mal: '坏', syn: '共同',
  secut: '跟随', lute: '冲洗', cess: '走、让', philo: '爱',
  popul: '人口', import: '带入', bull: '公牛', well: '好',
  western: '西', cube: '立方', poet: '诗人', abbreviate: '缩短', calibrate: '口径',
  spoken: '说', counter: '反',
  // 后缀/前缀：同样撞上了缩写词条
  semi: '半', milli: '千分之一', multi: '多', iso: '相等', uum: '名词词尾',
  ency: '名词后缀', sion: '名词后缀', um: '名词后缀',
  // 3.4 六级批的同根变体：这些 id 拼法来自 cigen，各自需要独立义项（第 1 层合并前先兜对）
  aggress: '攻击', note: '知道、标记', not: '知道、标记', active: '做、行动',
  courage: '心', just: '判断、公正', passer: '经过',
}

/**
 * 词典兜底痕迹的特征——用于校验时报警（不是判错，是提示人工过一眼）。
 * 只收「绝不可能是一个词根义项」的标记，避免误伤（`美`(beauty)、`计`(计算)、`方`(方向)
 * 这类单字开头都可能是正常义项，所以不放进去）。
 */
export const DICT_ARTIFACT_RE = /^医|^俚|^古|^略|^变体|^见$|人名|姓氏|的复数|量滴|液量单位/
