# Stage 1 操作手册（照着做就行）

> 这份文档是给**接手继续做的 AI** 用的。请**从头到尾按顺序读一遍再动手**。
> 每一步都写了「做什么 / 敲什么命令 / 期望看到什么 / 出问题怎么办」。
> 遇到没写过的情况，**停下来问用户**，不要自己发明做法。

---

# 第 0 步 · 先搞清你是谁、要干什么

## 0.1 这个项目是什么

一个中文的「词根背单词」应用（React + TypeScript + Vite），玩法是把单词拆成词素让学生拼。
现在词库只有 **16 个词、12 个词素**，是手写的。任务是**扩到 2000 个词、300 个词根**。

分四个阶段，**你现在要做的是 Stage 1**：把数据管线跑通，产出 **60 个词 / 20 个词根**。
不是直接做 2000 个。Stage 1 的目的就是「管线能不能跑通」，跑通了后面两个阶段只是加大批量。

## 0.2 动手前必须读的三个文件

按顺序读，每个都要读完：

1. `docs/扩词库计划.md` —— 总纲，四阶段的完整设计。**权威文档，和本文档冲突时以它为准。**
2. `docs/AI交接说明.md` —— 项目现状、代码结构、已经踩过的坑。
3. 本文档 —— 你要做的事的具体步骤。

## 0.3 绝对不要做的事（红线，违反了要回滚）

| 不要做 | 为什么 |
|---|---|
| **不要改 `PROFILE_VERSION`**（在 `src/domain/persistence.ts`） | `normalizeProfile` 按 id 重映射，已经能正确迁移老档案。改了会让用户的存档失效 |
| **不要在 `src/domain/contentRules.ts` 里加带值的相对 import** | 这个文件被裸 Node 直接加载，加错会让 `npm run validate:content` 静默失效。只需要 `import type` |
| **不要删 `scripts/validate-content.mjs` 里硬编码的 16 个 canary 词 id** | 它们是唯一的回归锚点 |
| **不要把 `kaikki-*` / `morphynet-*` 的任何句子写进 `src/`** | 那两份是 CC BY-SA，传染性的。写进去整个仓库就得转许可证，**单向门，不能反悔** |
| **不要逐字复制 `cigen` / `shiweihappy` 的中文释义** | 它们的原始出处是新东方 PDF，仓库作者无权再授权 |
| **不要跳过闸门直接改产物文件** | 产物由管线生成，手改会被下次重跑覆盖 |
| **不要用 `git push` / 不要建远端仓库** | 用户没让你做 |

## 0.4 用户是谁（影响你怎么汇报）

- 用户**读中文**，跟他汇报一律用中文。
- **用户不懂英文，也无法校对任何英文内容。** 所以质量全靠自动化规则，
  **绝对不要设计出「请用户看一下这句英文对不对」这种环节**。
- 用户希望**省钱**。LLM 调用要尽量走缓存（见第 3 步），不要反复重跑。

---

# 第 1 步 · 环境自检

## 1.1 打开正确的目录

```bash
cd "D:/AIGAME/背单词"
```

**期望看到**：命令不报错。
**出问题**：路径里有中文，必须加引号。Windows 上用 Git Bash。

## 1.2 五项自检，一次跑完

把下面一整段复制进去执行：

```bash
cd "D:/AIGAME/背单词" && echo "--- node 版本 ---" && node -v && echo "--- 测试 ---" && npm test 2>&1 | tail -5 && echo "--- 闸门 ---" && npm run validate:content 2>&1 | tail -6 && echo "--- API key ---" && node -e "console.log(process.env.OPENROUTER_API_KEY ? 'OPENROUTER_API_KEY 存在，长度 '+process.env.OPENROUTER_API_KEY.length : '缺少 OPENROUTER_API_KEY')"
```

**期望看到**：
- node 版本是 `v22.20.0` 或更高
- `Tests  49 passed (49)`
- `内容校验通过：16 个词、12 个词素…，0 个警告。`
- `OPENROUTER_API_KEY 存在，长度 73`

**出问题怎么办**：

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 测试不是 49 个通过 | 代码被改坏了 | **停下来告诉用户**，不要自己改测试来「让它通过」 |
| 闸门报错 | 同上 | 同上 |
| `OPENROUTER_API_KEY` 不存在 | 环境变量没设 | 告诉用户导出这个变量，或让他确认是不是换了终端 |
| `node -v` 低于 22.5 | 版本太老 | 告诉用户。`node:sqlite` 和类型剥离都需要新版本 |

## 1.3 确认原始数据都在

```bash
cd "D:/AIGAME/背单词/scripts/.work/raw" && ls -la | awk '{print $5, $9}'
```

**期望看到 12 个文件**（大小可以不完全一样）：

```
62.9 MB  ecdict.csv
2.2 MB   lemma.en.txt
362 KB   wordroot.txt
7.8 MB   morphynet-eng-derivational.tsv
103.6 MB tatoeba-eng-sentences.tsv
4.0 MB   tatoeba-cmn-sentences.tsv
434.5 MB links.csv
121 KB   shiweihappy-roots.json
379 KB   cigen-roots_affixes.json
3.02 GB  kaikki-English.jsonl
7.2 MB   kaikki-en-prefix.jsonl
6.1 MB   kaikki-en-suffix.jsonl
```

**如果文件不在**：`scripts/.work/` 是 gitignore 的，走 git 传不过来。需要按下面的地址重新下载，
存到 `D:/AIGAME/背单词/scripts/.work/raw/`，**文件名必须完全一致**：

```bash
cd "D:/AIGAME/背单词/scripts/.work/raw"

# GitHub 直连在这台机器上拉不动大文件，必须套 ghproxy.net
curl -L -o ecdict.csv        "https://ghproxy.net/https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv"
curl -L -o lemma.en.txt      "https://ghproxy.net/https://raw.githubusercontent.com/skywind3000/ECDICT/master/lemma.en.txt"
curl -L -o wordroot.txt      "https://ghproxy.net/https://raw.githubusercontent.com/skywind3000/ECDICT/master/wordroot.txt"

# jsdelivr 只吃小于 20 MB 的文件
curl -L -o morphynet-eng-derivational.tsv "https://cdn.jsdelivr.net/gh/kbatsuren/MorphyNet@main/eng/eng.derivational.v1.tsv"
curl -L -o cigen-roots_affixes.json        "https://cdn.jsdelivr.net/gh/jesselau76/cigen@main/data/roots_affixes.json"
curl -L -o shiweihappy-roots.json          "https://cdn.jsdelivr.net/gh/shiweihappy/english-word-root@main/public/data/roots.json"

# Tatoeba 和 kaikki 可以直连
curl -L -o tatoeba-eng-sentences.tsv.bz2 "https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2"
curl -L -o tatoeba-cmn-sentences.tsv.bz2 "https://downloads.tatoeba.org/exports/per_language/cmn/cmn_sentences.tsv.bz2"
curl -L -o tatoeba-links.tar.bz2         "https://downloads.tatoeba.org/exports/links.tar.bz2"
curl -L -o kaikki-English.jsonl.gz       "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz"
curl -L -o kaikki-en-prefix.jsonl        "https://kaikki.org/dictionary/English/pos-prefix/kaikki.org-dictionary-English-by-pos-prefix.jsonl"
curl -L -o kaikki-en-suffix.jsonl        "https://kaikki.org/dictionary/English/pos-suffix/kaikki.org-dictionary-English-by-pos-suffix.jsonl"

# 解压（Node 内置的 zlib 不认 bz2，必须用系统命令）
bunzip2 -k tatoeba-eng-sentences.tsv.bz2
bunzip2 -k tatoeba-cmn-sentences.tsv.bz2
tar -xjf tatoeba-links.tar.bz2        # 解出 links.csv
gunzip -k kaikki-English.jsonl.gz     # 解出 kaikki-English.jsonl

# 解压完把压缩包删掉，省 1 GB
rm -f tatoeba-eng-sentences.tsv.bz2 tatoeba-cmn-sentences.tsv.bz2 tatoeba-links.tar.bz2 tatoeba-links.tar kaikki-English.jsonl.gz
```

**下载很慢怎么办**：ECDICT 那三个是慢的（219 KB/s，66 MB 约 5 分钟）。
`links.tar.bz2` 最慢（142 MB 下载 + 434 MB 解压）。**耐心等，不要中断。**

---

# 第 2 步 · 先看一眼数据长什么样（别跳过）

**为什么要做**：后面的脚本全靠这些数据的字段。文档里写的格式万一和你手上的文件对不上，
**现在发现比写完三个脚本再发现便宜得多**。

```bash
cd "D:/AIGAME/背单词" && node -e '
const fs=require("fs");
const log=(...a)=>console.log(...a);
const raw="scripts/.work/raw/";

const ecdict=fs.readFileSync(raw+"ecdict.csv","utf8").split("\n");
log("ecdict 表头:", ecdict[0]);
log("ecdict 行数:", ecdict.length-1);

log("links 前 3 行:", fs.readFileSync(raw+"links.csv","utf8").split("\n").slice(0,3).join(" | "));

log("morphynet 前 3 行:");
fs.readFileSync(raw+"morphynet-eng-derivational.tsv","utf8").split("\n").slice(0,3).forEach(l=>log("  "+l));

const wr=JSON.parse(fs.readFileSync(raw+"wordroot.txt","utf8"));
log("wordroot 是 JSON，条数:", Object.keys(wr).length);
log("  hom 这条:", JSON.stringify(wr.hom));

const cg=JSON.parse(fs.readFileSync(raw+"cigen-roots_affixes.json","utf8"));
log("cigen roots:", cg.roots.length, "entries:", cg.entries.length);
log("  entry 样例:", JSON.stringify(cg.entries[0]));
'
```

**期望看到**：

```
ecdict 表头: word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio
ecdict 行数: 770611
links 前 3 行: 1	2481 | 1	5350 | 1	180624
morphynet 前 3 行:
  sense	nonsense	N	N	non	prefix
  moon	month	N	N	th	suffix
  multicultural	multiculturalism	J	N	ism	suffix
wordroot 是 JSON，条数: 611
  hom 这条: {"meaning":"man, human","class":"root","root":"hom","example":["homage",...],"origin":"Latin"}
cigen roots: 275 entries: 953
```

**对不上怎么办**：**停下来告诉用户**。不要硬着头皮往下写。

**几个反直觉的地方，记住**：

- `wordroot.txt` **名字叫 .txt，内容其实是 JSON**
- `ecdict.csv` 的 `translation` 字段里换行是**字面量 `\n`**（反斜杠+n），不是真换行
- `ecdict.csv` 的 `phonetic` **不带斜杠**（`hʊd`），而出厂要求 `/hʊd/`
- `ecdict.csv` 的 `bnc`/`frq` 为 **0 表示没有排名**，不是第 0 名
- `ecdict.csv` **字段里可能有引号包着的逗号**，绝对不能用 `split(',')` 解析。用下面这个函数
- `morphynet` 的文件**没有表头**，6 列，列序是：`源词 | 派生词 | 源词性 | 目标词性 | 词素 | 类型`
- `morphynet` 的**词性字母**：`N`=名词 `V`=动词 `J`=形容词 `R`=副词

**解析 ECDICT 的 CSV 用这个函数**（`scripts/10-build-roots.mjs` 里也有，可以复制）：

```js
function parseCsvLine(line){
  const out=[]; let cur="", q=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(q){ if(c==='"'){ if(line[i+1]==='"'){cur+='"';i++} else q=false } else cur+=c }
    else { if(c==='"') q=true; else if(c===',') { out.push(cur); cur="" } else cur+=c }
  }
  out.push(cur); return out;
}
```

---

# 第 3 步 · 重跑 11 号（LLM 词根释义）

## 3.1 为什么现在要跑

前一个 AI 已经跑过一轮，但之后**改了它的系统提示词**（因为有 3 条输出违反了字数限制），
而缓存键里包含提示词文本，**所以整个缓存失效了，必须重跑**。

成本约 **$0.06**。这是唯一一次需要重花的钱。

## 3.2 跑

```bash
cd "D:/AIGAME/背单词" && node scripts/11-glossary-llm-clean.mjs
```

**要等几分钟**（23 批，并发 4）。屏幕上会滚动打印 `批 N/23：要 25 条，回 25 条`。

**期望看到结尾**：

```
写出 563 条到 .work/derived/roots.cleaned.json
  其中 keep=true 的 5xx 条，keep=false 的 5x 条（12 号规则会丢弃）
  机器校验没过的 0 条 → roots.llm-failures.json
  ...
[llm] 11 号词根清洗：实调 23 次、命中缓存 0 次，token ...，花销 $0.0xxx

下一步：node scripts/12-glossary-rules.mjs
```

**判断成功的标准**：
- `写出 NNNN 条`：这个数字 + `机器校验没过的 N 条` = **563**。不等就说明模型漏条了
- 花销在 **$0.03 ~ $0.12** 之间

## 3.3 出问题怎么办

| 现象 | 原因 | 怎么办 |
|---|---|---|
| `缺少 .work/derived/roots.candidates.json` | 10 号没跑 | 先 `node scripts/10-build-roots.mjs` |
| `缺少环境变量 OPENROUTER_API_KEY` | 环境变量没设 | 问用户要，或用 `OPENROUTER_API_KEY=xxx node scripts/...` |
| `HTTP 402` 或提到 `insufficient credits` | 账户没钱 | **告诉用户充值**，不要自己想办法 |
| `HTTP 401` | key 无效 | 告诉用户 |
| `HTTP 429` 连续重试后失败 | 限速 | 等 5 分钟再跑。**已完成的批次有缓存，重跑不重复花钱** |
| `响应体异常（0 字节）` | OpenRouter 的临时故障 | 脚本会自动重试。连续失败就等会儿再跑 |
| 最后花销超过 $0.5 | 提示词太长了 | 告诉用户，别自己改提示词硬跑 |
| `机器校验没过的` 有十几条 | 模型没好好听话 | **正常损耗，不要重跑**。12 号会处理。只有超过 50 条才需要查 |

**如果只是想看看结果**（不花钱）：

```bash
cd "D:/AIGAME/背单词" && node -e '
const d=require("./scripts/.work/derived/roots.cleaned.json");
console.log("总条数:", d.entries.length);
console.log("keep=true:", d.entries.filter(e=>e.keep).length);
for(const e of d.entries.slice(0,15)) console.log(" ", e.id, "|", e.type, "|", e.displayText, "|", e.meaningCn, "|", e.etymologyZh);
'
```

**看不懂输出**：把这几行贴给用户看，让他判断中文对不对。

---

# 第 4 步 · 写 `scripts/12-glossary-rules.mjs`（词根确定性闸门）

## 4.1 这一步做什么

把 11 号的输出过一遍**纯规则**校验，产出最终词根表。**不调 LLM**，所以免费、快、可重跑。

- 输入：`scripts/.work/derived/roots.cleaned.json`
- 输出：`scripts/.work/derived/roots.validated.json` + `roots.rejected.json`

## 4.2 逐条规则（全部要实现）

对每一条：

1. **`keep === false` 的丢弃**，并把 `rejectReason` 写进 rejected 文件
2. **在 `roots.llm-failures.json` 里的 id 丢弃**
3. **id 必须匹配 `/^[a-z]+$/`**（纯小写字母，不能有连字符或数字）
4. **`displayText` 必须全局唯一**，重复的只留第一个，其余记 rejected
5. **`allomorphs` 必须非空数组**
6. **`meaningCn` 里的汉字数必须在 1–8 之间**
   - ⚠️ **不要自己写汉字计数器**。用现成的：
     ```js
     import { countHanzi } from '../src/domain/contentRules.ts'
     ```
     （注意：**必须带 `.ts` 扩展名**，不带会报 `ERR_MODULE_NOT_FOUND`）
   - 让它报错而不是你自己数，这样闸门和测试用的是同一份实现
7. **`meaningCn` 里不能有拉丁字母**：`/[A-Za-z]/.test(meaningCn)` 必须为 false
8. **`level` 必须是 1–5 的整数**
9. **`type` 必须是 `root` / `prefix` / `suffix` 之一**；`color` 必须和 type 对应
   （prefix=`blue`、root=`orange`、suffix=`green`）

## 4.3 那 40 条冲突怎么裁决（**这是这一步最需要动脑的地方**）

10 号脚本在 `roots.candidates.json` 的每条上留了 `variants` 和 `conflicts` 字段。两类冲突：

**第一类：同形异义**（同一个 id 有两种不同含义）
例子：`-al1` 是形容词后缀、`-al2` 是名词后缀；`cap` 是「头」也是「抓」；`cur` 是「关心」也是「跑」。

**裁决办法**：
- 11 号已经问过 LLM 该选哪个，答案在 `chosenVariant`（下标）
- 取 `variants[chosenVariant]` 那条的 `glossEn`，确认最终的 `meaningCn` 说的是这个意思
- 把被放弃的义项**记录到 rejected 文件**里，附理由「同形异义，取了另一个义项」
- **不要因为处理不了就把整条丢掉**——这些里面 `cap`、`cur`、`al` 都是常用词素

**第二类：type 冲突**（不同来源对同一 id 的词性判断不同）
例子：`ac` 一边说 root 一边说 prefix；`ad` 一边说 prefix 一边说 suffix。

**裁决办法**：**一律以 ECDICT 为准**（因为它是唯一许可干净、且结构完整的来源）。
在 rejected 文件里记一条「type 冲突，按 ECDICT 判定为 X」。

**如果某个 id 你实在判断不了**：写进 `roots.rejected.json`，理由写「来源冲突无法自动裁决，需人工」，
然后在最后汇报时告诉用户「有 N 条需要人工判断」。**不要猜。**

## 4.4 词根数量的说明

现在有 **406 个词根**，目标约 **300**。

**不要在这一步硬砍到 300。** 多余的词根会在第 5 步（选词）被自然淘汰——
「这个长不出 ≥3 个 CET 常用词」的词根会被丢掉。这是计划书定的策略。

## 4.5 跑完自检

```bash
cd "D:/AIGAME/背单词" && node -e '
const v=require("./scripts/.work/derived/roots.validated.json");
const r=require("./scripts/.work/derived/roots.rejected.json");
const entries=v.entries||v;
console.log("通过:", entries.length);
const byType={root:0,prefix:0,suffix:0};
entries.forEach(e=>byType[e.type]++);
console.log("  词根",byType.root,"前缀",byType.prefix,"后缀",byType.suffix);
console.log("拒绝:", (r.entries||r).length);
console.log("  拒绝原因分布:");
const reasons={};
(r.entries||r).forEach(e=>{const k=(e.reason||"?").slice(0,20); reasons[k]=(reasons[k]||0)+1});
Object.entries(reasons).sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([k,n])=>console.log("   ",n,k));
'
```

**期望**：通过数在 450–560 之间，词根 350–420 之间。
**如果通过数少于 300**：说明规则写太严了，去检查第 4.2 节哪条实现错了。

---

# 第 5 步 · 写 `scripts/13-glossary-llm-review.mjs`（换模型对抗式复核）

## 5.1 这一步做什么

**用一个和生成器不同的模型**重新审一遍词根表，专门找毛病。

- 输入：`scripts/.work/derived/roots.validated.json`
- 输出：`scripts/.work/derived/roots.reviewed.json` + 有问题的进 `.work/quarantine/`

## 5.2 实现要点

**必须用不同的模型。** 代码里已经准备好了：

```js
import { chatJson, mapBatches, MODELS, reportUsage } from './lib/llm.mjs'
// MODELS.generator 是生成用的，MODELS.reviewer 是复核用的，两个不是同一个模型
```

**提示词必须写成对抗式的**（中文）：

```
你是一个严格的审校员。你的任务是**找出下面每一条词素释义的缺陷**。
默认倾向于报告问题——如果拿不准，就报 suspect，不要报 ok。

逐条检查：
1. meaningCn 说的意思和英文义项（glossEn）对得上吗？
2. meaningCn 是不是太宽泛、或者根本是另一个词素的意思？
3. displayText 的连字符位置对吗？（前缀结尾带 -、后缀开头带 -、词根都不带）
4. level 合理吗？1=初中见到、5=六级才见到
5. etymologyZh 里说的来源语言和 origin 字段一致吗？有没有编造细节？

只输出 JSON：{"results":[{"id":"...","verdict":"ok|suspect|reject","issue":"...","correctedMeaningCn":"..."}]}
verdict 只能是 ok / suspect / reject 三个值之一。
results 必须和输入一一对应，id 原样返回。
```

**批量**：20 条一批。

**裁决规则**：
- `ok` → 进 reviewed，正常出货
- `suspect` → 进 reviewed 但打上 `reviewFlag`，最后汇报时统计
- `reject` → 进 `.work/quarantine/词根/`，**不进 reviewed**

⚠️ **绝对不要自动采用模型给的 `correctedMeaningCn`。** 那样等于绕过了 12 号的确定性规则。
如果确实要采纳某条修正，必须**改完之后重新跑一遍 12 号规则**。

## 5.3 跑完自检

```bash
cd "D:/AIGAME/背单词" && node -e '
const r=require("./scripts/.work/derived/roots.reviewed.json");
const e=r.entries||r;
console.log("复核后:", e.length);
console.log("被打 flags 的:", e.filter(x=>x.reviewFlag).length);
const fs=require("fs");
const dir="scripts/.work/quarantine";
if(fs.existsSync(dir)) console.log("隔离区文件:", fs.readdirSync(dir,{recursive:true}).length);
'
```

**期望**：`reject` 的条目在 **5% 以内**（即 20–30 条）。
**如果超过 20%**：要么是模型太苛刻，要么是 11 号生成质量真的差。**停下来告诉用户。**

---

# 第 6 步 · 写 `scripts/20-select-words.mjs`（选词）

## 6.1 这一步做什么

从 ECDICT 的 77 万个词里，挑出**适合放进游戏的词**。
**Stage 1 只要 60 个词 / 20 个词根。**

- 输入：`roots.reviewed.json` + `ecdict.csv` + `morphynet-eng-derivational.tsv`
- 输出：`.work/derived/words.candidates.json`

## 6.2 筛选条件

一个词要入选，必须**同时**满足：

1. **在考试词表里**：`tag` 字段包含 `zk`/`gk`/`cet4`/`cet6` 之一
2. **能对上已接受的词根**：MorphyNet 的派生关系里能推出来它的切分包含某个已接受的词根
3. **能完整切分**：切出来的所有词素都在 `roots.reviewed.json` 里（允许词尾有残留，但残留必须在
   `scripts/gates/residue-allowlist.json` 里）
4. **是常用词**：`collins` 或 `oxford` 字段非空，或者 `bnc`/`frq` 排名在前 20000

## 6.3 排序打分

```
分数 = (有 collins 加 3 分) + (有 oxford 加 2 分) + (cet4/gk/zk 加 2 分，cet6 加 1 分) - (排名惩罚)
排名惩罚 = 如果 bnc > 0，用 log10(bnc)；如果 bnc = 0（没有排名），用 6（最差）
```

⚠️ **`bnc` 和 `frq` 为 0 表示「没有排名」，不是「第 0 名」。** 排序时必须当最差处理，
否则一堆生僻词会排到前面。

## 6.4 每个词根必须「两端都有人」（**这是头号风险**）

计划书点名的最大风险就在这：**每个词根必须至少有一个 `difficulty-1` 的词和一个 `difficulty-5` 的词。**

如果某个词根做不到，**把整个词根丢掉**，不要给它编难度。

**为什么**：`src/domain/logic.ts` 里简单词熟练度涨 1.5 倍、难词涨 0.5 倍。
只有 difficulty-3 的词根会让奖励曲线变平；一个 difficulty-1 都没有的词根永远不会触发
「每词涨 18%」那档。有测试断言两个方向都存在。

**difficulty 怎么定**：
- `difficulty 1`：zk / gk 标签，或 collins 5 星，或 bnc 前 3000
- `difficulty 5`：cet6 / toefl 标签且 bnc 排名靠后（>10000 或没有排名）
- `difficulty 3`：其余

## 6.5 Stage 1 的取法

先按上面筛完，然后**人工挑出 20 个词根和它们家族里最好的 60 个词**。
优先保证 `spec` / `dict` / `port` / `vid` 这四个在（第 8 步要做差分测试）。

**怎么人工挑**：脚本先输出全部候选，然后你在脚本里写一个显式的 id 白名单（Stage 1 专用），
跑出来看结果。不要写成「取前 60 个」——那样每次重跑结果可能不一样。

## 6.6 跑完自检

```bash
cd "D:/AIGAME/背单词" && node -e '
const d=require("./scripts/.work/derived/words.candidates.json");
const w=d.words||d;
console.log("候选词:", w.length);
const roots=new Set(); w.forEach(x=>x.parts.forEach(p=>roots.add(p.morphemeId)));
console.log("覆盖词根:", roots.size);
const d1=w.filter(x=>x.difficulty===1).length, d5=w.filter(x=>x.difficulty===5).length;
console.log("difficulty 1:", d1, " 5:", d5);
const bad=w.filter(x=>x.parts.some(p=>!/^[a-z]+$/.test(p.morphemeId)));
console.log("切分里出现非法 morphemeId:", bad.length);
'
```

**期望**：候选词 60 个，覆盖词根 20 个，`difficulty 1` 和 `5` 都大于 0，非法 morphemeId 为 0。

---

# 第 7 步 · 写 `scripts/21-split-morphemes.mjs`（切分器，**最容易做错**）

## 7.1 这一步做什么

把每个词切成词素序列。

- 输入：`words.candidates.json` + `morphynet-eng-derivational.tsv` + `cigen-roots_affixes.json`
- 输出：`.work/derived/words.split.json`

## 7.2 核心思路：**链式推导**

MorphyNet 只给「词 + 一个词素 → 派生词」这一层关系，**不给完整切分**。要链起来：

```
spect → inspect   （前缀 in）
inspect → inspection （后缀 ion）
所以 inspection = in + spect + ion
```

**算法**：
1. 从我们的词根表里挑一个词根 `R` 作为「种子」（比如 `spect`）
2. 从 MorphyNet 里找所有 `源词 = R` 的行，得到一层派生
3. 对每个派生词再找 `源词 = 派生词` 的行，得到二层派生，以此类推
4. 一路记录用到的词素和顺序
5. 目标词必须在这条链上，或者本身就是链上的节点

## 7.3 硬性校验（**不过就丢词，绝不修复**）

1. **拼起来必须等于原词**（扣掉白名单里的残留）：
   ```js
   const assembled = parts.map(p => p.surface).join('').toLowerCase()
   const target = word.word.toLowerCase()
   if (assembled !== target) {
     // 残留必须在 scripts/gates/residue-allowlist.json 里，且必须是词的「前缀」
     if (!target.startsWith(assembled)) throw new Error("切分对不上")
   }
   ```
   **这是最便宜也最强的反幻觉闸门。**

2. **每个 `surface` 必须在对应词素的 `allomorphs` 里**
   （`allomorphs` 来自 `roots.validated.json`，加上 ECDICT 键里逗号后面的同源变体）

3. **每个词至少有一个 `type === 'root'` 的 part**
   - 少了它，`src/domain/logic.ts` 的 `getRootId` 会退回 `parts[0]`（往往是个前缀），
     结算时找不到进度记录，**静默给 0 经验**

4. **`parts[i].position === i`**

## 7.4 用 cigen 交叉验证

`cigen-roots_affixes.json` 的 `entries[].components` 是**人工切分**，可以当第二意见：

```js
// cigen 里筛选条件的写法
const hit = cigen.entries.find(e => e.word === word.word)
// 例：acentric → [{morpheme:"a",hint:""},{morpheme:"centric",hint:"中心的"}]
```

**如果你切出来的和 cigen 不一致**：记进报告的「切分分歧」清单，**以你的链式推导为准**
（cigen 的中文 hint 质量不可靠，但它的**切分位置**是人工做的，有参考价值）。
分歧超过 20% 时停下来告诉用户。

## 7.5 跑完自检

```bash
cd "D:/AIGAME/背单词" && node -e '
const d=require("./scripts/.work/derived/words.split.json");
const w=d.words||d;
console.log("切好的词:", w.length);
let bad=0;
w.forEach(x=>{
  const a=x.parts.map(p=>p.surface).join("").toLowerCase();
  if(a!==x.word.toLowerCase()){ bad++; console.log("  对不上:",x.word,"→",a); }
});
console.log("拼不上的:", bad);
console.log("没有 root part 的:", w.filter(x=>!x.parts.some(p=>p.type==="root")).length);
w.slice(0,10).forEach(x=>console.log(" ", x.word, "→", x.parts.map(p=>p.morphemeId).join(" + ")));
'
```

**期望**：`拼不上的: 0`，`没有 root part 的: 0`。

---

# 第 8 步 · 写 `scripts/22-choose-examples.mjs`（选例句）

## 8.1 这一步做什么

给每个词配一句**英文例句 + 中文翻译**，从 Tatoeba 里捞真实的人工译文，不要 AI 编。

- 输入：`words.split.json` + `links.csv` + 两个 sentences 文件
- 输出：`.work/derived/words.examples.json`

## 8.2 ⚠️ 性能警告：先建 SQLite 索引

`links.csv` 有 **2843 万行 / 434 MB**。**不要每次都在内存里线性扫描**，会跑到天荒地老。

Node 22.20 内置了 SQLite，**实测可用**，不需要装任何依赖：

```js
import { DatabaseSync } from 'node:sqlite'   // 会有个 experimental 警告，正常
const db = new DatabaseSync('scripts/.work/tatoeba.db')
db.exec('CREATE TABLE IF NOT EXISTS links (a INTEGER, b INTEGER)')
// 用事务批量插入，不然 2843 万行会插到明年
db.exec('BEGIN')
const insert = db.prepare('INSERT INTO links VALUES (?, ?)')
for (const line of linksLines) {
  const [a, b] = line.split('\t')
  insert.run(Number(a), Number(b))
}
db.exec('COMMIT')
db.exec('CREATE INDEX idx_a ON links(a)')
```

**这个索引只在第一次运行时建**，之后直接打开 `tatoeba.db` 用。判断方式：
```js
if (existsSync('scripts/.work/tatoeba.db')) { /* 直接用 */ } else { /* 建 */ }
```

## 8.3 选句规则

对每个词，从英文句子里找满足全部条件的：

1. 句子**包含这个词**（整词匹配，或 ECDICT `exchange` 里列的变位形式）
2. 英文句子 **4–20 个词**（太短没上下文，太长读不动）
3. **有中文译文**（通过 `links.csv` 能找到对应的 cmn 句子）
4. 中文译文里**不含拉丁字母**（出厂规则要求）
5. **没有专名**（大写开头的词出现两次以上、或含 `Mr.`/`New York` 这类，跳过）
6. 取**最短的**那句

**记录 `sentenceId`**（英文和中文的都要），后面做署名用（Tatoeba 是 CC BY 2.0 FR，要求署名）。

## 8.4 找不到例句怎么办

计划书允许 LLM 兜底写。但**标记出来**：给这些词打 `exampleSource: "llm"`，
后面 60 号复核时对这些要查得更严。

**Stage 1 的 60 个词如果超过 20 个要靠 LLM 兜底**：停下来告诉用户，
说明 Tatoeba 对 CET 词表覆盖不足，需要调整策略。

## 8.5 跑完自检

```bash
cd "D:/AIGAME/背单词" && node -e '
const d=require("./scripts/.work/derived/words.examples.json");
const w=d.words||d;
console.log("有例句的:", w.length);
console.log("  来自 Tatoeba:", w.filter(x=>x.exampleSource!=="llm").length);
console.log("  LLM 兜底:", w.filter(x=>x.exampleSource==="llm").length);
const noEn=w.filter(x=>!x.exampleEn.toLowerCase().includes(x.word.toLowerCase()));
console.log("  英文例句里没有该词的:", noEn.length);
noEn.slice(0,5).forEach(x=>console.log("    ",x.word,"|",x.exampleEn));
const hasLatin=w.filter(x=>/[A-Za-z]/.test(x.exampleCn));
console.log("  中文例句里含英文的:", hasLatin.length);
hasLatin.slice(0,5).forEach(x=>console.log("    ",x.word,"|",x.exampleCn));
'
```

**期望**：`英文例句里没有该词的: 0`，`中文例句里含英文的: 0`。

---

# 第 9 步 · 写 `scripts/30-llm-prose.mjs`（LLM 生成文案）

## 9.1 这一步做什么

生成每课的「画面句」和「三选一干扰项」。**这是唯一必须生成的部分**——
没有任何数据集有「字面画面」和「怎么记」这种字段。

## 9.2 输入输出的形状

**给模型的输入是 JSON 对象，不是散文**：

```json
{ "word": "circumspect", "phonetic": "/ˈsɜːrkəmspekt/", "partOfSpeech": "adj.",
  "modernMeaningCn": "谨慎的；周详的",
  "parts": [{"morphemeId":"circum","surface":"circum","meaningCn":"周围"},
            {"morphemeId":"spec","surface":"spect","meaningCn":"看"}],
  "exampleEn": "She was circumspect about making promises.",
  "exampleCn": "她对做出承诺一事十分谨慎。" }
```

## 9.3 提示词契约（**照抄计划书，一条都不能漏**）

写进系统提示词的中文硬约束：

1. **`parts` 是冻结的、权威的。** 不许增删改序、不许重新切分、不许提到列表外的词素。
2. `literalMeaningCn`：**只用给定的 `meaningCn` 按顺序组成的画面句**，≤12 汉字，无拉丁字母，
   **不得**是 `modernMeaningCn` 的复述。
3. `metaphorMeaningCn`：≤20 汉字，从 `literalMeaningCn` 推出来，但不得与之逐字相同。
4. `metaphorOptions`：**恰好 3 个**，`[0]` 是正确答案。`[1]` 必须复用**本词自己某个词素** +
   从全局义项池里取的**错误**中文释义；`[2]` 是合理的无关画面。各 ≤20 汉字，无拉丁字母。
5. `mnemonicNote` ≤40 汉字且必须含字面画面；`sourceNote` ≤60 字。
6. **`sourceNote` 只有在给了词源材料时才可以用「来自/源自/拉丁语」。** 否则写成「构词逻辑」。
7. 逃生舱：`{"reject": true, "reason": "…"}`——当 ECDICT 释义与词素义矛盾时用它。

**结构上最关键的一点：模型永远不会被要求产出 `id`、`parts`、`difficulty`、`familyWordIds`、`distractors`。**
切分没法被幻觉，因为模型根本没机会写切分。只有文案会错，而文案由第 11 步的复核管。

## 9.4 技术要点

- **每批 10 个词**（失败只损失 10 个）
- **temperature 0**
- **逐词落盘**，方便断点续跑
- 走 `scripts/lib/llm.mjs` 的 `chatJson`，自动有缓存和重试
- 模型用 `MODELS.generator`
- 用 `mapBatches(words, 10, worker, 4)`

## 9.5 跑完自检

```bash
cd "D:/AIGAME/背单词" && node -e '
const {countHanzi}=await import("./src/domain/contentRules.ts");
const d=require("./scripts/.work/derived/words.prose.json");
const w=d.words||d;
console.log("生成文案:", w.length);
const badLim=w.filter(x=>countHanzi(x.literalMeaningCn)>12);
console.log("literalMeaningCn 超 12 字:", badLim.length);
const badOpt=w.filter(x=>!Array.isArray(x.metaphorOptions)||x.metaphorOptions.length!==3);
console.log("metaphorOptions 不是 3 个:", badOpt.length);
const latin=w.filter(x=>/[A-Za-z]/.test(x.literalMeaningCn+x.metaphorMeaningCn+x.metaphorOptions.join("")));
console.log("文案里含拉丁字母:", latin.length);
' --input-type=module 2>/dev/null || echo "（上面这句如果报错，就写成临时 .mjs 文件再跑）"
```

**期望**：三个数字全是 0。

---

# 第 10 步 · 写 `scripts/40-assemble.mjs`（组装产物）

## 10.1 这一步做什么

把所有中间产物拼成出厂格式，写进 `src/domain/content/`。

- 输入：`.work/derived/` 下所有文件 + `overrides/` 目录
- 输出：`src/domain/content/*.json` + `.work/derived/provenance.json`

## 10.2 组装器负责算的东西（**模型不产出这些**）

- `id`：就是 `word` 本身，小写
- `difficulty`：第 6 步定的
- `familyWordIds`：和本词共享至少 1 个 `morphemeId` 的其他词，长度 2–8
- `distractors`：3–5 个，三种来源
  - `form` = 与本词某段共享 ≥3 字符前缀、但 id 不同的词素
  - `meaning` = `meaningCn` 落在同一个中文语义簇、但 id 不同的词素
  - `random` = **定种子随机**取（种子固定，保证每次重跑产物一样）
  - 取完再对 `parts[].surface` 过滤一遍
- **写 `provenance.json` 边车**：这张文件的存在就是「这是管线生成的内容」的标志，
  `scripts/validate-content.mjs:31` 靠它决定启不启用需要 provenance 的那批规则

## 10.3 ⚠️ `overrides/` 必须是**最后**一步套用

创建 `scripts/overrides/` 目录，把**现在手写的 16 个 canary 词的完整数据**存成 JSON：

```
scripts/overrides/
  circumspect.json
  inspection.json
  respect.json
  circumspection.json
  predict.json
  prediction.json
  predictable.json
  predictive.json
  portable.json
  import.json
  report.json
  porter.json
  visible.json
  vision.json
  revise.json
  visibility.json
```

**怎么做**：从当前的 `src/domain/data.ts` 里把这 16 个词的数据原样抄出来，
每个存一个 JSON 文件。然后用 40 号脚本在**生成完所有词之后**，用这些 JSON **覆盖**对应的词。

**为什么必须这么做**：这 16 个词是仓库里**唯一的人工内容**，是整条管线的回归锚点。
重新生成会毁掉它们。覆盖必须发生在最后，否则会被后续步骤改写。

**验证方法**（第 12 步会用到）：重新生成后，这 16 个词的每一个字段都必须和覆盖前逐字节相同。

## 10.4 产物格式

**用 JSON 不要用 TS 字面量**（生成的代码不能含代码、要能 diff）。
`tsconfig.app.json` 里已经有 `"resolveJsonModule": true`。

放 `src/domain/content/`，`src/domain/data.ts` 保持为薄包装层——
这样 `App.tsx`、测试、`validate-content.mjs` 的 import 路径**全都不用改**。

⚠️ **Stage 1 先不要做懒加载分片**（计划书说那是 Stage 3 的事）。
Stage 1 直接产出一个 `words.json`，`data.ts` 读它就行。

## 10.5 跑完自检

```bash
cd "D:/AIGAME/背单词" && npm run validate:content 2>&1 | tail -20
```

**期望**：`内容校验通过`，且**不再打印「跳过 A12/A19/A21/A27」**（因为有 provenance 了）。

---

# 第 11 步 · 写 `scripts/60-llm-review-content.mjs`（第二个 AI 复核）

## 11.1 这一步做什么

**用和生成器不同的模型**，在**组装后的产物**上做对抗式复核。
（注意是组装后，不是生成器输出上——这样才能抓到切分器和组装器的 bug。）

## 11.2 要点

- **每批 8 个词**，并发 4–6，走 `lib/llm.mjs` 的缓存
- 模型用 `MODELS.reviewer`（和 30 号不同）
- **给复核者什么**：冻结的 `parts` + 词素义、`word`、`phonetic`、`partOfSpeech`、
  `modernMeaningCn`、ECDICT 原始 `translation`、待审文案、例句对
- **不给生成器的推理过程**，且提示词要写成对抗式：「你的任务是找出缺陷，默认倾向于报告」

## 11.3 强制返回的 schema（逐词）

```json
{ "id": "circumspect",
  "checks": { "splitMatchesWord": true, "splitMatchesEtymology": true,
    "literalComposedFromGlosses": true, "metaphorExtendsLiteral": true,
    "optionsThreeDistinct": true, "optionAIsCorrectAnswer": true,
    "optionBWrongForStatedReason": true, "optionCWrongForStatedReason": true,
    "exampleEnContainsWord": true, "exampleCnTranslatesExampleEn": true,
    "sourceNoteConsistentWithEtymology": true, "mnemonicFreeOfAnswerLeak": true,
    "noInventedMorpheme": true },
  "severity": "ok | minor | major",
  "issues": [{ "field": "metaphorOptions[1]", "problem": "…", "suggestedFix": "…" }] }
```

## 11.4 路由规则

| severity | 处理 |
|---|---|
| `major` | 写进 `.work/quarantine/<日期>/<id>.json`，**该词永不出货**。组装器带排除清单重跑 |
| `minor` | 正常出货，计入报告 |
| `ok` | 正常出货 |

- 只对标记过的词做第二轮修复请求。**修完的文本必须重新过一遍第 4 步的规则闸门才能写回。**
- **规则和复核冲突时，规则赢**（确定性优先），但要记进报告，这样跨轮次的模型漂移看得见。

## 11.5 ⚠️ 漂移探测器（计划书要求，别漏）

用**完全相同的输入**对 **2% 的随机样本**重跑生成器，测结果不一致率。
**超过 5% 就判定提示词不稳定，阻断发布。**

**这是没有人读英文时唯一能发现 LLM 漂移的机制。** 不实现它，就没有任何东西能发现
「同一个词昨天生成的是 A、今天是 B」。

**怎么实现**：
```js
// 把 30 号的提示词和输入原样重放一遍，但绕过缓存（设 RD_NO_CACHE=1 或单独传参数）
// 比较两次输出的 meaningCn / metaphorOptions 是否一致
```

---

# 第 12 步 · 写 `scripts/70-report.mjs` + 接进 npm

## 12.1 报告内容

写到 `.work/report.md`：

- 每个词根的**覆盖度**（有几个词）
- 每个词根的**难度分布**（有没有 difficulty-1 和 difficulty-5）
- **隔离率**（被复核判 major 的比例）
- **体积检查**（产物 JSON 的 gzip 大小）
- **切分分歧**（和第 7 步的 cigen 交叉验证结果）
- **本次花销**

## 12.2 加进 `package.json`

在 `scripts` 段加：

```json
"content:all": "node scripts/10-build-roots.mjs && node scripts/11-glossary-llm-clean.mjs && node scripts/12-glossary-rules.mjs && node scripts/13-glossary-llm-review.mjs && node scripts/20-select-words.mjs && node scripts/21-split-morphemes.mjs && node scripts/22-choose-examples.mjs && node scripts/30-llm-prose.mjs && node scripts/40-assemble.mjs && node scripts/50-validate-content.mjs && node scripts/60-llm-review-content.mjs && node scripts/70-report.mjs"
```

⚠️ **每一步结束都必须能全量重跑**：

```bash
rm -rf scripts/.work/derived && npm run content:all
```

**只能增量跑的管线不算可复现，而可复现是用户读不了英文时唯一的替代品。**

---

# 第 13 步 · Stage 1 验收（六条，全都要过）

## 13.1 三条自动验收

```bash
cd "D:/AIGAME/背单词" && npm test && npm run validate:content && npm run build
```

| # | 标准 | 怎么验 |
|---|---|---|
| 1 | 所有闸门绿 | `npm run validate:content` 输出「内容校验通过」且 0 错误 |
| 2 | 隔离 ≤2 个词且有书面理由 | 数 `.work/quarantine/` 下的文件，每个都要有 `reason` |
| 3 | 记录 gzip 体积 | `npm run build` 看输出的 kB 数，记进报告 |

## 13.2 三条关键验收（**这才是 Stage 1 成不成的判据**）

### (a) 四个家族的差分测试

**重新生成** `spec` / `dict` / `port` / `vid` 四个家族，
断言生成的 `parts` 的 **morphemeId 和顺序** 和**手写版完全一致**。

**为什么这条最重要**：它是切分器对人工作品的差分测试。手写的 16 个词是已知正确的，
如果切分器切出来不一样，就说明切分器有 bug——**而不是说手写版错了**。

**怎么做**：写一个测试，把两边都读进来逐个对比。

### (b) 16 个 canary 词逐字节存活

```bash
cd "D:/AIGAME/背单词" && npm run validate:content 2>&1 | grep -i canary
```

`scripts/validate-content.mjs:42` 里硬编码了 16 个词 id，缺任何一个都会报错。
**这 16 个词的每一个字段都必须和覆盖前完全相同**（靠第 10 步的 `overrides/` 保证）。

### (c) 残留白名单只剩一条

```bash
cd "D:/AIGAME/背单词" && cat scripts/gates/residue-allowlist.json
```

**期望**：只有 `porter` 的 `-er` 一条（Stage 1 补上 `-er` 之后这条应该删掉）。

## 13.3 实机验证（用 Playwright MCP）

走一遍：**今天 → 拼单词（含发音）→ 复习配对 → 词根地图 → 新手帮助**，
在 **1440×900 和 390×844** 两个尺寸各截图。

⚠️ **给 Playwright 塞测试档案的坑**：应用会在 `pagehide` 把内存里的档案写回 localStorage，
所以「先 `evaluate` 写 localStorage 再 reload」会被覆盖。**必须用 `addInitScript`**，
让种子在应用启动前落下。

---

# 第 14 步 · 更新文档

做完之后更新 `docs/AI交接说明.md`：

- 把「Stage 1 未开始」改成实际状态
- 记录实际花销
- 记录遇到的、文档里没写的新坑
- 更新「未决事项」那一节

**然后告诉用户**：
- 60 个词 / 20 个词根跑通了没有
- 隔离了几个词、为什么
- 花了多少钱
- 下一步（Stage 2）需要他决定什么

---

# 附录 A · 通用的调试手法

## A.1 看 JSON 产物

```bash
cd "D:/AIGAME/背单词" && node -e '
const d=require("./scripts/.work/derived/你要看的文件.json");
console.log("顶层键:", Object.keys(d));
const arr = d.entries || d.words || d;
console.log("条数:", arr.length);
console.log("第一条:", JSON.stringify(arr[0], null, 2).slice(0, 1500));
'
```

## A.2 找出产物里的异常条目

```bash
cd "D:/AIGAME/背单词" && node -e '
const d=require("./scripts/.work/derived/words.split.json");
const w=d.words||d;
// 把条件换成你要查的
const bad = w.filter(x => x.parts.some(p => !p.surface));
console.log("异常条数:", bad.length);
bad.slice(0,20).forEach(x=>console.log(" ", x.word));
'
```

## A.3 检查 LLM 缓存和花销

```bash
cd "D:/AIGAME/背单词" && echo "缓存的批次数:" && ls scripts/.work/llm-cache/ 2>/dev/null | wc -l
```

**缓存没用了**（想强制重调）：加环境变量
```bash
RD_NO_CACHE=1 node scripts/11-glossary-llm-clean.mjs
```
⚠️ **这会重新花钱。** 除非改过提示词，否则不要用。

## A.4 换模型

```bash
RD_MODEL_GENERATOR=deepseek/deepseek-chat RD_MODEL_REVIEWER=google/gemini-2.5-flash node scripts/30-llm-prose.mjs
```

⚠️ **生成器和复核器必须是不同的模型**，否则「第二个 AI 复核」就退化成了自我确认。

---

# 附录 B · 网络问题的排查

## B.1 下载失败

| 地址 | 症状 | 换用 |
|---|---|---|
| `raw.githubusercontent.com` | 大文件超时（HTTP 000） | 套 `https://ghproxy.net/` 前缀 |
| `cdn.jsdelivr.net` | HTTP 403 | 文件超过 20 MB，改用 ghproxy |
| 都很慢 | | 改用 `codeload.github.com/<owner>/<repo>/tar.gz/refs/heads/<branch>` 下整包 |

## B.2 判断文件下没下坏

```bash
cd "D:/AIGAME/背单词/scripts/.work/raw" && ls -la
```

对照第 1.3 节的大小表。**明显偏小的就是断流了，删掉重下。**

## B.3 解压相关

- **Node 内置的 `zlib` 不认 bzip2**。遇到 `.bz2` 必须用系统的 `bunzip2`
- 本机可用：`tar`、`bunzip2`、`unzip`、`xz`，7-Zip 在 `C:\Program Files\7-Zip\7z.exe`
- `tar -xjf xxx.tar.bz2` 一步解出内容

---

# 附录 C · 一个完整的「出问题怎么办」流程

**不管遇到什么问题，按这个顺序做**：

1. **读错误信息**。Node 的报错会指出文件名和行号。
2. **看是哪个脚本出的错**。管线是线性的，前面的产物坏了后面必崩。
3. **检查输入产物在不在、空不空**（用附录 A.1 的写法）。
4. **重跑上一个脚本**，大多数问题是偶发的（网络、LLM 抖动）。
5. **对照本文档的「期望看到」**，看差在哪。
6. **还是解决不了**：
   - **如果是钱的问题**（花销异常、余额不足）→ **立刻停下来问用户**
   - **如果是数据的问题**（格式和文档不符、大小不对）→ 停下来问用户
   - **如果是代码的问题**（语法错、逻辑错）→ 可以自己修，但要保证 `npm test` 仍然 49 个通过
   - **其余情况** → **停下来问用户**，不要自己发明做法

**改代码之后永远要跑这三条**：

```bash
cd "D:/AIGAME/背单词" && npm test && npm run validate:content && npm run build
```

**这三条是绿的，你才没有把项目搞坏。**
