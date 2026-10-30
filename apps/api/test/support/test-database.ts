import 'dotenv/config';

const DEFAULT_TEST_DATABASE_URL =
  'postgresql://mimir:mimir@localhost:5433/mimir_test';

/**
 * Resolves the integration-test database URL and refuses anything whose
 * database name does not end in `_test`, so tests can never wipe dev data.
 */
export function resolveTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  const databaseName = new URL(url).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run integration tests against "${databaseName}": TEST_DATABASE_URL must point to a database ending in "_test".`,
    );
  }
  return url;
}
