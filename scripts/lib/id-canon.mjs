// 词素 id 归一化：切分算法按**词形**定 id，同一个词根会散成多个：
//   absorb → ab+sorbe ／ adsorb → ad+sorb      （sorbe / sorb 各自只有 1 个词）
//   television → tele+vise+ion ／ vision → vis+ion
//   accumulate → ac+cumulate+ate ／ cumulative → cumul+ative
// 后果有两层：① 每个 id 词数都不够，过不了「教学价值」门槛；② 词库里同一个词根出两张卡片。
//
// 归一化 = 把屈折尾巴（-ate/-te/-e/-at）造成的变体并回词根形式。
//
// 但去尾 e 会撞上语义无关的巧合，所以有黑名单：`ice`(冰) 不是后缀 `ic` 的变体、
// `note`(记录) 不是 `not`(不)、`side`(边) 不是 `sid`(坐)、`mate` 不是 `ma`、
// `case` 不是 `cas`、`close` 不是 `clos`、`rede`/`red`、`pole`/`pol`、`chat`/`ch` 同理。
// 这些宁可不合并（少救几个），也不能并错（会把「冰」的卡片塞进 `-ic` 后缀的位置）。

/** 不做长→短合并的 id（语义与短形式无关）。 */
export const CANON_BLACKLIST = new Set(['ice', 'note', 'case', 'close', 'side', 'mate', 'rede', 'pole', 'chat'])

// 顺序要紧：先试长的尾巴，`insulate` 要去 `-ate` 得 `insul`（不存在）后，才退到 `-te` 得 `insula`。
const CUTS = ['ate', 'te', 'e', 'at']

/**
 * 由「存在的 id 全集」算出归一化映射（长 → 短）。
 * @param {Iterable<string>} ids 全部词素 id
 * @returns {Map<string, string>} 只含需要改写的条目
 */
export function buildCanon(ids) {
  const set = new Set(ids)
  const map = new Map()
  for (const id of set) {
    if (CANON_BLACKLIST.has(id)) continue
    for (const cut of CUTS) {
      if (!id.endsWith(cut) || id.length <= cut.length + 1) continue
      const base = id.slice(0, -cut.length)
      if (set.has(base) && !CANON_BLACKLIST.has(base)) { map.set(id, base); break }
    }
  }
  // 传递闭包：sorbe→sorb，若还有 sorbeX→sorbe 也要落到 sorb
  for (const [from] of map) {
    let to = map.get(from)
    const seen = new Set([from])
    while (map.has(to) && !seen.has(to)) { seen.add(to); to = map.get(to) }
    if (to !== map.get(from)) map.set(from, to)
  }
  return map
}

/** 归一化单个 id。 */
export function canonOf(map, id) {
  return map.get(id) || id
}

/**
 * 「同一个词根、两种拼法」的分组。词素表里两边各存了一份：
 *   cigen 用拉丁词干全形（trah / puls / mitt / minimus / passer / dc…）
 *   切分算法按**词形**定 id（tract / pel / mit / minim / pass / duce…）
 *
 * 21 号的 cigen 交叉验证要求「cigen 标出的词根必须都在切分里」，不认这层对照就会把这些词
 * 当冲突丢掉 —— 实测 26 个词因此进不了词库，例如
 *   retract / distract / extract / transmit / dismiss / adjust / unjust / introduce /
 *   minimum / minimal / peninsula / activity / exact / counteract / aggression /
 *   progress / bypass / surpass / encourage / discourage / notice / impulse
 * 注意是**双向**的：retract 切到 tract 而 cigen 说 trah，distract 反过来切到 trah
 * 而 cigen 说 tract，两个方向都要认。
 */
export const CIGEN_ROOT_GROUPS = [
  ['tract', 'trah'],
  ['cor', 'courage'],
  ['pel', 'puls'],
  ['mit', 'miss', 'mitt'],
  ['jud', 'just'],
  ['active', 'act'],
  ['duce', 'dc'],
  ['aggress', 'gress'],
  ['minim', 'minimum', 'minimus'],
  ['insula', 'nsula'],
  ['pass', 'passer'],
  ['not', 'note', 'iced'],
]

/** 词库 id → 可接受的一组同根 id（含自己）。命中任一即算对上。 */
export const CIGEN_ROOT_ALIAS = new Map()
for (const group of CIGEN_ROOT_GROUPS) for (const id of group) CIGEN_ROOT_ALIAS.set(id, group)

/** cigen 多标出来、本阶段切分不单独建模的前缀/词尾，交叉验证时直接跳过。 */
export const CIGEN_ROOT_IGNORE = new Set(['deh'])
