import { defineConfig } from 'vitest/config';

// Angular owns spec discovery and the browser environment. Keep Node-only
// include/exclude patterns in vitest.config.ts, used by npm run test:unit.
export default defineConfig({
  test: {
    browser: {
      api: {
        host: '127.0.0.1',
        port: 51204,
      },
    },
  },
});
