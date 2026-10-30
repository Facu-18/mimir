import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

describe('Test database isolation', () => {
  it('runs integration tests against a dedicated *_test database', async () => {
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    });
    try {
      const [row] = await prisma.$queryRaw<{ db: string }[]>`
        SELECT current_database() AS db`;
      expect(row.db).toMatch(/_test$/);
    } finally {
      await prisma.$disconnect();
    }
  });
});

describe('resolveTestDatabaseUrl', () => {
  const original = process.env.TEST_DATABASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = original;
  });

  it('refuses a database whose name does not end in _test', async () => {
    const { resolveTestDatabaseUrl } =
      await import('./support/test-database.js');
    process.env.TEST_DATABASE_URL =
      'postgresql://mimir:mimir@localhost:5433/mimir';

    expect(() => resolveTestDatabaseUrl()).toThrow(
      'Refusing to run integration tests against "mimir"',
    );
  });
});
