// 临时：算原始数据指纹，供交叉验证对齐输入。
import { createHash } from 'node:crypto'
import { createReadStream, statSync } from 'node:fs'

const files = [
  'scripts/.work/raw/ecdict.csv',
  'scripts/.work/raw/cigen-roots_affixes.json',
  'scripts/.work/raw/morphynet-eng-derivational.tsv',
  'scripts/.work/raw/wordroot.txt',
  'scripts/.work/raw/shiweihappy-roots.json',
  'scripts/.work/raw/kaikki-English.jsonl',
  'scripts/.work/derived/roots.candidates.json',
]
for (const f of files) {
  const size = statSync(f).size
  const hash = await new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(f).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject)
  })
  console.log(`${f}\n  bytes=${size}  sha256=${hash}`)
}
