import { fileURLToPath } from 'node:url';
import { searchForWorkspaceRoot } from 'vite';
import { defineConfig } from 'vitest/config';

// Layout specs save review screenshots to the repository's docs/reviews
// folder. Vitest only writes screenshots inside server.fs.allow, so allow
// that one folder next to the default workspace root.
const reviewScreenshots = fileURLToPath(new URL('../docs/reviews', import.meta.url));

// Angular owns spec discovery and the browser environment. Keep Node-only
// include/exclude patterns in vitest.config.ts, used by npm run test:unit.
export default defineConfig({
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), reviewScreenshots],
    },
  },
  test: {
    browser: {
      api: {
        host: '127.0.0.1',
        port: 51204,
      },
    },
  },
});
