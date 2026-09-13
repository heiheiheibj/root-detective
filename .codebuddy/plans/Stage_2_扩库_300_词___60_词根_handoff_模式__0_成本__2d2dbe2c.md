---
name: Stage 2 扩库：300 词 / 60 词根（handoff 模式，$0 成本）
overview: 从 67 词/20 词根扩到 300 词/60 词根。全程 handoff 模式（执行 AI 写静态数据，不用 OpenRouter，$0 成本），先跑词根供给分析定 go/no-go，再写 stage2 配置与四份 handoff 数据，最后全链路重跑过闸门、适配测试、实机验证。
todos:
  - id: supply-analysis
    content: 写供给分析脚本，统计 563 候选词素的 d1/d5 供给，定 60 词根清单或降目标
    status: completed
  - id: stage2-config
    content: 写 stage2-content.json：60 家族 + ~300 词 + 全部切分 + 词素全表 + ~12 世界
    status: completed
    dependencies:
      - supply-analysis
  - id: pipeline-adapt
    content: 参数化 20 号脚本读 stage2 配置，TARGET_WORD_COUNT 与 WorldId 生成化适配
    status: completed
    dependencies:
      - stage2-config
  - id: handoff-data
    content: 扩 handoff 四件套：词素释义、~284 词 prose、例句兜底、300 词复核数据
    status: completed
    dependencies:
      - stage2-config
  - id: credits-minor
    content: 补 CREDITS.md + license-manifest.json，修 century/envision/voice 三个 minor
    status: completed
  - id: full-rerun
    content: 全链路重跑 content:all，闸门全绿，两次重跑逐字节一致
    status: completed
    dependencies:
      - pipeline-adapt
      - handoff-data
      - credits-minor
  - id: test-verify
    content: 适配测试与 build（gzip 预算内），用 [skill:playwright-cli] 实机两尺寸验证全玩法
    status: completed
    dependencies:
      - full-rerun
---


## 用户需求
执行词库扩容 Stage 2：从 67 词 / 20 词根扩到 **300 词 / 60 词根**。

## 核心要点
- **LLM 策略已定**：handoff 模式——执行 AI 直接写静态数据（`scripts/lib/handoff/*.json`），不调 OpenRouter，**$0 成本**。管线脚本优先读 handoff 文件，架构两边兼容，将来想切真 LLM 无需改代码
- **先跑供给分析再定目标**：60 个词根每个都要「≥3 词且 d1/d5 各≥1」（A23 闸门），CET 词表可能供不上；凑不齐就按计划书风险 #4 降目标（丢词根），不硬凑、不按词根相对难度分档
- **质量闸门不放松**：隔离率 <5%、canary 16 词逐字节存活、专名过滤、A28 元话语拦截、两次重跑逐字节一致
- **顺手补遗留**：CREDITS.md + license-manifest.json（许可红线，Stage 2 前必须补）、修 3 个 minor（century/envision 字面义、voice 变体）
- **验收**：`npm run content:all` 全绿、53+ 测试通过、build gzip 在预算内、Playwright 实机两尺寸走完全部玩法



## Tech Stack
- 现有栈零新增：Node v22.20.0 + `.mjs` 管线脚本 + vitest + Vite/React（产物层不动）
- 数据源：`scripts/.work/raw/ecdict.csv`（77 万词，选词/难度打分）、Tatoeba（例句）、`roots.candidates.json`（563 候选词素）
- handoff 静态数据：`scripts/lib/handoff/`（roots-llm.json / words-prose.json / words-review.json / 例句兜底）

## Implementation Approach
管线 10→70 已在 Stage 1 全量验证，本阶段**不改管线结构，只换配置和数据**：

1. **供给分析先行（go/no-go）**：写一次性分析脚本，对 563 候选词素 × ECDICT 建单遍 Map 索引，统计每个词根能供给的 CET 词数及 d1/d5 分布，产出「能凑齐 A23 的词根清单」。60 个凑不齐就降目标——这是计划书明确的头号未知数，必须在写内容前量出来
2. **配置驱动**：新建 `scripts/lib/stage2-content.json`（结构同 stage1：families + canary + forceInclude + splits + extraMorphemes + worlds），20 号脚本参数化读取（保留 stage1 文件不动，可随时回滚）
3. **handoff 四件套扩容**（工作量主体，执行 AI 逐词写）：
   - `roots-llm.json`：60 词根 + 新前后缀的中文释义（照 12 个手写词素的风格样本）
   - `words-prose.json`：~284 个非 canary 词 × 7 字段（modernMeaningCn 钉死 ECDICT 第一义项、literalMeaningCn 词素义拼接、metaphorOptions 3 个「无关但合理」的画面、mnemonicNote、sourceNote）
   - 例句兜底：Tatoeba 覆盖不到的词（预计 ~90 个）手写，过「无专名」闸
   - `words-review.json`：300 词 × 13 项 checks（机械项脚本算死，语义项执行 AI 判）
4. **常量与类型适配**：`contentRules.ts` 的 `TARGET_WORD_COUNT` 67→实际数；`types.ts` 的 `WorldId` 从 6 字面量闭集改为 `worlds` as const 数组派生（已确认无处穷尽 switch，安全）
5. **闸门密度对冲「运动员兼裁判」风险**：A10~A28 确定性规则不认识谁写的数据，写错照样拦；canary 16 词逐字节存活是硬锚点

## Implementation Notes
- **性能**：ECDICT 77 万行先建 Map 再查（Stage 1 已验证瞬时完成）；大循环禁止套整表扫描
- **环境坑**：PowerShell 下 `node -e` 引号易炸，复杂校验写临时 `.mjs` 再跑；`.mjs` 里 `??` 与 `||` 混用必须加括号
- **回归控制**：stage1-content.json 保留不删（回滚锚）；`PROFILE_VERSION` 不动（normalizeProfile 按 id 重映射已能迁移）；canary overrides 永不重算
- **A28 正则双份同步**：`contentRules.ts` 与 `30-llm-prose.mjs` 两处必须一起改（若需扩规则）
- **40 号已知坑**：canary 的 `familyWordIds` 不重算、干扰项 FNV-1a 种子 + 全局签名去重（Stage 1 修过，别回归）

## Architecture Design
```mermaid
graph LR
    A[供给分析脚本<br/>563 词素 × ECDICT] -->|60 词根清单| B[stage2-content.json<br/>60 家族/300 词/切分/世界]
    B --> C[20 选词 → 21 切分 → 22 例句]
    C --> D[handoff 四件套<br/>roots-llm/words-prose/例句/review]
    D --> E[30 释义 → 40 组装]
    E --> F[60 复核 → 70 报告]
    F --> G[words.json / morphemes.json<br/>+ TARGET_WORD_COUNT + WorldId]
    G --> H[测试适配 + build + 实机验证]
```

## Directory Structure
```
d:\AIGAME\背单词\
├── scripts/
│   ├── lib/
│   │   ├── stage2-content.json        # [NEW] Stage 2 配置：60 家族 + ~300 词 + 切分 + 词素全表 + ~12 世界
│   │   └── handoff/
│   │       ├── roots-llm.json         # [MODIFY] 扩到 60 词根 + 新前后缀中文释义
│   │       ├── words-prose.json       # [MODIFY] 51 → ~284 词 × 7 字段
│   │       ├── words-review.json       # [MODIFY] 67 → 300 词 × 13 checks
│   │       └── words-examples.json    # [MODIFY] 例句兜底扩容（无专名闸）
│   ├── 20-select-words.mjs           # [MODIFY] 参数化读 stage2 配置
│   └── tools/
│       └── supply-analysis.mjs        # [NEW] 供给分析（go/no-go 依据，保留复跑能力）
├── src/domain/
│   ├── contentRules.ts                # [MODIFY] TARGET_WORD_COUNT 67→实际数
│   └── types.ts                       # [MODIFY] WorldId 生成化（worlds as const 派生）
├── src/domain/content/
│   ├── words.json                     # [REGEN] 40 号组装产出
│   └── morphemes.json                 # [REGEN]
├── tests/                             # [MODIFY] 数量断言、下标夹具改 find、向前兼容用例
├── CREDITS.md                         # [NEW] 数据来源许可清单（红线）
└── license-manifest.json              # [NEW] 许可清单机器可读版
```


## Agent Extensions
### Skill
- **playwright-cli**
  - Purpose: Stage 2 收尾实机验证——走完 今天→拼单词(朗读)→猜词义→复习→词根地图→新手帮助 全流程
  - Expected outcome: 1440×900 与 390×844 两尺寸截图确认无回归，60 词根地图页不卡
