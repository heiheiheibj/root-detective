import { defineConfig } from 'vitest/config'

// 不挂 @vitejs/plugin-react：测试全部是纯领域函数（无 JSX）。
// plugin-react@6 在 vitest worker 里会抛 "Cannot read properties of undefined (reading 'config')"，
// 导致所有测试文件直接挂掉。
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})