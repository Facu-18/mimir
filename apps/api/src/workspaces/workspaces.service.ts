import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { Workspace } from '../generated/prisma/client.js';
import { isDatabaseUnavailableError } from '../prisma/database-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Fixed id so every install and restart resolves the same workspace. */
export const DEFAULT_WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
export const DEFAULT_WORKSPACE_NAME = 'Personal';

@Injectable()
export class WorkspacesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.ensureDefault();
    } catch (error) {
      if (!isDatabaseUnavailableError(error)) throw error;
      // Keep the API up so health checks can report the outage; the
      // workspace is created lazily by getDefault() once the DB is back.
      this.logger.error(
        'Database unavailable at startup; the default workspace will be created when it becomes reachable.',
      );
    }
  }

  /** Creates the default workspace if missing; never overwrites user edits. */
  ensureDefault(): Promise<Workspace> {
    return this.prisma.workspace.upsert({
      where: { id: DEFAULT_WORKSPACE_ID },
      create: { id: DEFAULT_WORKSPACE_ID, name: DEFAULT_WORKSPACE_NAME },
      update: {},
    });
  }

  async getDefault(): Promise<Workspace> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: DEFAULT_WORKSPACE_ID },
    });
    return workspace ?? this.ensureDefault();
  }
}
