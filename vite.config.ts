 // vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // 开发环境下的 source map 配置
  build: {
    sourcemap: true, // 生产构建也开启（按需）
  },
  server: {
    port: 5173, // 确保端口与 launch.json 一致
  },
})