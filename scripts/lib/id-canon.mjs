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
