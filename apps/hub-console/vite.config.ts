import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 本地开发：console(5174) 通过 proxy 把 /api 与 /health 转到本地 hub-server(4177)，
// 真实模式用相对路径同源访问、免 CORS。改端口直接改这里。
const API_TARGET = 'http://127.0.0.1:4177';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // 入口 chunk 曾超 500kB 触发 vite 警告：把稳定的框架层拆出去，业务代码更新时
        // 用户浏览器还能命中 vendor 缓存。@xyflow 不在此列——它只被懒加载的依赖图页
        // 消费，留在那个按需 chunk 里。
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-data': ['@tanstack/react-query', 'zod'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 5174,
    strictPort: false,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/health': { target: API_TARGET, changeOrigin: true },
    },
  },
});
