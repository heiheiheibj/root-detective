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

  // ── 2026-09-15 补：build-morpheme-table 兜底缺口（152 条）─────────────────
  // 这些词素在草稿里义项为空：教学词素的英文 gloss 走「待翻译」队列，而这张表当时
  // 少了六级批新增，FALLBACK 兜不住。取值来源：126 条直接抄**现库产物**的值
  // （保证将来重建批次时复现现状），26 条不在现库的按词源人工给定。
  // ⚠️ 维护时保持与 OVERRIDE_MEANINGS 的分工：这张表只兜「没有汉字」，OVERRIDE 无条件覆盖。
  er: '做……的人或物（名词）',
  ion: '动作、过程（名词）',
  al: '……的（形容词）',
  re: '再、回',
  ity: '性质、状态（抽象名词）',
  ation: '行为、结果（名词）',
  in: '不；进入',
  con: '共同、一起',
  ment: '行为、结果（名词）',
  un: '不、相反',
  dis: '分离、分开、否定',
  en: '使、使进入',
  ful: '充满……的（形容词）',
  able: '能够……的（形容词）',
  ic: '……的、与……有关（形容词）',
  ive: '具有……性质的（形容词）',
  or: '做……的人或物（名词）',
  pro: '向前、在前',
  at: '向、至',
  ed: '有……的、已……的（形容词）',
  ance: '性质、状态（名词）',
  ary: '与……有关的（形容词）',
  ant: '……的；做……的人',
  ist: '……者、……家（名词）',
  ad: '朝、向；加强',
  per: '贯穿、彻底；每一',
  sub: '在下、下面、次级',
  ent: '做……的人、……的',
  ence: '状态、性质（名词）',
  an: '……地方的、……的人',
  ial: '……的（形容词）',
  inter: '在……之间',
  ian: '……的人（名词）',
  ism: '主义、学说（名词）',
  de: '向下、离开',
  form: '形状、形成',
  trans: '横穿、转移',
  ure: '行为、状态、结果（名词）',
  ify: '使……化（动词）',
  logy: '……学（名词）',
  post: '后、延迟',
  ual: '……的（形容词）',
  long: '长',
  spect: '看',
  para: '旁边、平行',
  ition: '动作、状态（名词）',
  dict: '说',
  most: '最',
  dia: '通过、跨越',
  like: '像……的',
  pose: '放置',
  soft: '软',
  tract: '拉、拖',
  ory: '……的场所（名词）',
  ious: '多……的（形容词）',
  bio: '生命',
  graphy: '书写、学科',
  cap: '抓取、拿',
  verse: '转',
  pend: '悬挂、称量',
  free: '免……的',
  gen: '出生、种类、产生',
  kilo: '千',
  phone: '声音',
  photo: '光',
  fer: '带来、承载',
  logue: '说',
  auto: '自己、自动',
  lect: '收集、选',
  fort: '强壮',
  cor: '心',
  cent: '百',
  pel: '驱动、推',
  extra: '超出、以外',
  geo: '地',
  ice: '状态、性质（名词）',
  kind: '类',
  graph: '写、画',
  sym: '相同、一起',
  mit: '送、放',
  uni: '一、单一',
  ject: '投、掷',
  vis: '看',
  af: '朝向',
  christ: '基督',
  log: '说、词',
  valent: '价值',
  god: '上帝',
  mal: '坏',
  abs: '离开',
  apt: '适合',
  enda: '待办',
  bene: '好',
  eond: '那一边',
  lis: '教堂',
  ch: '冷',
  cop: '铜',
  coun: '对面',
  diff: '不同',
  dif: '不同',
  ron: '粒子',
  barrass: '阻碍',
  eng: '英格',
  dem: '民众',
  europe: '欧洲',
  expo: '展出',
  fra: '香气',
  gas: '气',
  lus: '戏弄',
  atory: '…的',
  lan: '灯',
  milli: '千分之一',
  mons: '警示',
  pole: '波兰',
  portugal: '葡萄牙',
  servre: '服务',
  der: '剩下',
  sumere: '拿取',
  tardus: '慢',
  sar: '沙丁鱼',
  spain: '西班牙',
  rendre: '给',
  rem: '事物',
  thurs: '雷神',
  turk: '土耳其人',
  wandn: '漫步',
  dwi: '宽',
  wf: '女人',
  just: '公正',
  metre: '米',
  vs: '看',                  // vise 是 vis(看) 的变体（revise）
  }

/** 义项里没有汉字就算缺（deriveMeaning 有时会填进一串英文，那种也过不了 A20）。 */
export const hasHanzi = (text) => /[\u4e00-\u9fff]/.test(String(text || ''))

/**
 * 强制覆盖义项：这些词素的 meaningCn **有汉字、但意义完全不对**，兜底表兜不住。
 *
 * 成因：生成词素表时按 id 去 ECDICT 查义项，而很多词根/词干的拼法**正好撞上一个英文缩写、
 * 专名或俚语词条**，于是拿回来的是那个词条的释义 —— 真实存在，但与词根毫无关系：
 *   trah  → 「人名特拉汉」（Trah 人名）      puls → 「的复数普尔阿富汗」（阿富汗货币 pul）
 *   dc    → 「医直电流」（DC 直流电）        who  → 「医世界卫生组织」（WHO）
 *   sci   → 「计串行通信接口」（SCI 接口）    minim → 「量滴液量单位」（minim 药量单位）
 *
 * 与 FALLBACK_MEANINGS 的分工：那张表只在**没有汉字**时兜（A20 空值），这张表是**无条件覆盖**
 * （值错了也要改）。两处都在 build-stage3-config.mjs 的统一收敛点上应用 —— 那里是唯一的
 * 汇合处，比在生成器里各补一遍可靠（词素来自 stage1 + 各批 additions 三处）。
 *
 * ── 2026-09 全表复核（第二轮）─────────────────────────────────────────────────
 * 上一轮只修了「靠家族词能自证」的那批。独立复核发现同一类病还有三类漏网，本次一并修完：
 *
 *   (1) 领域标记泄漏：shortMeaning 把 `[医] 山` 的标记当字头拼进义项，产出「医山」
 *       「计硬件描象层」「枪医枪」「视觉的医视觉的」「必然的事情计计算」这种拼接串，共 165 条。
 *       根因已在 build-morpheme-table.mjs 的 shortMeaning 里修掉（先剥 [..] 再取首义，
 *       并在词性段中间切一刀）。这里覆盖的是**已经灌进批次文件的存量值**。
 *   (2) 缩写/专名条目：`wf`←Water Filter、`so`←spin-orbit splitting、`mary`←Mary、
 *       `len`←Len、`coun`←councillor… 义项取的是「这个词当英文词时什么意思」，
 *       而它在词库里是当词素用的。
 *   (3) 包含匹配兜底：`wandn`←insidescrewandnonrisingstem、`eond`←dueondemand、
 *       `ular`←gular —— 匹配到的词与词根本身毫无关系。生成器侧已加长度比例与词首/词尾约束。
 *
 * 还有一类是「义项本身没错、但它不是这个词素在该家族词里的角色」（`car`＝汽车 之于
 * careful/careless、`bull`＝公牛 之于 bullet）：这类正则永远抓不到，只能逐条比对家族词。
 *
 * ⚠️ 本表的 key 必须唯一 —— JS 对象字面量遇到重复 key 会**静默后者胜出**。
 *    `scripts/tools/check-morpheme-overrides.mjs` 会检查重复、失效条目与闸门判据。
 */
export const OVERRIDE_MEANINGS = {
  // ══════ 第一轮（3adf204 引入）：被当成英文缩写/专名/术语查了的词根 ══════════
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
  popul: '人口', import: '带入', bull: '球', well: '好',
  western: '西', cube: '立方', poet: '诗人', abbreviate: '缩短', calibrate: '口径',
  spoken: '说', counter: '反',
  // 后缀/前缀：同样撞上了缩写词条
  semi: '半', milli: '千分之一', multi: '多', iso: '相等', uum: '名词词尾',
  ency: '名词后缀', sion: '名词后缀', um: '名词后缀',
  // 同根变体：拼法来自 cigen（同一词根散成两条记录），合并前先各兜对义项。
  // 标注「合并后作废」的条目在 id 合并之后就没有记录会用到，留着是防合并被回退时义项又变回垃圾。
  aggress: '攻击',                              // 合并后作废（并入 gress）
  active: '做、行动',                            // 合并后作废（并入 act）
  passer: '经过',                                // 合并后作废（并入 pass）
  note: '知道、标记', not: '不',                 // 不合并：notice/notation 是词根 not-(知道)，neither/notwithstanding 是副词 not(不)
  courage: '心', just: '判断、公正',             // 第 2 层合并（courage→cor、just→jud）
  iced: '冰',                                   // 不是 not 家族：icecream = ice + cream

  // ══════ 第二轮 A：ECDICT 领域标记泄漏 / 词典条目被拼接（165 条严判）══════════
  // 形态：`[医] 山` → 「医山」，或首义后面又挂了一个词性段 → 「必然的事情计计算」。
  cert: '确定',            // 曾「必然的事情计计算」（[计] 计算机紧急反应小组 被拼进首义）
  it: '它；走',            // 曾「它计信息论」；circuit 用「走」（ire），itself 用「它」
  pa: '爸',                // 曾「每年医髓轴的」；grandpa
  deh: '宽',               // 曾「数字编码手册」（DEH 缩写）；wide 用
  dwi: '宽',               // 同上，wide 的另一条重复记录
  af: '朝向',              // 曾「视频」（AF = audio frequency）；ad- 的同化形式
  rect: '直、正',          // 曾「矩形」（rect = rectangular 缩写）；correct/correction
  intro: '向内',           // 曾「介绍计简介」（[计] 简介）；introduce
  sept: '七',              // 曾「氏族经九月」（[经] 九月）；September ← septem
  twi: '二',               // 曾「契维语…」（Twi 语）；twilight
  agriculture: '农业',     // 曾「农业机农业」（[机] 农业 拼进首义）
  almen: '明矾',           // 曾「机阿尔门试验」（[机] 阿尔门试验）；aluminium ← alumen
  arent: '显现',           // 曾「不是」（aren't 缩写）；apparent ← apparere
  minton: '庄园',          // 曾「明顿英国著名的卫…」；badminton 来自 Badminton 庄园
  botany: '植物',          // 曾「植物学医植物学」
  cas: '落下',             // 曾「中国科学院」（CAS 缩写）；casual ← casus
  oxide: '氧',             // 曾「氧化物医氧化物」
  electron: '电子',        // 曾「电子化电子」
  fra: '香气',             // 曾「联邦铁路局」（FRA 缩写）；fragrant ← fragrare
  hon: '蜂蜜',             // 曾「化羟基氧代正缬氨」（[化] 术语）；honey
  val: '墙',               // 曾「化缬氨酸」（[化] 术语）；interval ← vallum
  lan: '灯',               // 曾「局部区域网络」（LAN 缩写）；lantern
  bus: '公共汽车',         // 曾「公共汽车计总线」（[计] 总线 拼进首义）
  regis: '统治',           // 曾「里吉斯男子名」；register ← regesta
  represent: '代表',       // 曾「尤指未支付的支票」（[经] 术语）
  sales: '卖',             // 曾「销售的计销售」
  coming: '来',            // 曾「的现在分词组件对」（词典标注串）；shortcoming
  mary: '总',              // 曾「玛丽女子名」（Mary）；summary ← summa
  pect: '看',              // 曾「化正电子发射断层」（[化] PET）；suspect ← spectare
  wed: '结亲',             // 曾「我们已」（we'd 缩写）；wedding
  breaker: '打破之物',     // 曾「断路器化破碎机」；windbreaker = 挡风之物
  len: '羊毛',             // 曾「伦恩男子名」（Len）；woollen
  cop: '铜',               // 曾「化冷冻系数」（[化] 术语）；copper ← cuprum
  ron: '粒子',             // 曾「研究法辛烷值」（RON 缩写）；electron ← -on
  combust: '燃烧',         // 曾「建燃料」（[建] 燃料）
  pict: '画',              // 曾「皮克特人计图象」；depict
  libr: '天平',            // 曾「图书管理员」（librarian 缩写）；equilibrium ← libra
  local: '地方',           // 曾「低卡路里」（low calorie 缩写）；locality
  microscope: '显微镜',    // 曾「显微镜化显微镜」
  valence: '价值',         // 曾「原子价化化合价」；prevalence
  bush: '灌木',            // 曾「矮树丛化管衬」
  rem: '事物',             // 曾「眼的迅速跳动计识别存储器」；theorem ← theorema
  visual: '视觉',          // 曾「视觉的医视觉的」
  avoidable: '可避免的',   // 曾「可避免的法可作为」（[法] 可作为无效的）
  shrew: '鼩鼱',           // 曾「泼妇法捍妇」；shrewd ← shrew(鼩鼱)
  vita: '生命',            // 曾「个人简历医生活」；vitamin ← vita
  axis: '轴',              // 曾「轴计坐标轴」
  bullet: '告示',          // 曾「子弹医弹」；bulletin ← bulletino(小告示)
  ceres: '谷物',           // 曾「刻瑞斯谷类和耕作」（Ceres 神名）；cereal
  deaf: '聋',              // 曾「聋的医聋的」
  lyze: '分解',            // 曾「与词尾的名词构成」（词典的构词说明）；paralyze
  pher: '带',              // 曾「酶蛋白」（[生] 术语）；peripheral ← pherein
  petit: '小',             // 曾「法小的」（[法] 小的）；petition
  voke: '呼喊',            // 曾「恶作剧者」（voke 拼法撞上）；provoke ← vocare
  ref: '再、回',           // 曾「裁判员计参考」（[计] 参考）；refrain
  sar: '沙丁鱼',           // 曾「搜索救援」（SAR 缩写）；sardine ← 撒丁岛
  theo: '神',              // 曾「理论上的」（theory 缩写）；theorem ← theos
  uous: '…的',             // 曾「费力的」（uous 撞上 strenuous 的释义）；contemptuous
  esy: '礼节',             // 曾「电子系统」（缩写）；courtesy
  ication: '…化',          // 曾「表示形成」
  ification: '…化',        // 曾「奉为神」（撞上 deification）
  icity: '性质',           // 曾「化合价」（撞上 valency）
  istic: '…的',            // 曾「的变形」
  atic: '…的',             // 曾「航空航天技术情报」（ATIC 缩写）
  ie: '指小',              // 曾「构成名词表示小」
  ular: '…的',             // 曾「解咽喉的」（[解] 术语，来自 gular）
  es: '…人的',             // 曾「附于词尾为」；Chinese/Japanese
  eth: '第…',              // 曾「埃塞俄比亚全国运动联合会」；twentieth
  wich: '村、镇',          // 曾「苏湿草地」（[苏] 湿草地）；sandwich 来自 Sandwich 镇
  organ: '器官',           // 曾「风琴」；organise/organic/organism 一族都是「器官」
  element: '元素',         // 曾「元件」（[计] 元件）；elementary/elemental
  gun: '枪',               // 曾「枪医枪」
  ch: '冷',                // 曾「克劳斯汉兹」；chill
  belove: '爱',            // 曾「通常用于被动语态」
  pol: '弄脏',             // 曾「油料」；pollute
  inc: '偏斜',             // 曾「根据法律组成的公…」；incline
  ordin: '顺序',           // 曾「序数顺序的」
  tect: '遮盖',            // 曾「涕必灵」；detect
  poo: '洗',               // 曾「邮政汇票」；shampoo ← champo(按摩)
  cede: '退让',            // 曾「割让法割让」；concede/precede
  herit: '继承',           // 曾「继承人法继承人」；heritage
  rend: '给',              // 曾「法年终报告」；surrender（rendre 的归一化形）
  rendre: '给',
  venire: '来',            // 曾「律陪审员召集令」；convene
  sumere: '拿取',          // 曾「经消费者经济学」；consume
  volt: '伏特',            // 曾「伏特化伏特」
  twink: '闪烁',           // 曾「游戏用语高等级带」；twinkle
  equi: '相等',            // 曾「马科动物包括马」；equilibrium
  tal: '地平线',           // 曾「事物处理应用语言」；horizontal
  ior: '行为者',           // 曾「输入输出寄存器」；behavior
  dal: '豆',               // 曾「植木豆等于」；scandal
  sd: '坐',                // 曾「化磺胺嘧啶」；subsidy ← sidere
  transform: '变形',       // 曾「化反式」（[化] 反式异构体）
  sports: '运动',          // 曾「英运动会」
  lis: '教堂',             // 曾「法诉讼事件」；cathedral
  circu: '圆',             // 曾「圆週」；circuit
  ulate: '使…动',          // 曾「谄媚」；circulate
  ien: '公民',             // 曾「网际网工程备忘录」；citizen
  clude: '关闭',           // 曾「除外」；exclude/include

  // ══════ 第二轮 B：缩写 / 专名被当成义项 ═══════════════════════════════════
  so: '如此、这样',        // 曾「自旋轨道分裂」（SO = spin-orbit splitting）；also
  eond: '那一边',          // 曾「经活期」（含 dueondemand 匹配）；beyond
  coun: '对面',            // 曾「顾问」（councillor 缩写）；country ← contra
  japan: '日本',           // 曾「日本化天然漆」
  suc: '跟随',             // 曾「成功」（succeed 缩写表）；succeed ← sub+cedere
  thurs: '雷神',           // 曾「经星期四」；Thursday ← Thor 之日
  tues: '战神',            // 曾「星期二」；Tuesday ← Tiw 之日
  ug: '丑陋',              // 曾「地下」（UG = underground）；ugly ← 古北欧 uggligr
  pr: '前',                // 曾「宾夕法尼亚雷丁海…」（PRSL 缩写）；pre-/pro- 同源
  ill: '病',               // 曾「我将」（I'll）；illness
  indus: '勤劳',           // 曾「印度河」（Indus）；industry ← industria
  ann: '年',               // 曾「安女子名」（Ann）；annual ← annus
  tach: '钉住',            // 曾「环节」（tache/转速计缩写表）；attach
  bouk: '桶',              // 曾「苏格兰英语躯体」（[苏] 方言标注）；bucket
  comm: '共同',            // 曾「委员会」（committee 缩写）；command
  pete: '追求',            // 曾「皮特等于」；compete ← petere
  stant: '站立',           // 曾「斯坦顿」（Stanton 人名）；constant ← stare
  tempor: '时间',          // 曾「颞颥」（[医] 术语）；contemporary ← tempus
  tribu: '给予',           // 曾「法保民官」（[法] 术语）；tribute ← tribuere
  min: '小',               // 曾「部长」（minister 缩写）；minimum/vitamin ← minus
  bid: '命令',             // 曾「一日两次医每日两」（[医] b.i.d.）；forbid
  gener: '产生',           // 曾「类」（前缀匹配取错义）；generate/generation
  ser: '连接',             // 曾「锡厄印巴等国重量」；insert ← serere
  spr: '呼吸',             // 曾「心灵研究学会」（SPR 缩写）；inspire ← spirare
  adays: '日子',           // 曾「现在」；nowadays
  suade: '劝',             // 曾「劝阻法劝阻」；persuade
  pole: '波兰',            // 曾「波兰人」；作为词素只服务 polish
  por: '携带',             // 曾「返回后付款」（P.O.R. 缩写）；port 的同源形式
  cise: '切',              // 曾「烟酒等消费税」（[经] 术语）；precise ← caedere
  roy: '王',               // 曾「罗伊男子名」（Roy）；royal ← roi
  mars: '马',              // 曾「火星」（Mars）；marshal ← marah(马)+skalk(仆人)
  month: '月',
  grammatic: '语法',       // 曾「网络语法」
  expo: '展出',            // 曾「经展览会」
  wf: '女人',              // 曾「滤水器」(Water Filter)；woman
  wer: '人',               // 曾「文字差错率」(Word Error Rate)；world ← wer(人)+eld

  // ══════ 第二轮 C：包含匹配兜出来的垃圾（生成器侧已加约束，这里修存量）═══════
  rive: '岸',              // 曾「撕开」；arrive ← ad+ripa(岸)
  ford: '向前',            // 曾「浅滩」；afford ← 古英语 forth
  lout: '小',              // 曾「蠢人愚弄屈服」；little ← 古英语 lytel
  numb: '数',              // 曾「麻木的」；number ← numerus
  own: '自己的',           // 曾「自己的自己的」
  moth: '母',              // 曾「蛾害」；mother
  monk: '猴',              // 曾「修道士」；monkey
  mess: '送',              // 曾「食堂」；message ← mittere(送)
  kit: '厨房',             // 曾「装备」；kitchen
  chen: '厨房',            // 曾「陈」；kitchen ← 拉丁 coquina
  ledge: '知道',           // 曾「突出部分」；knowledge
  dump: '面团',            // 曾「垃圾场倾倒」；dumpling
  engine: '机器',          // 曾「引擎」；engineer
  exam: '取出',            // 曾「考试」；example ← eximere(取出)
  excel: '高出',           // 曾「胜过」；excellent
  expense: '花费',         // 曾「费用」
  flow: '流',              // 曾「流程」；flower/overflow
  govern: '掌舵',          // 曾「统治」；government/governor
  heal: '完好',            // 曾「痊愈使复原」；health
  imp: '进入',             // 曾「顽童加强」；improve/implore ← in-
  rove: '改好',            // 曾「徘徊」；improve
  view: '看',              // 曾「视野」；interview/review/preview
  key: '键',               // 曾「钥匙」；keyboard
  lead: '带路',            // 曾「铅」；leader/mislead
  plea: '舒服',            // 曾「恳求」；pleasure
  poke: '兜',              // 曾「刺」；pocket
  rail: '轨',              // 曾「横杆」；railway/railroad
  cite: '叫',              // 曾「引用」；recite/citizen ← ciere(叫)
  pair: '配',              // 曾「一双」；repair/despair
  search: '找',            // 曾「搜寻」；research
  tell: '讲',              // 曾「告诉」；retell
  rede: '懂',              // 曾「忠告」；riddle
  sever: '分开',           // 曾「切断」；several/severely
  situate: '位于',         // 曾「使位于」
  supple: '填上',          // 曾「柔软的」；supply
  thou: '千',              // 曾「汝」；thousand
  pas: '糊',               // 曾「优先权」；toothpaste/pastime
  tow: '立起',             // 曾「拖」；tower
  train: '拖、练',         // 曾「火车」；training/trainer
  slate: '搬',             // 曾「板岩」；translate
  treat: '待',             // 曾「宴请」；treatment/retreat
  volley: '击球',          // 曾「群射」；volleyball
  weal: '身家',            // 曾「福利」；wealth/wealthy
  whet: '磨',              // whether 已重切为单个词素（SPLIT_REPLACE），这条只是防回退
  mar: '损毁',             // grammar(写字的规矩)/nightmare(夜里被压住) 里的 -mar 各是一回事

  // ══════ 第二轮 D：义项能过闸门、但与家族词对不上（正则抓不到，逐条比对才看得出来）══
  a: '在',                 // 曾「第一个字母」；alive/asleep/ahead 里的 a- 是古英语 on(在)
  car: '关心',             // 曾「汽车」；家族登记的教学词是 careful/careless
  fly: '飞',               // 曾「苍蝇」；butterfly
  break: '破',             // 曾「休息」；breakfast/breakthrough/breakdown
  fast: '牢固',            // 曾「快速的」；fasten
  cycle: '轮',             // 曾「周期」；bicycle/motorcycle/cyclist
  ground: '地',            // 曾「土地」；background/playground/underground
  attend: '拉',            // 曾「参加」；attention ← attendere(把心思拉过去)
  leave: '信',             // 曾「许可」；believe ← 古英语 geleafa(信)
  butt: '桶',              // 曾「粗大的一头」；butter
  mean: '中间',            // 曾「低劣的」；meanwhile/meantime 是「中间」
  line: '线、列',          // 曾「列」；airline/deadline/headline 都是「线」
  relate: '关联',          // 曾「讲」；relation/relative/correlate
  grav: '重',              // 曾「格拉夫加速度单位」；gravity ← gravis(重)
  bute: '给',              // 曾「保泰松一种止痛药」；tribute ← tribuere(给)
  statistic: '统计',       // 曾「统计量统计的」；statistical
  physic: '自然、身体',    // 曾「药品」；physically ← physis(自然)
  hydro: '水',             // 曾「水疗医院」；hydrogen/hydrant/dehydrate
  antic: '巨大',           // 曾「滑稽动作古怪的」；gigantic ← gigas(巨人)
  rate: '节制',            // 曾「比率」；moderate ← moderari(节制)
  trance: '进入',          // 曾「昏睡状态」；entrance
  express: '挤出',         // 曾「快车」；expression ← exprimere(挤出)
  fair: '公平',            // 曾「展览会」；fairly/fairness/unfair
  feat: '羽毛',            // 曾「壮举」；feather
  nail: '甲',              // 曾「钉子」；fingernail
  fon: '偏爱',             // 曾「丰人」；fond
  give: '给',              // 曾「弹性」；forgive ← 古英语 forgiefan(给)
  fortune: '运气',         // 曾「财富」；misfortune
  garb: '废物',            // 曾「打扮」；garbage
  germ: '日耳曼',          // 曾「细菌」；germany
  grow: '生长',            // 曾「种植」；growth
  grant: '香',             // 曾「授予」；fragrant
  tern: '灯',              // 曾「三个一组」；lantern/pattern
  field: '田地',           // 曾「领域」；oilfield
  park: '停',              // 曾「公园」；parking
  pat: '拍',               // 曾「轻拍轻拍适时」；pattern/patriot
  pop: '爆',               // 曾「砰然声」；popcorn
  mote: '移动',            // 曾「尘埃」；promote
  raze: '刮',              // 曾「毁灭」；razor
  commend: '称赞',         // 曾「嘉奖」；recommend
  refer: '提到',           // 曾「提交」；referee/reference
  mind: '心',              // 曾「思想」；remind
  tire: '累',              // 曾「轮胎」；retire/tiresome
  secure: '安心',          // 曾「无虑的」；security
  sharp: '尖锐',           // 曾「半升音调」；sharpen
  seeing: '看',            // 曾「视觉」；sightseeing
  sneak: '偷偷',           // 曾「鬼鬼祟祟做事偷偷」
  spar: '雀',              // 曾「晶石」；sparrow
  row: '雀',               // sparrow 的另一半
  spell: '拼写',           // 曾「符咒」；spelling
  sty: '管理',             // 曾「猪栏」；steward
  watch: '看',             // 曾「观察」；watchful
  stub: '树桩',            // 曾「断肢」；stubborn
  born: '天生',            // 曾「天生的的过去分词」
  subject: '主体',         // 曾「科目」；subjective
  tank: '罐',              // 曾「槽」；tanker
  thrill: '心跳',          // 曾「震颤」；thriller
  table: '表、桌',         // 曾「桌子」；timetable
  writer: '写的人',        // 曾「作家」；typewriter
  fare: '过活',            // 曾「费用」；welfare/farewell/warfare
  wit: '知道',             // 曾「机智」；witness
  oxy: '酸',               // 曾「牛的」；oxygen ← oxys(酸)
  cast: '撒',              // 曾「演员阵容」；broadcast
  pot: '壶',               // 曾「盆」；teapot
  pease: '拍手',           // 曾「豌豆」；applause
  ban: '布',               // 曾「禁令禁止」；banner
  close: '关',             // 曾「结束」；disclose/enclose
  lapse: '滑落',           // 曾「过失」；collapse
  mission: '派送',         // 曾「任务」；commission/transmission
  plain: '捶胸',           // 曾「平原」；complain ← plangere
  pound: '放',             // 曾「磅」；compound
  fine: '精细',            // 曾「罚款」；confine/refine/finely
  quer: '寻求',            // 曾「德横的」；conquer ← quaerere
  consequent: '跟随',      // 曾「随后发生的事情」；consequently
  berate: '掂量',          // 曾「严责」；deliberate
  very: '真',              // 曾「真正的」；delivery
  depend: '挂',            // 曾「靠」；dependent
  ridge: '脊',             // porridge/cartridge
  tray: '递',              // betray/portray
  have: '持',              // behave
  rest: '停',              // arrest/unrest/restless
  prove: '好',             // approve
  argue: '理由',           // argument
  sham: '羞',              // ashamed/shameful
  ave: '平',               // average
  bon: '骨',               // backbone
  agri: '田地',            // 曾「阿格里土耳其地区」；agriculture
  bin: '箱、容器',         // 曾「贮存谷物等的容器」；dustbin
  laud: '赞美',            // applaud

  // ══════ 第二轮 E：旧 shortMeaning 的「词性段拼接」（产物 == 旧实现 != 新实现）══════
  // 判据是机器给的：拿同一条 ECDICT 记录，用旧实现算一遍、用新实现算一遍，产物值等于旧实现
  // 就说明这条是那个 bug 的产物。上面 A~D 四类是「记录本身是垃圾」，这一类是「记录是普通词，
  // 但取义项时把两个词性段一起取进来了」—— 前一版审计按「记录是否垃圾」筛，所以整类漏掉了。
  any: '任何',             // 曾「任何的任何」；anybody/anyone/anything
  ache: '疼痛',            // 曾「疼痛痛」；headache/toothache
  manage: '管理',          // 曾「处理管理」；management
  may: '可能',             // 曾「五月愿能」；maybe（这里要的是「可能」，不是月份）
  please: '使高兴',        // 曾「请使高兴」；pleasant/pleased/displease
  berry: '浆果',           // 曾「浆果采集浆果」；strawberry
  when: '何时',            // 曾「当的时候何时」；whenever
  roach: '近',             // 曾「斜齿鳊使成凹状」；approach/reproach ← ad+prope(近)
  arab: '阿拉伯',          // 曾「阿拉伯的阿拉伯人」；arabic/arabian
  awe: '敬畏',             // 曾「敬畏使敬畏」；awesome/awful
  bad: '坏',               // 曾「坏的坏坏地」；badly
  battle: '战斗',          // 曾「战役战斗」；battleground
  begin: '开始',           // 曾「开始计开始」；beginning/beginner
  boat: '船',              // 曾「船乘船以船运」；boating
  can: '罐',               // 曾「装罐罐头」；canteen
  respond: '回应',         // 曾「以回答回答」；correspond
  boy: '男孩',             // 曾「男孩法男孩」；cowboy
  deep: '深',              // 曾「深的深入地深渊」；deeply/deepen
  settle: '安顿',          // 曾「有背长椅决定」；settlement
  shut: '关闭',            // 曾「关闭关上」；shuttle/shutter
  destruct: '拆毁',        // 曾「自毁自毁」；destruction/destructive
  employ: '雇用',          // 曾「雇用雇用」；employee/employer/employment
  fart: '远',              // 曾「屁放屁」；farther ← 古英语 feor(远)
  different: '不同',       // 曾「不同的机差动」；indifferent
  legislate: '立法',       // 曾「制定法律用立法规」；legislation
  murder: '谋杀',          // 曾「谋杀谋杀」；murderer
  navigate: '航行',        // 曾「航行航行于」；navigation
  neighbor: '邻居',        // 曾「邻居邻接毗邻而居」；neighborhood
  quote: '引用',           // 曾「引用引述」；quotation
  save: '攒下',            // 曾「救球解救」；saving
  bankrupt: '破产',        // 曾「破产者破产的使破」；bankruptcy
  bear: '承受',            // 曾「熊忍受」；bearing（这里要的是「扛」不是动物）
  blend: '混合',           // 曾「混合混合」；blunder（blunder 是误切，见残留说明）
  cart: '卷',              // 曾「二轮运货马车驾运」；cartridge ← charta(纸卷)
  chat: '闲谈',            // 曾「闲谈闲谈」；chatter
  derive: '源头',          // 曾「得自起源」；derivation
  divers: '不同',          // 曾「各种不同的若干个」；diversify/diversion
  erupt: '喷出',           // 曾「爆发喷出」；eruption
  hinder: '挡住',          // 曾「后面的阻碍」；hindrance
  retire: '退下',          // 曾「隐居引退」；retirement
  seeming: '表面',         // 曾「表面上的外观」；seemingly
  spoke: '说话',           // 曾「轮辐装轮辐」；spokesman ← speak
  vial: '路',              // 曾「小瓶装入小瓶」；trivial ← trivium(三岔路口)
  arian: '…的人',          // 曾「构成形容词或名词」；humanitarian
  // 同一类、但记录来源路径不同（非 ecdict 首义），人工扫出来的三条
  daughter: '女儿',        // 曾「女儿女儿的」；granddaughter
  dependent: '依赖的',     // 曾「依赖他人者依赖的」；independent
  dear: '亲爱的',          // 曾「亲爱的人亲爱的」；darling
  english: '英语',         // 曾「英语英文的」
  increasing: '增加',      // 曾「经递增」（[经] 标记泄漏）
  semble: '相似',          // 曾「律看来好象」（[律] 标记泄漏）；resemble
  ards: '朝向',            // 曾「见」（ecdict-contain(wards) 的包含匹配）；-wards 的变体，同 ward
  hiero: '神圣',           // 曾「人名」；hieroglyph ← hieros(神圣)
  mans: '（复数后缀）',     // 曾「的复数」；ECDICT 把 man 的复数词条当成了这条的释义
  // 注：`fusc`（obfuscate ← fuscus 暗）与 `vinci`（convince ← vincere 征服）也出现在草稿的可疑
  // 清单里，但它们从未进任何批次 —— 覆盖表写了也永远轮不到（check-morpheme-overrides 会报
  // 「上游不存在的 id」），所以不写，留给生成器的出厂警告盯着。
}

/**
 * 显示名修正：id 是内部标识，卡片上画的是 displayText。有一批 id 是切分算法按词形凑出来的
 * 碎片（`wf`、`wer`、`eond`），直接显示会在牌面上出现「wf＝女人」这种莫名其妙的卡片 ——
 * 改成该词素实际用到的表面形式。
 *
 * ⚠️ displayText 必须全局唯一（A20），改之前先确认没有别的词素在用同一个名字。
 */
export const OVERRIDE_DISPLAY = {
  wf: 'wo',        // woman = wo + man
  wer: 'wor',      // world = wor + ld
  eond: 'yond',    // beyond = be + yond
  deh: 'de',       // wide = wi + de
  pr: 'pre',       // present/precise/pretend —— 实际用到的表面是 pre
  eth: 'th',       // twentieth = twen + ti + th
}

/**
 * 新增词素记录：重切分、或从别的词素里摘出来之后需要独立建模的词根。
 *
 * 为什么不去改 stage-additions 里各批的 morphemes-roots / morphemes-affixes：那些是
 * **生成产物**（build-batch-config.mjs 的落点），手改会在下次重建时被覆盖；而且 Stage 3 的
 * 既定做法是「所有修正落在 build-stage3-config.mjs 这一个收敛点」。所以新增记录写在这里。
 *
 * 每条的来历必须写清楚 —— 这些 id 不在任何上游数据源里，只有注释能说明它为什么存在。
 */
export const INJECT_MORPHEMES = [
  {
    // missing = miss + ing，来自古英语 missan（错过、未命中），不是拉丁 mittere(送)。
    // 原先切分把 miss 并进了 mit，于是 missing 挂在一张「送、放」的卡片下 —— 玩家学 missing
    // 时看到「送 + 正在」。同一个表面「miss」在两个词源里都出现，所以新开一个 id，
    // 让 mit(送) 继续服务 missile/mission/permissible。
    id: 'missan', displayText: 'miss', type: 'root', meaningCn: '错过',
    allomorphs: ['miss'], etymology: '古英语 missan（错过、未命中）', level: 1, color: 'orange',
  },
  {
    // wander 是单个词根（古英语 wandrian）。原先切成 wandn[wande] + rn[r]：两个碎片，
    // 义项分别是「化暗杆内螺纹」和「走」，牌面上是两张没有意义的卡片。
    id: 'wander', displayText: 'wander', type: 'root', meaningCn: '漫步',
    allomorphs: ['wander'], etymology: '古英语 wandrian（漫无目的地走）', level: 1, color: 'orange',
  },
  {
    // whether 是单个词根（古英语 hwæther）。原先切成 whet[whet](磨) + her[her](她)，
    // whet 的义项还是从 "whet" 这个词查来的，与 whether 毫无关系。
    id: 'whether', displayText: 'whether', type: 'root', meaningCn: '是否',
    allomorphs: ['whether'], etymology: '古英语 hwæther（两者中的哪一个）', level: 1, color: 'orange',
  },
  {
    // carrot 是单个词根（希腊 karōton）。原先切成 car[汽车] + rot[轮转]，
    // 两张卡片的义项都指不到「胡萝卜」，拼不出任何东西。
    id: 'carrot', displayText: 'carrot', type: 'root', meaningCn: '胡萝卜',
    allomorphs: ['carrot'], etymology: '希腊语 karōton（胡萝卜）', level: 1, color: 'orange',
  },
  {
    // isolate = isol + ate（拉丁 insula 岛 → 意大利 isola）。原先切成 iso[相等] + late[携带]，
    // 而 iso- 是「相等」（isotherm/isometric），跟「隔离」没有关系。
    id: 'isol', displayText: 'isol', type: 'root', meaningCn: '岛',
    allomorphs: ['isol'], etymology: '意大利语 isola（岛），源自拉丁 insula', level: 3, color: 'orange',
  },
  {
    // correct/correlate 的 cor- 是 com- 的同化形式（加强语气），不是词根 cor(心)。
    // 库里 con- 的变体表里早就有 cor，但 con- 是前缀 —— 直接改挂会让 correct 失去词根（A18），
    // 所以单独立一个 root 记录：只服务这两条词，不参与家族教学。
    id: 'corr', displayText: 'cor-', type: 'root', meaningCn: '共同、加强',
    allomorphs: ['cor'], etymology: 'com- 在 r 前的同化形式', level: 2, color: 'orange',
  },
  {
    // delivery 是单个词根（拉丁 de+liberare，交出）。原先切成 deli[熟食店] + very[真正的] ——
    // 两个义项跟「交付」都毫无关系，而且 deli/very 各自只服务这一条词，切成碎片没有任何收益。
    id: 'delivery', displayText: 'delivery', type: 'root', meaningCn: '递送',
    allomorphs: ['delivery'], etymology: '拉丁语 de- + liberare（交出、释放）', level: 3, color: 'orange',
  },
]

/**
 * 词典兜底痕迹的特征——用于校验时报警（不是判错，是提示人工过一眼）。
 *
 * 旧版只认行首的 `^医`，于是「枪医枪」「视觉的医视觉的」「必然的事情计计算」这种**夹在中间**
 * 的拼接串一条都抓不到（实测漏了 10 条，而 A20b 报 0 反而让人以为干净）。所以除了这张标记
 * 表，还要配 looksLikeDuplicatedGloss 一起用。
 * 仍只判 warning：`美`(beauty)、`计`(计算)、`方`(方向) 这类单字开头都可能是正常义项。
 */
export const DICT_ARTIFACT_RE = /医|俚|人名|姓氏|男子名|女子名|的复数|量滴|液量单位|^见$|^略|^网络/

/**
 * 义项里出现重复片段（枪医枪 / 视觉的医视觉的 / 雇用雇用）—— 词典条目被拼接的形态。
 *
 * 成因：ECDICT 的 translation 里同一个词性段会挂两种词性（`n. 雇用 vt. 雇用`），
 * 取「第一个逗号段」时两段一起被取进来，于是拼成「雇用雇用」。
 *
 * ⚠️ 先要把省略号与标点清掉：后缀义项本来就写成「……的、与……有关（形容词）」，
 * 不清的话「……」自己就会命中重复判定，把 ic/ant/ist/an 这些**正确**的后缀义项全报出来。
 */
export function looksLikeDuplicatedGloss(text) {
  const s = String(text || '').replace(/…/g, '').replace(/[、；;，,（）()]/g, '')
  for (let len = 2; len <= Math.floor(s.length / 2); len += 1) {
    if (s.slice(len).includes(s.slice(0, len))) return true
  }
  return false
}
