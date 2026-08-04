import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// 本地开发：console(5174) 通过 proxy 把 /api 与 /health 转到本地 hub-server(4177)，
// 真实模式用相对路径同源访问、免 CORS。改端口直接改这里。
const API_TARGET = 'http://127.0.0.1:4177';

const CONSOLE_DIR = path.dirname(fileURLToPath(import.meta.url));
// pdf.js 按名动态 fetch 的资源（CMap/标准字体）——12306 铁路电子客票等用中文 CID 字体的
// 发票缺这两个目录会整段丢字（标签全灭只剩数字），必须随产物伺服。体积 ~2.5MB、按需加载。
// 走 createRequire 定位包路径——workspaces 提升后不一定在 console 自己的 node_modules。
const PDFJS_DIST_DIR = path.dirname(
  createRequire(import.meta.url).resolve('pdfjs-dist/package.json'),
);
const PDFJS_ASSETS: Record<string, string> = {
  '/pdfjs/cmaps/': path.join(PDFJS_DIST_DIR, 'cmaps'),
  '/pdfjs/standard_fonts/': path.join(PDFJS_DIST_DIR, 'standard_fonts'),
};

/** dev 中间件直发 node_modules + build 结束拷进 dist/pdfjs/（免引 vite-plugin-static-copy）。 */
function pdfjsAssetsPlugin(): Plugin {
  return {
    name: 'teamhub-pdfjs-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        const prefix = Object.keys(PDFJS_ASSETS).find((p) => url.startsWith(p));
        if (!prefix) {
          next();
          return;
        }
        const filePath = path.join(PDFJS_ASSETS[prefix], decodeURIComponent(url.slice(prefix.length)));
        if (!filePath.startsWith(PDFJS_ASSETS[prefix]) || !existsSync(filePath) || !statSync(filePath).isFile()) {
          next();
          return;
        }
        res.setHeader('content-type', 'application/octet-stream');
        createReadStream(filePath).pipe(res);
      });
    },
    closeBundle() {
      for (const [urlPrefix, srcDir] of Object.entries(PDFJS_ASSETS)) {
        cpSync(srcDir, path.join(CONSOLE_DIR, 'dist', urlPrefix), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), pdfjsAssetsPlugin()],
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
