import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 本地开发：console(5174) 通过 proxy 把 /api 与 /health 转到本地 hub-server(4177)，
// 真实模式用相对路径同源访问、免 CORS。改端口直接改这里。
const API_TARGET = 'http://127.0.0.1:4177';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: false,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/health': { target: API_TARGET, changeOrigin: true },
    },
  },
});
