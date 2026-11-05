import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { resolveTestDatabaseUrl, TEST_ASSETS_DIR } from './test-database.js';

async function withClient<T>(
  connectionString: string,
  run: (prisma: PrismaClient) => Promise<T>,
): Promise<T> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/** Recreates the test database from scratch and applies every migration. */
export default async function setup(): Promise<() => void> {
  const testUrl = resolveTestDatabaseUrl();
  const databaseName = new URL(testUrl).pathname.replace(/^\//, '');
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';

  await withClient(adminUrl.toString(), async (prisma) => {
    await prisma.$executeRawUnsafe(
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
    );
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  });

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });

  return () => rmSync(TEST_ASSETS_DIR, { recursive: true, force: true });
}
