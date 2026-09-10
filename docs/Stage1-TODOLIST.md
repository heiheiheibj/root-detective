# Stage 1 待办（交给下一个 AI）

> 接手前先读 [AI交接说明.md](AI交接说明.md)（项目现状与硬约束）和 [扩词库计划.md](扩词库计划.md)（四阶段总纲）。
> 本文档只写**这一轮实际做出来的东西**和**还没做的**，重点标注那些「重新查一遍很贵」的事实。

**当前基线**：git 提交 `6d4a5f6`（绿色：49 测试通过、闸门 0 警告、dist 309 KB）。
工作区里还有本轮新增的、**尚未提交**的管线脚本，见第 6 节。

---

## 1. 网络环境（这台机器的实测结论，别重复踩）

| 通道 | 状态 | 用途 |
|---|---|---|
| `raw.githubusercontent.com` | **大文件全超时**（小文件 200，388 KB 就 000） | 别用 |
| `https://ghproxy.net/https://raw.githubusercontent.com/…` | 可用，206，**219 KB/s** | 大文件（ECDICT 66 MB 走这条） |
| `https://cdn.jsdelivr.net/gh/<owner>/<repo>@<branch>/<path>` | 可用，快 | GitHub 上 **< 20 MB** 的文件（超了返回 403） |
| `codeload.github.com` | 200 | 整仓库 tarball（备选） |
| `kaikki.org` | 直连可用 | 507 MB 的包 |
| `downloads.tatoeba.org` | 直连可用 | 句子和 links |

**默认分支**：ECDICT = `master`，其余三个 = `main`。

**本机解压工具**：`tar`、`bunzip2`、`unzip`、`xz` 在 PATH 里；7-Zip 在 `C:\Program Files\7-Zip\7z.exe`。
**Node 内置 `zlib` 只认 gzip/deflate，不认 bzip2** —— 遇到 `.bz2` 要 `child_process` 调 `bunzip2`。

**追加依赖（可选）**：`scripts/.work/` 下的 SQLite 索引可用 **`node:sqlite`**，
Node 22.20 实测可用（带 experimental 警告，不需 flag）：
```js
const { DatabaseSync } = require('node:sqlite')
```

---

## 2. 原始数据（已下载、已验证、已清理，都在 `scripts/.work/raw/`）

冗余归档已删除（4.7 GB → 3.7 GB）。当前 12 个文件，sha256 前 16 位：

| 文件 | 大小 | sha256(前16) | 许可 |
|---|---|---|---|
| `ecdict.csv` | 62.9 MB | `1a6947e04785db63` | MIT |
| `lemma.en.txt` | 2.2 MB | `e255b097404e3e00` | MIT |
| `wordroot.txt` | 362 KB | `4b400dc5980e4a36` | MIT |
| `morphynet-eng-derivational.tsv` | 7.8 MB | `5920edacc1888b14` | CC BY-SA 3.0（**离线证据**） |
| `tatoeba-eng-sentences.tsv` | 103.6 MB | `da6714526a5cf1f0` | CC BY 2.0 FR |
| `tatoeba-cmn-sentences.tsv` | 4.0 MB | `22e3bff576affa31` | CC BY 2.0 FR |
| `links.csv` | 434.5 MB | `7782d61eab4fa945` | CC BY 2.0 FR |
| `shiweihappy-roots.json` | 121 KB | `d6c58979c9c634e9` | 仓库标 Apache-2.0（**见第 4 节**） |
| `cigen-roots_affixes.json` | 379 KB | `b20aae11372041d7` | 仓库标 MIT（**见第 4 节**） |
| `kaikki-English.jsonl` | 3.02 GB | `3c202ca40f2a57d7` | CC BY-SA 4.0 + GFDL（**离线证据**） |
| `kaikki-en-prefix.jsonl` | 7.2 MB | `3cf6ecd3771b8106` | 同上 |
| `kaikki-en-suffix.jsonl` | 6.1 MB | `3cf6ecd3771b8106`… 见文件 | 同上 |

**还没做**：`scripts/00-fetch-sources.mjs`（把这些下载流程脚本化 + 写 manifest）。

---

## 3. 每份数据的真实格式（已逐字段验证，别再猜）

### `ecdict.csv` —— 权威词表，MIT
- **13 列，有表头**：`word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange, detail, audio`
- **770,611 行数据**
- `tag` 的取值实测只有 8 种：`zk` `gk` `cet4` `cet6` `ky` `toefl` `ielts` `gre`（空格分隔的列表）
- `translation` 里的换行是**字面量 `\n`**（反斜杠 + n），要自己 `replace(/\\n/g, '\n')`
- `phonetic` **不带斜杠**（`hʊd`），而出厂要求 `/hʊd/`，要补
- `bnc` / `frq` 是整数，**0 表示没有排名**（不是第 0 名）
- ⚠️ **字段里可能含引号内的逗号**，不能用 `split(',')`。用 `scripts/10-build-roots.mjs` 里那个 `parseCsvLine`。
- `exchange` 是变位表，格式 `p:过去式/d:过去分词/3:三单/i:现在分词`（后续「例句包含该词」规则要用）

### `wordroot.txt` —— **其实是个 JSON 文件，不是纯文本**
- 顶层是对象，**611 个键**，键就是词根本身，有的键是逗号分隔的同源变体：`"pter, ptero, pteryg, pteryx"`
- 值：`{ meaning: "man, human", class: "root", root: "hom", example: ["homage", ...], origin: "Latin" }`
- `class` 取值实测：`root`(423) `prefix`(110) `noun-forming suffix`(41) `adjective-forming suffix`(28) `verb-forming suffix`(4) `adjective- and noun-forming suffix`(3) `adverb-forming suffix`(2) —— **统一归成 root/prefix/suffix**（含 "suffix" 的都算 suffix）
- 键**可能带编号后缀**表示同形异义：`a-1`、`an-2`、`-en2`、`-al1`

### `cigen-roots_affixes.json` —— 953 条人工切分，但来历有问题
- `{ meta, roots, entries }`
- `meta`：`{sourcePdf: "XDF________.pdf", entryCount: 953, rootCount: 275}`
- `roots[275]`：`{ root, gloss, wordCount, sampleWords[] }`
- `entries[953]`：`{ id, word, meaning, decomposition, page, components[{morpheme, hint}] }`
  - 例：`acentric` → `decomposition: "a+centric 中心的"`，`components: [{morpheme:"a",hint:""},{morpheme:"centric",hint:"中心的"}]`
  - **这是人工切分证据，对 21 号切分器很有用**
- ⚠️ `gloss` 质量不可靠：`un` 被标成「难为情的」（实际是「不、否定」）

### `shiweihappy-roots.json` —— 只有 61 条
- `{ meta, entries }`，`meta.entryCount = 61`
- `entries[]`：`{ id: "prefix-a", type, root, meaningZh, section, aliases[], examples[{word, decomposition, explanationZh}] }`
- `meaningZh` 常是从例词倒推的句子（「例词义项: 无中心的；不好社交的」），价值低

### `morphynet-eng-derivational.tsv` —— 切分器的证据库
- **6 列，tab 分隔，没有表头**
- 列序（已从官方 README 核对）：`源词 | 派生词 | 源词性 | 目标词性 | 词素 | 类型`
  - 例：`sense\tnonsense\tN\tN\tnon\tprefix`、`slow\tslowly\tJ\tR\tly\tsuffix`
- 词性字母：`N` 名词 `V` 动词 `J` 形容词 `R` 副词
- 英文规模：**67,412 个词 / 225,131 条 / 2,445 个词素**
- ⚠️ **它只覆盖「派生」关系（词 + 一个词素），不做完整切分。** 完整切分要靠**链式推导**：
  `spect → inspect`（前缀 in）、`inspect → inspection`（后缀 ion），合起来得到 `in+spect+ion`。

### Tatoeba
- `tatoeba-eng-sentences.tsv` / `tatoeba-cmn-sentences.tsv`：`句号id \t 语言 \t 文本`，**无表头**
- `links.csv`：**28,439,850 行**，`句号id1 \t 句号id2`，**无表头**
- 句子 id 在两个文件之间是全局唯一的，靠 links 把 eng 和 cmn 配对

### kaikki（离线证据，**任何一句话都不能进 `src/`**）
- `.jsonl` 每行一个 JSON 对象，含 `pos` / `etymology_text` / `head_templates` 等
- `kaikki-en-prefix.jsonl` / `kaikki-en-suffix.jsonl` 的每条 `"pos"` 就是 `"prefix"` / `"suffix"`，是词缀构词信息的专表

---

## 4. 许可结论（**修正了原计划里的一个错误假设**）

计划书原文写「两个中文词根表找不到 LICENSE，所以只用它们推导 id 列表」。**这个前提是错的**：

- `shiweihappy/english-word-root` → **Apache-2.0**
- `jesselau76/cigen` → **MIT**

但是——两个仓库的数据**都是从新东方（XDF）的 PDF 抽出来的**：
- shiweihappy 里有 `XDF.pdf`（848 KB 原书）和 `scripts/extract_xdf.py`
- cigen 的 `scripts/extract_pdf_data.py`，meta 里写着 `sourcePdf: XDF________.pdf`

**仓库作者给自己贴的许可证盖不住上游版权。** 所以原计划那条规矩要保留，只是理由更硬：
**中文释义一律重写，绝不逐字复制这两家的 `meaningZh` / `gloss`。**

**好消息**：ECDICT 自带的 `wordroot.txt` 是 **MIT**、611 条、有英文义项 + 拉丁/希腊来源 + 例词，
**这才是唯一可以放心当权威的来源**。原计划没发现它，白担心了一场。

三条红线（别越）：
1. `kaikki-*` 和 `morphynet-*` 是 **share-alike**，只能待在 `scripts/.work/`（已 gitignore），**不进产物**。
   出厂的 `sourceNote` 必须是基于词素义重写的「构词逻辑」句，不是抄词源。越线 = 整个仓库要转 CC BY-SA 4.0，**单向门**。
2. 两个中文词根表只用于 (a) 交叉核对 id、(b) 人工切分证据，**不复制文本**。
3. 出厂产物保持 **MIT 兼容**。

**还没做**：`CREDITS.md` + `scripts/gates/license-manifest.json`（计划书要求）。

---

## 5. Node 的坑（会让人白查半天）

### 5.1 从 `.mjs` 里 import `.ts` 的规则（**比我上一版文档写的宽松**）

实测：
```js
import { countHanzi } from '../src/domain/contentRules.ts'   // ✅ 可用（带 .ts 扩展名）
import { x } from './y'                                       // ❌ ERR_MODULE_NOT_FOUND（无扩展名）
import type { Word } from './types'                           // ✅ 整段被擦除，不参与路径解析
```
- **带 `.ts` 扩展名的值导入是可以用的**，`scripts/validate-content.mjs:9` 就是这么干的。
- 扩展名不能省。这适用于所有 `.mjs` → `.ts` 的导入。
- `contentRules.ts` 之所以只写 `import type`，是为了让它同时被 vitest 和裸 Node 加载时不引入解析问题——加规则时守住这条。
- 不支持 `enum` / `namespace` / 参数属性（不可擦除语法）。

### 5.2 其它
- OpenRouter 偶尔返回 **200 + 空响应体**。`response.json()` 会直接抛异常把整轮跑挂。`scripts/lib/llm.mjs` 已改成先 `text()` 再解析并重试——**别改回去**。
- 有时也用 200 包一个 `{error: {...}}` 回来，已处理。

---

## 6. 已经做完的（本轮新增，**尚未提交**）

| 文件 | 状态 | 说明 |
|---|---|---|
| `.gitignore` `.gitattributes` `LICENSE` | ✅ 已提交 `6d4a5f6` | 行尾统一 LF（两台机器改代码必须），MIT |
| `scripts/10-build-roots.mjs` | ✅ 跑通 | 三份词根表 → `.work/derived/roots.candidates.json` |
| `scripts/lib/llm.mjs` | ✅ 跑通 | 四个 LLM 脚本共用：**缓存**（键 = sha256(model+system+user+temperature)）、**重试**、**记账** |
| `scripts/11-glossary-llm-clean.mjs` | ⚠️ **需要重跑** | 见下 |

### 10 号的产出
`roots.candidates.json`：**563 条候选 = 词根 406 + 前缀 94 + 后缀 63**，全部有英文义项、来源语、例词。
其中 **153 条**被第二份来源交叉核对过，**40 条**标了冲突：
- **同形异义**（ECDICT 用编号区分）：`-al1` 形容词后缀 vs `-al2` 名词后缀、`a-`(不/无) vs `a-`(朝向)、`cap`(头) vs `cap`(抓)、`cur`(关心) vs `cur`(跑)
- **type 冲突**：`ac` root vs prefix、`ad` prefix vs suffix

⚠️ 这些**不能覆盖丢弃**——10 号已经把每条同形条目存进 `entry.variants[]` 了。最终 id 只能留一个（运行时 `morphemeById` 是按 id 索引的 Map），**由 12 号规则裁决，并给出书面理由**。

### 11 号的现状（**关键**）
已经跑过一轮：560/563 条产出，504 条 `keep=true`，花销 $0.016。

之后我**改了 SYSTEM 提示词**（因为 3 条失败：模型把括号里的词性漏出字数预算了），
**缓存键包含 system 文本，所以整个缓存失效了，需要重跑**（23 批，约 $0.06）：

```bash
cd "D:/AIGAME/背单词"
node scripts/11-glossary-llm-clean.mjs
```

重跑后应当：3 条失败清零或大幅减少。**如果还有失败，就当正常损耗丢掉**（12 号会处理），别为了几毛钱反复重跑。

---

## 7. 还没做的（按顺序）

### 7.1 `scripts/12-glossary-rules.mjs` —— 确定性词根闸门
输入 `roots.cleaned.json` → 输出 `roots.validated.json` + `roots.rejected.json`。
要点：
- 丢弃 `keep=false` 的（56 条）和 11 号机器校验没过的
- **裁决 40 条冲突**：同形异义按 `chosenVariant` 取一条；type 冲突按 ECDICT 优先
- id 必须是 `[a-z]+`；`displayText` 全局唯一；`allomorphs` 非空
- `meaningCn` 汉字数 1–8（用 `countHanzi`，**从 `../src/domain/contentRules.ts` 导入，别另写一个**）
- 词根数量目标 ~300：现在 406 个词根，**多余的靠 20 号选词时「这个词根长不出 ≥3 个 CET 词」反向淘汰**，不要在这里硬砍

### 7.2 `scripts/13-glossary-llm-review.mjs` —— 换模型对抗式复核
- **必须用和生成器不同的模型**（`MODELS.reviewer`，默认 `google/gemini-2.5-flash`）
- 20 条一批，强制返回 `{id, verdict: "ok"|"suspect"|"reject", issue, correctedMeaningCn?}`
- 提示词要写成**对抗式**：「你的任务是找出缺陷，默认倾向于报告」
- `suspect`/`reject` 进 `scripts/.work/quarantine/`，**不要自动采用它的 `correctedMeaningCn`**——那会绕过 12 号规则。要采纳就得重新走一遍 12 号。

### 7.3 `scripts/20-select-words.mjs` —— 选词
- 候选 = `tag ∈ {zk,gk,cet4,cet6}` **且** MorphyNet 切分能对上已接受词根的词
- 用 `bnc`/`frq`（**0 表示无排名，要当最差处理**）+ `collins`/`oxford` 打分排序
- **每个词根至少要有 1 个 difficulty-1 和 1 个 difficulty-5 的词**，否则丢弃该词根
  （这是计划书点名的头号风险：300 词根目标可能在这里被打穿）
- Stage 1 只要 **60 个词 / 20 个词根**

### 7.4 `scripts/21-split-morphemes.mjs` —— 确定性切分器
**这是最容易做错的一步。** 要点：
- 用 MorphyNet 的派生关系**链式推导**完整切分（`spect → inspect → inspection` ⇒ `in+spect+ion`）
- 用 `cigen.entries[].components` 当人工切分证据交叉验证
- 拼出来的串必须等于词本身（扣掉 `scripts/gates/residue-allowlist.json` 里的残留），**失败就丢词，绝不修**
- 每个 `surface` 必须在对应词素的 `allomorphs` 里
- **Stage 1 的验收关键**：重新生成 `spec`/`dict`/`port`/`vid` 四个家族，产出的 `parts` 的 morphemeId 和顺序必须和手写版**完全一致**——这是切分器对人工作品的差分测试

### 7.5 `scripts/22-choose-examples.mjs` —— 选例句
- 用 `links.csv` + 两个 sentences 文件配对英中句子
- ⚠️ `links.csv` 有 2843 万行 / 434 MB，**建一次本地 SQLite 索引再用**（`node:sqlite` 可用，见 1 节）
- 取含该词、4–20 词、有中文译文、无专名的最短句；记 `sentenceId` 供署名
- Tatoeba 覆盖不到的词允许 LLM 兜底写例句，但复核时要查得更严

### 7.6 `scripts/30-llm-prose.mjs` —— LLM 生成文案
提示词契约见计划书。**已经被验证有效的三条**（照抄 11 号的做法）：
1. **输入是 JSON 对象，不是散文**
2. **`parts` 是冻结的、权威的**，模型不许增删改序——切分没法被幻觉，因为模型根本没机会写切分
3. **模型绝不产出 `id` / `difficulty` / `familyWordIds` / `distractors`**（这些在 40 号算）
4. 批 10 词，temperature 0，逐词落盘以便断点续跑
5. 逃生舱：`{"reject": true, "reason": "…"}`

### 7.7 `scripts/40-assemble.mjs` —— 组装
- 算 `id` / `difficulty` / `familyWordIds` / `distractors`（**定种子随机**，保证可复现）
- **最后**套用 `overrides/` —— 16 个 canary 词必须**逐字节存活**
- 写 `provenance.json` 边车（`validate-content.mjs:31` 靠它的存在判断「这是生成内容」）

### 7.8 `scripts/60-llm-review-content.mjs` —— 第二个 AI 复核
- 跑在**组装后的产物**上（不是生成器输出上），才能抓到切分器和组装器的 bug
- 8 词/请求，并发 4–6，**用不同模型**，同样走 `scripts/lib/llm.mjs` 的缓存
- 强制 schema 见计划书；`major` → 进隔离区，组装器带排除清单重跑

### 7.9 `scripts/70-report.mjs` + `package.json` 的 `content:all`
- 每词根覆盖度、难度分布、隔离率、体积检查
- 阶段结束必须能 `rm -rf scripts/.work/derived && npm run content:all` 全量重跑

### 7.10 `scripts/00-fetch-sources.mjs`（补）
把第 1、2 节的下载流程脚本化：镜像回退链、sha256 校验、`manifest.json`、hash 不变则跳过。

---

## 8. Stage 1 验收（计划书原文，照做）

1. 所有闸门绿；隔离 ≤2 个词且有书面理由
2. 记录词条 chunk 的 gzip 体积；20 个词根在地图页渲染不破版
3. **四个家族差分测试**：重新生成 `spec`/`dict`/`port`/`vid`，断言生成的 `parts` 与手写的 morphemeId 和顺序一致
4. **16 个 canary 词逐字节存活**（靠 40 号最后套的 `overrides/`）
5. `residue-allowlist.json` 里只剩 `porter` 的 `-er` 一条
6. Playwright 实机走一遍（今天 → 拼单词含发音 → 复习配对 → 词根地图 → 新手帮助），1440×900 和 390×844 各截图

跑完记得：
```bash
npm test && npm run validate:content && npm run build
```

---

## 9. 已知未决 / 陷阱清单

- **`PROFILE_VERSION` 不许动**（`normalizeProfile` 按 id 重映射已经能正确迁移）
- **`contentRules.ts` 只能有 `import type`**，不能引入带值的相对 import
- **canary 清单不许删**（`scripts/validate-content.mjs:42` 里硬编码的 16 个词 id）
- **14 个测试用下标取夹具**已全部改成按 id 查找，新写测试照办
- `OPENROUTER_API_KEY` **没有消费上限**（`limit: null`，已用 $2.40）。Stage 3 的 2000 词会到几美元量级，**建议先去 OpenRouter 后台设限**
- 模型可用环境变量覆盖：`RD_MODEL_GENERATOR` / `RD_MODEL_REVIEWER` / `RD_NO_CACHE=1`（强制忽略缓存）
- `scripts/.work/` 全部可重新生成，已 gitignore。**只有 `scripts/gates/` 下的白名单和 `overrides/` 要进仓库**
- 两个词根共享 `meaningCn` 的告警规则**还没实现**（`spec` 和 `vid` 现在都是「看」）
- `CREDITS.md` + `scripts/gates/license-manifest.json` **还没做**
