import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const api = 'http://127.0.0.1:3000';

// Pour les hébergements statiques sans redirection vers index.html : on copie la page en 404.html
// pour que les liens directs (/carte, /admin...) fonctionnent.
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
    // Chemins relatifs : le serveur injecte <base href="/cms/"> selon le chemin choisi à l'installation.
    // La démo est servie à la racine de son propre domaine (demo.palcms.online).
    base: demo ? '/' : './',
    plugins: [react(), tailwindcss(), ...(demo ? [spaFallback()] : [])],
    server: {
      port: 5173,
      proxy: {
        // changeOrigin: false garde l'en-tête Host du navigateur, comme Nginx en production.
        '/api': { target: api, changeOrigin: false },
        '/uploads': { target: api, changeOrigin: false },
        '/ws': { target: api, ws: true, changeOrigin: false },
      },
    },
    build: {
      outDir: demo ? 'dist-demo' : 'dist',
      chunkSizeWarningLimit: 900,
    },
  };
});
