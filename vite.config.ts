import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 测试时（vitest worker）不要加载 plugin-react@6：它在 vitest worker 里会抛
// "Cannot read properties of undefined (reading 'config')"，让所有测试文件直接挂掉。
// 测试全是纯领域函数、无 JSX，不需要 React 插件。dev/build 不受影响。
// 不直接用 process：仓库没装 @types/node，tsc -b 会报 TS2591。从 globalThis 上拿，
// 运行时行为完全一样（vitest/node 都注入 process.env）。
const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
const isTest = nodeEnv?.VITEST === 'true' || nodeEnv?.NODE_ENV === 'test'
export default defineConfig({
  plugins: isTest ? [] : [react()],
  // dist 是「前端成品 + 词典接口」的 IIS 站点根：构建产物写进 dist，
  // 但 dist 里同时有 bin/(dll 会被 IIS 占用锁定)、App_Data/、Dict.aspx 等接口文件。
  // 若让 Vite 清空 dist，删 bin 会失败并导致整个构建中止（前端不产出）——所以禁用它。
  // 前端旧产物（assets/index.html）由 scripts/deploy-iis.mjs 负责清理。
  build: { emptyOutDir: false },
})
