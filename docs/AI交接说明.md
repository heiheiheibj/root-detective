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

## 3. 下一步：Stage 1（60 词 / 20 词根，跑通管线）

计划书里 Stage 1 的全部门槛写得比我这里细，**以计划书为准**。起手顺序：

1. **`git init` + `.gitignore` + `LICENSE`（MIT）**——现在三样都没有。计划书把这一步列为管线的第 0 步。**这一步需要先问用户**，因为涉及仓库初始化。
2. 写 `scripts/00-fetch-sources.mjs` 起的那批脚本（00 → 70，清单和职责见计划书）。
3. 跑通后按计划书的 Stage 1 验收标准检查，重点三条：
   - (a) 重新生成 `spec`/`dict`/`port`/`vid` 四个家族，生成的 `parts` 必须和手写版的 morphemeId 与顺序一致——这是切分器对人工作品的**差分测试**
   - (b) 16 个 canary 词逐字节存活（靠组装器**最后**套用的 `overrides/` 保证）
   - (c) `residue-allowlist.json` 里只剩 `porter` 的 `-er` 一条

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

---

## 5. 怎么验证（照抄）

```bash
npm run test              # vitest，纯领域函数，无 jsdom
npm run build             # tsc -b && vite build
npm run validate:content  # 规则闸门
```

实机验证用 Playwright MCP，走一遍：今天 → 拼单词（含发音）→ 复习配对 → 词根地图 → 新手帮助，在 **1440×900 和 390×844** 两个尺寸各截图确认。

> 给 Playwright 塞测试档案的坑：应用自己会在 `pagehide` 把内存里的档案写回 localStorage，所以「先 `evaluate` 写 localStorage 再 reload」会被覆盖。**要用 `addInitScript`**，让种子在应用启动前落下。

---

## 6. 未决事项（需要用户拍板）

1. ~~`ion` 的 meaningCn 超长~~ **已解决**（2026-09-11）：改为「动作、过程（名词）」，闸门现在零警告。
2. **`git init` + LICENSE 未做**：计划书说 Stage 1 前必须解决。涉及仓库初始化，需要用户同意。
3. **两个中文词根表（shiweihappy/english-word-root、jesselau76/cigen）找不到 LICENSE**：已定策略是**只用来推导候选词根 id 列表，绝不逐字复制 `meaningZh`**。若将来要商用，词根 id 列表需要律师看一眼——这条 AI 判断不了，必须转给用户。

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
3. Stage 0 已完成（49 测试通过、dist 309 KB 不变）。git init / LICENSE / .gitattributes
   已做（基线 commit `6d4a5f6`）。下一步是 Stage 1，**具体步骤见 `docs/Stage1-TODOLIST.md`**。
4. 别动 PROFILE_VERSION。别在 src/domain/contentRules.ts 里写带值的相对 import
   （`src/` 内必须无扩展名，裸 Node 必须带 `.ts`，两头矛盾——详见 4.1）。

动手前先跑一遍确认基线是绿的：
npm test && npm run validate:content
```
