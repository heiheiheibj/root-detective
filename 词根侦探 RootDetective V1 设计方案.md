# 词根侦探 RootDetective V1 修订版设计方案

> 版本：V1.1  
> 目标：第一版覆盖 100+ 词素，1000+ 单词  
> 核心：让用户看到陌生词，先拆、再猜、后验证。复习词根，不复习单词；单词只是谜题。  
> 本版已吸收反馈：词素变体去重、补齐后缀、语义梯子、分段推义、干扰项、复习分层降级、FSRS 难度权重、数据库增强、Edge-TTS 音频。

---

## 目录

1. 产品定位
2. V1 目标
3. 核心闭环
4. 词素体系重构
5. 后缀体系
6. 主词素总表
7. 核心玩法
8. 语义梯子
9. 推义交互
10. 拆解干扰项
11. 复习系统
12. FSRS 算法修订
13. 数据库设计
14. API 设计
15. 页面结构
16. 技术架构
17. 音频方案
18. 内容生产流程
19. 成就与经济
20. 变现设计
21. 开发里程碑
22. 验收标准
23. 成功指标
24. 风险与对策
25. 总结

---

## 1. 产品定位

**词根侦探：让用户看到陌生词，先拆、再猜、后验证。**

核心体验：

```text
CIRCUMSPECT
  ↓
CIRCUM + SPECT
周围     看
  ↓
从周围观察
  ↓
周详 / 谨慎
```

不是背：

```text
circumspect = 谨慎的
```

而是推理：

```text
circum = 周围
spect = 看
周围 + 看 = 从周围观察 = 周详/谨慎
```

---

## 2. V1 目标

### 内容目标
- 100+ 词素。
- 1000+ 单词。
- 每个核心词根至少 8-10 个家族词。
- 每个单词包含：拆分、词素含义、字面义、隐喻义、现代释义、音标、发音、例句、同族词、干扰项。
- 区分“词源解释”和“助记解释”。
- 词素支持“主词素 + 变体 / 异体形式”。
- 补齐 15 个高频后缀。

### 产品目标
- 用户能完成完整推理闭环。
- 复习时系统给同词根新词，弹药耗尽后降级。
- 用户看到陌生词，第一反应是拆，不是查。
- 核心指标：陌生词猜对率、词根迁移率、7 日留存。

### 技术目标
- 移动端 + PC 端。
- PWA 可安装。
- 支持离线缓存。
- 支持账号同步。
- Edge-TTS 批量生成音频。
- 2-4 周上线 MVP。

---

## 3. 核心闭环

```text
学会词根
  ↓
破解熟悉单词
  ↓
认识更多家族词
  ↓
尝试破解陌生词
  ↓
猜对 → 获得成就
  ↓
复习词根
  ↓
掌握词根
  ↓
解锁新的词根世界
  ↓
循环
```

---

## 4. 词素体系重构

### 4.1 原方案问题

- 同一词源的不同变体被切成独立词素，导致重复复习。
- 缺少后缀，词性无法闭环。
- 复习排程会把 `spect` 和 `spec` 当成两个知识点。

### 4.2 合并清单

| 合并前 | 合并后主词素 | 变体 |
|---|---|---|
| #41 spect + #103 spec | spec | spec, spect, spic |
| #65 manu + #106 man | manu | manu, man |
| #114 vit + #116 viv | viv | viv, vit |
| #58 gress + #73 grad/gress | grad | grad, gress |
| #67 cap/capt/cept + #68 ceiv/cept | cap | cap, capt, cept, ceiv |
| #42 vid + #43 vis | vid | vid, vis |
| #50 mit + #51 miss | mit | mit, miss |
| #51 duc + #52 duct | duc | duc, duct |
| #59 ced + #60 cess | ced | ced, cess |
| #60 cur + #61 curs | cur | cur, curs |
| #61 ven + #62 vent | ven | ven, vent |
| #62 voc + #63 vok | voc | voc, vok |
| #69 ten + #70 tain + #71 tin | ten | ten, tain, tin |
| #70 fin + #71 fini | fin | fin, fini |
| #112 ment + #113 men | ment | ment, men |

### 4.3 主词素 + 变体数据模型

```sql
CREATE TABLE morphemes (
    id VARCHAR(32) PRIMARY KEY,
    display_text VARCHAR(64) NOT NULL,
    type VARCHAR(16) NOT NULL,          -- 'prefix' | 'root' | 'suffix'
    meaning_cn VARCHAR(64) NOT NULL,
    allomorphs TEXT[],
    etymology TEXT,
    level INT DEFAULT 1,
    color VARCHAR(16) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

```json
{
  "id": "spec",
  "display_text": "spec / spect",
  "type": "root",
  "meaning_cn": "看",
  "allomorphs": ["spec", "spect", "spic"],
  "etymology": "拉丁语 specere",
  "level": 2,
  "color": "orange"
}
```

---

## 5. 后缀体系

英语构词法：

```text
前缀（定方向/态度） + 词根（定核心动作/对象） + 后缀（定词性/状态）
```

没有后缀，用户推导出动作后，无法精准落地到最终词义。

### 5.1 V1 必加 15 个高频后缀

| 编号 | 后缀 | 类型 | 核心作用 | 候选例词 |
|---|---|---|---|---|
| S01 | -able / -ible | 后缀 | 形容词：能够…的 / 值得…的 | visible, portable, predictable, credible, flexible |
| S02 | -tion / -sion | 后缀 | 名词：动作、过程或状态 | inspection, introduction, conclusion, admission |
| S03 | -ous / -ious | 后缀 | 形容词：充满…的 / 具有…特性的 | curious, infectious, famous |
| S04 | -ive | 后缀 | 形容词/名词：有…倾向的 / …性质的 | attractive, progressive, assertive, exclusive |
| S05 | -ment | 后缀 | 名词：行为的结果、手段或状态 | government, movement, postponement |
| S06 | -al / -ial | 后缀 | 形容词：与…有关的 | visual, terminal, manual, national |
| S07 | -ize / -ise | 后缀 | 动词：使成为 / …化 | civilize, synchronize, visualize, customize |
| S08 | -ify / -fy | 后缀 | 动词：使…化 / 做成… | clarify, verify, simplify, magnify |
| S09 | -ant / -ent | 后缀 | 形/名：…性质的 / 做…的人或物 | dependent, assistant, student, resident |
| S10 | -er / -or | 后缀 | 名词：从事…的人或工具 | inspector, porter, dictator, conductor |
| S11 | -ist | 后缀 | 名词：…专业人员 / 主义者 | dentist, psychologist, optimist, artist |
| S12 | -ism | 后缀 | 名词：…主义 / 现象 / 学说 | optimism, criticism, patriotism |
| S13 | -ity / -ty | 后缀 | 抽象名词：性质、状态 | visibility, activity, security, legality |
| S14 | -ate | 后缀 | 动/形/名：使… / 具有…的 | duplicate, activate, navigate, passionate |
| S15 | -less | 后缀 | 形容词：无…的 / 缺乏的 | homeless, endless, hopeless, motionless |

### 5.2 后缀颜色

| 类型 | 颜色 |
|---|---|
| 前缀 | 蓝 `#3B82F6` |
| 词根 | 橙 `#F97316` |
| 后缀 | 绿 `#22C55E` |

### 5.3 拆解示例

```text
circumspection
= circum + spect + ion
周围 + 看 + 名词
= 从周围看的状态
= 谨慎、周详
```

```text
circumspect
= circum + spect
周围 + 看
= 从周围看的
= 谨慎的
```

---

## 6. 主词素总表

> 说明：以下为 V1 内容生产主词素清单。  
> 去重后约 129 个词素：40 前缀 + 74 词根 + 15 后缀。  
> 每个词素配置 8-10 个家族词，去重后覆盖 1000+ 单词。  
> 所有词源、拆分、释义需内容审核。

### 6.1 前缀 40 个

| 编号 | 主词素 | 含义 | 变体 | 候选例词 |
|---:|---|---|---|---|
| P01 | pre- | 前/预先 | pre | preview, predict, prevent, prepare, prescribe, precede, premature, prelude, preposition, prewar |
| P02 | fore- | 前 | fore | forehead, foreword, forecast, foresee, foretell, foremost, forefather, forewarn, foreground, forehand |
| P03 | post- | 后 | post | postwar, postpone, postscript, postgraduate, postdate, posthumous, postmeridian, postlude, posttest, postfix |
| P04 | re- | 再/回 | re | review, return, rebuild, recall, reflect, reject, remain, repeat, replace, restore |
| P05 | un- | 不/反 | un | unhappy, unable, unlock, unknown, unfair, untrue, undo, unpack, uncover, unleash |
| P06 | in-/im-/il-/ir- | 不/入 | in, im, il, ir | invisible, incorrect, impossible, illegal, irregular, import, include, inflame, imprison, irrigate |
| P07 | dis- | 不/分 | dis | disagree, disappear, discover, disconnect, dislike, dismiss, disturb, display, dissolve, distance |
| P08 | mis- | 错误 | mis | mistake, misunderstand, misuse, mislead, misprint, misjudge, mistrust, misplace, misbehave, misread |
| P09 | over- | 过度 | over | overwork, overeat, overestimate, overlook, overcome, overtake, overcharge, overreact, overdo, overconfident |
| P10 | under- | 下/不足 | under | underground, underline, understand, underestimate, underpay, underdeveloped, undergo, undercover, underweight, understate |
| P11 | sub- | 下 | sub | subway, submarine, submerge, submit, subject, subordinate, subscribe, subtract, subdivide, substandard |
| P12 | super- | 上/超 | super | superior, supermarket, supervise, superhuman, supernatural, superstar, superimpose, supersonic, superpower, supersede |
| P13 | sur- | 上/超 | sur | surface, surround, surplus, survive, surpass, surcharge, surname, surreal, surrender, surveillance |
| P14 | inter- | 之间 | inter | international, internet, interact, interfere, interrupt, interview, interval, intercity, interlock, interdependent |
| P15 | intra- | 内 | intra | intranet, intraocular, intravenous, intramural, intrastate, intracellular, intrapersonal, intracoastal, intrauterine, intracompany |
| P16 | trans- | 横/转 | trans | transport, transfer, translate, transform, transmit, transparent, transplant, transaction, transcend, transient |
| P17 | circum- | 周围 | circum | circumspect, circumstance, circumference, circulate, circumnavigate, circumscribe, circumlocution, circumcise, circumflex, circumambient |
| P18 | peri- | 周围 | peri | period, perimeter, periscope, periphery, peripatetic, pericardium, perinatal, perigee, perihelion, peristyle |
| P19 | anti- | 反 | anti | antiwar, antibody, antibiotic, antisocial, antihero, anticlockwise, antidote, antifreeze, antipathy, antitrust |
| P20 | pro- | 向前/支持 | pro | progress, project, promote, protect, propose, provide, produce, proceed, propel, prospect |
| P21 | con-/com- | 共同 | con, com | connect, combine, communicate, compare, compete, complete, complex, compress, concentrate, conference |
| P22 | de- | 向下/去除 | de | descend, decrease, defend, delete, depart, depress, destroy, detach, devalue, decode |
| P23 | ex-/e- | 出 | ex, e | exit, export, exclude, expose, expand, extract, external, exceed, exhale, eject |
| P24 | extra- | 额外 | extra | extraordinary, extract, extracurricular, extraterrestrial, extravert, extraneous, extrapolate, extrasensory, extrajudicial, extraofficial |
| P25 | hyper- | 超 | hyper | hyperactive, hyperlink, hypersensitive, hypertension, hypermarket, hypertext, hyperventilate, hypercritical, hyperextension, hyperinflation |
| P26 | hypo- | 下 | hypo | hypothesis, hypocrite, hypodermic, hypothermia, hypoglycemia, hypothyroid, hypogeal, hypocaust, hypnosis, hypochondria |
| P27 | macro- | 大 | macro | macroeconomics, macrocosm, macroinstruction, macrobiotic, macroclimate, macroevolution, macromolecule, macroscopic, macrospore, macrostructure |
| P28 | micro- | 小 | micro | microscope, microphone, microbe, microchip, microwave, microeconomics, microfilm, microorganism, microsurgery, microsecond |
| P29 | mono- | 单一 | mono | monopoly, monologue, monogamy, monotonous, monorail, monochrome, monolith, monosyllable, monotheism, monocle |
| P30 | multi- | 多 | multi | multiple, multiply, multimedia, multinational, multiracial, multitask, multicolor, multifunction, multistory, multivitamin |
| P31 | poly- | 多 | poly | polygamy, polygon, polyphony, polytechnic, polystyrene, polytheism, polyunsaturated, polyglot, polygraph, polymer |
| P32 | semi- | 半 | semi | semicircle, semiconductor, semifinal, semipermanent, semiautomatic, semicolon, semiconscious, semidesert, semiofficial, semiprecious |
| P33 | hemi- | 半 | hemi | hemisphere, hemicycle, hemiplegia, hemisect, hemistich, hemitrope, hemialgia, hemianopsia, hemicephalia, hemichordate |
| P34 | uni- | 一 | uni | uniform, unite, universal, unicorn, unicycle, unilateral, unique, unify, unison, unicellular |
| P35 | bi- | 二 | bi | bicycle, bilingual, bimonthly, biped, bilateral, binary, binocular, biology, biplane, bipolar |
| P36 | tri- | 三 | tri | triangle, tricycle, trilingual, tripod, trilogy, trident, triple, triathlon, triceps, trillion |
| P37 | quad- | 四 | quad | quadruple, quadrant, quadrilateral, quadriceps, quadruplet, quadraphonic, quadrennial, quadricycle, quadrisect, quadrumane |
| P38 | omni- | 全 | omni | omnipotent, omniscient, omnipresent, omnivorous, omnibus, omnidirectional, omnifarious, omniform, omnify, omnitude |
| P39 | auto- | 自动/自己 | auto | automatic, automobile, autograph, autobiography, autopilot, autonomy, autocrat, autoimmune, autofocus, autodidact |
| P40 | tele- | 远 | tele | telephone, television, telescope, telegraph, telepathy, telecommute, teleconference, telephoto, telescreen, telethon |

### 6.2 词根 74 个

| 编号 | 主词素 | 含义 | 变体 | 候选例词 |
|---:|---|---|---|---|
| R01 | spec | 看 | spec, spect, spic | inspect, respect, suspect, prospect, retrospect, spectator, spectrum, speculate, circumspect, aspect |
| R02 | vid | 看 | vid, vis | video, visible, vision, visit, visual, supervise, television, evidence, provide, revise |
| R03 | audi | 听 | audi | audio, audience, audit, auditorium, audible, audition, audiovisual, audiometer, audiophile, inaudible |
| R04 | dict | 说 | dict, dic | dictate, dictionary, predict, contradict, verdict, dictator, edict, indicate, dedicate, indict |
| R05 | scrib | 写 | scrib, script | describe, prescribe, subscribe, manuscript, transcript, inscription, script, scribble, postscript, conscript |
| R06 | graph | 写/画 | graph | photograph, biography, geography, autograph, diagram, telegraph, paragraph, graphite, graphic, calligraphy |
| R07 | log | 言/学 | log | logic, dialogue, monologue, biology, psychology, geology, apology, catalog, analogy, epilogue |
| R08 | port | 携带 | port | import, export, transport, portable, report, support, porter, portfolio, deport, purport |
| R09 | tract | 拉/引 | tract | attract, contract, extract, distract, tractor, subtract, abstract, retract, protract, intractable |
| R10 | mit | 送 | mit, miss | submit, permit, transmit, admit, commit, dismiss, mission, missile, remit, emit |
| R11 | duc | 引导 | duc, duct | conduct, produce, reduce, introduce, educate, induce, deduce, viaduct, aqueduct, abduct |
| R12 | ject | 投 | ject | reject, inject, project, object, subject, eject, interject, deject, trajectory, adjacent |
| R13 | pos | 放 | pos, pon | position, compose, expose, impose, deposit, propose, postpone, component, opponent, positive |
| R14 | stat | 站 | stat | state, station, status, statue, stable, establish, constant, instant, statistics, circumstantial |
| R15 | sist | 站 | sist | assist, consist, insist, persist, resist, subsist, desist, existence, inconsistent, transistor |
| R16 | fer | 带 | fer | transfer, refer, prefer, offer, differ, suffer, infer, confer, fertile, ferry |
| R17 | gest | 带/运 | gest | gesture, suggest, digest, congest, ingest, register, jest, gestation, gestalt, exaggerate |
| R18 | grad | 步/走 | grad, gress | grade, gradual, graduate, degrade, upgrade, progress, regress, aggressive, centigrade, gradient |
| R19 | ced | 走/让 | ced, cess | proceed, exceed, succeed, access, process, recess, concede, recede, precede, intercede |
| R20 | cur | 跑 | cur, curs | current, occur, recur, excursion, cursor, cursory, concur, curriculum, cursive, precursor |
| R21 | ven | 来 | ven, vent | prevent, invent, convention, event, advent, avenue, revenue, convene, intervene, circumvent |
| R22 | voc | 叫/声 | voc, vok | voice, vocal, vocabulary, advocate, evoke, provoke, invoke, revoke, vocation, equivocate |
| R23 | lingu | 语言 | lingu, linqu | language, linguistics, bilingual, linguist, lingua, lingo, lingual, monolingual, multilingual, linguine |
| R24 | liter | 文字 | liter | literature, literal, literary, literate, illiterate, literacy, alliteration, transliterate, preliterate, obliterate |
| R25 | manu | 手 | manu, man | manual, manufacture, manuscript, manipulate, manage, manicure, manifest, manacle, emancipate, manumit |
| R26 | ped | 脚/儿童 | ped, pod | pedal, pedestrian, pedicure, tripod, podiatry, pediatrician, pedigree, pedometer, centipede, podium |
| R27 | cap | 拿/抓 | cap, capt, cept, ceiv | capture, capable, capacity, accept, concept, except, receive, intercept, participate, captivate |
| R28 | ten | 握 | ten, tain, tin | contain, maintain, obtain, retain, sustain, tenant, tenacious, continue, entertain, abstain |
| R29 | fin | 结束/界限 | fin, fini | final, finish, define, infinite, confine, finance, finite, refine, affinity, definitive |
| R30 | termin | 界限 | termin | terminal, determine, terminate, exterminate, interminable, terminology, terminus, determinism, indeterminate, terminal |
| R31 | limin | 门槛 | limin | limit, eliminate, preliminary, sublime, liminal, delimitate, unlimited, limited, limitation, subliminal |
| R32 | val | 价值 | val | value, valid, evaluate, invalid, valor, valuable, devalue, equivalence, prevalent, valediction |
| R33 | ver | 真实 | ver | verify, verdict, veracity, veritable, aver, verisimilitude, very, verily, verism, veridical |
| R34 | cred | 相信 | cred | credit, credible, incredible, creditor, creed, credential, credo, credulous, accreditation, miscreant |
| R35 | fid | 信任 | fid | confidence, fidelity, infidel, fiduciary, confide, diffident, perfidy, bona fide, fiducial, fiducially |
| R36 | sci | 知道 | sci | science, conscious, conscience, scientific, omniscient, prescient, subconscious, nescient, conscionable, geoscience |
| R37 | soph | 智慧 | soph | philosophy, sophisticated, sophomore, sophism, sophist, unsophisticated, theosophy, pansophy, sophistry, sophistical |
| R38 | nom | 规则/名 | nom | economy, astronomy, autonomy, taxonomy, nominate, nominal, nomenclature, anomie, agronomy, antinomy |
| R39 | onym | 名字 | onym | synonym, antonym, anonymous, pseudonym, homonym, acronym, eponym, onomatopoeia, patronym, toponym |
| R40 | arch | 统治/首 | arch | hierarchy, archbishop, architect, archive, archetype, anarchy, monarchy, patriarchy, archaeology, archangel |
| R41 | cracy | 统治 | cracy, crat | democracy, autocracy, bureaucracy, aristocracy, plutocracy, meritocracy, theocracy, technocracy, democrat, bureaucrat |
| R42 | dem | 人民 | dem | democracy, demographic, epidemic, pandemic, endemic, demagogue, demography, demotic, demobilize, demodulation |
| R43 | popul | 人民 | popul | popular, population, populate, populous, populism, depopulate, popularize, unpopular, populace, populist |
| R44 | civ | 公民 | civ | civil, civilian, civilization, civilize, civics, uncivil, civic, civility, civilly, civilization |
| R45 | urb | 城市 | urb | urban, suburb, suburban, urbanization, urbane, interurban, urbanize, urbanity, exurb, conurbation |
| R46 | patr | 父 | patr, pater | father, paternal, patriarch, patriotism, patron, patronize, paternity, patrician, expatriate, repatriate |
| R47 | mater | 母 | mater, matr | mother, maternal, maternity, matriarch, matrimony, matrix, matron, matrilineal, matriculate, alma mater |
| R48 | frater | 兄弟 | frater | fraternal, fraternity, fraternize, confraternity, fratricide, fraternalism, fraternization, frater, fratery, fratercula |
| R49 | gen | 出生/产生 | gen | generate, gene, genetic, genius, genuine, genocide, generation, generator, congenital, progenitor |
| R50 | nat | 出生 | nat | native, nature, nation, natural, innate, prenatal, neonatal, natal, nativity, naturalize |
| R51 | bio | 生命 | bio | biology, biography, biodiversity, biosphere, antibiotic, biohazard, biopsy, biogenesis, bioluminescence, symbiosis |
| R52 | geo | 地球 | geo | geography, geology, geometry, geocentric, geophysics, geothermal, geopolitics, geode, geographer, geoscience |
| R53 | terr | 土地 | terr | territory, terrain, terrestrial, terrace, terrarium, territorial, extraterrestrial, subterranean, Mediterranean, terracotta |
| R54 | aqua | 水 | aqua | aquarium, aquatic, aqueduct, aquamarine, aquaplane, aquaculture, aqueous, aqualung, aquanaut, aqua |
| R55 | hydro | 水 | hydro | hydrogen, hydroelectric, hydroplane, hydrofoil, hydrotherapy, dehydration, hydrophobia, hydrosphere, hydrodynamic, hydrant |
| R56 | therm | 热 | therm | thermal, thermometer, thermostat, thermos, thermodynamics, hypothermia, thermonuclear, endothermic, exothermic, thermocouple |
| R57 | photo | 光 | photo | photograph, photosynthesis, photon, photogenic, photocopy, photoelectric, photojournalism, photosphere, photometer, photophobia |
| R58 | lumen | 光 | lumen, luc | lumen, luminous, lucid, translucent, illuminate, luminary, luminescence, lucent, lucubrate, lucifer |
| R59 | son | 声 | son | sound, sonic, sonata, resonance, supersonic, dissonance, sonorous, ultrasound, assonance, consonant |
| R60 | phon | 声 | phon | telephone, microphone, phonograph, phonetics, symphony, cacophony, phoneme, euphonious, saxophone, gramophone |
| R61 | opt | 看/光 | opt | optic, optical, optician, optimist, optimize, option, optometry, optoelectronics, synoptic, panoptic |
| R62 | ocul | 眼 | ocul | ocular, binocular, oculist, monocular, oculomotor, oculogyric, oculoplastics, oculomycosis, oculopathy, oculonasal |
| R63 | derm | 皮 | derm | dermis, dermatology, dermatitis, hypodermic, epidermis, dermatologist, dermabrasion, scleroderma, pachyderm, taxidermy |
| R64 | corp | 身体 | corp | corporation, corpse, corporal, corpulent, incorporate, corporeal, corpus, corps, corpuscle, corpulence |
| R65 | carn | 肉 | carn | carnivore, carnal, carnation, incarnate, carnival, carnage, carnelian, carnassial, carnify, carnosity |
| R66 | psych | 心理 | psych | psychology, psychiatrist, psychic, psychopath, psychotherapy, psyche, psychosomatic, psychoanalysis, psychotropic, psychokinesis |
| R67 | ment | 心/思 | ment, men | mental, mention, comment, mentality, mentor, mentation, demented, menthol, menticide, mentalese |
| R68 | anim | 生命/精神 | anim | animal, animate, animation, unanimous, animosity, animus, equanimity, magnanimous, pusillanimous, inanimate |
| R69 | viv | 生命/活 | viv, vit | vital, vitamin, vitality, vitals, survive, revive, vivacious, vivid, vivisection, convivial |
| R70 | mort | 死 | mort | mortal, immortal, mortality, mortgage, mortuary, mortify, postmortem, mortician, rigor mortis, mortmain |
| R71 | chron | 时间 | chron | chronic, chronology, synchronize, chronicle, chronometer, anachronism, chronological, chronograph, chronobiology, chronotherapy |
| R72 | temp | 时间 | temp | temporary, temperature, tempo, temporal, contemporary, contemplate, tempest, template, temporize, extemporaneous |
| R73 | ann | 年 | ann, enn | annual, anniversary, annually, biennial, perennial, centennial, millennium, annuity, annals, triennial |
| R74 | noct | 夜 | noct | nocturnal, nocturne, noctambulist, nocturia, noctilucent, noctivagant, pernoctation, equinoctial, noctograph, noctuid |

### 6.3 后缀 15 个

见第 5 节。

---

## 7. 核心玩法

### 7.1 侦探流程

```text
线索 → 拆解 → 推义 → 验证 → 奖励 → 复习
```

### 7.2 拆解环节

移动端：点选词素卡。  
PC 端：拖拽 + 键盘。

必须提供：

- 正确词素。
- 2-3 个形似干扰项。
- 2-3 个义似/混淆干扰项。
- 同化提示标签。

示例：

```text
predict
正确：pre + dict
干扰：pro, per, duct, dic
```

```text
imperfect
正确：im + perfect
提示：im- 是 in- 的同化变体
```

### 7.3 推义环节

彻底放弃自由文本输入，使用三段式闭锁推理：

```text
第 1 阶：词素积木合成（字面义）
  点选 [周围] + [看]
  = 从周围看 / 环顾四周

第 2 阶：隐喻引申方向
  A. 四处张望、防备危险（谨慎周详）  ← 正确
  B. 视力开阔、登高望远（开阔宏大）
  C. 视线受阻、看不清楚（模糊暧昧）

第 3 阶：词性与现代词义闭环
  circumspect = [周详的 / 谨慎小心的]（形容词）
```

### 7.4 验证环节

- 显示真实释义、词源、发音、例句。
- 显示同词根家族词。
- 标注“词源解释”和“助记解释”。
- 展示语义梯子。

### 7.5 奖励环节

- 洞察点。
- 词根经验。
- 解锁家族词。
- 成就弹窗。
- 连续猜对加成。

### 7.6 复习环节

- 不考旧词，优先给同词根新词。
- 新词耗尽后降级。
- 猜对才算迁移成功。
- 猜错回到词根卡。

---

## 8. 语义梯子

### 8.1 三级释义

每个单词必须有三级释义：

```json
{
  "word": "circumspect",
  "literal": "周围 + 看 = 从四周看",
  "metaphor": "多方观察，不轻举妄动",
  "modern": "谨慎的，周详的"
}
```

```json
{
  "word": "comprehend",
  "literal": "com + prehend = 全部抓住",
  "metaphor": "把知识全部抓在手里",
  "modern": "理解，领悟"
}
```

```json
{
  "word": "candidate",
  "literal": "candid + ate = 穿白袍的人",
  "metaphor": "古罗马竞选者穿白袍示纯洁",
  "modern": "候选人"
}
```

### 8.2 数据库字段

```sql
ALTER TABLE words ADD COLUMN literal_meaning_cn VARCHAR(255);
ALTER TABLE words ADD COLUMN metaphor_meaning_cn VARCHAR(255);
ALTER TABLE words ADD COLUMN modern_meaning_cn VARCHAR(255);
ALTER TABLE words ADD COLUMN semantic_jump VARCHAR(16); -- low / medium / high
```

### 8.3 UI 原则

推义阶段只让用户推到 `literal` 或 `metaphor`，`modern` 作为揭晓。

---

## 9. 推义交互

### 9.1 三步闭锁

```text
第 1 步：词素拼接
第 2 步：语义方向三选一
第 3 步：揭晓词典释义
```

### 9.2 判分逻辑

```text
第 1 步：精确匹配。
第 2 步：三选一。
第 3 步：不计分，只揭晓。
```

### 9.3 为什么不用自由输入

- 中文表达太灵活，Regex 误判率高。
- LLM 打分有成本和延迟。
- 选择题会靠排除法蒙对，污染迁移率指标。
- 分段闭锁既避免技术坑，又保留推理感。

---

## 10. 拆解干扰项

### 10.1 干扰项生成规则

```text
干扰项 = 形似干扰 + 义似干扰 + 随机干扰
```

| 类型 | 规则 | 例（predict） |
|---|---|---|
| 形似 | 编辑距离 ≤ 2 | pre-, pro-, per-, pri- |
| 义似 | 同类型、近义 | dict, duct, dic, log |
| 随机 | 同级别其他词素 | spect, port, tract |

### 10.2 数据库

```sql
CREATE TABLE word_distractors (
    id uuid PRIMARY KEY,
    word_id uuid REFERENCES words(id),
    morpheme_id text REFERENCES morphemes(id),
    distractor_type text,  -- 'form' | 'meaning' | 'random'
    UNIQUE (word_id, morpheme_id)
);
```

### 10.3 配置示例

```json
{
  "word": "predict",
  "parts": ["pre", "dict"],
  "distractors": ["pro", "per", "duct", "dic", "spect"],
  "difficulty": 2
}
```

---

## 11. 复习系统

### 11.1 排程对象

- 排程词根，不排程单词。
- 每个词根有独立熟练度。
- 单词用于验证迁移。

### 11.2 词根状态

```text
新词根 → 学习中 → 复习中 → 已掌握
```

### 11.3 题库分层

```text
【储备池】
├─ 教学词（1-2个）：首次学词根时用
├─ 迁移测试词（3-5个）：到期复习时按难度逐个推出新词测试
└─ 进阶挑战词（2-3个）：高熟练度时触发
```

### 11.4 弹药耗尽降级策略

```text
第 1 层：新词猜义
  ↓ 弹药耗尽
第 2 层：逆向造词（给释义 + 语境，用户从词素库拼出单词）
  ↓ 弹药耗尽
第 3 层：同族词情境完形填空（旧词放入新例句）
  ↓ 弹药耗尽
第 4 层：词素辨析挑战（区分同根近义词）
  ↓ 弹药耗尽
第 5 层：词根听写 / 词根速认
```

### 11.5 数据库

```sql
CREATE TABLE morpheme_family_pool (
    id uuid PRIMARY KEY,
    morpheme_id text REFERENCES morphemes(id),
    word_id uuid REFERENCES words(id),
    tier text NOT NULL,   -- 'teaching' | 'first_test' | 'advanced'
    used_count int DEFAULT 0,
    UNIQUE (morpheme_id, word_id)
);
```

### 11.6 核心指标

```text
词根迁移率 = 同词根新词首次猜对次数 / 同词根新词总尝试次数
```

---

## 12. FSRS 算法修订

### 12.1 核心问题

词根是记忆主体，单词是测试载体。不同单词难度差异大，不能用同一权重。

### 12.2 权重修正公式

```text
词根熟练度变化 = 基础变化 × 单词难度权重
```

### 12.3 评分映射

| 用户结果 | 单词难度 | 词根 stability 变化 |
|---|---|---|
| 猜对 | 基础词 K=1 | +1.5× |
| 猜对 | 中等词 K=3 | +1.0× |
| 猜对 | 高难词 K=5 | +0.5× |
| 猜错 | 基础词 K=1 | -1.0×，严重衰减 |
| 猜错 | 中等词 K=3 | -0.7× |
| 猜错 | 高难词 K=5 | -0.3×，轻度扣减 |

### 12.4 示例

```text
若用户在 visible（K=1）猜错：
  S_new = S_old × 0.2

若用户在 perspicacious（K=5）猜错：
  S_new = S_old × 0.8
```

### 12.5 数据库

```sql
ALTER TABLE words ADD COLUMN difficulty_weight float DEFAULT 1.0;
ALTER TABLE user_morpheme_progress ADD COLUMN weighted_stability float;
```

---

## 13. 数据库设计

### 13.1 词素表

```sql
CREATE TABLE morphemes (
    id VARCHAR(32) PRIMARY KEY,
    display_text VARCHAR(64) NOT NULL,
    type VARCHAR(16) NOT NULL,          -- 'prefix' | 'root' | 'suffix'
    meaning_cn VARCHAR(64) NOT NULL,
    allomorphs TEXT[],
    etymology TEXT,
    level INT DEFAULT 1,
    color VARCHAR(16) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 13.2 单词表

```sql
CREATE TABLE words (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word VARCHAR(64) NOT NULL UNIQUE,
    phonetic VARCHAR(64),
    audio_url TEXT,
    part_of_speech VARCHAR(16),
    modern_meaning_cn VARCHAR(255) NOT NULL,
    literal_meaning_cn VARCHAR(255) NOT NULL,
    metaphor_meaning_cn VARCHAR(255),
    metaphor_options JSONB,
    semantic_jump VARCHAR(16),
    difficulty_level INT DEFAULT 1,
    difficulty_weight FLOAT DEFAULT 1.0,
    distractors TEXT[],
    example_en TEXT NOT NULL,
    example_cn TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 13.3 单词-词素关联表

```sql
CREATE TABLE word_morphemes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word_id UUID REFERENCES words(id) ON DELETE CASCADE,
    morpheme_id VARCHAR(32) REFERENCES morphemes(id),
    actual_surface VARCHAR(32) NOT NULL,
    position INT NOT NULL,
    is_assimilated BOOLEAN DEFAULT FALSE
);
```

### 13.4 用户词根进度表

```sql
CREATE TABLE user_morpheme_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    morpheme_id VARCHAR(32) REFERENCES morphemes(id),
    state VARCHAR(16) DEFAULT 'new',
    stability FLOAT DEFAULT 0.0,
    difficulty FLOAT DEFAULT 0.0,
    weighted_stability FLOAT DEFAULT 0.0,
    due_at TIMESTAMP WITH TIME ZONE,
    tested_word_ids UUID[],
    migration_correct INT DEFAULT 0,
    migration_attempts INT DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, morpheme_id)
);
```

### 13.5 其他表

```sql
CREATE TABLE word_distractors (
    id uuid PRIMARY KEY,
    word_id uuid REFERENCES words(id),
    morpheme_id text REFERENCES morphemes(id),
    distractor_type text,
    UNIQUE (word_id, morpheme_id)
);

CREATE TABLE morpheme_family_pool (
    id uuid PRIMARY KEY,
    morpheme_id text REFERENCES morphemes(id),
    word_id uuid REFERENCES words(id),
    tier text NOT NULL,
    used_count int DEFAULT 0,
    UNIQUE (morpheme_id, word_id)
);

CREATE TABLE review_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id),
    morpheme_id text REFERENCES morphemes(id),
    word_id uuid REFERENCES words(id),
    result text,
    response_ms int,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE achievements (
    id text PRIMARY KEY,
    title text NOT NULL,
    description text,
    condition jsonb
);

CREATE TABLE user_achievements (
    user_id uuid REFERENCES auth.users(id),
    achievement_id text REFERENCES achievements(id),
    unlocked_at timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, achievement_id)
);
```

---

## 14. API 设计

| API | 作用 |
|---|---|
| `get_daily_session` | 获取今日任务 |
| `get_review_queue` | 获取到期词根 |
| `submit_split` | 提交拆解 |
| `submit_inference` | 提交推义 |
| `get_morpheme_tree` | 获取词根树 |
| `get_word_family` | 获取家族词 |
| `sync_progress` | 同步进度 |
| `unlock_world` | 解锁世界 |
| `claim_daily_reward` | 领取奖励 |
| `get_audio_url` | 获取音频 |
| `get_distractors` | 获取干扰项 |

---

## 15. 页面结构

### 首页
- 今日破解。
- 继续学习。
- 复习队列。
- 词根世界地图。
- 连续天数、洞察点。

### 侦探页
- 线索区。
- 词素卡区。
- 槽位区。
- 推义三阶段。
- 验证结果。
- 奖励动画。

### 图鉴页
- 词根树。
- 已解锁词根。
- 家族词。
- 已破解单词。
- 未解锁世界。

### 复习页
- 到期词根。
- 新词猜义。
- 降级题型。
- 错题回炉。
- 复习统计。

### 成就页
- 首次破解。
- 连续猜对。
- 词根大师。
- 迁移大师。
- 世界解锁。

### 统计页
- 掌握词根数。
- 陌生词猜对率。
- 词根迁移率。
- 7 日留存。
- 错误词根排行。

### 设置页
- 账号同步。
- 音频开关。
- 主题。
- 离线下载。
- 自定义词库。
- 订阅管理。

---

## 16. 技术架构

### 前端
- React + TypeScript + Vite。
- Tailwind CSS。
- Zustand 状态管理。
- Framer Motion 动画。
- dnd-kit 拖拽。
- Howler 音频。
- XState 或自定义状态机。

### 跨端
- PWA：manifest + service worker。
- 可安装到移动/PC。
- 离线缓存：IndexedDB。
- 上架：Capacitor 包 Android / iOS。

### 后端
- Supabase：
  - Auth 登录。
  - Postgres 词库与进度。
  - Storage 音频。
  - Edge Functions。
  - RLS 行级安全。

### 部署
- 前端：Vercel / Netlify。
- 后端：Supabase。
- 音频：Supabase Storage 或 CDN。

### 状态机

```text
clue → split → infer_literal → infer_metaphor → verify → reward → review
```

---

## 17. 音频方案

### 17.1 方案选型

| 方案 | 成本 | 质量 | 推荐 |
|---|---|---|---|
| Edge-TTS | 免费 | 高 | V1 主力 |
| OpenAI TTS | 约 $15/1M 字符 | 极高 | 兜底/付费词包 |
| 真人录音 | 高 | 最高 | V2 可选 |

V1 选 Edge-TTS。1200 词 × 平均 12 字符 ≈ 14400 字符，成本 0 元。

### 17.2 生成脚本

```python
# scripts/generate_audio.py
import asyncio
import csv
import os
import edge_tts

VOICE = "en-US-AriaNeural"
OUTPUT_DIR = "audio"
CONCURRENCY = 8

async def generate_one(word, sem):
    async with sem:
        path = os.path.join(OUTPUT_DIR, f"{word}.mp3")
        if os.path.exists(path):
            return
        try:
            communicate = edge_tts.Communicate(word, VOICE)
            await communicate.save(path)
            print(f"OK {word}")
        except Exception as e:
            print(f"FAIL {word}: {e}")

async def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    sem = asyncio.Semaphore(CONCURRENCY)
    words = []
    with open("data/words.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            words.append(row["word"])
    tasks = [generate_one(w, sem) for w in words]
    await asyncio.gather(*tasks)

if __name__ == "__main__":
    asyncio.run(main())
```

### 17.3 安装与运行

```bash
pip install edge-tts
python scripts/generate_audio.py
```

### 17.4 音频命名

```text
audio/
  preview.mp3
  circumspect.mp3
  circumspection.mp3
```

### 17.5 前端播放

```ts
import { Howl } from 'howler'

const CDN = import.meta.env.VITE_AUDIO_CDN
const cache = new Map<string, Howl>()

export function playWord(word: string) {
  let sound = cache.get(word)
  if (!sound) {
    sound = new Howl({
      src: [`${CDN}/${word}.mp3`],
      preload: true,
      html5: false,
    })
    cache.set(word, sound)
  }
  sound.play()
}
```

### 17.6 IndexedDB 离线缓存

```ts
const DB = 'audio-cache'
const STORE = 'files'

async function openDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getAudioBlob(word: string): Promise<Blob | null> {
  const db = await openDB()
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(word)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => resolve(null)
  })
}

export async function cacheAudio(word: string, blob: Blob) {
  const db = await openDB()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(blob, word)
}
```

### 17.7 音色建议

| 用途 | 音色 |
|---|---|
| 美音女声 | en-US-AriaNeural |
| 美音男声 | en-US-GuyNeural |
| 英音女声 | en-GB-SoniaNeural |
| 英音男声 | en-GB-RyanNeural |

### 17.8 OpenAI TTS 兜底

```python
from openai import OpenAI
client = OpenAI()

def generate_openai(word: str, path: str):
    response = client.audio.speech.create(
        model="tts-1",
        voice="nova",
        input=word,
    )
    response.stream_to_file(path)
```

---

## 18. 内容生产流程

1. 从 B 站视频整理词根和单词。
2. 导出 CSV / JSON。
3. 审核词源准确性。
4. 拆分“词源”和“助记”。
5. 补充音标、发音、例句。
6. 标注难度和前置词根。
7. 生成词根家族关系。
8. 配置干扰项。
9. 配置语义梯子。
10. 导入 Supabase。

### 内容审核规则
- 不硬拆。
- 词源和助记分开。
- 每个词必须有至少 1 个例句。
- 每个词根必须有至少 8 个家族词。
- 同族词必须真实相关。
- 易错点必须标注。
- 变体必须归入主词素。

---

## 19. 成就与经济

### 成就
- 首次破解。
- 连续 7 天。
- 破解 100 词。
- 掌握 30 个词根。
- 迁移大师：同词根新词猜对 50 次。
- 世界解锁：完成一个词根世界。

### 货币
- 洞察点。
- 获取：每日任务、首次破解、连续猜对、成就。
- 消耗：提示、解锁额外复习、自定义词库。

---

## 20. 变现设计

| 类型 | 内容 |
|---|---|
| 免费 | 1 个词根世界、基础复习、基础统计 |
| 订阅 | 全部词根世界、离线、去广告、高级统计、自定义词库 |
| 内购 | 单个词根世界包、发音包、主题包 |
| 原则 | 不做重氪，学习工具靠订阅和词包 |

---

## 21. 开发里程碑

| 阶段 | 目标 | 时间 |
|---|---|---|
| M1 | 原型：拆解 + 干扰项 + 三段推义 | 4 天 |
| M2 | 词库导入：129 词素、1000+ 单词 | 6 天 |
| M3 | 复习系统：分层池 + 降级 + FSRS 权重 | 4 天 |
| M4 | 页面：首页、侦探、复习、图鉴、统计 | 5 天 |
| M5 | PWA + Supabase 登录同步 | 3 天 |
| M6 | Edge-TTS 音频生成与缓存 | 2 天 |
| M7 | 测试、内容审核、上线 | 4 天 |
| 合计 | MVP 上线 | 3-4 周 |

---

## 22. 验收标准

- [ ] 词素变体合并完成。
- [ ] 15 个后缀入库。
- [ ] 129 个主词素入库。
- [ ] 1000+ 单词入库。
- [ ] 每个词根有分层家族池。
- [ ] 每个单词有 literal / metaphor / modern。
- [ ] 拆解有干扰项。
- [ ] 推义是三步闭锁。
- [ ] 复习弹药耗尽有降级。
- [ ] FSRS 有权重修正。
- [ ] 音频 Edge-TTS 批量生成。
- [ ] 音频 CDN + IndexedDB 缓存。
- [ ] 移动 + PC + PWA。
- [ ] 账号同步。
- [ ] 每日任务 + 成就。
- [ ] 订阅入口。

---

## 23. 成功指标

### 北极星指标

```text
词根迁移率 = 同词根新词首次猜对次数 / 同词根新词总尝试次数
```

### 辅助指标
- 7 日留存。
- 日均破解词数。
- 掌握词根数。
- 复习完成率。
- 付费转化率。
- 用户看到陌生词先拆还是先查。

---

## 24. 风险与对策

| 风险 | 对策 |
|---|---|
| 词源硬拆 | 审核词源，区分助记 |
| 内容质量低 | 人工审核 + 家族词校验 |
| 用户只记答案 | 复习给新词，考迁移 |
| 移动拖拽难用 | 移动点选，PC 拖拽 |
| 版权问题 | 原创例句或授权内容 |
| 作弊 | 选项随机、输入模糊判定、人工抽检 |
| 初期内容少 | 先做 129 词素，覆盖 1000+ 词 |
| 复习弹药耗尽 | 分层池 + 降级回退 |
| 难词误杀词根熟练度 | FSRS 难度权重修正 |
| 语义引申受挫 | 语义梯子 + 三段推义 |

---

## 25. 总结

**词根侦探不是单词卡，是词根推理游戏。**

核心闭环：

```text
学词根 → 拆熟悉词 → 认家族词 → 猜陌生词 → 猜对成就 → 复习词根 → 掌握 → 解锁新世界
```

V1 目标：

```text
129 个主词素
1000+ 单词
完整拆解、干扰项、三段推义、验证、分层复习闭环
FSRS 难度权重修正
Edge-TTS 音频
移动端 + PC 端 + PWA
```

最终目标：

**用户看到陌生词，第一反应不是查，而是拆、猜、验证。**