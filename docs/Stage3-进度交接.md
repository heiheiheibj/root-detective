# Stage 3 进度交接（重启后续接看这份）

> 最后更新：2026-09-14 ｜ HEAD：`ecc0d9e`
> 一句话现状：**3.1 中考批已完成并通过全部验证；3.2 高考批的配置已生成，但卡在「20 号只收家族词」这个设计问题上。**

---

## 一、当前状态

| 项 | 值 |
|---|---|
| **已发布词库** | **1995 词 / 1639 词素（含 1371 词根）/ 37 世界**（校验 0 错误，可发布） |
| **管线已推进到** | **3.4 六级批：切分通过 2679 词，例句 2668/2679**（+684 词待写释义） |
| **当前阻塞** | **3.4 的 689 个词缺释义**（`batch-36` ~ `batch-47`，每批 ≤60） |
| 详情分片 | 24 片（3.4 完成后会再增） |
| 测试 | **53/53 通过** |
| 构建 | 成功，919.95 kB / gzip 188.01 kB |
| 已完成批次 | 3.1 中考、3.2 高考、3.3 四级 |
| 释义批次 | `batch-1` ~ `batch-35` 共 1981 词，全量自检 0 问题 |
| 例句覆盖 | 3.1~3.3 全部有中文对照；3.4 有 11 个词缺 |
| 词素义项 | 全部有中文义项（`scripts/lib/morpheme-fallback.mjs` 统一兜底） |
| 世界 | 37 个（3.4 完成后 39：新增格物斋、紧固坊） |

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

### 步骤 4：铺 3.4 六级批（850 词）【配置就绪，待写释义 689 词 / 12 批】

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
| 3.4 六级 | 850 | ⬜ 未开始（下一批） |

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
