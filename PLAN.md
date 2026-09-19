# 根记 RootDeck · 里程碑

词根法背单词 Web 应用（react + vite + typescript）。
设计原则：每条改动都要有测试，`npx vitest run` 与 `npm run build` 必须全绿再提交。

## 里程碑

- [x] **M1 脚手架** — react + vite + ts，单页结构，导航 + 视图挂载。
- [x] **M2 内容与数据** — 2000 词、词根、世界、家族词；`domain/data` 导出；`data/repositories` 统一访问。
- [x] **M3 三个缺失页面** — 统计 / 成就 / 设置页。复用 `profileStats`、`achievements` 两个纯模块；发音走浏览器 TTS，无需音频文件。
- [ ] **M4 学习循环精修** — 拆词/猜义/迁移/复习各阶段的体验与平衡性。
- [ ] **M5 迁移题与安心机制** — 举一反三（造词）、干扰项、回退与提醒节奏。
- [ ] **M6 Supabase 多端同步** — 远端适配器实现 `repository` 接口（读/写档案、读内容），页面层零改动。
- [x] **M7 词根地图详情 + 全局搜索** — 地图里点任意词根进入详情表（单词 / 如何拆分 / 每段含义 / 释义），并支持按单词或释义搜索。

## 第二轮补充（已落地）
- P0：为核心学习引擎（`logic.ts`）补齐单测——稳定度档位、等级、连续天数、复习排程与缺门置后、`applyCompletedCase/applyIncorrectAttempt/applyMatchReview`、配对板、词根解锁条件、拆解与猜义判分。
- P1：把 `AtlasView` 抽到 `src/views/atlas.tsx`，`App.tsx` 不再内联大视图。
- P1 安心机制：词根地图概览显示「N 个词根该复习了」，把逾期项摆到台前。
- P2：设置页支持进度导出 / 导入 JSON（Supabase 接入前的备份手段），复用 `persistence` 的序列化与校验。
- P2：`speak.ts` 等待 `voiceschanged` 再朗读，首调用也能选到对应语言音色；中文按 `zh` 选音。
- P2：词根详情表、搜索框、返回链接的样式与移动端响应式、键盘焦点可达性。
- 新增可测试纯函数 `describeWordParts`（词根详情表与单测共用）。
- 词根详情页整行可点直接开练（与拼词游戏并行的「直接看词根」线，两条线不冲突）；选中的词根状态提升到 `App`，学完一个词再回地图仍停在该词根，保留上下文。
- 词根详情表调整：①「如何拆分」同时显示字面字母段与中文含义（如 `vis(看) + ion(动作、过程)`），段间用加粗带色 `+` 连接；② 删除「每段含义」列，「释义」列改名为「单词意思」显示整词含义。
- 词根地图搜索改为「输入后回车或点搜索按钮才检索」（原为每输入一个字符即时搜索）；输入框与按钮同行，返回时清空。
- 左侧菜单新增全局搜索框：回车或点「搜索」进入结果页，列表样式与词根地图搜索一致（点卡片进词根详情、点「学习 →」直接开练）；支持模糊查询（拼写子串 / 漏字母子序列 / 中文释义）。词根地图搜索也复用同一模糊逻辑。新增 `searchAllWords` 单测。
- 搜索结果增强（词根地图搜索与全局搜索页共用 `SearchResults`）：① 按词根分组展示（组头显示词根标签 + 含义 + 词数）；② 命中片段高亮（连续子串 `<mark>`）；③ 结果达上限（地图 50 / 全局 80）时显示「已显示前 N 个，可缩小关键词」提示。
- 搜索结果改为与词根详情页完全相同的表格（单词 / 如何拆分 / 单词意思 / 学习）：抽出共用组件 `RootWordsTable`，两处渲染一致；组头提供「看这个词根的全部单词 →」入口，点行直接学词。
- 修复表格列错位：`display: flex` 不能直接加在 `<td>` 上（会覆盖 table-cell 使整列脱离列网格），改为 td 内套 div.flex（`.cell-seg`）。

## 已完成细节（M3）

- `src/domain/profileStats.ts`：把 `PlayerProfile` 摊平成统计页数字（等级、连续天数、已学词、熟词根、迁移正确率、待复习、世界解锁、各档词根分布）。
- `src/domain/achievements.ts`：成就定义 + `computeAchievements(profile)` + `getUnlockedCount(profile)`，条件全部来自真实学习数据。
- `src/data/settings.ts`：设置读写（默认开发音），容错损坏存档。
- `src/App.tsx`：导航增加 `stats` / `achievements` / `settings`；`StatsView` / `AchievementsView` / `SettingsView` 三个视图；发音抽象成 `sound` 接口下发给 `CaseRoom`。
- 测试：`tests/profileStats.test.ts`、`tests/achievements.test.ts`、`tests/settings.test.ts`。

## 发音（全量）

- `src/speak.ts` 用浏览器 `speechSynthesis` 朗读任意英文单词与例句，`canSpeak()` 守卫 `window`。
- 词表任意词都能实时朗读，无需预录音频；无语音合成环境时按钮自动禁用。
