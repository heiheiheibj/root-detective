import fs from 'node:fs'
const log = (...a) => console.log(...a)
const raw = 'scripts/.work/raw/'

const ecdict = fs.readFileSync(raw + 'ecdict.csv', 'utf8').split('\n')
log('ecdict 表头:', ecdict[0])
log('ecdict 行数:', ecdict.length - 1)

log('links 前 3 行:', fs.readFileSync(raw + 'links.csv', 'utf8').split('\n').slice(0, 3).join(' | '))

log('morphynet 前 3 行:')
fs.readFileSync(raw + 'morphynet-eng-derivational.tsv', 'utf8').split('\n').slice(0, 3).forEach((l) => log('  ' + l))

const wr = JSON.parse(fs.readFileSync(raw + 'wordroot.txt', 'utf8'))
log('wordroot 是 JSON，条数:', Object.keys(wr).length)
log('  hom 这条:', JSON.stringify(wr.hom))

const cg = JSON.parse(fs.readFileSync(raw + 'cigen-roots_affixes.json', 'utf8'))
log('cigen roots:', cg.roots.length, 'entries:', cg.entries.length)
log('  entry 样例:', JSON.stringify(cg.entries[0]))

log('')
log('raw 目录文件清单:')
for (const f of fs.readdirSync(raw)) {
  const st = fs.statSync(raw + f)
  log('  ' + f, (st.size / 1024 / 1024).toFixed(1) + 'MB')
}
