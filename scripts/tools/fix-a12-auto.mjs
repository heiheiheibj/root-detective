// A12 自动修复：对失败的干扰项，从「义项→场景」模板库挑选一个
// 外来（不属于本词词素）的场景替换，并避开 A11 相似度冲突。
// 模板场景的文案是人工编写的；只让程序做「选哪个、避哪些」的机械工作。
// 跑法：node scripts/tools/fix-a12-auto.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, '..', 'lib', 'handoff', 'words-prose-stage2')

// ── 与 contentRules 相同的判定件 ──
const words = JSON.parse(readFileSync(join(here, '..', '..', 'src', 'domain', 'content', 'words.json'), 'utf8'))
const morphemes = JSON.parse(readFileSync(join(here, '..', '..', 'src', 'domain', 'content', 'morphemes.json'), 'utf8'))
const morphemeById = new Map(morphemes.map((m) => [m.id, m]))
const splitGlosses = (s) => String(s).replace(/（[^）]*）/g, '').split(/[、；;，,]/).map((x) => x.trim()).filter((x) => [...x].filter((c) => /[一-鿿]/.test(c)).length >= 2)
const pool = new Set()
for (const m of morphemes) for (const g of splitGlosses(m.meaningCn)) pool.add(g)
const PUNCT = /[\s，。、；;：:（）()「」《》…—·,.!?;:'"-]/g
const bigrams = (t) => { const a = [...t.replace(PUNCT, '')]; const s = new Set(); for (let i = 0; i < a.length - 1; i++) s.add(a[i] + a[i + 1]); return s }
const jaccard = (a, b) => { const A = bigrams(a), B = bigrams(b); if (!A.size && !B.size) return 0; let n = 0; for (const g of A) if (B.has(g)) n++; return n / (A.size + B.size - n) }

// ── 义项 → 场景模板（场景内嵌义项原文） ──
const SCENES = {
  征服: ['征服高山的登山队', '征服浪头的帆船', '被征服者的旧城'],
  放置: ['把花瓶放置在窗台的动作', '被放置在角落的旧琴'],
  弯曲: ['被雪压弯曲的竹枝', '弯曲的小巷'],
  形状: ['云朵变化的形状', '被捏成心形状的饼'],
  形成: ['水洼里形成的冰', '慢慢形成的沙丘'],
  强壮: ['搬水缸的强壮手臂', '强壮的老水牛'],
  灌注: ['给花盆灌注清水的动作', '为新队伍灌注活力'],
  相等: ['长度相等的两根绳', '两边分量相等的天平'],
  平等: ['分得平等的两块饼', '平等相待的朋友'],
  持有: ['持有地契的老地主', '持有那张旧船票的人'],
  居住: ['供人居住的木屋', '在这座城里居住的人家'],
  劳作: ['在田里劳作的背影', '停止劳作的黄昏'],
  高兴: ['收到信的高兴样子', '高兴得跳起来的孩子'],
  感激: ['满脸感激的旅客', '感激的鞠躬'],
  神圣: ['神圣不可触碰的祭坛', '神圣的古庙'],
  见证: ['见证婚礼的老槐树', '见证王朝更替的城墙'],
  检验: ['接受检验的新桥', '经受风雨检验的老屋'],
  文字: ['刻在石碑上的文字', '写在墙上的文字'],
  字母: ['墙上的字母招牌', '字母拼成的灯牌'],
  举起: ['把奖杯举起的冠军', '举起火把的队伍'],
  迁移: ['向南迁移的雁阵', '整村迁移的队伍'],
  惊奇: ['睁大眼睛的惊奇表情', '满脸惊奇的孩子'],
  同伴: ['跟在身后的同伴', '同伴递来的水壶'],
  社会: ['城市里热闹的社会图景', '社会新闻的版面'],
  触碰: ['怕被触碰的含羞草', '轻轻触碰琴键的手'],
  技艺: ['展示技艺的工匠', '失传的老技艺'],
  艺术: ['挂满艺术的展厅', '街头艺术表演'],
  自然: ['回到自然的溪流', '自然生长的野花'],
  身体: ['锻炼身体的少年', '身体保养得极好的老人'],
  抓取: ['伸爪抓取鱼儿的猫', '抓取面包屑的麻雀'],
  带来: ['从海上带来风暴的云', '带来消息的信鸽'],
  承载: ['承载货物的老木船', '承载回忆的老照片'],
  中间: ['站在中间的裁判', '藏在柜子中间的钥匙'],
  测量: ['测量土地的测绘员', '测量水深的竹竿'],
  称量: ['称量谷物的杆秤', '称量珍珠的天平'],
  判断: ['很难判断方向的浓雾', '凭经验判断的老农'],
  法律: ['写在法律里的条文', '法律禁止的事'],
  服务: ['提供服务的前台', '服务周到的老店'],
  保持: ['保持安静的图书馆', '保持整洁的书桌'],
  城市: ['夜晚亮灯的城市', '城市边缘的旧铁轨'],
  公民: ['全体公民的集会', '公民的责任'],
  选择: ['摆在面前的两种选择', '没有选择的困境'],
  眼睛: ['闭上眼睛的雕像', '眼睛发亮的少年'],
  声音: ['传遍山谷的声音', '来自远方的声音'],
  移动: ['慢慢移动的沙丘', '移动书架找东西的人'],
  悬挂: ['悬挂在檐下的灯笼', '悬崖上悬挂的冰柱'],
  相信: ['愿意相信别人的心', '相信童话的孩子'],
  出生: ['记录出生的旧户口册', '刚出生的羊羔'],
  种类: ['种类繁多的集邮册', '这种花的种类'],
  产生: ['摩擦产生火花的石块', '产生怀疑的瞬间'],
  制造: ['手工制造的木碗', '制造噪音的机器'],
  携带: ['方便携带的小折凳', '携带行李的旅人'],
  生命: ['充满生命的嫩芽', '挽救生命的医生'],
  投掷: ['投掷石子的孩子', '投掷鱼网的渔夫'],
  记录: ['写满记录的笔记本', '记录温度的表格'],
  过程: ['记录全部过程的笔记', '烧制瓷器的过程'],
  动作: ['整齐划一的动作', '缓慢重复的动作'],
  行为: [' reward 好行为的小红花', '值得表扬的行为'],
  结果: ['等待结果的考生', '意料之外的结果'],
  状态: ['混乱到极点的状态', ' kept 完好的状态'],
  性质: ['改变物质性质的反应', '胶水的黏性质地'],
  集合: ['广场上人群的集合', ' коллекция 集合各家旧物'],
  场所: ['新建的聚会场所', '安静的学习场所'],
  时代: ['属于骑士的时代', '不同时代的衣裳'],
  程度: ['磨损到这种程度的鞋', '信任到盲目的程度'],
  小东西: ['抽屉里的小东西', '缝在衣角的小东西'],
  预先: ['预先写好的字条', '预先备好的干粮'],
  周围: ['周围开满野花的湖', '围在周围的栅栏'],
  之间: ['两座山之间的吊桥', '朋友之间的约定'],
  向下: ['向下俯冲的滑翔伞', '向下流淌的小溪'],
  向外: ['向外探出头的猫', '向外张望的窗'],
  相同: ['相同图案的两块砖', '口味相同的老友'],
  相反: ['朝相反方向开的两列车', '答案相反的两个人'],
  分离: ['骨肉分离的家书', '分离多年的姐妹'],
  分开: ['被分开的双胞胎', '把绳索分开理顺的手'],
  共同: ['共同抬木头的伙伴', '共同的童年记忆'],
  一起: ['一起野餐的同学', '一起长大的街坊'],
  单一: ['单一色调的房间', '单一口味的糖'],
  完全: ['完全熄灭的篝火', '完全看不见的山路'],
  自己: ['自己动手修的车', '自己缝的书包'],
  自动: ['自动弹开的折凳', '自动门开合的商店'],
  进入: ['进入梦乡的孩子', '禁止进入的花园'],
  携带B: [],
  贯穿: ['贯穿南北的大道', '贯穿全文的线索'],
  彻底: ['彻底打扫过的厨房', '彻底改变的小村'],
  制造噪音: [],
  声音B: [],
}

const own = (w) => new Set(w.parts.flatMap((p) => (morphemeById.get(p.morphemeId) ? splitGlosses(morphemeById.get(p.morphemeId).meaningCn) : [])))
const foreign = (w) => [...pool].filter((g) => !own(w).has(g))
const sceneFor = (gloss) => SCENES[gloss] || [`${gloss}的样子`]

let fixed = 0, failed = []
for (const w of words) {
  const fl = foreign(w)
  const bad = w.metaphorOptions.slice(1).map((o, i) => (!fl.some((g) => o.includes(g)) ? i : -1)).filter((i) => i >= 0)
  if (!bad.length) continue
  const used = new Set()
  for (const idx of bad) {
    const cand = fl.filter((g) => sceneFor(g).length && !used.has(g))
    let done = false
    for (const g of cand) {
      for (const scene of sceneFor(g)) {
        if (jaccard(w.metaphorOptions[0], scene) < 0.5) {
          w.metaphorOptions[idx + 1] = scene
          used.add(g)
          done = true
          fixed += 1
          break
        }
      }
      if (done) break
    }
    if (!done) failed.push(`${w.id}#${idx + 1}`)
  }
}
if (failed.length) console.error(`未能修复 ${failed.length}：${failed.join('、')}`)

// 回写 batch 文件
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.json')) continue
  const p = join(dir, f)
  const data = JSON.parse(readFileSync(p, 'utf8'))
  for (const w of words) {
    if (data[w.id]) data[w.id].metaphorOptions = w.metaphorOptions
  }
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8')
}
console.log(`✓ 自动修复 ${fixed} 个干扰项`)
