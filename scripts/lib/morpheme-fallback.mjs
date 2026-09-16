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
  capit: '头', comp: '共同', sid: '坐', turb: '搅动', dure: '持续',
  eng: '英格', ma: '妈', bag: '袋', handwrite: '手写', ind: '印度', duce: '引导',
  duct: '引导', // 曾「管」（ECDICT 把 duct 当「导管」查了）；conduct/educate 要的是「引导」
  par: '相等；准备', // 曾「标准」（ECDICT 义项）；compare 支 par(相等)，prepare 支 parare(准备)
  se: '分开、离开', // 曾「计栈空」（SE 缩写词条泄漏）；select ← se-(分开)+legere(选)
  reg: '统治；区域', // 曾「计注册表文件」（REG 缩写泄漏）；region ← regio，与 regere(统治) 同源
  val: '强健；墙', // 曾只挂「墙」（interval ← vallum）；value/valid 支 valere(强健)
  pat: '忍受；拍', // 曾只挂「拍」（pattern/patriot）；patient 支 pati(忍受)
  main: '主要；手；留下', // 曾「主要；手」；remain/permanent 支 manere(留下)
  liber: '自由；称量、天平', // 曾只挂「称量、天平」（deliberate）；liberal/liberty 支 liber(自由)
  mathematic: '数学', mann: '人', eld: '年代', bi: '二', mas: '弥撒',
  apt: '适合', enda: '待办', app: '朝向', awk: '反手', butch: '屠宰', rot: '轮转',
  circ: '圆', barrass: '阻碍', rupt: '破裂', minim: '最小', minimus: '最小',
  minimum: '最小', rn: '走', abs: '离开', yer: '人', cip: '拿取', sci: '知道',
  gas: '气', lus: '戏弄', lig: '捆绑', soph: '智慧', sprink: '洒',
  urbs: '都市', who: '谁', zeal: '热忱', eous: '…的', trah: '拉、拖', emi: '出去',
  dem: '民众', hospital: '招待', dc: '引导', mons: '警示',
  pel: '驱动、推', der: '剩下', tardus: '慢', tard: '慢', mal: '坏', syn: '共同',
  secut: '跟随', cess: '走、让', philo: '爱',
  popul: '人口', import: '带入', bull: '球', well: '好',
  western: '西', cube: '立方', poet: '诗人', abbreviate: '缩短',
  spoken: '说',
  // 后缀/前缀：同样撞上了缩写词条
  semi: '半', multi: '多', iso: '相等', uum: '名词词尾',
  ency: '名词后缀', sion: '名词后缀', um: '名词后缀',
  // 同根变体：拼法来自 cigen（同一词根散成两条记录），合并前先各兜对义项。
  // 标注「合并后作废」的条目在 id 合并之后就没有记录会用到，留着是防合并被回退时义项又变回垃圾。
  gress: '攻击',                              // 合并后作废（并入 gress）
  act: '做、行动',                            // 合并后作废（并入 act）
  passer: '经过',                                // 合并后作废（并入 pass）
  note: '知道、标记', not: '不',                 // 不合并：notice/notation 是词根 not-(知道)，neither/notwithstanding 是副词 not(不)
  cor: '心', just: '判断、公正',             // 第 2 层合并（courage→cor、just→jud）
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

  bid: '命令',             // 曾「一日两次医每日两」（[医] b.i.d.）；forbid
  gener: '产生',           // 曾「类」（前缀匹配取错义）；generate/generation

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

  pair: '配',              // 曾「一双」；repair/despair
  search: '找',            // 曾「搜寻」；research
  tell: '讲',              // 曾「告诉」；retell

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
  // ── 二轮全表对抗式复核（2698 词逐条过目）抓出的残余错注 ──────────────────────
  // 模式与首轮相同：词典把「现代词义/专名/残段」当成了词素义。这里的三百多条每条都对着
  // 用词的 literal/mnemonic/sourceNote 核过 —— 字面义当时就是按正确词源写的，词素表注错才对不上。
  // 真双支（两个词源都真实存在的）用「；」并立；纯泄漏（现代词义、药名、人名、残句）直接删掉。
  abound: '充盈、满溢',      // 曾「大量存在」；abound ← abundare(满溢)
  access: '通路；附加',     // 附件支 accessorium(附加)
  acre: '英亩；砍杀',       // massacre ← mactare(宰杀)；acre 本义英亩
  actor: '表演',             // 曾「男演员」（循环义）；actress ← actrice
  advert: '使转向',         // 曾「提出看法」；advertise ← ad+vertere(转)
  aeri: '空气',             // 曾「表示空气」（残句）；aerial ← aer(空气)
  ag: '做、驱使',           // 曾「朝向」；agenda ← agere(做)
  air: '…的人（法语后缀）', // 曾「空气」；millionaire 的 -aire 是施事后缀
  ambit: '四处走动；周围',  // ambition ← ambire(四处走)
  annual: '年度的',         // 曾「年刊」（n. 词义当词素义）；annualis ← annus(年)
  anti: '反对；在…之前',   // antique 支 ante(在前)，antibiotic 支 anti-(反)
  appeal: '恳求；打动',     // appealing ← appellare(招呼、打动)

  apply: '涂；施用',        // appliance ← applicare(施用)
  appraise: '评价；估价',    // appraise ← prisier(估价)
  atom: '原子；不可切',     // atomos 本义不可切
  automatic: '自动的',      // 曾「自动手枪」（n. 串味）；automatos(自动)
  available: '有效的；可得', // availability 要「可得」支
  ban: '布告、旗',         // banner ← bandum(旗)
  base: '底部；基础；垒',   // database 要「基础」、baseball 要「垒」
  basic: '基本的',          // 曾「基本原理」（n. 串味）
  be: '蜜蜂',              // 曾「是」（be 动词串味）
  behave: '举止、表现',      // 曾「举止端正」（状态义）
  bet: '好（比较级支）',   // 曾「打赌」（bet 串味）；better ← betera
  bore: '钻孔；令人厌烦',    // boring 支 borian(钻孔)，bore 支令人厌烦
  bow: '弓；弯',            // elbow 支 boga(弯)
  bowl: '碗；球',           // bowling ← boule(球)
  brace: '支柱；手臂',      // embrace 支 brace(手臂)
  braid: '辫子；缰绳',       // bridle ← bridel(缰绳，编结而成)
  bush: '灌木；砍',         // rebuke ← buchier(砍)
  calibrate: '口径；校准',   // calibration ← calibrer(校准)

  cap: '容纳',            // 曾「抓取、拿」；capacity ← capacitas(容纳)
  carry: '运送',            // 曾「进位」；carrier ← carrus(车)
  case: '情形；箱、柜',     // bookcase/suitcase 要「箱柜」支
  ceit: '拿、领会；欺骗',   // conceit ← conceiven(领会)，deceit 支欺骗
  scend: '爬',               // 曾「波浪的推动力」（无中生有）；transcend ← scandere(爬)
  cent: '百；唱',           // incentive ← incinere(奏唱)，percent 支百
  champ: '竞技场；大声嚼',  // champion ← campus(竞技场)，chomp 支大声嚼
  chant: '圣歌；唱',        // enchant ← incantare(念唱)
  chap: '小伙子；头',       // chapter ← capitulum(小头)
  char: '家庭杂务；烧焦',   // charcoal 支 char(烧焦)，charwoman 支杂务
  charge: '指控；装载',     // discharge ← chargier(装载)
  chart: '图表；文书',      // charter ← charta(纸、文书)
  chemist: '化学、炼金（者）', // chemistry 字面「炼化的学问」
  chest: '胸；箱',          // chestnut 民间拆法用「箱」支
  chute: '瀑布；坠落',      // parachute ← chute(坠落)
  cite: '城市',             // 曾「叫」（citare 串味）；citizen ← cite(城市)
  claim: '要求；喊',        // proclaim ← clamare(喊)
  class: '班级；等级、类别', // classic ← classicus(等级)
  cleanly: '洁净',          // 曾「爱清洁的」（词义当词素义）；clæne(洁净)
  clos: '关闭；秘密',       // closet ← clos(关闭)
  co: '外套、上衣',       // 曾「共同」（co- 串味）
  colony: '垦殖；殖民地',   // colonial ← colere(耕作)
  com: '来',               // 曾「共同」（com- 串味）；welcome ← cuman(来)
  commerce: '贸易',          // 曾「商业」（现代义当词素义）；merx(货物)
  commune: '共有；公社',     // 曾「恳谈」；communis(共有的)
  communicate: '共通；传达', // 曾「显露」；communicare(使共有)
  compatible: '相容',       // 曾「能共处的」（残句）；pati(忍受) 支
  complex: '缠绕、复杂；综合体', // complexity ← complecti(缠绕)
  conduct: '行为；引导',    // conductor ← conducere(引导)
  conserve: '保存；蜜饯',    // 曾「蜜饯」（n. 支当主义）；conservare(保存)
  convention: '大会；惯例', // conventional 要「惯例」支
  converse: '相反；交往',    // conversation 支 conversari(交往)
  cook: '烹调；厨子',       // 曾「厨子」（n. 义）；cooker 字面「做菜用的器物」
  cord: '心；绳索',         // record/cordial 支 cor(心)，cordless 支绳索
  corporate: '成一体；社团的', // incorporate ← corpus(身体)
  correlate: '关联',         // 曾「有相互关系的东西」（残句）；correlare(关联)
  counter: '柜台；反、相对', // counteract/counterpart 支 counter-(反)
  course: '课程；跑、进程', // discourse ← currere(跑)
  court: '法院；宫廷',      // courtesy ← corteis(宫廷式的)
  cracy: '统治',            // 曾「的政府」（残句）；kratos(统治)
  craft: '技艺；（飞行）器', // aircraft 要「器」支
  culture: '文化；耕作',    // agriculture 要「耕作」支
  cuss: '诅咒；摇',         // discuss ← quatere(摇)

  cut: '切口；跟随',       // execute ← sequi(跟随)，cute 本义切口/可爱
  cy: '（后缀）性质、状态', // 曾「表示性质」（残句）；bankruptcy 的 -cy
  deport: '押解、运送；举止', // deportation ← deportare(押解)
  derive: '引出；源头',      // derivation ← derivare(引出)
  deter: '制止；限定',      // determine ← de+terminus(界限)
  dorm: '睡',               // 曾「宿舍」（n. 串味）；dormant ← dormire(睡)
  dox: '见解',              // 曾「强力霉素」（药名泄漏）；doxa(见解)
  due: '应付的；引导',      // subdue ← ducere(引导)，overdue 支应付
  earn: '赚得；热忱',       // earnest ← eornost(热忱)
  economy: '持家；经济',     // economic ← oikonomia(持家)
  educate: '引出、教育',     // 曾「教育」（循环义）；educare(引出)
  ell: '前臂；厄尔（量布单位）', // elbow ← eln(前臂)，ell 本义厄尔
  elect: '当选人；电',      // electron 支 elektron(琥珀→电)
  endure: '持久；忍受',      // endurance ← durare(持续)
  enter: '进入；在…之间',  // enterprise ← entre-(之间)
  epi: '在上',              // 曾「直沙嘴」（无中生有）；epidemic ← epi-(在上)
  eros: '啃蚀',             // 曾「爱神」（Eros 人名串味）；erosion ← erodere(啃蚀)
  err: '犯错；走偏',        // error ← errare(游荡走偏)
  ex: '出（ex- 变体）',    // execute 的 exe-
  exhaust: '抽干；排气',    // exhaustion ← exhaurire(抽干)
  exploit: '功绩；利用',    // exploitation ← esploitier(利用)
  extract: '提取',          // 曾「榨出物」（残句）；extrahere(拉出)
  extraordinary: '超出寻常', // 曾「非常的」（词义当词素义）
  ey: '眼睛',              // 曾「指小」（后缀义串味）
  fact: '做；事实',         // faction ← facere(做)
  fect: '做、成',           // 曾「电场效应」（缩写泄漏）；facere(做)
  feed: '喂；饲料',         // feedback ← feed(喂养)
  fellow: '伙伴；男人',     // fellowship ← feolaga(伙伴)
  fic: '面；做、成',        // superficial ← facies(面)，efficient 支 facere(做)
  file: '档案；线',         // profile ← filo(线)
  final: '终点的；期末考试', // finally ← finalis(终点)
  fit: '适宜；做',          // benefit ← facere(做)
  float: '飘动、扑动',      // 曾「漂流物」；flutter ← floterian(扑动)
  for: '为了；失去',        // forget/forbid 的 for-(否定、失去)
  form: '形状；前',         // former ← forma(第一、前)
  formula: '公式、配方；客套语', // formulation 要「公式」支
  fort: '强壮；十四',       // fortnight ← feowertine(十四)
  found: '奠基；底',        // profound ← fundus(底)
  game: '博戏；比赛',       // gamble ← gamen(游戏、骰子)
  gig: '巨人',              // 曾「旋转物」；gigantic ← gigas(巨人)
  glam: '魔力',             // 曾「迷人的」（词义当词素义）；glamer(魔法)
  god: '教亲',              // 曾「上帝」；godsibb(教亲) 的前半
  graduate: '走完等级、毕业', // 曾「毕业生」（循环义）
  greet: '问候；悲叹',       // regret ← greter(悲叹)，greet 支问候
  guise: '方式、装扮',      // 曾「相似」；disguise ← guise(方式)
  gust: '味道；突然一阵',   // disgust ← gouster(尝)
  gut: '水滴、淌',         // 曾「剧情」；gutter ← gutta(水滴)
  hal: '看马人；仆役',      // marshal ← scalc(仆役)
  hard: '坚硬的；园圈',     // orchard 支 geard(园圈)
  haste: '纠缠',             // 曾「匆忙」；hassle ← haggle(讨价还价)
  hate: '帽子；憎恨',        // hatred ← hatian(恨)
  helm: '舵；盔',           // helmet 支 helm(护首之物)
  her: '她；粘',            // adhere 支 haerere(粘)
  hind: '后面；雌鹿',       // behind 要「后面」支
  host: '主人；敌人',       // hostile ← hostis(敌人)
  hide: '藏、缩',           // 曾「兽皮」；huddle 与 hide(藏) 同源
  hum: '地面',             // 曾「嗡嗡声」；humble ← humus(土地)
  ignore: '不知道',          // 曾「不理睬」；ignorare(不知道)
  ile: '不；（后缀）…的、物', // missile 的 -ile 是物后缀
  immune: '免除；免疫的',    // immunity ← munus(义务、免除)
  impure: '不纯',            // impurity ← purus(纯净)
  influence: '流入；影响力', // influential ← influere(流入)
  inforce: '使有力',        // 曾「大规模地」（残句）；reinforce ← enforce(使有力)
  initial: '最初的；字首',  // initially ← initium(开始)
  initiate: '开始、发起；入会', // initiative ← initiare(开始)
  inspire: '吸气；使感动',   // inspiration ← inspirare(吸气)
  institute: '设立、建立',   // 曾「学会」（循环义）
  intense: '拉紧；非常的',   // intensity ← intendere(拉紧)
  intern: '内部的',         // 曾「实习生」（n. 串味）；internus(内部)
  inverse: '相反、翻转',    // 曾「以诗体」（无中生有）；invertere(翻转)
  ite: '…的、…的人；石',   // favourite 支 favorito，meteorite 支矿物后缀
  journal: '日报、期刊；日记', // journalist ← diurnalis(每日的)
  keep: '看守；生计',       // 曾「生计」（n. 支当主义）
  lap: '膝盖；搭叠',        // overlap ← lappe(搭叠)
  late: '晚、后（比较级支）', // 曾「携带」（latum 串味）；latter ← lætra
  lease: '放开；租约',      // release ← laissier(放开)
  left: '留下；左边',       // leftover 要「留下」支
  leg: '读；腿',            // legend ← legenda(该读的)，leg 本义腿
  locate: '定位；找出',      // location ← locare(定位)
  loco: '地方',             // 曾「疯草病」（loco weed 串味）；locus(地方)
  lore: '哭喊；知识',       // implore ← plorare(哭喊)
  lute: '洗、污；琵琶',     // pollute ← luere(弄污)
  main: '主要；手',         // maintain ← manu tenere(用手持)
  major: '较大的；主修课',  // majority ← major(较大的)
  man: '人；手',            // manoeuvre ← manu(手)
  mar: '鬼压；损毁',       // nightmare ← mare(压人的鬼)
  marine: '海的',           // 曾「舰队」（n. 串味）；marinus(海的)
  marx: '马克思',   // 曾「马克思无产阶级的」（残句泄漏）
  measure: '量度；尺寸',     // measurable ← mesurer(量度)
  mand: '修补；托付',       // commend ← mandare(托付)
  merge: '沉',              // 曾「使合并」（现代义）；submerge ← mergere(沉)
  mill: '磨坊',             // 曾「压榨机」；windmill ← mylne(磨坊)
  milli: '千；千分之一',    // million ← mille(千)，millimetre 要千分之一
  min: '小；界限；挖',     // determine 支 terminus(界限)，undermine 支 minen(挖)
  ming: '掺、混',           // 曾「明朝」（朝代名泄漏）；mingle ← mengan(混合)
  minor: '较小的；未成年人', // minority ← minor(较小的)
  miser: '可怜；守财奴',    // miserable ← miser(可怜)
  mist: '称呼；雾',         // mister ← master(弱化)，mist 本义雾
  mode: '尺度',             // 曾「模态」；moderate ← modus(尺度)
  mortal: '必死的、凡人',   // 曾「生物」；immortal ← mors(死)
  motive: '移动的',         // 曾「动机」（n. 串味）；locomotive ← motivus(移动的)
  multiplicate: '倍增',      // 曾「复合的」；multiplication ← multiplus(多倍的)
  muse: '缪斯；沉思',        // music ← Mousa(缪斯)
  mute: '变换',             // 曾「哑子」（n. 串味）；commute ← mutare(变换)
  natural: '自然的',        // 曾「白痴自然的」（垃圾串泄漏）；natura(本性)
  navy: '船',                // 曾「海军」（现代义）；naval ← navis(船)
  nerve: '神经',             // 曾「精神」；nervous ← nervus(神经)
  ne: '不',                 // 曾「原姓的」（残句泄漏）；nought ← ne(不)
  nov: '九；新',            // november ← novem(九)，novelty 支新
  novel: '小说；新奇',      // novelist ← novella(故事)
  object: '物体；反对、客体', // objection ← obicere(扔向、反驳)
  office: '公务、职责',      // 曾「办公室」；official ← officium(职责)
  old: '以前的；（threshold 支）门坎', // threshold ← therscold(门坎)

  on: '一',                // anyone/everyone 的 one
  open: '打开',             // 曾「公开」（词义当词素义）；opener ← openian(打开)
  operative: '工作的',      // 曾「动作的」（残句）；cooperative ← operari(工作)
  orc: '园',                // 曾「虎鲸」（orca 串味）；orchard ← hortus(园)
  orient: '日出；东方',     // orientation ← oriens(日出)
  ory: '场所；…的',         // contradictory 要「…的」支
  ought: '东西；应该',      // nought ← owiht(东西)，ought 本义应该
  pact: '压紧；契约',       // compact ← pangere(钉紧)
  paint: '描绘、画；油漆',  // painter ← peindre(描绘)
  para: '防；旁边、平行',   // parachute ← para-(防)
  particular: '特定的',     // 曾「一项或条点」（残句）；particula(小部分)
  pass: '经过；步；承受',   // compass 支 passus(步)，passive 支 pati(承受)
  patch: '拴住；片、补丁',  // dispatch ← pedica(脚镣拴住)
  patient: '忍耐；病人',    // impatient ← pati(忍受)
  pay: '支付；薪资',        // payment ← paier(支付)
  pen: '几乎；钢笔',        // peninsula ← paene(几乎)
  pense: '称量；分开花费',  // dispense ← pensare(称量)
  permit: '放行',          // 曾「许可证」（n. 串味）
  pick: '腌；精选',         // pickle ← pekel(盐水)
  play: '游戏；折叠',       // display ← pleier(折)
  populate: '定居、使人聚居', // 曾「使人口聚居在中」（残句）
  posit: '放置',            // 曾「假设」（v. 串味）；positive ← ponere(放置)
  post: '后；邮政',         // postcard/passport 要「邮政」支
  present: '呈献；现在、礼物', // presentation ← praesentare(呈献)
  primary: '首要',          // 曾「最主要者」（残句）；primus(第一)
  principal: '首要的',      // 曾「校长」（n. 串味）；princeps(为首者)
  process: '行进；程序',    // procession ← processio(行进)
  produce: '产出、引出',     // 曾「生产品」（循环义）
  prompt: '即时的；激励',   // promptly ← promptus(准备好的)
  proof: '防、挡；证据',    // waterproof 要「防挡」支
  propose: '提出',           // 曾「计划」（现代义当词素义）
  prospect: '前景；景色',   // prospective ← prospicere(向前看)
  pump: '鼓、熟瓜',         // 曾「抽水机」；pumpkin ← pepon(熟瓜)
  que: '…的（法语词尾）；队列', // unique 的 -que，queue 本义队列
  radius: '辐射；半径',       // radial ← radius(轮辐、光线)
  radio: '射线；无线电',    // radioactive ← radius(射线)
  react: '反应',            // 曾「重做」（字面拼装义）；re-agere(回做)
  rebel: '造反',           // 曾「叛徒」（n. 串味）；rebellio(再战)
  recess: '后退；休息',     // recession ← recedere(后退)
  relative: '相对的',       // 曾「亲戚」（n. 串味）；relativus(相对的)
  rent: '流；租金',         // torrent ← torrens(翻腾流)
  rep: '爬；回',            // 曾「棱纹平布」（布料名）；reptile ← repere(爬)，reproach 支回
  repute: '认为；名望',      // reputation ← reputare(反复思量)
  reserve: '保留',           // 曾「储备品」（n. 串味）；reservare(保留)
  resign: '辞去、交还',     // 曾「再签署」（字面拼装义）
  response: '回应',          // 曾「反应」；responsible ← respondere(回应)
  rede: '推测、解；筛',     // riddle ← rædan(推测)
  riff: '长官',             // 曾「连复段」（乐句串味）；sheriff ← gerefa(长官)
  right: '直、正；权利',    // upright ← riht(直)
  rip: '起伏、微波',       // 曾「裂痕」；ripple ← ripplen(起微波)
  rob: '长袍',             // 曾「抢夺」（rob 串味）
  roll: '名册；卷',         // enroll ← rolle(名册)
  rough: '粗糙的',          // 曾「粗糙的东西」（残句泄漏）
  ry: '场所；性质、行业',   // bravery 要「性质」支
  sal: '汁',               // 曾「盐」（与 saus 混同）；saucer ← sauce(汁)
  saul: '跳',              // 曾「索尔男名」（人名泄漏）；assault ← saltare(跳)
  scan: '绊倒；审视',       // scandal ← skandalon(绊脚石)
  scar: '红布；疤痕',       // scarlet ← saqirlat(红布)
  science: '知道；科学',    // conscience ← scire(知道)
  scramb: '抓爬',           // 曾「英方用指甲或爪子」（残句泄漏）
  second: '第二',           // 曾「秒」（n. 串味）；secundus(第二)
  sent: '感觉；存在',       // absent/present 支 esse(存在)
  sequence: '跟随；序列',   // consequence ← sequi(跟随)
  sequent: '跟随',          // 曾「后果」（词义当词素义）
  ser: '放置；连接',       // insert ← serere(放置)
  sever: '严峻',           // 曾「分开」（sever 串味）；severus(严峻)
  sh: '郡',                // 曾「嘘」；sheriff ← scir(郡)
  skill: '币名',            // 曾「技术」（skill 串味）；shilling ← scilling
  ship: '船',               // 曾「身份」（-ship 后缀支当主义）；shipbuilding ← scip(船)
  shut: '梭；关闭',        // shuttle ← scytel(梭)
  sib: '血亲',              // 曾「啜饮」（sip 本义）；gossip ← godsibb(教亲)
  sit: '地点',             // 曾「坐落」；website ← situs(地点)
  slight: '轻微',           // 曾「轻蔑」（n. 串味）；sletta(平滑轻微)
  sole: '唯一；脚掌、孤单', // solely 要「唯一」，console 要「孤单」，sole 本义脚掌
  solution: '解开；解决',   // resolution ← solvere(松开)
  solve: '松开',            // 曾「解决」（词义当词素义）
  sort: '出去',             // 曾「种类」（现代义当词素义）；resort ← sortir(出去)

  space: '空间；位置',      // airspace 要「空间」支
  special: '专门的',        // 曾「专辑」（n. 串味）；specialis(专门的)
  specific: '特定、具体',   // 曾「特殊的」；specificus(具体的)
  spine: '旋转；脊骨',       // spinal ← spina(脊骨)
  spite: '轻视',            // 曾「恶意」（n. 义当词素义）；despite ← despicere(俯视)
  stable: '稳固的',         // 曾「马房」（n. 串味）；stabilis(稳固)
  stag: '摇晃',            // 曾「牡鹿」；stagger ← stakra(推晃)
  stance: '站立',           // 曾「准备击球姿势」；circumstance ← stare(站)
  start: '开始；惊起',      // startle ← steartlian(惊起)
  station: '驻立；车站',    // stationary ← statio(驻地)
  sty: '厅堂',              // 曾「管理」；steward ← stig(厅堂)
  stead: '位置',            // 曾「代替」（词义当词素义）；stede(位置)
  step: '一步；步骤',       // footstep 要「脚步」支
  still: '安静',            // 曾「蒸馏室」（n. 串味）；stille(安静)

  store: '储存',            // 曾「商店」；restore ← restaurare(重建)
  strain: '拉紧',           // 曾「紧张」（现代义）；stringere(拉紧)
  struct: '堆叠、构造',     // 曾「结构」（结果义）；struere(堆叠)
  substantial: '实质的',    // 曾「重要材料或事物」（残句泄漏）
  success: '接续；成功',    // succession ← succedere(接着来)
  suit: '跟随、起诉；套装', // pursuit/pursuit 支追随，lawsuit 支起诉
  sum: '夏；总数',         // summer ← sumor(夏)
  superior: '较高的',       // 曾「长者」（n. 串味）
  suspect: '怀疑',           // 曾「被怀疑者」（n. 串味）；suspicere(由下往上看)
  tail: '切割；尾部',       // detail ← tailler(切割)
  template: '观测场；样板', // contemplate ← templum(观测场地)
  tempt: '试探；诱惑；轻蔑', // attempt 支 temptare(试)，contempt 支 contemnere(轻蔑)
  ten: '持有；十',          // tenth 要「十」支，tenable 要「持有」支
  tenant: '持有者；承租人', // lieutenant ← tenens(持有者)
  tend: '伸展；柔嫩',       // tender ← tener(柔嫩)
  tent: '持有；帐篷',       // content ← continere(容纳)，tent 本义帐篷
  tick: '轻触',             // 曾「滴答声」（n. 义当词素义）；tickle ← tikelen(轻触)
  tile: '物',               // 曾「砖瓦」（tile 本义）；reptile 的 -tile
  ting: '安置',             // 曾「叮当声」（拟声串味）；setting 的残段
  tiny: '立定；很少的',     // destiny ← destinare(立定)
  tor: '翻滚',              // 曾「石山」；torrent ← torrere(翻腾)
  translate: '搬运',         // 曾「翻译」（循环义）；translatus(搬过去)
  tress: '拉紧',            // 曾「一绺头发」（n. 义当词素义）；distress ← distringere(拉紧)
  tri: '分；三',            // tribute ← tribuere(分给)
  troy: '堆叠',             // 曾「金衡」（金衡制串味）；destroy ← struere(堆叠)
  trump: '号角',            // 曾「王牌」（n. 义当词素义）；trumpet ← trompe(号角)
  ty: '十；性质、状态',     // fifty 要「十」支，duty/casualty 要状态支
  un: '不；直至',           // until 支 und(直至)
  eur: '…的人（法语后缀）',  // 曾「欧洲」（Europe 串味）；entrepreneur 的 -eur
  vac: '牛',             // 曾「空」（vacuum 串味）；vacca(牛)
  vag: '游荡',              // 曾「流浪者」（n. 串味）；vagari(游荡)
  valid: '强健',            // 曾「有确实根据的」（语义义当词素义）；validus(强健)
  vain: '空虚',              // 曾「无价值的」；vanity ← vanus(空虚)
  vantage: '在前；优势',    // advantage 字面「处在前面」
  verge: '倾斜',            // 曾「边缘」；diverge/converge ← vergere(倾向)
  vestigate: '足迹',        // 曾「调查」（循环义）；vestigium(足迹)
  vicine: '邻近',            // 曾「巢菜碱」（药名泄漏）；vicinus(邻居)
  viola: '越界、施暴',     // 曾「中提琴」（乐器名串味）；violare(施暴)
  violet: '紫色',           // 曾「堇菜」（花名串味）；ultraviolet ← viola(紫罗兰色)
  vow: '出声',              // 曾「誓约」（n. 义当词素义）；vowel ← vocalis(发声)

  ward: '看守；朝向',       // steward/wardrobe 支 warder(看守)
  war: '货物',             // 曾「战争」（war 串味）；warehouse ← waru(货物)
  wide: '宽的；广泛',       // 曾只注「广泛」；wide 本义宽
  wild: '野生；荒野',       // wildlife 要「野生」支
  wind: '风；缠绕',         // winding ← windan(缠绕)
  with: '伴随；回、对抗',   // withdraw 支回，withstand 支对抗
  yard: '场地',             // 曾「码」（单位义当词素义）；courtyard ← geard(场地)
  yield: '让；生产量',      // yielding ← gieldan(付、让)
  pan: '平锅；面包；潘神',  // company ← panis(面包)，panic ← Pan(潘神)
  im: '不；进入',           // impossible 支 im-(不)，immigrate 支 in-(进入) 的同化
  lemon: '柠檬',            // 曾缺失；lemonade ← lemon + -ade
  weave: '编织',              // 原「编法」（ECDICT 词性段拼接），weaver 的字面义对不上
  village: '村庄',            // 原「村庄乡村的」（词性段拼接）
  manufacture: '制造；产品',   // 原只挂「产品」，manufacturer 的字面义是「做出产品的一方」
  simil: '相似',              // 原「明喻」（simile 是比喻格），assimilate 要的是「相似」
  insula: '岛',               // 原「医岛」（ECDICT 领域标记泄漏），insulate ← insula(岛)
  lumin: '光',                // 原「腔」（lumen 是腔，lumin 是光），illuminate 要「光」
  rit: '刺激',                // 原「计信息传输速率」（缩写词条），irritate ← irritare(刺激)
  module: '组件；调节',        // modulate 要的是 modus(尺度、调节)，原只挂「组件」
  me: '我；通过、穿行',        // permeate ← per+meare(通过)，原只挂「我」
  cipit: '头',                // 原「开始中世纪抄本开」（残句），praecipit- 是「头朝下」
  fac: '做、制造；面',         // surface/interface ← facies(面、形状)，原只挂「做、制造」
  mitt: '送、投',             // 原「棒球手套」（mitt 词条），omit ← ob+mittere(送)
  vid: '看；分开',            // divide ← dis+videre(分开)，原只挂「看」
}
/**
 * 显示名修正：id 是内部标识，卡片上画的是 displayText。有一批 id 是切分算法按词形凑出来的
 * 碎片（`wf`、`wer`、`eond`），直接显示会在牌面上出现「wf＝女人」这种莫名其妙的卡片 ——
 * 改成该词素实际用到的表面形式。
 *
 * ⚠️ displayText 必须全局唯一（A20），改之前先确认没有别的词素在用同一个名字。
 */export const OVERRIDE_DISPLAY = {
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
  {
    // 二轮复核注入：这些残段原本被张冠李戴的碎片占着名（deli[熟食店]、far[fart 截断]…），
    // 切分改挂正身时目标 id 在库里没有，只能注入。每条的词源都写在 etymology 里。
    id: 'cline', displayText: 'cline', type: 'root', meaningCn: '倾斜',
    allomorphs: ['cline'], etymology: '拉丁 clinare（倾斜）；decline/incline', level: 3, color: 'orange',
  },
  {
    id: 'liber', displayText: 'liber', type: 'root', meaningCn: '称量、天平',
    allomorphs: ['liber'], etymology: '拉丁 libra（天平）；deliberate ← de+librare', level: 3, color: 'orange',
  },
  {
    id: 'electr', displayText: 'electr', type: 'root', meaningCn: '电',
    allomorphs: ['electr'], etymology: '希腊 elektron（琥珀，摩擦起电）；electron', level: 3, color: 'orange',
  },
  {
    id: 'ther', displayText: 'ther', type: 'suffix', meaningCn: '比较级后缀',
    allomorphs: ['ther'], etymology: 'farther ← ferther（far 的比较级）', level: 1, color: 'green',
  },
  {
    id: 'far', displayText: 'far', type: 'root', meaningCn: '远',
    allomorphs: ['far'], etymology: '古英语 feor（远）；farther = far + ther', level: 1, color: 'orange',
  },
  {
    id: 'frain', displayText: 'frain', type: 'root', meaningCn: '勒住',
    allomorphs: ['frain'], etymology: '古法语 fraindre（勒住）；refrain', level: 3, color: 'orange',
  },
  {
    id: 'chill', displayText: 'chill', type: 'root', meaningCn: '寒冷',
    allomorphs: ['chill'], etymology: '古英语 cele（寒冷）；chill 整词，原 ch+ill 残段', level: 1, color: 'orange',
  },
  {
    // lemonade ← lemon + -ade（饮料，法语后缀：orangeade/lemonade）。原先挂在 ad-(朝向) 上，
    // 卡片成了「柠檬 + 朝向」——ade 是能独立成话的支，单独立 root。
    id: 'ade', displayText: 'ade', type: 'root', meaningCn: '饮料',
    allomorphs: ['ade'], etymology: '法语 -ade（由…制成的饮料）；lemonade', level: 3, color: 'orange',
  },
  {
    // 这批词在英文里就是整词（river ← riparia、liver ← lifer、hover ← hoven…），硬切只会
    // 切出 rive/rathe/hove/cate/pee 这种无意义的碎片（还带出「岸」「较普通时刻时期早」
    // 「猫」「英便士」这类垃圾义项）。按 delivery/wander 的既定做法：整词立一个 root。
    id: 'river', displayText: 'river', type: 'root', meaningCn: '河流',
    allomorphs: ['river'], etymology: '古法语 rivere，拉丁 riparia（河岸）', level: 1, color: 'orange',
  },
  {
    id: 'liver', displayText: 'liver', type: 'root', meaningCn: '肝脏',
    allomorphs: ['liver'], etymology: '古英语 lifer', level: 1, color: 'orange',
  },
  {
    id: 'hover', displayText: 'hover', type: 'root', meaningCn: '盘旋；悬停',
    allomorphs: ['hover'], etymology: '中古英语 hoven（徘徊）', level: 3, color: 'orange',
  },
  {
    id: 'rather', displayText: 'rather', type: 'root', meaningCn: '相当；宁愿',
    allomorphs: ['rather'], etymology: '古英语 hrathor，hræth（快）的比较级', level: 1, color: 'orange',
  },
  {
    id: 'slippery', displayText: 'slippery', type: 'root', meaningCn: '滑的',
    allomorphs: ['slippery'], etymology: 'slip（滑）+ -ery，p 双写', level: 1, color: 'orange',
  },
  {
    id: 'peer', displayText: 'peer', type: 'root', meaningCn: '同辈；凝视',
    allomorphs: ['peer'], etymology: '古法语 per，拉丁 par（相等）', level: 3, color: 'orange',
  },
  {
    id: 'taper', displayText: 'taper', type: 'root', meaningCn: '逐渐变细；烛芯',
    allomorphs: ['taper'], etymology: '古英语 tapur（烛芯）', level: 3, color: 'orange',
  },
  {
    // miner 的词干原本被归一到 min(小，minute/minimum) —— 那是另一个词源。mine 是
    // 古法语 mine（矿、矿井），与 min(小) 同形不同源，单独立 id。
    id: 'mine', displayText: 'mine', type: 'root', meaningCn: '矿；挖',
    allomorphs: ['mine'], etymology: '古法语 mine（矿、矿井），miner', level: 1, color: 'orange',
  },
  {
    // appreciate ← ad + pretium(价值)：切分表里落成了 reci（被 ECDICT 的 ricin 词条污染成
    // 「医蓖麻毒素」），正身是 preci。
    id: 'preci', displayText: 'preci', type: 'root', meaningCn: '价值',
    allomorphs: ['preci'], etymology: '拉丁 pretium（价值、价钱）；appreciate', level: 3, color: 'orange',
  },
  {
    // heroine / routine 的 -ine 立不住独立 id：id 归一化会剥掉词尾的 e（ine→in），
    // 于是又并回前缀 in(不、进入)。按 delivery 的做法整词立 root，词源写进助记里。
    id: 'heroine', displayText: 'heroine', type: 'root', meaningCn: '女英雄；女主角',
    allomorphs: ['heroine'], etymology: '法语 héroïne，hero + -ine（阴性后缀）', level: 3, color: 'orange',
  },
  {
    id: 'routine', displayText: 'routine', type: 'root', meaningCn: '常规；例行程序',
    allomorphs: ['routine'], etymology: '法语 routine，route（路）+ -ine', level: 3, color: 'orange',
  },
  {
    // preface ← 拉丁 praefatio（prae- 前 + fari 说），与 fac(做、面) 无关。
    // 词形撞脸 fac，挂上去就会教成「前面的面」，整词立 root。
    id: 'preface', displayText: 'preface', type: 'root', meaningCn: '序言；开场白',
    allomorphs: ['preface'], etymology: '拉丁 praefatio，prae-（前）+ fari（说）', level: 3, color: 'orange',
  },
  {
    // automation = automat(自动装置) + -ion。原切分是 automatic[automati] + ion[on]，
    // 把 ion 的表面写成 on 是硬凑。
    id: 'automat', displayText: 'automat', type: 'root', meaningCn: '自动装置；自动操作',
    allomorphs: ['automat'], etymology: '希腊 automatos（自己动的）；automation', level: 3, color: 'orange',
  },
  {
    // 比较级 -er（later/farther）与施事 -er（driver）同形不同义，挂在 er 一张卡上会互相串味，
    // 单独立 id。farther 的 -ther 是同一批里的另一个变体（见 INJECT_MORPHEMES 的 ther）。
    id: 'comper', displayText: 'comper', type: 'suffix', meaningCn: '更……的（比较级）',
    allomorphs: ['er'], etymology: '比较级后缀 -er；与施事 -er 同形不同义', level: 1, color: 'green',
  },
  {
    id: 'scent', displayText: 'scent', type: 'root', meaningCn: '气味；爬',
    allomorphs: ['scent'], etymology: '双支：sentir（气味）与 scandere（爬，descent）', level: 3, color: 'orange',
  },
  {
    id: 'terr', displayText: 'terr', type: 'root', meaningCn: '地',
    allomorphs: ['terr'], etymology: '拉丁 terra（地）；terrain', level: 3, color: 'orange',
  },
  {
    id: 'ain', displayText: 'ain', type: 'suffix', meaningCn: '（法语词尾）',
    allomorphs: ['ain'], etymology: 'terrain 的 -ain 词尾', level: 1, color: 'green',
  },
  // ── 批次 06 注入：常用拉丁词根（此前上游数据源没有这些 id）─────────────────────
  {
    // create ← 拉丁 creare（创造、生长）。
    id: 'cre', displayText: 'cre', type: 'root', meaningCn: '创造、生长',
    allomorphs: ['cre'], etymology: '拉丁 creare（创造、生长）；create/creature', level: 3, color: 'orange',
  },
  {
    // station ← 拉丁 stare（站立）。与已有的 stand/st（站立）同源，词形是 sta（st 是后缀，
    // 变体表里只有 st/state/stat，覆盖不了 station 的 sta）。
    id: 'sta', displayText: 'sta', type: 'root', meaningCn: '站立',
    allomorphs: ['sta'], etymology: '拉丁 stare（站立）；station/stable', level: 3, color: 'orange',
  },
  {
    // section ← 拉丁 secare（切）。sect 在 intersect/dissect 里也是「切」。
    id: 'sect', displayText: 'sect', type: 'root', meaningCn: '切',
    allomorphs: ['sect'], etymology: '拉丁 secare（切）；section/insect/intersect', level: 3, color: 'orange',
  },
  {
    // connect ← 拉丁 nectere（系、连接）。上游数据源没有 nect 这个 id。
    id: 'nect', displayText: 'nect', type: 'root', meaningCn: '连接',
    allomorphs: ['nect'], etymology: '拉丁 nectere（系、连接）；connect', level: 3, color: 'orange',
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
