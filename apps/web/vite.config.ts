import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const api = 'http://127.0.0.1:3000';

// For static hosting without a fallback to index.html: copy the page to 404.html
// so that direct links (/map, /admin...) work.
const spaFallback = (): Plugin => ({
  name: 'spa-fallback',
  closeBundle() {
    const dir = path.resolve('dist-demo');
    fs.copyFileSync(path.join(dir, 'index.html'), path.join(dir, '404.html'));
  },
});

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    // Relative paths: the server injects <base href="/cms/"> according to the path chosen at install.
    // The demo is served at the root of its own domain (demo.palcms.online).
    base: demo ? '/' : './',
    plugins: [react(), tailwindcss(), ...(demo ? [spaFallback()] : [])],
    server: {
      port: 5173,
      proxy: {
        // changeOrigin: false keeps the browser Host header, like Nginx in production.
        '/api': { target: api, changeOrigin: false },
        '/uploads': { target: api, changeOrigin: false },
        '/extensions': { target: api, changeOrigin: false },
        '/ws': { target: api, ws: true, changeOrigin: false },
      },
    },
    build: {
      outDir: demo ? 'dist-demo' : 'dist',
      chunkSizeWarningLimit: 900,
    },
  };
});
