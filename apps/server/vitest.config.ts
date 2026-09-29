import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Les plugins installés sont chargés par Node lui-même, comme en production.
    server: { deps: { external: [/[\/]extensions[\/][^\/]+[\/]server\.js/] } },
  },
});
