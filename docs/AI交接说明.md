# AI 交接说明

这份文档是给**接手继续干活的 AI** 看的。人类用户不读英文、也不做人工校对，所以下面每一条约束都是硬的。

---

## 0. 先读这个

**长计划在 [`docs/扩词库计划.md`](扩词库计划.md)**，那是经过用户批准的总纲（16 词 → 2000 词 / 300 词根）。本文档只写「现在在哪、下一步干什么、哪些坑别踩」。

任务一句话：**把词库从 16 个词扩到 2000 个词、300 个词根**，玩法不变（拼词根 → 猜词义 → 结算 + 配对复习）。

---

## 1. 用户约束（最重要，别绕过）

1. **用户不读英文，没法审任何英文内容。** 所有质量闸门必须是**规则校验 + 第二个 AI 对抗式复核**，绝不能设计出「请用户检查一下这句英文对不对」的环节。
2. **用户读中文、看中文界面。** 跟用户汇报用中文。
3. 词库出厂的每一条中文文案（释义、画面句、干扰项、记忆法），用户都**无法人工校验**——所以确定性规则是唯一的防线。
4. 用户已经拍板的决定，不要重新讨论：
   - 规模：约 2000 词 / 300 词根
   - 数据策略：**开源打底 + 脚本切分 + LLM 补文案**
   - 词根表：**先抓开源的 → AI 先过一遍 → 写规则 → 由另一个 AI 审**（用户不参与）

---

## 2. 当前状态：Stage 0 已完成

Stage 0 是「在 16 个词上做行为不变的重构 + 建好质量闸门」，**已完成并全部验收通过**。

### 验收数据（2026-09-11 实测）

| 命令 | 结果 |
|---|---|
| `npm test` | 49 个测试通过 / 3 个文件（重构前是 39 个） |
| `npm run build` | 通过 |
| `npm run validate:content` | 通过，1 个警告 |
| `dist/` 体积 | **309 KB，与重构前基线一字不差**（计划要求 ±5% 内） |

### 已经落地的代码改动

| 文件 | 改了什么 |
|---|---|
| `src/domain/types.ts` | 拆出 `WordCore` / `WordDetail`（为将来分片懒加载铺路）；`WorldId` 从 `worlds` 列表反推；`Difficulty` 保持 `1\|3\|5` |
| `src/domain/data.ts` | 模块级 `wordById` / `morphemeById` Map；`buildRootIndex()` + `wordsByRoot`；`findMorpheme()`；`getWorldUnlockStatus` 不再写死词根 |
| `src/domain/logic.ts` | `pickNextWord` / `getReviewCandidate` / `getReviewBoard` 收 `ReadonlyMap` 索引；`groupStability()` + `stabilityPolicy: 'max' \| 'meanTop'`；难度表收紧成 `Record<Difficulty, number>` |
| `src/domain/persistence.ts` | `normalizeProgress` 从 O(n²) 降到 O(n) |
| `src/App.tsx` | `padStart(4)`；派生值 `useMemo`；进度 Map 传进地图页；localStorage 写入 debounce 500ms + `pagehide` 补写 |
| `src/domain/contentRules.ts` | **新增**，闸门规则的唯一实现 |
| `scripts/validate-content.mjs` | **重写**，改为调用 `contentRules.ts` + 读白名单 |
| `scripts/gates/*.json` | **新增** 白名单文件 |

### 闸门现状

`contentRules.ts` 实现了计划里的 A1–A27。**当前在 16 词上跑，有规则是「跳过」而不是「通过」**，报告里会明写：

- **跳过（缺 provenance 边车）**：A12 错项复用真实义项、A19 provenance 覆盖、A21 词源措辞与来源一致、A27 隔离区批准
- **跳过（样本 < 50）**：A22 死变体、A23 每词根 ≥3 词且难度铺开
- **跳过（编译期保证）**：A26 world id 联合类型

> 这些一旦进 Stage 1 就会真正生效，**很可能成批失败**——那是正常的，不是回归。

闸门现状是**零警告**。曾经有的一条（`ion` 的 `meaningCn` 9 个汉字超上限）已修：改成「动作、过程（名词）」，6 个汉字。同族后缀的写法参照：`ive`「具有……性质的（形容词）」8 字、`able`「能够……的（形容词）」6 字、`ity`「性质、状态（抽象名词）」8 字。**新词素的 `meaningCn` 一律 ≤8 汉字，且不要和已有词素撞释义。**

---

## 3. 当前状态：Stage 1 已完成（67 词 / 20 词根，管线全绿）

> 逐项过程与踩坑记录见 [`docs/Stage1-进度记录.md`](Stage1-进度记录.md)，报告见 `scripts/.work/report.md`。

Stage 1 的目标（跑通数据管线，产出 60 词 / 20 词根）**已完成并全部验收通过**。最终规模是 **67 词 / 20 词根**：
A23（每词根 ≥3 词且 d1/d5 各 ≥1）在 16 个 canary 各 4 词、四个家族各需补 1 个 d5 的情况下，把总数顶到了 67。
`TARGET_WORD_COUNT = 67`（`src/domain/contentRules.ts:42`），闸门、测试、选词脚本三处共用。

### 验收数据（2026-09-12 实测）

| 项 | 结果 |
|---|---|
| `npm test` | **53 个测试通过** / 4 个文件（含新增 `tests/pipeline.test.ts` 四条关键验收） |
| `npm run validate:content` | 通过：67 词 / 69 词素（20 词根）/ 6 世界，0 错误 45 警告（警告全是 A22 死变体，属样本小，Stage 2 铺词后自然消失） |
| `npm run build` | 通过；`dist/assets/index-*.js` **327 kB / gzip 99.5 kB** |
| `npm run content:all` | 10→70 全链可重跑；**同配置两次全量重跑产物逐字节一致**（handoff 模式，LLM 花销 $0） |
| (a) 四家族差分 | `tests/pipeline.test.ts` 断言切分器输出 = 手写 overrides（spec/dict/port/vid 共 16 词） |
| (b) canary 逐字节 | 16/16 与 `scripts/overrides/canary-words.json` 一致 |
| (c) 残留白名单 | 只剩 `porter` 一条 |
| 隔离率 | 0（复核 67 词：ok 64 / minor 3 / major 0） |
| 漂移探测 | 样本 8，漂移 0%（handoff 模式下是结构性的 0；切回真 LLM 才会开始真测） |
| 实机验证 | Playwright 走完 今天→拼单词(含朗读)→猜词义→复习→词根地图→新手帮助，1440×900 与 390×844 各截图（仓库根 `shot-*.png`，11 张） |

### Stage 1 落地的关键文件

| 文件 | 作用 |
|---|---|
| `scripts/lib/stage1-content.json` | Stage 1 白名单总配置：20 families / 67 词 splits / extraMorphemes 全表 / worlds。**挑词与切分都在这里手写**（6.5） |
| `scripts/lib/handoff/*.json` | 静态数据（roots-llm / roots-review / words-prose / words-examples / words-review）。**本阶段零成本、无 OpenRouter 的关键** |
| `scripts/overrides/canary-words.json` | 16 个手写锚点词全文，40 号**最后**套用 |
| `scripts/20…70-*.mjs` | 选词 → 切分 → 例句 → 释义 → 总装 → 复核 → 报告 |
| `src/domain/content/*.json` + `data.ts` | 组装产物；`data.ts` 是薄包装，由 40 号回写 |
| `src/domain/contentRules.ts` | 新增 **A28**（干扰项不得是元话语/占位符，见 4.9） |

### 下一步：Stage 2

按计划书放大批量（几百词）。开工前先看「未决事项」第 3–5 条：干扰项与例句的质量策略在 67 词上够用，
放大到几百词之前最好先把「干扰项语义相关性」「例句专名过滤的严格度」再抬一档。

---

## 4. 非显而易见的坑（踩过，别再踩）

### 4.1 Node 类型剥离：`contentRules.ts` 只能有 `import type`

`scripts/validate-content.mjs` 直接 `import` `.ts` 文件，靠 Node 22.20 的类型剥离。**实测结论**：

- `import type { X } from './types'` ✅ 整段被删掉，不参与路径解析
- `import { x } from '../src/domain/contentRules.ts'` ✅ **带 `.ts` 扩展名就能跑**
  （`scripts/11-glossary-llm-clean.mjs:23` 就是这么引 `countHanzi` 的，一直好的）
- `import { x } from './y'`（无扩展名）❌ `ERR_MODULE_NOT_FOUND`

**注意别把上面第二条误读成「`src/` 里可以写 `.ts` 扩展名」**：`tsconfig.app.json` 没开
`allowImportingTsExtensions`（只有 `tsconfig.node.json` 开了），所以在 `src/` 内部**必须写无扩展名**。
而无扩展名的相对 import 在裸 Node 下必挂。

两条一夹，结论还是那个：**`contentRules.ts` 不能有任何带值的相对 import**——
不是 Node 的锅，是「src 里必须无扩展名」和「Node 里必须带扩展名」互相矛盾，没有写法能同时满足。
这也是为什么 `normalizeMorphemeKey` 住在 `contentRules.ts` 而不是 `data.ts`——它必须被运行时
（`App.tsx`）和闸门（Node）共用同一份实现，而 `contentRules.ts` 恰好没有值依赖，是唯一两头都能用的位置。

同理，`contentRules.ts` 里不能用 `enum` / `namespace` / 参数属性。

> 推论：如果以后 `contentRules.ts` 真的需要引别的东西，正确做法是**把那个依赖也搬进
> `contentRules.ts`**，而不是加一条 import。

### 4.2 白名单文件丢失 = 闸门静默收紧

`validate-content.mjs` 发现 `scripts/gates/*.json` 缺失会**直接退出**，而不是当成空白名单。这是故意的：空白名单会让闸门悄悄变严，然后有人随手放宽它。

### 4.3 不要动 `PROFILE_VERSION`

`normalizeProfile` 按 morphemeId 重映射，老档案（4 个词根）能正确载入 300 词根的世界，老词根熟练度保留、新词根归零。有测试守着（`tests/persistence.test.ts`）。**词根从 4 涨到 300 不需要改版本号。**

### 4.4 干扰项卡片必须用「只查 id」的 `findMorpheme`

`getAvailableCards`（`App.tsx`）里干扰项故意**不解析变体**。原因：`spic` 是 `spec` 的变体，若解析成 `spec`，circumspect 的卡片里就会出现一张显示「看」的干扰牌，玩家点它反而算对。解析不到就画合成牌，只显示干扰类型文案（「长得像，但不是」）。

但**闸门规则 A15 允许变体**（`spic` / `spect` 都是合法干扰项）——运行时和闸门的判据不同，这是有意的。

### 4.5 残留白名单只允许挂在词尾

A5 规则：`parts.map(p => p.surface).join('')` 必须是 `word` 的**前缀**，剩下的部分才算残留，且必须写进 `scripts/gates/residue-allowlist.json` 并附书面理由。

### 4.6 canary 清单不许删

`scripts/validate-content.mjs` 里硬编码了 16 个 canary 词 id。**每次重新生成词库，这 16 个都必须还在。** 它们是这套玩法唯一的回归锚点；它们的文案要靠 `overrides/` 保住，不能靠重新生成。

### 4.7 测试里的事件夹具不要用下标

`initialProgress[0]` 这种写法是对生成顺序的隐式依赖。已经全部改成 `initialProgress.find(p => p.morphemeId === 'spec')` 或 `createRootProgress(id)`。新写测试请照办。

### 4.8 两个词根现在都释义为「看」

`spec` 和 `vid` 的 `meaningCn` 都是「看」。词级去重（按 `modernMeaningCn`）挡住了配对面板出现两个相同选项，但这是一个**已知的语义碰撞**，词库变大后会更严重。计划书里有一条「两个词根共享 meaningCn 时告警」的规则**还没实现**。

### 4.9 干扰项绝不能写成元话语（A28 的来历）

Stage 1 第一版里，51 个生成词的 102 个干扰项全是模板套话（`讲的其实是X` / `说的还是Y`）——
它们把别家词素的义项塞进了一句「这是哪个词素的意思」的解释里，**A10/A11/A12/A13 四条机械闸门一条都拦不住**。
这是 60 号对抗式复核抓出来的，修复后新增了 **A28**（`contentRules.ts` 的 `META_OPTION_PATTERN`）：
干扰项里出现 `讲的是 / 说的是 / 讲的还是 / 说的还是 / 指的是 / 其实是 / …` 之一即报错。
`30-llm-prose.mjs` 里有一份同样的正则（生成时 fail-fast）。**改这两处必须同步。**

教训：机械闸门只能保证「形状合法」，形状合法的句子完全可以是废话。凡是「给用户看的中文文案」，
都要问一句「这句话像不像一个真正的选项」。

---

## 5. 怎么验证（照抄）

```bash
npm test                  # vitest，纯领域函数，无 jsdom
npm run build             # tsc -b && vite build
npm run validate:content  # 规则闸门
npm run content:all       # 全量重跑数据管线（10→70，零成本，可反复跑）
```

实机验证用 Playwright MCP，走一遍：今天 → 拼单词（含发音）→ 复习配对 → 词根地图 → 新手帮助，在 **1440×900 和 390×844** 两个尺寸各截图确认。

> 给 Playwright 塞测试档案的坑：应用自己会在 `pagehide` 把内存里的档案写回 localStorage，所以「先 `evaluate` 写 localStorage 再 reload」会被覆盖。**要用 `addInitScript`**，让种子在应用启动前落下。

---

## 6. 未决事项（需要用户拍板）

1. ~~`ion` 的 meaningCn 超长~~ **已解决**（2026-09-11）：改为「动作、过程（名词）」，闸门现在零警告。
2. ~~`git init` + LICENSE 未做~~ **已做**（基线 commit `6d4a5f6`，见第 8 节）。
3. **两个中文词根表（shiweihappy/english-word-root、jesselau76/cigen）找不到 LICENSE**：已定策略是**只用来推导候选词根 id 列表，绝不逐字复制 `meaningZh`**。若将来要商用，词根 id 列表需要律师看一眼——这条 AI 判断不了，必须转给用户。
4. **`CREDITS.md` + `scripts/gates/license-manifest.json` 未做**（第 7 节的许可红线要求它们，Stage 2 批量前必须补）。
5. **复核留下的 3 个 minor**（`scripts/.work/report.md` 末尾有全文）：`century`/`envision` 的字面义不是词素义按顺序拼出来的、`voice` 的 `vo` 变体牵强。不阻断，Stage 2 铺词时顺手修 handoff 数据即可。
6. **根目录 `_t_*.mjs` / `_dev.log` / `shot-*.png` / `console.log('ERR'` / `*副本*` 等临时文件未清理**——删除类操作需要用户确认，AI 没动。
7. **favicon 404**：`index.html` 没配图标，控制台有一条 404。纯外观问题。

---

## 7. 许可红线（别越线）

- **Wiktionary / MorphyNet 是 share-alike，只能离线当证据，不进产物。** 出货的 `sourceNote` 必须是基于词素义重写的「构词逻辑」句，不是抄词源。否则整个仓库要转 CC BY-SA 4.0——**单向门，不能反悔。**
- 出厂产物保持 **MIT 兼容**。
- 计划书要求生成 `CREDITS.md` + `scripts/gates/license-manifest.json`，把每个字段映射到来源和许可，闸门检查「share-alike 字段不得出现在标记 MIT 的文件里」。**这两个还没做。**

---

## 8. 给下一个 AI 的开场白（直接复制粘贴）

```
这个仓库是「词根背单词」（RootDetective），React + TS + Vite 的中文英语词汇游戏。
任务是扩词库：从 16 个词扩到 2000 个词 / 300 个词根，玩法不变。

先读这两个文件，再动手：
- docs/AI交接说明.md   ← 现在在哪、下一步、坑
- docs/扩词库计划.md   ← 完整四阶段计划（已获用户批准）

硬约束（别绕）：
1. 用户不读英文、不做人工校对。所有质量闸门必须是自动规则 + 第二个 AI 复核。
   任何「请用户检查一下这句英文」的环节都是错的。
2. 跟用户汇报用中文。
3. Stage 0、Stage 1 都已完成（53 测试通过；67 词 / 20 词根管线全绿、可全量重跑、$0 花销）。
   下一步是 Stage 2 放大批量，**先读 `docs/AI交接说明.md` 第 3 节和第 6 节的未决事项**。
4. 别动 PROFILE_VERSION。别在 src/domain/contentRules.ts 里写带值的相对 import
   （`src/` 内必须无扩展名，裸 Node 必须带 `.ts`，两头矛盾——详见 4.1）。

动手前先跑一遍确认基线是绿的：
npm test && npm run validate:content
```
