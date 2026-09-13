# Stage 2 进度记录

> 更新时间：2026-09-13（Stage 2 完成）
> 目标：67 词 / 20 词根 → **300 词 / 60 词根 / 12 世界**。
> LLM 策略：**handoff 模式**（执行 AI 写静态数据），全程 **$0**，未 git push。

---

## 一、验收结论（2026-09-13 实测）

| 项 | 结果 |
|---|---|
| `npm test` | **53 个测试通过** / 4 个文件（零适配——测试是动态的） |
| `npm run validate:content` | 通过：300 词 / 155 词素（60 词根）/ 12 世界，**0 错误**、45 警告（A22 死变体，铺词后自然减少） |
| `npm run build` | 通过；`dist/assets/index-*.js` 552 kB / **gzip 153.9 kB**（Stage 1 为 99.5 kB，预算内） |
| `npm run content:all` | 10→70 全链跑通（先经 build-stage2-config 合并配置）；**两次重跑派生产物逐字节一致**（SHA256 比对） |
| A23 | 60 家族全部「≥3 词且 d1/d5 各≥1」；选词分布 159 d1 / 72 d3 / 69 d5 |
| 隔离率 | 0%（复核 300 词：ok 300 / minor 0 / major 0）——**Stage 1 的 3 个 minor（century/envision/voice）已修复** |
| 漂移探测 | 0%（handoff 模式，结构性 0） |
| canary | 16/16 逐字节存活 |
| 实机验证 | Playwright 走完 今天→帮助→拼单词(朗读)→猜词义→结果→词根地图；1440×900 与 390×844 各截图（`stage2-*.png`）；控制台 0 错误 |

## 二、关键改动

| 改动 | 说明 |
|---|---|
| `scripts/tools/supply-analysis.mjs` + `check-shortlist` + `check-families` + `check-words` | 供给分析四件套：563 候选词素 × ECDICT 供给统计 → 252 个 root 可凑齐 A23（60 有余）；草稿家族逐词验证 |
| `scripts/lib/stage2-additions/*.json`（7 片） | 增量数据：40 新家族 / 233 词切分 / 40 新词根 / 前后缀增补与 allomorph 覆写 / 6 新世界 / forceInclude（~50 词，多为 d5E 保送） |
| `scripts/tools/build-stage2-config.mjs` | 合并 stage1-content + additions → `stage2-content.json`，自带完整性自检（A5/家族覆盖/世界覆盖/词素建模） |
| 20/21/40 号参数化 | 接受配置路径参数；`content:all` 传 stage2（stage1-content.json 保留为回滚锚） |
| 22 号 | handoff 双文件合并（Stage1 + Stage2，后者胜）；**handoff 判定提前到候选池判断之前**（修「池空但 handoff 有」丢例句 bug） |
| 30 号 | handoff 合并 `words-prose-stage2/*.json` 四分片 |
| 40 号 | **修干扰项窗口耗尽 bug**：固定步长 3 时组合只有词素数种（155），300 词必然耗尽；加步长维度后组合 ≈ 25× |
| `contentRules.ts` | `TARGET_WORD_COUNT` 67→300 |
| `CREDITS.md` + `license-manifest.json` | 许可红线补齐（ECDICT MIT / Tatoeba CC BY / kaikki CC BY-SA / cigen·shiweihappy 仅 id 交叉验证） |
| 修 3 个 minor | century 字面义改「一百之数」；envision 改「使看见的动作」；voice → **vocal**（vo 变体牵强，vocal=voc+al 干净；d5 由 vocation 承担，A23 不受影响） |

## 三、本次踩的坑（别再踩）

1. **A12 的「外来义项」**：干扰项必须字面包含 ≥2 汉字的义项原文（如「征服」「放置」），且**本词自己的前缀/后缀义项不算外来**（discord 自带 dis→「分开」就不能用「分开」锚定）。批次重写两轮才领悟：模板必须逐字包含 gloss。
2. **前缀抢走家族词**：hydrogen=hydro+gen、thermometer=thermo+meter 会让 d1/d5 词落不到 hydr/therm 家族（验证器按 parts 分组）。解法：连接体作为词根 allomorph（hydro/thermo ∈ hydr/therm.allomorphs），删独立前缀词素。
3. **覆写词素要保义项超集**：改 allomorphs 时顺手改了 meaningCn（gen 丢了「种类」），Stage 1 老词的 A12 锚定全断。覆写 = allomorphs ∪ 旧义项。
4. **干扰项窗口耗尽**：`makeDistractors` 固定步长 3，组合数=池长；67 词时够用，300 词必炸（script 词 0 干扰项）。加步长维度（3–27）解决。
5. **PowerShell**：`Get-FileHash | ForEach` 里 ProviderPath 为 null 会炸；哈希比对一律写 Node 脚本（`verify-rerun.mjs`）。
6. `node -e` 里写中文 JSON 改写文件是可行捷径，但改完必须立刻重跑闸门验证。

## 四、成本与复现

- LLM 花销 **$0**（11/13/30/60 号 handoff 全命中；环境里虽存在 `OPENROUTER_API_KEY`，但脚本优先 handoff，未发起任何调用）。
- 全量重跑：`npm run content:all`（≈2 分钟，含两次 ECDICT 全量扫描）。
- 一致性验证：`node scripts/tools/verify-rerun.mjs`（跑两次，第二次比对 SHA256）。

## 五、遗留事项

1. **根目录临时文件**（删除需确认）：`_t_*.mjs`、`run1/run2.txt`（应已不存在）、`shot-*.png`、`stage2-*.png`（建议移入 docs/）、`package - 副本.json` 等。
2. **45 个 A22 死变体警告**（af/ag/ap/ar/oc/syn/ance/judg 等）：随 Stage 3 铺词自然减少，或按「变体设计保留」白名单化。
3. **gzip 153.9 kB**：预算内，但 Stage 3（2000 词）前必须做索引/详情分层拆包（计划书 §A）。
4. 手写干扰项来自义项模板库（`fix-a12-auto.mjs` 的 SCENES），个别词的画面契合度可再打磨；A28/复核均绿。
5. `docs/扩词库计划.md` 的 Stage 3 前置条件：本阶段隔离率 0%、重跑一致已达成；「跨两次独立运行稳定」建议在 Stage 3 开工前再跑一轮确认。
