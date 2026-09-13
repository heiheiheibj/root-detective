# 数据来源与许可（CREDITS）

本项目的词库内容由下列公开数据源加工生成（管线：`scripts/10`–`70` 号脚本）。
所有中文释义、例句翻译、助记与干扰项文案均为本项目重写，不逐字复制任何来源。

| 来源 | 用途 | 许可 | 备注 |
|---|---|---|---|
| [ECDICT](https://github.com/skywind3000/ECDICT) `ecdict.csv` | 选词池、音标、词性、难度标签（zk/gk/cet4/cet6）、词频（bnc/frq） | MIT | 77 万词；只取词条元数据 |
| ECDICT `wordroot.txt` | 词根候选（英文义项 + 例词）的唯一权威来源 | MIT（随 ECDICT） | 611 条；中文释义全部重写 |
| [Tatoeba](https://tatoeba.org) 例句 + `links.csv` | 例句（英文句 + 中文对照） | CC BY 2.0 FR | 句子按 sentence id 可溯源；无对照的词由 `scripts/lib/handoff/words-examples*.json` 人工补写 |
| [kaikki.org](https://kaikki.org) Wiktionary 抽取 | 词源证据（交叉参考，不直接进入产物） | CC BY-SA 4.0 | 仅用于人工核对词源，产物不含其文本 |
| [MorphoNet / morphynet-eng-derivational](https:// Lombard?) | 派生关系证据（选词参考） | CC BY-SA | 仅用于供给分析，产物不含其数据 |
| cigen `roots_affixes.json` | 词根 id 交叉验证、人工切分证据 | 仓库自称 MIT，但数据源自新东方 PDF（作者无权再授权） | **只取 id 与切分对照，绝不复制其中文释义**；商用前需法律复核 |
| shiweihappy `roots.json` | 同上 | 同上 | 同上 |

## 产物中的文本

- 词素中文释义（`meaningCn`）：参照 wordroot.txt 英文义项由执行 AI 重写。
- 词条文案（字面义/隐喻/助记/来源注）：基于词素义由执行 AI 撰写（`scripts/lib/handoff/`）。
- 干扰项：由组装器从词素义项池机械生成，或由执行 AI 手写（canary 16 词）。

## 商用前待办

- cigen / shiweihappy 的 id 清单沿用需律师复核（见 `docs/扩词库计划.md` §许可）。
- Tatoeba 句子若商用需遵守 CC BY 2.0 FR 的署名要求（保留 sentenceId 可溯源）。
