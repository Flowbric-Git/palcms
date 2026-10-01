import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Installed plugins are loaded by Node itself, as in production.
    server: { deps: { external: [/[\/]extensions[\/][^\/]+[\/]server\.js/] } },
  },
});
