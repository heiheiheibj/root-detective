# Stage 3 进度交接（重启后续接看这份）

> 最后更新：2026-09-14 ｜ HEAD：`ecc0d9e`
> 一句话现状：**3.1 中考批已完成并通过全部验证；3.2 高考批的配置已生成，但卡在「20 号只收家族词」这个设计问题上。**

---

## 一、当前状态

| 项 | 值 |
|---|---|
| **当前词库** | **1379 词 / 1200 词素（含 960 词根）/ 32 世界** |
| **内容校验** | **0 错误 / 357 警告**（警告多为 A23 难度梯度提示） |
| 详情分片 | 17 片 |
| 测试 | **53/53 通过** |
| 构建 | 成功，726.81 kB / gzip 157.95 kB |
| 已完成批次 | 3.1 中考（434 词）、3.2 高考（974 词，实收 988 净增） |
| 释义批次 | `batch-1` ~ `batch-24` 共 1365 词，全量自检 0 问题 |
| **3.3 四级批** | 配置就绪（切分通过 1995 词），**释义进行中：`batch-25`~`26` 已完成，剩 `batch-27`~`35`（498 词）** |

---

## 二、下一步（按顺序做）

### 步骤 1：改 20 号的收录逻辑 【✅ 已完成】

改动：候选改为遍历 `Object.keys(splits)`（切分表里的全部词），`famStats` 单独按 families 统计；
6.2 从「硬卡」改为「筛选」（不达标跳过，不中断）。21 号的「丢词即中断」也改成「报告后继续」
（`within`/`wherever`/`wisdom` 这类复合词没有 root 词素，A18 必然拦下，属正常筛除）。

效果：收录数 392 → **1601**，切分通过 **1379 词**（丢 222 个无词根的复合词）。

### 步骤 2：为 989 个词写释义 【✅ 已完成】

batch-8 ~ batch-24 共 989 词已全部写完，全量自检 0 问题（合计 1365 词）。

### 步骤 3：铺 3.3 四级批（771 词）—— 下一步

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
| 3.2 高考 | 974 | ⏳ 配置已生成，待改 20 号后写释义 |
| 3.3 四级 | 771 | ⬜ 未开始 |
| 3.4 六级 | 850 | ⬜ 未开始 |

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
