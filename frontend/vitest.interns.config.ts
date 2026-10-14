import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/app/pages/branch/branch-interns/*.spec.ts',
      'src/app/pages/branch/branch-employees/branch-intern-entry.spec.ts',
    ],
    setupFiles: ['@angular/compiler'],
  },
});
