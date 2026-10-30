import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { Workspace } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Fixed id so every install and restart resolves the same workspace. */
export const DEFAULT_WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
export const DEFAULT_WORKSPACE_NAME = 'Personal';

@Injectable()
export class WorkspacesService implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureDefault();
  }

  /** Creates the default workspace if missing; never overwrites user edits. */
  ensureDefault(): Promise<Workspace> {
    return this.prisma.workspace.upsert({
      where: { id: DEFAULT_WORKSPACE_ID },
      create: { id: DEFAULT_WORKSPACE_ID, name: DEFAULT_WORKSPACE_NAME },
      update: {},
    });
  }

  getDefault(): Promise<Workspace> {
    return this.prisma.workspace.findUniqueOrThrow({
      where: { id: DEFAULT_WORKSPACE_ID },
    });
  }
}
