const get = async (name) => {
  const res = await fetch(`https://registry.npmmirror.com/${name}`)
  const json = await res.json()
  return json
}

const show = (label, doc, filter) => {
  console.log(`\n=== ${label} ===`)
  const entries = Object.entries(doc.time || {})
    .filter(([v]) => filter(v))
    .map(([v, t]) => [v, new Date(t).toISOString()])
    .sort((a, b) => (a[1] < b[1] ? -1 : 1))
  for (const [v, t] of entries.slice(-25)) console.log(` ${t}  ${v}`)
  console.log(' dist-tags:', JSON.stringify(doc['dist-tags']))
}

const vitest = await get('vitest')
show('vitest', vitest, (v) => /^[45]\.\d+\.\d+$/.test(v))

const vite = await get('vite')
show('vite', vite, (v) => /^[78]\.\d+\.\d+$/.test(v))

const pr = await get('@vitejs/plugin-react')
show('@vitejs/plugin-react', pr, (v) => /^[456]\.\d+\.\d+$/.test(v))
console.log('\nplugin-react 6.1.1 peerDeps:', JSON.stringify(pr.versions['6.1.1']?.peerDependencies))
console.log('vitest 5.0.0 engines:', JSON.stringify(vitest.versions['5.0.0']?.engines))
const v4 = Object.keys(vitest.versions).filter((v) => v.startsWith('4.')).sort().at(-1)
console.log('最新 vitest 4.x =', v4, ' peer vite:', JSON.stringify(vitest.versions[v4]?.peerDependencies?.vite))
