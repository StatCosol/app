import { defineConfig } from 'vitest/config';

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
