# Stage 1 进度记录

> 更新时间：2026-09-12（Stage 1 收尾完成）
> 总目标：管线全跑通。**最终产出 67 词 / 20 词根**（60 是原估算，A23 把它顶到了 67，见下），
> 所有质量闸门绿色，`npm run content:all` 全量可重跑。
> 红线遵守情况：不用 OpenRouter（全部走 handoff 静态数据），**LLM 花销 $0**，未 git push。
> 汇报对象只读中文。

---

## 一、验收结论（2026-09-12 实测）

| 项 | 结果 |
|---|---|
| `npm test` | **53 个测试通过** / 4 个文件（新增 `tests/pipeline.test.ts`） |
| `npm run validate:content` | 通过：67 词 / 69 词素（20 词根）/ 6 世界，**0 错误**、45 警告（全是 A22 死变体，样本小所致，Stage 2 铺词后自然消失） |
| `npm run build` | 通过；`dist/assets/index-*.js` 327 kB / **gzip 99.5 kB** |
| `npm run content:all` | 10→70 全链跑通；**同配置两次全量重跑，派生产物逐字节一致** |
| (a) 四家族差分 | 切分器输出与手写 overrides 一致（spec/dict/port/vid 共 16 词，含 `isAssimilated` 标记） |
| (b) canary 逐字节存活 | **16/16** 与 `scripts/overrides/canary-words.json` 一致 |
| (c) 残留白名单 | 只剩 `porter` 一条 |
| 隔离率 | 0%（复核 67 词：ok 64 / minor 3 / major 0） |
| 漂移探测 | 样本 8，漂移 0%（handoff 模式下是结构性 0，切回真 LLM 才开始真测） |
| 实机验证 | Playwright 走完 今天→拼单词(朗读)→猜词义→复习→词根地图→新手帮助，1440×900 与 390×844 各截图（仓库根 `shot-*.png` 共 11 张） |

**为什么是 67 不是 60**：A23 要求每词根 ≥3 词且 d1/d5 各 ≥1。16 个 canary 每族 4 词，
dict/port/vid 各需补 1 个 d5（dictator/deport/envision，因 visible/vision/revise/visibility 实测均无 d5），
于是 4×4 + 16×3 = 67。`TARGET_WORD_COUNT = 67`（`src/domain/contentRules.ts:42`），闸门/测试/选词共用。

---

## 二、本次收尾改动（接手时的差异）

| 改动 | 原因 |
|---|---|
| **重写 51 个生成词的 102 个干扰项**（`scripts/lib/handoff/words-prose.json`） | 60 号复核发现全部是模板套话「讲的其实是X / 说的还是Y」——是元话语不是画面，A10/A11/A12/A13 都拦不住 |
| 新增 **A28** 规则（`contentRules.ts` + `30-llm-prose.mjs` 双份正则） | 把上面那类缺陷关死；**两处正则必须同步改** |
| 修 **22 号漏实现的 8.3 第 5 条（无专名）** | Tatoeba 例句和 handoff 兜底例句里混进了 Tom / Martino / Indian / US / Baptists 等；handoff 数据也加了同一道闸（坏数据直接退出） |
| 修 **40 号重算 canary 的 `familyWordIds`** | 这会把 16 个手写锚点词改写掉（实测 15/16 不一致），13.2(b) 的逐字节存活验收就是为抓它设计的。现在只对生成词重算 |
| 修 **40 号干扰项取模种子太弱** | photograph/paragraph 等 5 组词的四个干扰项逐条相同；改为 FNV-1a 哈希种子 + 全局签名去重（canary 签名也计入） |
| 补 `visibility` 切分的 `isAssimilated` 标记 | 手写 splits 漏了，导致差分测试失败（产物走 overrides 所以一直没暴露） |
| 修 `vite.config.ts` 的 TS2591 | 用了 `process` 但没装 @types/node；改从 `globalThis` 取，零依赖 |
| 新增 `scripts/60-llm-review-content.mjs` / `70-report.mjs`、`npm run content:all` | 第 11/12 步本体 |
| handoff 复核数据 `scripts/lib/handoff/words-review.json` | 67 词逐条 13 项 checks + issues（机械项算，语义项人工判） |

---

## 三、环境备忘（踩过的坑，别再踩）

- **shell 是 PowerShell（Core）**：`dir /o:d`、`Select-String` 可用，但 `node -e` 里的 `"` 引号转义极易炸——
  复杂校验一律写成临时 `.mjs` 文件再 `node` 跑，别硬塞 `node -e`。
- 大循环里别套整表扫描（770,611 词的 ECDICT）：先建单遍 Map 索引再查，瞬时完成。
- 长进程卡死：`taskkill /F /IM node.exe`（或按端口 `Get-NetTCPConnection -LocalPort 5173` 找 PID）。
- Node 版本 v22.20.0；`.mjs` 里 `??` 与 `||` 混用必须加括号（否则 SyntaxError）。
- ECDICT 列：0 word, 1 phonetic, 2 definition, 3 translation, 4 pos, 5 collins, 6 oxford, 7 tag, 8 bnc, 9 frq, 10 exchange, 11 detail, 12 audio。bnc/frq=0 = 没有排名 = 最差。
- 难度规则（6.4）：d1 = zk/gk 标签 或 collins=5 或 bnc<3000；d5 = (cet6|toefl) 且 bnc>10000 或 bnc=0；其余 d3。
  筛选（6.2）：tag 必须含 zk/gk/cet4/cet6 之一；常用词 = collins/oxford 非空 或 bnc/frq 前 20000。
- 排序打分（6.3）：+3 collins、+2 oxford、+2 (cet4/gk/zk)、+1 cet6、-log10(bnc)（bnc=0 记 -6）。
- A12 的「本词以外的真实义项」口径：`meaningCn` 去 `（…）` 后按 `、；;，,` 切，**≥2 个汉字才算义项**——
  单字义（听/看/说/百）进不了池子，写干扰项时别指望用它们过闸。
- chrome-devtools MCP 的浏览器实例可能被占用（profile 锁），换 `playwright-cli` 即可。

---

## 四、遗留事项

1. **根目录临时文件未清理**（删除需用户确认）：`_t_*.mjs`、`_t_*.log`、`_ecdict_probe.mjs`、
   `_fix_options*.mjs`、`_dev.log`、`_dev.err.log`、`shot-*.png`（截图建议移进 docs/ 或删）、
   `console.log('ERR'`（名字就是这串的坏文件）、`package - 副本.json`、`package-lock - 副本.json`。
   本轮新产生的可删清单：`_t_check_examples.mjs`、`_t_check_legacy.mjs`、`_t_diff_derived.mjs`、
   `_t_review_gen.mjs`（若要保留复核数据的再生成能力，可把它改名为 `scripts/tools/` 下的正式脚本）。
2. **复核留下的 3 个 minor**（`scripts/.work/report.md` 末尾全文）：`century`、`envision` 字面义不是词素义拼接；
   `voice` 的 `vo` 变体牵强。不阻断，Stage 2 顺手修 handoff。
3. **CREDITS.md + license-manifest.json 未做**（许可红线，Stage 2 前必须补）。
4. **favicon 404**（外观问题）。
5. `.work/derived` 里的中间产物已 gitignore；`report.md` 建议Stage 2 时抄一份进 docs/。

---

## 五、Stage 2 开工前要拍板的事

- 干扰项质量策略：现在 A28 只拦元话语，「无关但合理」的画面仍靠人工写 handoff。
  批量到几百词时，要么扩词素义项池让 A12 更有区分度，要么恢复真 LLM 生成 + 漂移探测。
- 例句策略：Tatoeba 对 CET 词表覆盖一般（67 词里 20 个靠 handoff 兜底）。
- 是否切回真 LLM（`OPENROUTER_API_KEY`）：handoff 架构两边都支持，切回即真测漂移。
