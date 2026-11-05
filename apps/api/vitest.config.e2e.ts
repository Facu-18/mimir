import { defineConfig } from 'vitest/config';
import {
  resolveTestDatabaseUrl,
  TEST_ASSETS_DIR,
} from './test/support/test-database.js';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts', 'test/**/*.int-spec.ts'],
    globalSetup: ['./test/support/global-setup.ts'],
    env: {
      DATABASE_URL: resolveTestDatabaseUrl(),
      // Never the real assets directory; the global setup removes it afterwards.
      ASSETS_DIR: TEST_ASSETS_DIR,
    },
    // All files share one database, so they must not run concurrently.
    fileParallelism: false,
  },
});
