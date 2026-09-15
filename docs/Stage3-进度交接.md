# Stage 3 进度交接（重启后续接看这份）

> 最后更新：2026-09-15 ｜ HEAD：`57d8335`（工作区含未提交的「词素义项全表复核」修复，见 `docs/复核修复进度-2026-09-15.md`）
> 一句话现状：**3.1 中考批已完成并通过全部验证；3.2 高考批的配置已生成，但卡在「20 号只收家族词」这个设计问题上。**

---

## 一、当前状态

| 项 | 值 |
|---|---|
| **当前词库** | **2698 词 / 2146 词素（含 1845 词根）/ 42 世界** |
| **内容校验** | **0 错误 / 1035 警告**（大头是 **A1 缺中文例句 811 条**，其余 A23 127、A22 88、A8 9） |
| **当前阻塞** | **无 —— Stage 3 四批（中考/高考/四级/六级）全部完成，词素重复记录也清完了，可发布** |
| 详情分片 | 32 片 |
| 测试 | **53/53 通过** |
| 构建 | 成功，1144.74 kB / gzip 224.70 kB |
| 释义批次 | `batch-1` ~ `batch-48` 共 2698 词，全量自检 0 问题 |
| 例句覆盖 | **1887/2698 有中文对照**（811 条 `exampleCn` 为空，Tatoeba 里没有带中文的句子 —— A1 的 811 条警告就是它；此前写「2698/2698 全部有」是错的） |
| 词素义项 | 全部有中文义项（`scripts/lib/morpheme-fallback.mjs` 统一兜底） |
| 世界 | 42 个 |

---

## 二、下一步（按顺序做）

### 步骤 1：改 20 号的收录逻辑 【✅ 已完成】

改动：候选改为遍历 `Object.keys(splits)`（切分表里的全部词），`famStats` 单独按 families 统计；
6.2 从「硬卡」改为「筛选」（不达标跳过，不中断）。21 号的「丢词即中断」也改成「报告后继续」
（`within`/`wherever`/`wisdom` 这类复合词没有 root 词素，A18 必然拦下，属正常筛除）。

效果：收录数 392 → **1601**，切分通过 **1379 词**（丢 222 个无词根的复合词）。

### 步骤 2：为 989 个词写释义 【✅ 已完成】

batch-8 ~ batch-24 共 989 词已全部写完，全量自检 0 问题（合计 1365 词）。

### 步骤 3：铺 3.3 四级批（771 词）【✅ 已完成】

释义 `batch-25` ~ `batch-35` 共 618 词写完；实收后全库 1995 词、1639 词素、37 世界。

总装路上又踩到四类闸门，都已修好并沉淀成脚本：

| 闸门 | 现象 | 修法 |
|---|---|---|
| A28 | `option[0]` 里带省略号（「在…之中」）被判为占位符，拦下 amongst / characterize / comprise / concerning / regarding | `scripts/tools/fix-ellipsis-glosses.mjs` 改写成具体措辞 |
| A20 | `st`/`est`/`ir`/`wave`/`ster`/`stock` 6 个词素无中文义项 | 补进 `scripts/lib/morpheme-fallback.mjs` |
| A24 | 13 个孤儿词根（stair/how/possible/operate/please/will/rob/store/commune/por/simple/skill/vary）没挂世界 | `batch-04/worlds.json` 加「生计巷」「人家院」两个世界 |
| 词典残留 | ECDICT 首义在 51 个词条上是拼接串（`underneath`「在下面在的下面」、`videotape`「录相磁带把电视节」），或偏离词根义（`resolution`「解析」、`readily`「迅速地」） | `scripts/tools/fix-modern-glosses.mjs` 一次修 51 处，并体检所有 >10 字无顿号的释义 |

**⚠ 事故记录（下次别重犯）**：手动跑切分时漏了配置参数 ——
`node scripts/21-split-morphemes.mjs` **必须带** `scripts/lib/stage3-content.json`：

```bash
node scripts/21-split-morphemes.mjs scripts/lib/stage3-content.json
```

漏参数的后果是它退回默认配置只切出 66 个词并**覆盖** `words.splits.json`；此时若跑
`prune-handoff-words.mjs`，它拿这份坏 splits 反查，会把上千真实词条当「多余词」删掉
（这次删了 `transmit`/`adjust`，已用 `scripts/tools/restore-pruned-handoff.mjs`
从 git HEAD 恢复）。`prune-handoff-words.mjs` 现在有防线：splits 少于 500 词直接停下。

### 步骤 4：铺 3.4 六级批（850 词）【✅ 已完成】

释义 `batch-36` ~ `batch-48` 共 689 词写完；实收后全库 **2698 词 / 2155 词素 / 42 世界**。

总装路上又踩到六类闸门，都已修好并沉淀：

| 闸门 | 现象 | 修法 |
|---|---|---|
| A12 | 657 个新词的干扰项没依据（`fix-distractors` **不在 `content:all` 里**，每写完一批都要手动跑一次） | `node scripts/tools/fix-distractors.mjs` |
| A28 | `clockwise` 的 option[0]/[1]（顺时针的／逆时针的）相似度过高 | 改写选项 |
| A1/A7/A9 | 11 个词在 Tatoeba 里找不到合格例句 | 补进 `scripts/lib/handoff/words-examples-stage3.json` |
| A20 | `kin`/`let`/`safe`/`eco`/`tri` 5 个词素缺中文义项 | 补进 `scripts/lib/morpheme-fallback.mjs` |
| A24 | 15 个孤儿词根（due/not/relate/sham/clear/clude/min/gener/cut/there/complete/history/imagine/intense/mature） | `batch-05/worlds.json` 加「缘由阁」「明辨堂」「刚柔场」 |
| A23 | `tight` 这类词根的家族词全是高级派生（tighten/tightly/watertight），基础词不在词库里 —— d1 缺从硬错误降为提示 | `20-select-words.mjs` + `contentRules.ts` + `tests/content.test.ts` 三处同步 |

**⚠ 顺手修好的一个隐蔽问题：cigen↔词库的词根拼法对照（救回 19 个词）**

21 号的 cigen 交叉验证要求「cigen 标出的词根必须都在切分里」，但两边拼法不同 ——
cigen 用拉丁词干全形（`trah` / `mitt` / `dc` / `minimus` / `passer` / `puls` / `nsula`），
切分算法按**词形**定的 id 是另一套（`tract` / `mit` / `duce` / `minim` / `pass` / `pel` / `insula`）。
19 个词因此被当「冲突」丢掉：retract transmit adjust introduce minimum peninsula activity
aggression bypass surpass detect depress depict design notice impulse dismiss encourage minimal。

修法：`scripts/lib/id-canon.mjs` 新增 `CIGEN_ROOT_GROUPS`（同根分组，**双向**认 ——
retract 切到 tract 而 cigen 说 trah，distract 反过来）+ `CIGEN_ROOT_IGNORE`
（cigen 多标的前缀 `deh`）；21 号改为「任一匹配即可」（`minimus` 既对 minimum 也对 minimal）。
冲突 19 → 0，切分 2679 → **2698**。

> 这一条已彻底解决，见下面「词素重复记录」一节。

### 词素重复记录（已解决，3adf204 / b8e2cb8 / 714c9f4）

同一个词根在词素表里存了两条记录 —— 21 号按 cigen 给的词根拼法定 id，而 cigen 对不同词给的
拼法不一样（cigen 用拉丁词干全形 `trah`/`mitt`/`dc`/`minimus`/`passer`，切分按词形定的 id 是
另一套 `tract`/`mit`/`duce`/`minim`/`pass`）。后果是词详情页同一词根两个名字（拼 `distract`
显示「trah」、拼 `extract` 显示「tract」），两条都挂了世界时地图上还各出一张卡。

排查中又发现一个更该先修的问题：**这些记录的义项有一半是词典垃圾** —— 生成词素表时按 id 去
ECDICT 查义项，而很多词根/词干的拼法正好撞上一个英文缩写或俚语词条，拿回来的是那个条目的释义，
真实存在但与词根毫无关系：`trah`＝「人名特拉汉」、`dc`＝「医直电流」、`who`＝「医世界卫生组织」、
`minim`＝「量滴液量单位」…… 有汉字、过得了 A20，所以既有的 `FALLBACK_MEANINGS`（只在无汉字时
兜）完全兜不住。最扎眼的是 `minim` 挂在「杂物仓」世界、家族词是 minimum —— 玩家会看到一张写着
「minim＝量滴液量单位」的教学卡然后学 minimum。

分三层修完：

| 层 | 做什么 | 落点 | 结果 |
|---|---|---|---|
| 0 | 修 85 处词典垃圾义项 | `morpheme-fallback.mjs` 新增 `OVERRIDE_MEANINGS`（**无条件覆盖**，与只在空值时兜的 `FALLBACK_MEANINGS` 分工明确），在 `build-stage3-config` 的统一收敛点应用 | 垃圾义项清零 |
| 1 | 合并 8 个残渣 id | `build-stage3-config` 的 `MORPHEME_MERGE` + `WORD_PART_FIX` | 词素 2155 → 2147 |
| 2 | 合并 3 组跨世界同根 | 同上的 `MORPHEME_MERGE`，并改写家族登记表、摘掉世界引用 | 词素 2147 → 2144 |

合并明细：`trah→tract`、`puls→pel`、`dc→duce`、`aggress→gress`、`minimum→minim`、
`minimus→minim`、`passer→pass`、`active→act`、`courage→cor`、`miss→mit`、`just→jud`

**不合并、改切分的一处**：`not` 家族混了两个词源 —— `notice`/`notation` 是词根 not-（知道），
`neither`/`notwithstanding` 是副词 not（不），四个词原先都挂在 `not` 下，一张卡要同时管两种意思。
把 `notice`/`notation` 改挂 `note`（知道、标记）后两条记录各自都正确。这不是「同一词根两张卡」，
是切分指错了词根 —— 合并只会把两种意思焊到一张卡上。

**实现要点**（全部落在 `build-stage3-config.mjs` 这一个收敛点，不改任何批次源文件）：
1. 按 `MORPHEME_MERGE` / `WORD_PART_FIX` 改写 `allSplits` 里 `part.id`
2. 家族登记表 `families` 跟着改写 —— 它按词根手写，键和 `roots` 里写死了源 id；
   只并 splits 的话「每个教学词根都要挂世界」的自检会拿 `courage` 去查世界、报一个已不存在的词根
3. 受影响词素的变体表重算 —— 目标收下原先落在源 id 上的表面（A6），源 id 上不再被用到的变体摘掉
   （`notation` 走了之后 `not` 的 `notat`；A22 死变体警告 1039 → 1038）
4. 源 id 的词素记录整条删除、从所属世界的 `morphemeIds` 里摘掉
5. 撤销引用：`gress`/`note` 因家族涨到 4 词升级为教学词根而缺世界（A24）→ 分别归入行止院
   （act/ceed/pass 同族）与识读阁（sign/mark/detect 同族）

顺带修掉一处同类症状（手写数据，与 cigen 无关）：`port` 同时挂在传送门与匠作台，一个词根两张卡；
`port`(携带) 的家族是 portable/import/report/porter，主题上属于传送门，故从匠作台摘掉。

**新增两道校验网**（`validate-content.mjs`，只报警不算错，防复发）：
`A20b` 义项里出现 `医/俚/古/人名/姓氏/的复数/量滴` 这类词典标记就提示人工确认；
`A24b` 同一个词素挂在多个世界上就提示 —— 归哪一边是编辑判断，不自动择一。

> 注：这些词根在词素表里仍各存了两份**上游记录**的来源（cigen 与切分算法两套拼法），
> 但产物已经归一。把 `CIGEN_ROOT_GROUPS` 接进 `buildCanon` 可从源头消除，收益仅是省掉这张
> 手写合并表，风险是改动全部批次的词素 id —— 不值得做。

**这一轮改动的已知薄弱处**（复核时优先看这些）：

| 薄弱处 | 说明 |
|---|---|
| **85 处覆盖义项没有第三方校验** | `OVERRIDE_MEANINGS` 的值是一个 AI 逐个拍出来的，只有「家族词是否相符」这一层自证。这是本轮最需要外部核对的部分。 |
| **`not` 家族的划分是编辑判断** | 拆成「副词 not(不) → neither/notwithstanding」与「词根 note(知道、标记) → notice/notation/notebook/notable」。划分合理，但换个人可能划得不一样。 |
| **`cigen` 与切分两套拼法的根源没动** | 只做了产物层归一。若将来 cigen 数据更新或新增批次，同样的重复记录会再次出现 —— 得再补 `MORPHEME_MERGE`。 |
| **`A20b` / `A24b` 只报警不算错** | `A20b` 的正则只认「绝不可能当词素义项」的词典标记（医/俚/古/人名/姓氏/的复数/量滴），像 `dc=医直电流` 能抓到，`counter=计算器` 抓不到（`计` 开头也可能是正常义项如「计算」）。覆盖面是有限的一层网，不是完备检查。 |
| **`DISPLAY_FIX`（iced→ice）目前是空跑** | 唯一用它的是 `icecream`，而 `icecream` 不在词库里，所以这个词素根本没被产出。留着是给将来预备。 |
| **1035 个警告没处理** | 主要是 A23 的「缺 d1/d5」（难度梯度少一端）。属于选题而非纠错。 |

```bash
node scripts/tools/build-batch-config.mjs 3      # 生成 batch-05（0-based：3=3.4）
# 前置 1：新建 scripts/lib/stage-additions/batch-05/worlds.json，按语义分组覆盖本批
#         全部教学词根家族（参考 batch-02/03/04），否则 A24 报错
# 前置 2：新词素若不在 scripts/lib/morpheme-fallback.mjs 里，补一条
node scripts/tools/make-prose-handoff.mjs 60     # 增量生成待写释义模板（不覆盖已有批次）
# 逐批填写 scripts/lib/handoff/words-prose-stage3/batch-N.json
node scripts/tools/check-prose-batch.mjs N       # 写一批查一批（N=批号）
node scripts/tools/fix-distractors.mjs           # 自动补 A12 干扰项（遍历全部批次）
node scripts/tools/fix-a14.mjs                   # 自动修助记里逐字抄答案的
npm run content:all && node scripts/validate-content.mjs
```

写释义的要点（前两批总结）：
- 字面义按词根直译（≤12 汉字）；隐喻义给真义（≤20 字）；`metaphorOptions[0]` 必须与隐喻义一字不差
- 三个选项先自己想两个干扰项，`fix-distractors` 会按词素义项池自动补/覆写
- 助记与词源**都不能逐字出现现代义**（A14 会拦）；也不能出现中文省略号「…」（A28 会拦）

```bash
node scripts/tools/build-batch-config.mjs 2      # 生成 batch-04
node scripts/tools/make-prose-handoff.mjs 60     # 增量生成待写释义模板（不覆盖已有批次）
# 逐批填写 scripts/lib/handoff/words-prose-stage3/batch-N.json
node scripts/tools/fix-distractors.mjs           # 自动补 A12 干扰项（遍历全部批次）
node scripts/tools/check-prose-batch.mjs         # 单批契约自检，写一批查一批
node scripts/tools/fix-a14.mjs                   # 自动修助记里逐字抄答案的
node scripts/30-llm-prose.mjs                    # 校验 9.3 契约
npm run content:all && node scripts/validate-content.mjs
```

**两个必做的前置**：
1. **给新词根划世界**：新建 `scripts/lib/stage-additions/batch-04/worlds.json`，
   按语义分组覆盖本批全部教学词根家族（参考 batch-02/03 的写法），否则 A24 报错。
2. **补词素义项**：新批的词根/前后缀若在 `scripts/lib/morpheme-fallback.mjs` 里没有，
   往里加一条（`build-stage3-config` 会统一兜底应用）。

30 号报 `handoff 缺释义` 989 条。做法与中考批一致（参考 `words-prose-stage3/batch-1~7.json` 的成熟写法）：

```bash
node scripts/tools/make-prose-handoff.mjs 60     # 重新生成模板（注意：会覆盖已有 7 批，先备份！）
# 逐批填写 scripts/lib/handoff/words-prose-stage3/batch-N.json
node scripts/tools/fix-distractors.mjs           # 自动补 A12 干扰项（选项里嵌真实义项）
node scripts/tools/fix-a14.mjs                   # 自动修助记里逐字抄答案的
node scripts/30-llm-prose.mjs                    # 校验 9.3 契约
npm run content:all
node scripts/validate-content.mjs                # 看剩余错误
```

**989 词建议分 8–10 小批（每批 ~100–130 词），每批写完就 commit**，
并在本文档更新进度，方便中断后续接。

**写释义时的三条经验**（中考批踩出来的）：
1. `literalMeaningCn` 按词根直译，`metaphorMeaningCn` 是真义，两者不能一字不差
2. `metaphorOptions[1][2]` 要嵌一个**本词之外**的真实义项（A12），跑 `fix-distractors` 自动补
3. `mnemonicNote` / `sourceNote` 里不能逐字出现 `modernMeaningCn`（A14），跑 `fix-a14` 自动修

---

## 二点五、词素义项全表复核（2026-09-15）

独立复核（`docs/复核报告-3adf204至8e721f7.md`）确认了三层修法的结论，但顺藤摸出**同一类病还有四类漏网**，本轮已全部修完。完整过程与判据见 `docs/复核修复进度-2026-09-15.md`。

| 类 | 形态 | 例 | 规模 |
|---|---|---|---|
| 领域标记泄漏 | `shortMeaning` 把 `[医] 山` 的标记当字头拼进义项 | 「医山」「计硬件描象层」「必然的事情计计算」 | 165 |
| 缩写/专名/包含匹配 | id 撞上某个英文词条，义项取的是「当英文词时什么意思」 | `wf`=滤水器(Water Filter)、`so`=自旋轨道分裂、`wandn`=化暗杆内螺纹 | 90+ |
| 词性段拼接 | ECDICT 的 `n. 雇用 vt. 雇用` 无逗号 → 两段一起取 | 「雇用雇用」「任何的任何」「女儿女儿的」 | 44 |
| 义项与家族词对不上 | 义项本身是真词义，但不是它在该家族词里的角色 | `car`=汽车(家族是 careful/careless)、`bull`=公牛(家族是 bullet) | ~200 人工核对 |

**修在哪**：全部落在 `build-stage3-config.mjs` 这一个收敛点 ——
`morpheme-fallback.mjs` 的 `OVERRIDE_MEANINGS`（**408 条**）/ `OVERRIDE_DISPLAY`（6 条显示名，
卡片画的是 displayText，`wf＝女人` 这种牌不能再有）/ `INJECT_MORPHEMES`（7 个新词素）；
`SPLIT_REPLACE`（5 词整条重切：wander/whether/carrot/delivery 单词根、isolate=isol+ate ——
这些是「拼得起来但切错了」，WORD_PART_FIX 只能改 id 救不了）。

**根因也修了**（`build-morpheme-table.mjs` 的 `shortMeaning`/`deriveMeaning`）：先剥 `[..]`
标记再取首义、在词性段中间切一刀、缩写/专名条目不产出义项（宁可留空让人补）、「包含匹配」
加长度与词首词尾约束。另外新增 `scripts/tools/check-morpheme-overrides.mjs` 自检覆盖表本身
（重复 key 会静默后者胜出、失效 id 覆盖不生效，这两条都实测踩过）。

**闸门**：`A20b` 去掉行首锚点（`/^医/` 抓不到「枪医枪」这种夹中间的），并用「重复片段」
判定补上词典拼接形态；新增 **A20c 干扰项池体检** —— 干扰项的 `text` 是指向词素表的软外键，
义项一脏会画进**别的词**的拼词盘（实测 20 个垃圾词素散布在 101 条干扰项 / 99 个词上）。
两条当前均 0 命中。

**已知残留**（不是义项能修的，要动切分才会波及别的词，本轮明确不动）：
`adjust=ad+jud`（词源是 juxta 靠近，教学上可接受）、`blunder=blend+er`、`fragrant=fra+grant`、
`steward=ste+ward`、`grammar/nightmare` 里的 `-mar`、`carbon` 里的 `-bon` —— 同形异源，
已在覆盖表注释里逐条标注；`sid=坐`（consider）、`der=剩下`（remainder）按报告 3.2/3.3 保留。

## 三、已踩过的坑（重做时别再踩）

| 坑 | 说明 |
|---|---|
| **fix-distractors 改的是 handoff，40 号读的是 30 号的产物** | 中间必须跑 `30-llm-prose.mjs`，否则修改不生效（A12 曾卡在 413 就是这个原因） |
| **`FALLBACK_MEANINGS` 有两份** | 以 `build-morpheme-table.mjs` 里那份为准；下游（`build-batch-config`）每次重跑会从产物重建，在那里补会被覆盖 |
| **canon 必须由「未归一化的 id」构建** | 用 draft（已归一化）当输入算不出映射；且输入要并入**已有词素表的 id**（`pos` 是 Stage 2 人工定的，切分表里没有） |
| **22 号的专名闸** | 除句首和 `I` 之外，**任何大写开头的词都算专名，月份（June）也算**；`10th` 还会被还原成 `tenth` |
| **`build-batch-config` 的「已有」基准** | 不能取 `stage3-content.json`（那是 40 号的**产物**），要取 `stage1-content.json` + 之前批次，否则重跑时增量归零 |
| **`morphemes-affixes.json` 结构** | 必须是 `{overrides, prefixes, suffixes}`；写成 `{morphemes}` 会被 `build-stage3-config` **静默忽略**，前后缀全丢 |
| **40 号清理孤儿词素后要重算 distractors** | 否则 A15 报「干扰项既不是词素也不是变体」（曾有 803 个） |
| **`content:all` 不含 `build-batch-config`** | 改了批次相关逻辑要先手动跑它，再 `npm run content:all` |
| **SPLIT_FIX 要同步到家族统计** | 只改切分输出不够，`alive` 的 `live→life` 若不同步，会留下空家族导致 A24/A23 打架 |

---

## 四、本阶段已完成的提交（供回溯）

| 提交 | 内容 |
|---|---|
| `da76151` | S6b：批次配置生成（batch-02） |
| `2f01714` | S6c 上半：词素分级 + id 归一化（不再剔词，改补义项） |
| `f44bdd9` | S6c：教学词根提纯 + 世界划分 |
| `8edcf8f` | S6d/S6e：确定性管线跑通到 handoff 边界 |
| `0433094` | 383 词释义分 7 批写完，30 号契约全绿 |
| `d54f069` | 40 号总装适配 + 校验口径对齐 |
| `c6dd409` | 修 A15/A16/A24 + A12 干扰项自动补齐（1389 → 160） |
| `5f0d0dc` | 词素补义项 + 20 号去重 + A14 部分修复（→ 11） |
| `610296d` | A14 自动修复 + stage3 兜底例句 + 22 号分层 handoff（→ 4） |
| `b75c66b` | SPLIT_FIX 同步到家族统计 + 词素义项回填（→ 3） |
| `40f6d35` | **Stage 3.1 完成：内容校验 0 错误（1389 → 0）** |
| `ecc0d9e` | 3.2 批配置生成 + 8 个新世界；测试对齐新口径 |

---

## 五、批次规划（原始目标 3,029 词）

| 批次 | 词数 | 状态 |
|---|---|---|
| 3.1 中考 | 434 | ✅ 完成（实收 391） |
| 3.2 高考 | 974 | ✅ 完成（释义 `batch-8`~`24`，实收后全库 1379 词） |
| 3.3 四级 | 771 | ✅ 完成（释义 `batch-25`~`35`，实收后全库 **1995 词**） |
| 3.4 六级 | 850 | ✅ 完成（释义 `batch-36`~`48`，实收后全库 **2698 词**） |

**Stage 3 四批全部完成，词素重复记录也清完了。** 剩余可做的事（按价值排序）：

1. **跑起来看**：`npm run dev`，走一遍地图页 → 词根卡 → 拼词 → 复习面板，确认 2698 词 / 42 世界在实际交互里没有布局或性能问题（构建产物 1.14 MB / gzip 225 KB，值得看首屏）。
2. **1035 个警告过一遍**：主要是 A23 的「缺 d1/d5」（难度梯度少一端）。若要真修，得往词库里补相应难度的家族词，属于选题而非纠错。
3. **给 A20b 补一层主动体检**：这次的义项垃圾（85 处）是靠人工扫全表发现的，正则只覆盖了「绝不可能当词素义项」的标记。
   若想更早发现，可以加一条「义项与家族词无关」的启发式检查（比如义项里的字在家族词的中文释义里从未出现过），但要先想清楚误报率。

---

## 六、常用命令速查

```bash
npm test                                    # 53 个测试
npm run build                               # 构建
npm run content:all                         # 全链（build-stage3-config → 10~13 → 20 → 21 → 22 → 30 → 40 → validate → 60 → 70）
node scripts/validate-content.mjs           # 单独看校验错误
node scripts/tools/build-batch-config.mjs N # 生成第 N 批（0-based）配置
node scripts/tools/build-morpheme-table.mjs # 重建词素表（读 ECDICT，约 5 秒）
```

**重要**：`content:all` 的第一步是 `build-stage3-config`，**不包含** `build-batch-config`。
改了批次生成逻辑后必须先手动跑 `build-batch-config`，再跑 `content:all`。
