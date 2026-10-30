import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  DEFAULT_WORKSPACE_ID,
  WorkspacesService,
} from '../src/workspaces/workspaces.service.js';
import { resetDatabase } from './support/reset-database.js';

async function bootApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('Default workspace bootstrap', () => {
  beforeEach(async () => {
    const app = await bootApp();
    await resetDatabase(app.get(PrismaService));
    await app.close();
  });

  it('creates the default workspace on startup', async () => {
    const app = await bootApp();
    try {
      const workspaces = await app.get(PrismaService).workspace.findMany();

      expect(workspaces).toEqual([
        expect.objectContaining({ id: DEFAULT_WORKSPACE_ID, name: 'Personal' }),
      ]);
    } finally {
      await app.close();
    }
  });

  it('is idempotent across restarts and keeps user changes', async () => {
    const first = await bootApp();
    await first.get(PrismaService).workspace.update({
      where: { id: DEFAULT_WORKSPACE_ID },
      data: { name: 'Renamed by user' },
    });
    await first.close();

    const second = await bootApp();
    try {
      const workspaces = await second.get(PrismaService).workspace.findMany();

      expect(workspaces).toHaveLength(1);
      expect(workspaces[0].name).toBe('Renamed by user');
    } finally {
      await second.close();
    }
  });

  it('recreates the default workspace lazily when it is missing', async () => {
    const app = await bootApp();
    try {
      const prisma = app.get(PrismaService);
      await prisma.workspace.deleteMany();

      const workspace = await app.get(WorkspacesService).getDefault();

      expect(workspace.id).toBe(DEFAULT_WORKSPACE_ID);
      await expect(prisma.workspace.count()).resolves.toBe(1);
    } finally {
      await app.close();
    }
  });
});
