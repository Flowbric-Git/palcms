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

// The demo ships the example extensions built by the kit (sdk/examples/*/dist):
// served under /extensions/<id>/ in development, copied to dist-demo/extensions/ at build time.
const EXAMPLES_DIR = path.resolve('../../sdk/examples');
const exampleDists = () =>
  fs.existsSync(EXAMPLES_DIR)
    ? fs
        .readdirSync(EXAMPLES_DIR)
        .map((d) => path.join(EXAMPLES_DIR, d, 'dist'))
        .filter((d) => fs.existsSync(path.join(d, 'palcms.json')))
        .map((d) => ({ id: JSON.parse(fs.readFileSync(path.join(d, 'palcms.json'), 'utf8')).id as string, dir: d }))
    : [];

const demoExtensions = (): Plugin => ({
  name: 'demo-extensions',
  configureServer(server) {
    server.middlewares.use('/extensions', (req, res, next) => {
      const [id, ...rest] = (req.url ?? '').split('?')[0].split('/').filter(Boolean);
      const ext = exampleDists().find((e) => e.id === id);
      const file = ext && path.join(ext.dir, ...rest);
      if (!file || !file.startsWith(ext.dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
      const type = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)] ?? 'application/octet-stream';
      res.setHeader('Content-Type', type);
      fs.createReadStream(file).pipe(res);
    });
  },
  closeBundle() {
    for (const { id, dir } of exampleDists()) {
      // Server code does not run in the demo: its routes are simulated by demo/extensions.ts.
      fs.cpSync(dir, path.resolve('dist-demo', 'extensions', id), { recursive: true, filter: (f) => !/server\.js$|README\.md$/.test(f) });
    }
  },
});

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    // Relative paths: the server injects <base href="/cms/"> according to the path chosen at install.
    // The demo is served at the root of its own domain (demo.palcms.online).
    base: demo ? '/' : './',
    plugins: [react(), tailwindcss(), ...(demo ? [spaFallback(), demoExtensions()] : [])],
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
