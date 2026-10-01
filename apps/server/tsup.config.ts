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
  // The shared package is TypeScript: it is bundled in. The other dependencies
  // stay external and are installed by npm on the VPS.
  noExternal: [/^@palcms\/shared/],
});
