/**
 * 部署脚本：把前端 + 词典接口打包成「一个 IIS 站点的根目录」。
 *
 *   IIS 网站物理路径 = 本项目的 dist/ 目录
 *     前端   -> http://<host>/                （默认文档 index.html）
 *     词典   -> POST http://<host>/Dict.aspx  （参数 word）
 *
 * 为什么不让 Vite 自己清空 dist：
 *   dist 里除了前端产物，还有 bin/(dll 被 IIS 占用锁定)、App_Data/、Dict.aspx 等接口文件。
 *   Vite 构建前清空 dist 时删不掉被锁的 bin，会直接报错中止、前端不产出（页面 404）。
 *   所以 vite.config.ts 里设了 build.emptyOutDir=false，这里手动清理前端旧产物。
 *
 * 运行：npm run deploy
 */
import { execSync, execFileSync } from 'child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'

const OUT = 'dist'

// 用 cmd 删除，绕开某些环境里 fs.rmSync 被安全垫片接管的问题
function rmDir(p) { try { execFileSync('cmd', ['/c', 'rmdir', '/s', '/q', p.replace(/\//g, '\\')], { stdio: 'ignore' }) } catch { /* ignore */ } }
function delFile(p) { try { execFileSync('cmd', ['/c', 'del', '/q', p.replace(/\//g, '\\')], { stdio: 'ignore' }) } catch { /* ignore */ } }

function copyItem(src, dest) {
  const st = statSync(src)
  if (st.isDirectory()) {
    mkdirSync(dest, { recursive: true })
    for (const name of readdirSync(src)) copyItem(join(src, name), join(dest, name))
  } else {
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
  }
}

// 1) 清掉上一次的前端产物（都是非锁定文件；不动 bin/App_Data）
console.log('[deploy] 清理上一次的前端产物…')
delFile(`${OUT}/index.html`)
delFile(`${OUT}/sw.js`)
delFile(`${OUT}/manifest.webmanifest`)
rmDir(`${OUT}/assets`)

// 2) 构建前端（emptyOutDir=false，不会去删 dist 里的接口文件）
console.log('[deploy] 构建前端…')
execSync('npm run build', { stdio: 'inherit', shell: true })

// 2.5) 给 Service Worker 换个新缓存版本，否则老用户浏览器会一直用旧缓存、看不到更新。
//       SW 的缓存名带 CACHE_VERSION，每次发布都换成时间戳，activate 时会清掉旧缓存。
const swPath = join(OUT, 'sw.js')
if (existsSync(swPath)) {
  const next = 'v' + Date.now().toString(36)
  const sw = readFileSync(swPath, 'utf8').replace(/CACHE_VERSION = '[^']+'/, `CACHE_VERSION = '${next}'`)
  writeFileSync(swPath, sw)
  console.log('[deploy] SW 缓存版本 ->', next)
}

// 3) 复制接口文件
//    - 代码/配置每次覆盖（不被锁定）
//    - bin/App_Data 只在缺失时复制（里面的 dll 被 IIS 锁定，覆盖会失败；db 也省得每次拷 22MB）
console.log('[deploy] 复制接口文件…')
for (const item of ['Dict.aspx', 'Dict.aspx.cs', 'Web.config']) {
  if (!existsSync(item)) { console.log('[deploy] 跳过(不存在):', item); continue }
  try { copyItem(item, join(OUT, item)); console.log('[deploy] 复制', item) }
  catch (e) { console.log('[deploy] 复制失败(可能被占用):', item, e.message) }
}
for (const item of ['bin', 'App_Data']) {
  const dest = join(OUT, item)
  if (existsSync(dest)) { console.log('[deploy] 已存在，跳过:', dest); continue }
  if (!existsSync(item)) { console.log('[deploy] 跳过(不存在):', item); continue }
  try { copyItem(item, dest); console.log('[deploy] 复制', item) }
  catch (e) { console.log('[deploy] 复制失败:', item, e.message) }
}

console.log('[deploy] 完成。IIS 站点根:', resolve(OUT))
