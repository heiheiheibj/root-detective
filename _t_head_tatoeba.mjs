import { createReadStream, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))
const raw = join(here, 'scripts', '.work', 'raw')
for (const f of ['tatoeba-eng-sentences.tsv', 'tatoeba-cmn-sentences.tsv', 'links.csv']) {
  const p = join(raw, f)
  console.log('===', f, 'size=', statSync(p).size)
  const fs = createReadStream(p, { encoding: 'utf8' })
  let buf = ''; let lines = 0
  for await (const chunk of fs) {
    buf += chunk
    let i
    while ((i = buf.indexOf('\n')) >= 0 && lines < 3) {
      console.log(JSON.stringify(buf.slice(0, i))); buf = buf.slice(i + 1); lines++
    }
    if (lines >= 3) break
  }
  console.log('')
}
