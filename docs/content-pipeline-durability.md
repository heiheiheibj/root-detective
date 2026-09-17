# 内容管线复现性与耐久指南

> 目的：说明在「零成本、无 OpenRouter」约束下，如何重跑内容管线而不丢失已做的修复；
> 以及哪些改动是「耐久源」（提交即永久）、哪些只是派生缓存（重跑即清）。

## 0. 核心原则

本项目 Stage 1 红线是 **零成本、无 OpenRouter**。管线之所以能在没有 API key 时完整跑通，
靠的是把所有「本该由 LLM 产出」的内容**预生成为静态 handoff 文件并提交到仓库**。
脚本运行时优先读这些 handoff 文件，只有缺失且配置了 key 时才真调模型。

因此：**只要 handoff / override 源文件在仓库里，重跑 `content:all` 必然复现同一份产物，与是否联网无关。**

## 1. content:all 各步骤与依赖

| 步骤 | 作用 | 是否需 LLM | 依赖的静态源（handoff） |
|------|------|-----------|------------------------|
| `tools/build-stage3-config.mjs` | 词/根/世界源定义 → `stage3-content.json` | 否 | `scripts/lib/stage3-content.json`（含 `OVERRIDE_MEANINGS`/`WORLD_ADD`） |
| `10-build-roots.mjs` | 建词根表 | 否 | — |
| `11-glossary-llm-clean.mjs` | 词根中文释义 | **读 handoff 即零成本** | `scripts/lib/handoff/roots-llm.json` |
| `12-glossary-rules.mjs` | 释义规则校验 | 否 | — |
| `13-glossary-llm-review.mjs` | 对抗式复核词根 | **读 handoff 即零成本** | `scripts/lib/handoff/roots-review.json` |
| `20-select-words.mjs` | 选题（按 ECDICT 标签定难度） | 否 | — |
| `21-split-morphemes.mjs` | 词素切分 | 否 | — |
| `22-choose-examples.mjs` | 选例句 | 否 | `scripts/lib/handoff/words-examples*.json`（**handoff 优先于 Tatoeba**） |
| `30-llm-prose.mjs` | 释义/handoff 透出 | **零成本** | `scripts/lib/handoff/words-prose*.json` |
| `40-assemble.mjs` | 总装 → `content/*.json` + `data.ts` | 否 | — |
| `tools/build-a23-d5-gap.mjs` | 生成 A23 d5 结构性缺口白名单 | 否 | 输出到 `scripts/gates/a23-d5-structural-gap.json` |
| `validate-content.mjs` | 闸门校验 | 否 | `scripts/gates/*.json` 白名单 |
| `60-llm-review-content.mjs` | 产物对抗复核 | **读 handoff 即零成本** | `scripts/lib/handoff/words-review.json` |
| `70-report.mjs` | 汇总报告 | 否 | — |

> 结论：在仓库已有的 handoff 文件齐全时，`npm run content:all` 可全程离线复现。

## 2. 耐久源清单（改这里才不会被冲掉）

| 修复项 | 应改的源文件 | 说明 |
|--------|-------------|------|
| 词根释义（A20） | `scripts/tools/build-stage3-config.mjs` 内 `OVERRIDE_MEANINGS` | 重跑 `build-stage3-config` 不丢 |
| 词根挂世界（A24） | `build-stage3-config.mjs` 内 `WORLD_ADD` | 同上 |
| 词典兜底痕迹（A20b/c） | `scripts/lib/morpheme-fallback.mjs` 内 `OVERRIDE_MEANINGS` | 同上 |
| **例句英文+中文（A1/A8）** | `scripts/lib/handoff/words-examples*.json`（新增批补译见 `words-examples-fill.json`） | `22-choose-examples` 优先采用，不被 Tatoeba 覆盖 |
| A23 d5 结构性缺口 | `scripts/gates/a23-d5-structural-gap.json` | 由 `build-a23-d5-gap.mjs` 生成（与 d1 同一脚本）；**词库/语料变动后必须重跑** |
| A23 d1 结构性缺口 | `scripts/gates/a23-d1-structural-gap.json` | 同上（同一脚本一并生成）；d1 缺口没有「可补」类，全是结构性 |

新增/修改 handoff 文件后，还需在 `22-choose-examples.mjs` 的 `handoffPaths` 里登记路径
（`words-examples-fill.json` 已登记），否则重跑 22 不会读它。

## 3. 重跑会被清掉的派生产物（可重新生成，勿手改当作源）

- `scripts/.work/derived/*`（候选、例句、切分、provenance 等）
- `src/domain/content/*.json`（words / morphemes / worlds 分片）
- `src/domain/data.ts`（总装回写）

这些由 `40-assemble.mjs` 从「耐久源」生成，改它们属于无效劳动——下次重跑即被覆盖。

## 4. 已知陷阱：A23 结构性缺口白名单过期

`a23-d5-structural-gap.json` 与 `a23-d1-structural-gap.json` 两张表，只收「翻遍可切分考试词库
也找不到含该词根的 cet6/toefl 难词（d5）/ zk-gk 入门词（d1）」的词根（常见词根本就只有简单词、
或 tight/script 这类词根天然只有高级派生，补不出来）。**这两张白名单不是一次生成永久有效**：
一旦词库或上游词表变动，必须重跑 `build-a23-d5-gap.mjs`（一次性同时生成两张表），
否则本该免报的词根会继续报警。

> 实测：某次词库变动后白名单没跟着重跑，导致 15 个 d5 警告本该免报却仍在报警、且 d1 缺口
> 根本没有白名单通道。重跑生成脚本后，d5/d1 全部结构性缺口自动进表，A23 警告清零——
> 属配置刷新，不是数据缺陷。

`contentRules.ts` 中 A23 对 d5/d1 缺口都已从 error 降为 warning，并在注释中明确
「tight 这类词根家族词全是高级派生，是词表性质决定的，不是数据缺陷」；结构性缺口一律进白名单，
**能补的（语料里确有对应难度词）一律不进表、继续报警**，由测试 `tests/content.test.ts` 的
「白名单没过期」用例守住（白名单里的词根若哪天真的有了对应难度词，说明已可补，不该再放行）。

## 4.1 如何让 A23 彻底清零

1. 保证词库/语料最新后，跑 `node scripts/tools/build-a23-d5-gap.mjs` 刷新两张白名单。
2. 校验 `node scripts/validate-content.mjs` 应显示 `0 个警告`。
3. 若仍有 A23 警告，说明那些词根是「可补」类（语料里确有对应难度词但没收进词库）——
   按提示把词收进 `20-select-words.mjs` 的选题，而不是塞进白名单。

## 5. 常用验证命令

```bash
# 仅校验当前产物
node scripts/validate-content.mjs

# 把 handoff 翻译同步进派生缓存（改了 words-examples-fill.json 后）
node scripts/.work/fill-examples.mjs
node scripts/40-assemble.mjs scripts/lib/stage3-content.json

# 刷新 A23 d5 白名单（词库变动后必跑）
node scripts/tools/build-a23-d5-gap.mjs

# 单测
npm test
```
