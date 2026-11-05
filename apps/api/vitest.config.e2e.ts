import { defineConfig } from 'vitest/config';
import { resolveTestDatabaseUrl } from './test/support/test-database.js';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts', 'test/**/*.int-spec.ts'],
    globalSetup: ['./test/support/global-setup.ts'],
    env: { DATABASE_URL: resolveTestDatabaseUrl() },
    // All files share one database, so they must not run concurrently.
    fileParallelism: false,
  },
});
