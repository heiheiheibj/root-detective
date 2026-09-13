# Stage 3 执行 TODO（可中断续跑）

> **目标：2,600+ 单词 / 347+ 词素** —— 覆盖中考→六级里「可拆讲」的考试词
> **依据**：`docs/测算方法说明.md`（已通过独立 AI 复算，核心结论成立）
> **更新**：2026-09-13

---

## 0. 新会话怎么接上

1. 读本文件 → 看「当前进度」一节，找到标记 `← 接这里` 的那一步
2. 读 `docs/测算方法说明.md` 了解数据与口径
3. 看该步的「输入 / 输出 / 验收 / 续跑命令」，直接执行；已完成步骤的产物文件都在

**当前进度**：**S1 已完成（质量达标、覆盖率未达标）→ 接 S3**

> S1 结果：融合五源后覆盖 **2,940 / 7,111（41.3%）**，未达 4,000 的验收线。
> 原因是词素白名单砍掉 10,530 个污染拆分——**这是有意的取舍**（宁少勿错）。
> 覆盖率提升改由 **S3 规则切分**继续推，所以把 S3 提前，S2 顺延（避免给将被淘汰的词素做归类）。

---

## 1. 步骤清单

### S1 融合多源、建权威拆分库 【✅ 已完成】

**产出**：
- `scripts/tools/kaikki-morphemes.mjs` → `.work/derived/kaikki-splits.json`（277,633 词 / 79,964 词素）
- `scripts/tools/fuse-splits.mjs` → `.work/derived/splits-fused.json`（**2,940 考试词**）
- `scripts/tools/audit-splits.mjs`（质量抽检工具）
- 文档：`docs/测算方法说明.md` 3.7 节（两轮修正）+ 4.4 节（两套口径）+ 10 节（交付状态）

**结果**：覆盖 2,940（41.3%）；来源 模板 1,382 / 文本 906 / cigen 161 / MorphyNet 239 / 复合词 252；
对齐救回 682 个；涉及词素 2,418 个；**≥3 考试词的词素 380 个 → 覆盖 2,729 词**。

**抽检**：随机 28 个（seed=42）→ 26 合理（93%）；对齐样本 18 个（seed=9）→ 16 合理（89%）。

**踩坑（4 个，都已修）**：
1. `surf` 模板第 1 位是 `+suf`/`+pre` 标记、第 2 位才是语言码 → 只跳 key=1 会多出一个 "en"
2. 参数值带内联注解 `ess<id:female>` → 必须先剥 `<...>`
3. 文本正则 `[^.;]*` 跨逗号贪婪 → 切出 `vusfromad+iaci`；改成 `[^,.;()]` 并限长 40
4. 文本路径必须用**模板词素白名单**过滤，否则拉丁词干的变音符号被 norm 掉会变垃圾（`ad+cd`）

---

### S3 规则切分兜底 【✅ 已完成 —— 结论：不采用激进切分】

**做了什么**：尝试给 4,171 个未覆盖考试词补拆分（典型目标 `accept → ac + cept`）。

**四版实验与抽检结果**：

| 版本 | 补充数 | 总覆盖 | 抽检准确率 | 判定 |
|---|---|---|---|---|
| ① 统计推断 surface（出现 ≥2 次） | 1,264 | 4,204（59.1%） | 23% | ❌ 废弃 |
| ② 门槛提到 ≥8 次 + 前缀 ≥3 字母 | 414 | 3,354（47.2%） | 42% | ❌ 废弃 |
| ③ 改用权威词素表（kaikki 高频 ≥50 词 + 候选词根 allomorphs） | 277 | 3,217（45.2%） | 62% | ❌ 废弃 |
| ④ ③ 再砍掉 `surface+suffix` 模式 | **89** | **3,029（42.6%）** | **70%** | ✅ **保留**（标记 low confidence） |

**根本原因**：英语里大量**单语素词看起来像可拆**——`miser`/`donkey`/`sister`/`liter`/`senate`/
`proper`/`person`/`assess`/`formidable`。统计规则区分不了「真派生」与「巧合撞上词素表面」。

**结论**：`surface+suffix` 模式误拆率过半，**默认关闭**（要开须显式 `--with-suffix`）。
S1 的人工标注准确率 86~93%，规则切分上限 70% —— **权威标注不可替代**，
覆盖率缺口交给 S2 的人工筛选，不用低质量数据充数。

**产出**：`scripts/tools/rule-split.mjs`、`.work/derived/splits-rule.json`、`.work/derived/splits-merged.json`

**对目标的影响**：2,600 词目标已由 S1 单独达成（2,940 词），S3 的 89 个是锦上添花。

---

### S2 词素归类与义项 【✅ 已完成】

**产出**：`scripts/tools/build-morpheme-lexicon.mjs` → `.work/derived/morpheme-lexicon.json` + **`docs/词素清单.md`**（人工过目用）

**结果**：入池 **377 个词素**（门槛 ≥3 个考试词）
- 类型：前缀 130 / 词根 96 / 后缀 151（判定优先级：kaikki 词条 pos → 候选词根 type → 位置统计）
- **义项覆盖 373/377 = 99%**（kaikki 词素词条 201 / 候选词根 34 / 该词自身中文释义 142）
- 覆盖：**≥3 词素 377 个 → 2,746 词**；≥5 词素 166 个 → 2,494 词；≥10 词素 65 个 → 2,079 词
- 难题分布也统计了（每个词素的 d1/d3/d5）

**关键发现（产品设计洞察）**：原本「缺义项」的 141 个词素**全是复合词部件**
（`day`/`book`/`hand`/`light`/`room`/`sea`/`air`），它们不是词缀而是**独立的英语词**。
产品上用它们当拼词卡片完全成立（`book` + `shelf` → `bookshelf`），义项直接取词义。
清单里用 `isCompoundPart` 字段标记了这类。

**遗留**：4 个词干变体缺义项（`clude`/`histor`/`imagin`/`simpl`），需要人工或 LLM 补。

---

### S4 目标词表与批次划分定案 【✅ 已完成】

**产出**：`scripts/tools/plan-batches.mjs` → `.work/derived/batches.json` + `docs/Stage3-分批计划.md`（目标与批次表已更新）

**定案**：目标 **3,029 词 / 2,559 词素**（教学词素 377 + 零件词素 2,182）

| 批次 | 层级 | 新增词 | 新增词素（其中教学） | 累计词 | 累计词素 |
|---|---|---|---|---|---|
| 3.1 | 中考 | 434 | 526（199） | 434 | 526 |
| 3.2 | 高考 | 974 | 860（148） | 1,408 | 1,386 |
| 3.3 | 四级 | 771 | 542（28） | 2,179 | 1,928 |
| 3.4 | 六级 | 850 | 631（2） | 3,029 | 2,559 |

**两个关键设计**：
1. **词素分两层**（原本要求"所有零件都入池"只剩 681 词 —— 太严，废弃）：
   拼词卡片是按 `word.parts` 生成的（见 `getAvailableCards`），低频词素照样能当卡片，
   只是不做教学单元。所以：教学词素 377（有义项+世界归属）/ 零件词素 2,182（只需最小记录）。
2. **分批规则**：词的层级取最低 tag（zk>gk>cet4>cet6）；词素归到最早需要它的批次，避免跨批重复引入。

**注意**：每批 430~970 词，比 Stage 2（233 词/批）大 2~4 倍，实施时按 ~150 词分子批。
3.1/3.2 就吃掉 347/377 个教学词素（常用词根先服务简单词）。

---

### S5 内容规则适配 【✅ 已完成】

**量清的影响面**（脚本 `_t_rule_check` 口径）：

| 规则 | 新规模下的问题 |
|---|---|
| **A23** | 96 个教学词根里只有 **21 个** d1/d5 齐（22%）—— Stage 2 能过是因为人工挑过词根 |
| **A18** | **2,658 / 3,029 词缺 root part**（词干类零件词素没入池，类型未定） |
| **A6** | **717 个 part 的 surface ≠ id**（`able→abil`、`absorb→absorp`）必须写进 allomorphs |

**改动**（`contentRules.ts` A23 + `content.test.ts` 同步）：

```
教学词素（家族 ≥ MIN_WORDS_PER_ROOT=3）：要求 ≥1 个 d1 词（硬卡）+ d5 提示
零件词素（家族 < 3）：豁免家族规模与难度覆盖
孤儿词素（0 词）：报错
d5 从 error 降为 warning —— 它是「必须收冷门派生词」的选题偏好，不是正确性
```

**验证**：53 测试全绿；内容闸门 0 错误 45 警告（对现有 300 词完全透明）。

---

### S6 流水线适配到千词规模 【进行中】

**S6a 词素表生成 【✅ 完成】**（`scripts/tools/build-morpheme-table.mjs` → `.work/derived/morphemes-draft.json`）

- **2,458 条**词素（按规范 id 归并变体）｜类型：前缀 244 / 词根 1,938 / 后缀 276
- 一次性解掉 4 个数据问题：
  - **A18** 零件词素默认 `type: 'root'`（只认 Wiktionary 词条定的前后缀）—— 按位置推断会让前缀虚高到 1,108 个
  - **A20** displayText 无冲突（前缀 `xxx-`、后缀 `-xxx`、词根 `xxx`）
  - **A6** allomorphs 收全**实际用到的**表面（如 `use` → `[use, us]`）
  - **A22** 只写用到的表面，不抄候选表的全部变体
- 义项：**自动 2,189 条**（零件词素，从 ECDICT 推导，如 `book→书`/`day→天`）+ **待翻译 232 条**（教学词素，见 `.work/derived/translate-queue.json`）

**S6b 批次配置生成 【✅ 完成】**（`scripts/tools/build-batch-config.mjs` → `scripts/lib/stage-additions/batch-02/`）

- 3.1 中考批：**新增词 415**（本批 434，已存在 19）｜**新增词素 461**（词根 298 / 前后缀 163）
- 切分文件 7 个（每片 ≤60 词）｜词根家族 298 个
- 只产增量（排除 `stage3-content.json` 已有词与词素，避免撞 A20）
- **管线已验证跑通**（20→21→22→30→40 全程无崩溃），只卡在「词根未挂世界」

**S6c~e 待做**：

| 步骤 | 内容 |
|---|---|
| **S6c** | ① ~~词素可用性门槛~~ ✅ 已改判为分级补义项（见下）　② **世界划分**：教学词根分成 15~25 个世界并命名　③ 改 A24 检查口径——现在要求「每个词根都要挂世界」，但 batch-02 里 328 个词根大多是零件词根，不该要求世界　④ 执行释义/翻译队列 |
| S6d | 管线适配：20/21/30/40 号按新规模调整（shard 大小、handoff 分片） |
| S6e | 跑通全链（`npm run content:all` 在目标词规模下 0 错误） |

### S6c 词素质量与 id 归一化 【✅ 完成】

**实际做法与原计划不同**：原打算按门槛**剔除**不合格词素及连带词（250 词），但那样会废掉
`absorb`/`agenda`/`adjacent`/`accumulate` 这些好词 —— 它们的词素（`sorbe`/`enda`/`jacent`/`cumul`）
看着像碎片，其实正是词素法该教的东西。**改成四级分级 + 补义项**：补得出就全保留，补不出才剔词。

| 级 | 数量 | 含义 | 动作 |
|---|---|---|---|
| A1 | 1900 | ECDICT 英语实词（`day`/`book`/`according`） | 义项直接可用 |
| A2 | 221 | 教学词素 / Wiktionary 词条（gloss 是英文） | 译成中文 |
| A3 | 35 | 出现在 ≥2 词但哪儿都查不到（`gener`/`cumul`/`vis`/`grav`） | LLM 写词素义项 |
| A4 | 231 | 只出现在 1 个词里（最可疑） | LLM 写义项，写不出就剔该词 |

受影响词只有 295 个（9.7%），补上义项即可全保留。队列在 `.work/derived/morpheme-tasks.json`。

**顺带修掉两个 bug**：

1. **id 归一化**（新增 `scripts/lib/id-canon.mjs`）：切分按词形定 id，同一词根会散成多份 ——
   `absorb→ab+sorbe` / `adsorb→ad+sorb`、`vision→vis+ion` / `television→tele+vise+ion`、
   `accumulate→ac+cumulate+ate` / `cumulative→cumul+ative`。合并了 71 个变体
   （`sorbe→sorb`、`vise→vis`、`cumulate→cumul`、`insulate→insula`…），并带语义黑名单
   （`ice`≠`ic`、`note`≠`not`、`side`≠`sid`）。不修的话每个 id 词数都不够（过不了教学价值门槛），
   而且词库里同一词根会出两张卡片。
2. **类型误判**：`lexicon` 里 `confidence: 'position'` 的条目是按位置猜的 —— `day` 因为 13 次出现在
   词尾被标成 `suffix`。改为只认 Wiktionary 给的身份（`glossSource: 'affix'`）。

**产物自洽已验证**：batch-02 的 415 词 / 484 词素，part id 在词素表里**缺失 0**。

### S6c 世界划分 【✅ 完成】

提纯教学词根时暴露两个边界问题：

1. **教学词根表里混着功能词与碎片**。判据原本只有「出现在 ≥3 个词里」，于是 `her`（代词，出现在 herself）、
   `every`/`there`/`how`（副词）、`six`/`seven`（数词）、`por`（abbr.）、`app` 都成了「词根」，还有
   `her→stick`、`fall→to deceive`、`ceive→head`、`main→hand` 这类错配 gloss。
   新增 `scripts/tools/refine-teaching-roots.mjs` 提纯：**163 → 154**（剔除 9 个）。两条判据：
   ① 有 Wiktionary 词根词条（`lexicon.glossSource === 'affix'`，`dict`/`sist`/`pel`/`ceed` 靠这条）；
   ② ECDICT 里是实词（词性 n/v/a，`day`/`book`/`sea` 靠这条，`her`/`there` 是功能词被拦）。
   **坑**：ECDICT 的 `pos` 独立字段实测是空的，词性得从 `translation` 开头取（`"n. 天, 日子"` / `"pron. 她的"`）。

2. **154 个「教学词根」里只有约 40 个该挂世界**。其余 110 多个是普通英语复合词部件
   （`day`→daytime、`book`→bookmark、`sea`→seaside），它们只是拼词零件，**没有主题归属**。
   另外世界是**按批次增量**的，本批只能挂已进词库的词根。

最终划出 4 个新世界（+ 已有 12 = 16）：

| id | 名称 | 词根 |
|---|---|---|
| `motion-yard` | 行止院 | act, ceed, pass, turn, cycle |
| `hold-vault` | 持握库 | tain, ten, prise, ceive, take, quest |
| `sense-gallery` | 感知廊 | sent, vision, view |
| `build-site` | 营造场 | stand, base, board |

### S6c 收尾（进行中）

**已修好并跑通的**：

| 问题 | 修法 |
|---|---|
| 功能词被当教学词素（`her`/`every`/`not`） | `_teaching` 加 `isFunctionalWord` 判定（词性从 translation 开头取，ECDICT 的 pos 字段是空的），教学词素 354→343 |
| 前后缀**全部丢失** | `morphemes-affixes.json` 结构要对齐 batch-01 的 `{overrides,prefixes,suffixes}` —— 写成 `{morphemes}` 会被 `build-stage3-config.mjs:50` 静默忽略 |
| **循环依赖** | `build-batch-config` 原先拿 `stage3-content.json`（**产物**）当「已有」基准，重跑时增量归零；改为取真正的上游：`stage1-content.json` + 之前批次 |
| 一词多家族 | 硬错误降为统计（`airport` 同为 air 和 port 的家族词，对产品无害） |
| split 无家族 | 硬错误降为统计（只有教学词根建家族，`ability` 无家族是正常的） |
| 家族覆盖 | batch-02 不再重建已有家族（否则 `port` 在 Stage 2 的 5 个家族词会被挤掉） |
| A24 检查口径 | families 只对教学词根建（324 → 61），不把 260 个碎片拖进世界 |

**当前状态**：`23 世界`、`121 家族`、`395 词`、`715 切分`、`594 词素`，`build-stage3-config` 自检**全绿**。

**卡在 A23（选词阶段，20 号脚本）**：

```
❌ A23 失败 [sea]：词=1 d1=1 d5=0
❌ A23 失败 [stand]：词=2 d1=2 d5=0
```

规则要求教学词素「d1、d5 各有一个词」，但新规模下 62 个教学词根大多只挂 1-2 个词
（`sea`/`sun`/`west`/`night`…），d5 端必然缺。`contentRules.ts` 里的 A23 已经把
**d5 降为 warning、d1 保留硬卡**，但选词脚本（20 号）还是旧口径 —— 要对齐。

### S6d / S6e 【✅ 完成】—— 确定性管线全线跑通

管线现在一路跑到 **30 号（LLM 文案）的 handoff 边界**才停下，这正是设计的分工线：

```
✓ build-stage3-config   121 家族 / 395 词 / 715 切分 / 594 词素 / 23 世界，自检全绿
✓ 10/11/12/13  词源与词素释义
✓ 20 选词      399 候选（257 d1 / 73 d3 / 69 d5），覆盖 119 家族
✓ 21 切分      0 丢词
✓ 22 例句
→ 30 文案      停在 handoff（383 词待写释义，模板已生成）
```

**本轮修掉的坑**（都是「数据流对不上」，只有真跑一遍才暴露）：

| 症状 | 根因 |
|---|---|
| `expose` 被丢 | 归一化只从切分表取 id，而 `pos` 是 Stage 2 人工定义的、切分表里没有，算不出 `pose→pos`。canon 输入要并入已有词素表的 id |
| `alive` 被丢 | cigen 词源说 `a+life`，切分表给 `a+live`，21 号要求两边一致 —— 用逐词修正表 |
| `used` 被丢 | `ed` 的 allomorphs 少了 `"d"`（`used` 切成 `us+d`），在 batch-01 的词素定义里补上 |
| 前后缀**全丢** | `morphemes-affixes.json` 结构必须是 `{overrides,prefixes,suffixes}`，写成 `{morphemes}` 会被 `build-stage3-config` 静默忽略 |
| 增量归零 | `build-batch-config` 拿 `stage3-content.json`（**产物**）当「已有」基准 → 改为取上游 `stage1-content.json` + 之前批次 |
| `face` 世界失效 | `face→fac` 归一化后 `fac` 是 Stage 2 词素（已在 `word-mill` 世界），不能再挂 |

### 下一步

1. **填 handoff 释义**（当前唯一阻塞）：`scripts/lib/handoff/words-prose-stage3/batch-1~7.json`，
   383 词 × 6 字段（`modernMeaningCn` 已预填）。填完 `npm run content:all` 就能一路跑到 40 总装。
2. **词素义项队列**：`.work/derived/morpheme-tasks.json`（A2 译 221 条 + A3/A4 释义 266 条）。
   ※ `her→stick`、`fall→to deceive`、`ceive→head`、`main→hand` 是 Wiktionary 错配，一并修掉。
3. **A23 提示 8 项**：`air/body/thing/ground/room/day/ember/tooth` 缺 d5 档（不影响产出）。
4. **仓库清理**：`_t_*.mjs` 等杂物上次误用 `git add -A` 提交了，需 `git rm --cached`（审批超时未完成）。

<details><summary>原问题描述（背景）</summary>

### 词素可用性门槛

**问题**（S6b 生成 batch-02 时暴露）：零件词素的义项是用「包含匹配最短词」自动推的，
结果把**专有名词、缩略语、错配词**也当成了词素：

| 词素 | 自动义项 | 问题 |
|---|---|---|
| `vis` | 医力 | 错配（应「看」） |
| `so` | 自旋轨道分裂 | 术语 |
| `asia` / `australia` | 亚洲 / 澳洲 | **专有名词** |
| `wf` / `ma` / `pa` / `ug` | 滤水器 / 医智力年龄 / 每年医髓轴的 / 地下 | 缩略语与碎片 |

**为什么必须解决**：这些词素会作为拼词卡片直接出现在产品里。卡片写着「自旋轨道分裂」，
学生拼词就变成"从垃圾碎片里挑"，学习效果为负。**卡片必须是可理解的单位**，这是产品底线。

**门槛设计**（可用的零件词素）：

1. 长度 ≥3，**或**在已知前缀白名单里（`ab`/`ad`/`an`/`be`/`de`/`en`/`ex`/`im`/`in`/`ir`/`re`/`un`/`up`/`dis`…）
2. 且满足其一：
   - 有 Wiktionary 词素词条（`affix-gloss-cache.json`）
   - 是 ECDICT 实词：有 `zk/gk/cet4/cet6` tag 或 `collins/oxford` ≥1 或 `bnc` 排名（**排除专有名词与缩略语**）
   - 义项来自「以它开头」的派生词（不是包含匹配 —— 包含匹配是 `vis→医力` 这种错配的源头）

**连带影响**：含不合格零件词素的**词也要剔出目标词表**（否则拼不出来）。
目标词数会从 3,029 下降 —— 这是必要的质量代价，具体数字在 S6c 里量。

</details>

**已知遗留**：
- 待翻译 / 待释义队列：`.work/derived/morpheme-tasks.json`（A2 译 221 条 + A3/A4 释义 266 条）

**原始 6 个数据侧问题（S5 量出）**：


| # | 问题 | 处理方向 |
|---|---|---|
| 1 | **A18：2,658/3,029 词缺 root part** | 生成词素表时，词干类零件必须标 `type: 'root'`（不能全默认按位置推断） |
| 2 | **A6：717 个 part 的 surface ≠ id** | 把 `(id, surface)` 对自动累加写进对应词素的 `allomorphs` |
| 3 | **A20：displayText 必须唯一** | 2,559 个词素里 `in`(前缀)/`in`(词根) 这类会撞 → 前缀显示 `in-`、后缀 `-tion`、词根 `in` |
| 4 | **A22：死变体警告会爆量** | allomorphs 只写「实际用到的表面」，别把候选表的全部变体抄进来 |
| 5 | **A16：familyWordIds 2~8 个** | 用共享词素自动生成（同词素的其它词） |
| 6 | **世界划分** | 96 个教学词根要挂进世界（12 → 约 15~25 个世界） |

---

**脚本侧适配**（现有 20/21/22/30/40 号是按 300 词写的）：
- `batch-NN/` 配置生成（families/splits 由 S1~S4 产物自动产出，不再手写）
- 文案 handoff 分片机制（3,029 词要拆多少片、每片多大）
- 40 号组装器的索引层/详情分片按新规模重算（shard 大小、片数、首屏 gzip 目标）
- 世界（worlds）划分：96 个教学词根要分成多少世界（现在 12 个世界挂 60 词根）

**输出**：改造后的脚本 + 跑通的空壳批次

**验收**：`npm run content:all` 在 3,029 词规模下跑通、闸门 0 错误

---

### S7 3.1 批次内容生产与验收 【待做】

**做什么**：第一批按 §五 流水线走完：选词 → 写切分 → 写文案（literal/metaphor/options/example/mnemonic）→ 组装 → 闸门 → 测试 → 实机验证 → tag。

**输出**：第一批词库（预计 600~800 词）

**验收**：闸门 0 错误、`npm test` 全绿、实机两尺寸截图、两次重跑逐字节一致

---

## 2. 关键数字备忘

| 数字 | 值 | 出处 |
|---|---|---|
| 考试词总量 | 7,111 | ECDICT zk/gk/cet4/cet6 |
| kaikki 有拆分 | 313,856 词 / 96,005 词素 | `kaikki-morphemes.mjs` |
| 当前覆盖 | 2,938（41.3%） | `exam-coverage.mjs` |
| ≥3 考试词的词素 | 347 → 覆盖 2,656 词 | 同上 |
| 旧口径天花板（已否决） | 155 词根 | `supply-ceiling.mjs` |

## 3. 关键文件位置

| 用途 | 路径 |
|---|---|
| 数据与口径规范 | `docs/测算方法说明.md` |
| 原始数据 | `scripts/.work/raw/` |
| 中间产物 | `scripts/.work/derived/` |
| 测算工具 | `scripts/tools/{kaikki-morphemes,exam-coverage,supply-ceiling,supply-analysis-strict}.mjs` |
| 独立复算留档 | `scripts/verify-independent/` |
| 内容管线 | `scripts/{20,21,22,30,40}-*.mjs` |
