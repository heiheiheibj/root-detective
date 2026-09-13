# Stage 3 分批计划：300 词/60 词根 → 2000 词/250 词根

> 创建时间：2026-09-13（Stage 2 完成后）
> 最后更新：2026-09-13 —— **3.0 第 1 项已完成，目标锁定 250 词根**（用户选「稳妥」方案）
> 前置阅读：`docs/Stage2-进度记录.md`（当前状态、工具链、踩坑记录）
> 总目标：**2000 词 / 250 词根**；当前 **300 词 / 60 词根**；缺口 **1700 词 / 190 词根**

---

## 一、目标已锁定：250 词根

**决策依据（2026-09-13 实测，脚本 `scripts/tools/supply-analysis-strict.mjs`）**：

| 口径 | 定义 | A23 合格词根 |
|---|---|---|
| A | 去子串 + 严格 6.2（不保送） | 152 |
| B | 去子串 + 允许 forceInclude ← **Stage 2 实际做法** | **259** |
| C | 含子串 + 严格 6.2（旧脚本口径） | 239 |

- **噪声量化**：87 个词根是只靠子串匹配才"合格"的假供给（如 `government`→`mit`），去掉后旧口径 239 → 152
- **自动信号会低估**：Stage 2 已用 60 个词根里只有 **41 个**被口径 B 判定合格，另外 19 个
  （`spec`/`dict`/`log`/`flect`/`sanct`/`test`/`liter`/`lev`/`migr`/`mir`/`soci`/`flu`/`nov`/`sal`/`art`/`serv`/`polit`/`ven`/`opt`）
  是我**人工选词**的产物，产品里跑得好好的。所以 259 是自动化下限，不是真实天花板
- **可新增**：218 个（259 − 41 已用）；其中 108 个能供 10+ 词；总供给 **10,521 词次** >> 1700 词缺口
- **选 250 的理由**：190 个新增全部落在自动供给范围内（< 218），**不需冒险人工挖掘生僻词根**；
  250 × 8 词/根 = 2000 词，正好对上词数目标

| 指标 | 当前 | 目标 | 缺口 |
|---|---|---|---|
| 单词 | 300 | 2000 | **1700** |
| 词根 | 60 | **250** | **190** |

**⚠️ 测算局限**（3.1 选根时必须人工把关）：
1. 没验证**语义可教性**——`non`(nine)/`cryo`(cold)/`pseud`(false) 供给数字好看但多半是学术造词，对中考→六级用户价值低
2. 没验证**切分可行性**——供给词能否干净切成「前缀+词根+后缀」未测（Stage 2 时 `hydrogen`/`thermometer` 在这栽过）
3. 口径 B 里不少词根的 d5 靠**保送 toefl/gre 词**凑，这类词偏难

---

## 二、切分三原则

1. **先改架构，再加数据**——分层拆包必须在加词前完成，否则每加一批都要返工
2. **每批独立可交付**——批末即可玩、闸门全绿、可回滚
3. **每批规模 ≈ 一个 Stage 2**（40~60 新词根 / 250~350 词）——实测上限，再大就会撞单次输出 token 限制

---

## 三、Stage 3.0：架构准备（0 个新词）

先把路修好。以下全部完成才能进 3.1。

| # | 任务 | 说明 | 验收 |
|---|---|---|---|
| 1 | ✅ **精确词根供给测算**（已完成 2026-09-13） | 脚本 `supply-analysis-strict.mjs`：去子串 + cigen/MorphyNet/wordroot 三硬信号，并模拟 forceInclude | **目标锁定 250 词根**，详见 §一 |
| 2 | ✅ **索引/详情分层拆包**（已完成 2026-09-13） | 详见下方「3.0 #2 完成记录」 | 首屏 101.8 KB gzip（300 词），详情分片按需加载，实机验证通过 |
| 3 | ✅ **配置架构批次化**（已完成 2026-09-13） | 详见下方「3.0 #3 完成记录」 | 新增批次不用改合并脚本 |
| 4 | ✅ **性能适配**（已完成 2026-09-13） | 详见下方「3.0 #4 完成记录」 | 250 卡重排 39.7ms → 7.2ms |
| 5 | **测试适配** | `logic.test.ts:158-164` 必须重写（断言复习板顺序 `['spec','dict','port']`，词根多了不成立） | 全部测试绿 |
| 6 | 补齐 error boundary | `main.tsx` 没有，懒加载分片 404 会白屏（计划书 line 311） | 分片加载失败有兜底 UI |

### 3.0 #2 完成记录（2026-09-13）

**架构**：
- 40 号新产物：`content/words-index.json`（WordCore 七字段）+ `content/details/shard-NN.json`（85 词/片，片数 = ⌈词数/85⌉，rmSync 重建避免孤儿片）
- `data.ts`：`words` 类型改 `WordCore[]`（索引层内联）；新增 `getWordCore` / `getWordDetailSync` / `loadWordDetail`（动态 import 分片 + Map 缓存 + in-flight 去重）；`getWord` 已删除；`getFamilyWords` 返回 `WordCore[]`
- `App.tsx`：`useWord(wordId)` hook 合成完整 Word，详情没到返回 null，拼词区渲染占位；`chooseWord` 不再同步算猜义选项，改 `useEffect([word])` 详情就绪后生成
- Node 侧（validate + content/logic/pipeline 测试）完整词表改读 `content/words.json`（`tests/fullWords.ts` 共享 helper），与浏览器共享同一份产物
- 接缝保持：`logic.ts` 依旧不 import data；`getRootId`/`pickNextWord` 本来就是 `WordCore` 接缝

**实测数字（300 词 / 60 根）**：
- 首屏：`index.js` 101.8 KB gzip + CSS 7.2 KB（React+应用代码+索引层+词素表）
- 懒加载：4 片详情共 ~56.8 KB gzip，**打开词条才拉对应那一片**
- 整包对比：拆包前 data 口径 98.4 KB → 现在首屏数据面只含索引层；2000 词时详情约 380 KB gzip 全部留在分片里
- ⚠️ 180 KB 首屏目标是 2000 词口径；届时索引层会涨到 ~130 KB gzip，3.1 批次结束后用 `npm run build` 实测曲线再校

**实机验证**（vite preview + Playwright）：今天→拼词→猜义→结果全流程通；
resource 记录只有 `index.js + CSS + shard-00`，shard-01/02/03 零请求；截图 `stage3-shard-verify.png`。

**踩坑（新）**：`useWord` 若每次渲染直接返回 `{...core, ...detail}` 新对象，`useEffect([word])` 会死循环
重洗猜义选项（洗牌结果每次不同 → 选中项漂移 → 玩家点 A 变成提交 B）。必须 `useMemo` 固定合成引用。

**verify-rerun** 已纳入 index/shards 共 9 个文件，两次重跑逐字节一致。

### 3.0 #3 完成记录（2026-09-13）

**架构**：
- `scripts/lib/stage2-additions/` → `scripts/lib/stage-additions/batch-01/`（9 个片，`git mv` 保留历史）
- `build-stage2-config.mjs` → `build-stage3-config.mjs`：**扫描 `batch-*/` 目录（名字排序=合并顺序）自动累加**，输出 `stage3-content.json`
- 合并规则：`splits-*.json` 支持多片（token 限制友好）；`families/splits/forceInclude` 同键后者胜出**并告警**；
  `worlds` id 重复、词素 id 重复**直接报错**；每次生成都跑完整自检（家族词↔split↔词素↔世界交叉检查）
- `package.json` 的 `content:all` 三处参数引用同步换到 `stage3-content.json`

**等价性证据**：新配置与旧 `stage2-content.json` **逐字节等价**（仅 `_comment` 文案不同）；
全链重跑后 `data.ts` 哈希 `96e32266e4c9810c` 与改造前**完全一致** → 重构对下游零影响。

**扩展点验收**：临时建空目录 `batch-02/` → 合并器自动识别、结果不变、无需改任何脚本 → 已删。
3.1 落地时只需 `mkdir stage-additions/batch-02/` 并放入切片文件。

### 3.0 #4 完成记录（2026-09-13）

**改动**（一行 CSS）：`.atlas-card` 加 `content-visibility: auto` + `contain-intrinsic-size: auto 142px`。

**实测（注入克隆卡凑到 250 张，模拟 250 词根）**：

| 指标 | 优化前 | 优化后 |
|---|---|---|
| 整页强制重排（5 次取中位） | 39.7 ms | **7.2 ms**（-82%） |
| 首次注入 190 卡 + 布局 | 27.1 ms | — |
| 滚动 120 帧 avg / jank | 16.55 ms / 0 | 16.56 ms / 0 |
| 滚动全页后文档高 | 12665 px | 12665 px（自校正一致） |

- `auto` 关键字会记住渲染过的真实尺寸：注入克隆卡时初始按 142px 估算（文档高虚高 980px），
  滚过一遍后回到与优化前**完全一致的 12665px**，滚动条不跳
- 60 卡真实页面 + 375px 移动端截图无视觉回归（`stage3-atlas-desktop.png` / `stage3-atlas-mobile.png`）
- **配对复习面板不用改**：`getReviewBoard` 上限 6 组，与词根总数无关

> 注意测量方法的局限：headless 下滚动帧率区分度低（paint 被跳过），所以主指标取「整页强制重排」，
> 它直接反映离屏卡片是否还参与布局。真机移动端收益应大于桌面。

---

## 四、Stage 3.1 ~ 3.5：按考试层级分批加词

按「中考 → 四级 → 六级」排，每批做完就有一层实际可用性。

目标 250 词根（新增 190）/ 2000 词（新增 1700），分 5 批，每批规模 ≈ 一个 Stage 2（40 根 / 233 词）。

| 批次 | 内容 | 增量 | 累计（约） |
|---|---|---|---|
| 3.1 | 中考核心词根 | ~38 根 / ~340 词 | 640 词 / 98 根 |
| 3.2 | 四级基础 | ~38 根 / ~340 词 | 980 词 / 136 根 |
| 3.3 | 四级进阶 | ~38 根 / ~340 词 | 1320 词 / 174 根 |
| 3.4 | 六级主力 | ~38 根 / ~340 词 | 1660 词 / 212 根 |
| 3.5 | 补齐 + 收尾 | ~38 根 / ~340 词 | **2000 词 / 250 根** |

> 选根从 §一的口径 B 合格清单（`scripts/.work/derived/supply-strict.json`）里挑，
> 按 6.2/6.4 与「语义可教性」人工筛，宁可少不要凑。

---

## 五、每批固定流水线（7 步）

工具链 Stage 2 已备齐，直接复用（`scripts/tools/` 下）：

```bash
# 1. 选根：供给分析
node scripts/tools/supply-analysis.mjs          # 或针对本批写 check-families 草稿
node scripts/tools/check-families.mjs           # 验证草稿家族 d1/d5
node scripts/tools/check-words.mjs "word1,word2" # 核验个别词难度与 6.2

# 2~3. 写切分 + 文案（按批写入 stage-additions/batch-NN/ 与 handoff 分片）
#      ⚠️ 文案必须分 3~4 个分片文件写，单个文件别超过 ~60 词

# 4. 合并配置 + 自检
node scripts/tools/build-stage3-config.mjs

# 5. 全链重跑
npm run content:all

# 6. A12 自动修复（干扰项义项锚定）
node scripts/tools/check-a12.mjs                # 列出待修
node scripts/tools/fix-a12-auto.mjs             # 自动替换（模板库 SCENES）
#    若 words-prose.json（Stage 1 老词）也需修，手工改后重跑 30→40

# 7. 验收
npm test                                        # 期望全绿
node scripts/validate-content.mjs               # 期望 0 错误
node scripts/tools/verify-rerun.mjs             # 跑两次，比对 SHA256
#    实机：Playwright 走 今天→拼词→猜义→结果→地图，两尺寸截图
git tag stage3.N
```

---

## 六、硬约束 checklist（Stage 2 血的教训）

- [ ] **文案分片写**：单次写入 >60 词会被截断（Stage 2 batch-1 废过一次）
- [ ] **覆写词素保义项超集**：改 allomorphs 时别删旧 meaningCn（改 `gen` 丢了「种类」导致老词 A12 全断）
- [ ] **连接体做 allomorph，不独立成前缀**：`hydro`/`thermo` 独立成前缀会让 d1/d5 词落不到 `hydr`/`therm` 家族
- [ ] **A12 外来义项**：干扰项必须字面含 ≥2 汉字义项原文，且**本词自己的前后缀义项不算外来**
- [ ] **先跑 fix-a12-auto，别手工重写**：Stage 2 手工重写 3 轮才过
- [ ] **干扰项窗口**：`makeDistractors` 已加步长维度（3~27），若将来再报 0 干扰项，是组合数不够，加步长范围

---

## 七、环境坑（PowerShell / Node）

- `npm run dev` 用 PowerShell 后台 job **起不来**，必须 `Start-Process node node_modules/vite/bin/vite.js --port 5173 --strictPort`
- `Get-FileHash | ForEach` 里 `ProviderPath` 为 null 会炸 → 哈希比对一律用 Node 脚本（`verify-rerun.mjs`）
- `node -e` 里引号极易炸（`node v22.20.0`），复杂校验写临时 `.mjs` 再跑；`.mjs` 里 `??` 与 `||` 混用要加括号
- ECDICT 列序：0 word, 1 phonetic, 2 definition, 3 translation, 4 pos, 5 collins, 6 oxford, 7 tag, 8 bnc, 9 frq, 10 exchange, 11 detail, 12 audio
- 难度规则（6.4）：d1 = zk/gk 标签 或 collins=5 或 bnc<3000；d5 = (cet6|toefl) 且 (bnc>10000 或 bnc=0)；其余 d3
- 环境里存在 `OPENROUTER_API_KEY`，但脚本**优先 handoff**，不会真调（Stage 2 全程 $0）

---

## 八、回滚

每批结束打 tag：`stage3.1` … `stage3.5`。任意一批出问题，退回上一批的词库照样能玩。
`stage1-content.json` 保留为回滚锚（Stage 2 合并脚本不修改它，只读取）。
**未经用户允许不 git push**（用户红线）。

---

## 九、明天如何继续

### 进度状态（2026-09-13 收工）

| 阶段 | 状态 |
|---|---|
| Stage 1（67 词 / 20 根） | ✅ 完成 |
| Stage 2（300 词 / 60 根） | ✅ 完成：闸门 0 错误、53 测试绿、实机双尺寸通过、两次重跑逐字节一致 |
| **Stage 3.0 第 1 项（供给测算）** | ✅ **完成，目标锁定 250 词根**（用户选稳妥） |
| **Stage 3.0 第 2 项（分层拆包）** | ✅ **完成**（见 §三 完成记录） |
| **Stage 3.0 第 3 项（配置批次化）** | ✅ **完成**（见 §三 完成记录，`batch-01` 已就位） |
| **Stage 3.0 第 4 项（性能适配）** | ✅ **完成**（重排 39.7→7.2ms，见 §三 完成记录） |
| Stage 3.0 第 5 项（测试适配） | ⏭️ **下一步** |
| Stage 3.0 第 6 项（error boundary） | ⬜ 待做 |
| Stage 3.1~3.5（加词） | ⬜ 待做 |

新会话读这三份即可恢复全部上下文：

1. `docs/Stage3-分批计划.md`（本文件）——下一步做什么、怎么做
2. `docs/Stage2-进度记录.md`——当前状态、工具链、踩过的坑
3. `docs/扩词库计划.md`——总体设计与验收标准

### 明天的启动指令（复制给我即可）

```
读 docs/Stage3-分批计划.md，从 Stage 3.0 第 5 项（测试适配）开始执行。
目标 2000 词 / 250 词根。3.0 全部做完再进 3.1。
```

### 第 5 项要点（免得我明天重复探索）

- 计划书原话是 `logic.test.ts:158-164` 断言复习板顺序 `['spec','dict','port']` 会随词根变多而失效。
  **先核实**：现在的代码已经是手工夹具（「一组都没到期时…」那条用例注释写明「由熟练度决定，而不是词根表顺序」），
  可能 Stage 2 已顺手修过——别重复劳动
- 真正会随词数增长出问题的是这几处，逐条量：
  1. `logic.test.ts` 题池差分测试遍历 `morphemes.map(id)` × 4 组夹具 × 全表过滤 → 250 词根时是 O(250×4×2000)，
     量一下耗时，别让单测从毫秒变秒级
  2. `content.test.ts`「每个词根至少覆盖 d1 和 d5」→ 新批次里冷门词根缺一端就会红，规则本身要商量
     （是每批都必须满足，还是允许 Stage 3.5 收尾时补齐）
  3. `TARGET_WORD_COUNT` / `AGGREGATE_MIN_WORDS` 这类常量是写死的 300，加词时要同步（`contentRules.ts`）
- 验收：加词后 53 个测试仍全绿，且总耗时仍在 1 秒量级

### 环境自检

```bash
cd d:\AIGAME\背单词
npm test                 # 期望 53 passed
npm run validate:content # 期望 300 词 / 155 词素 / 12 世界，0 错误 45 警告
node scripts/tools/supply-analysis-strict.mjs  # 重跑测算，确认口径 B = 259
```

### 当前未清理项（可选）

根目录 `_t_*.mjs`、`shot-*.png`、`stage2-*.png`、`package - 副本.json`、`package-lock - 副本.json`——删除需用户确认。
**未经用户允许不 git push**（用户红线，至今未 commit / 未 push）。
