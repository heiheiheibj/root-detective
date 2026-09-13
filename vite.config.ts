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
})
