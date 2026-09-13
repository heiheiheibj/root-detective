import { readFileSync, existsSync, readdirSync } from 'node:fs'

const readVer = (pkg) => {
  const p = `node_modules/${pkg}/package.json`
  if (!existsSync(p)) return 'MISSING'
  return JSON.parse(readFileSync(p, 'utf8')).version
}

console.log('node        ', process.version)
console.log('vitest      ', readVer('vitest'))
console.log('vite        ', readVer('vite'))
console.log('plugin-react', readVer('@vitejs/plugin-react'))
console.log('react       ', readVer('react'))
console.log('typescript  ', readVer('typescript'))
console.log('OPENROUTER_API_KEY', process.env.OPENROUTER_API_KEY ? `len=${process.env.OPENROUTER_API_KEY.length}` : 'MISSING')
console.log('llm-cache   ', existsSync('scripts/.work/llm-cache') ? readdirSync('scripts/.work/llm-cache').length + ' 个文件' : '不存在')
console.log('derived     ', existsSync('scripts/.work/derived') ? readdirSync('scripts/.work/derived').join(', ') : '不存在')
console.log('content目录 ', existsSync('src/domain/content') ? readdirSync('src/domain/content').join(', ') : '不存在')
console.log('overrides   ', existsSync('scripts/overrides') ? readdirSync('scripts/overrides').join(', ') : '不存在')
console.log('quarantine  ', existsSync('scripts/.work/quarantine') ? '存在' : '不存在')
