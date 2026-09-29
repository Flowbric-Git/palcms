import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  // Le paquet partagé est en TypeScript : on l'intègre au bundle. Les autres dépendances
  // restent externes et sont installées par npm sur le VPS.
  noExternal: [/^@palcms\/shared/],
});
