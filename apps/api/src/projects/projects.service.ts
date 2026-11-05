import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateProjectInput,
  ListProjectsQuery,
  UpdateProjectInput,
} from '@mimir/contracts';
import type { Prisma, Project } from '../generated/prisma/client.js';
import { escapeLike } from '../common/escape-like.js';
import { hasPrismaCode } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';

const UNIQUE_VIOLATION = 'P2002';
const RECORD_NOT_FOUND = 'P2025';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesService,
  ) {}

  async create(input: CreateProjectInput): Promise<Project> {
    const workspace = await this.workspaces.getDefault();
    try {
      // The counter row is created in the same statement so ticket numbering
      // (TSK-001) can always reserve numbers transactionally.
      return await this.prisma.project.create({
        data: { ...input, workspaceId: workspace.id, counter: { create: {} } },
      });
    } catch (error) {
      if (hasPrismaCode(error, UNIQUE_VIOLATION)) {
        throw new ConflictException(
          `Project key "${input.key}" already exists`,
        );
      }
      throw error;
    }
  }

  async list(query: ListProjectsQuery): Promise<Project[]> {
    const workspace = await this.workspaces.getDefault();
    const where: Prisma.ProjectWhereInput = {
      workspaceId: workspace.id,
      status: query.status,
      isFavorite: query.isFavorite,
    };
    if (query.archived === 'exclude') where.archivedAt = null;
    if (query.archived === 'only') where.archivedAt = { not: null };
    if (query.q) {
      where.OR = [
        { name: { contains: escapeLike(query.q), mode: 'insensitive' } },
        { key: { contains: escapeLike(query.q), mode: 'insensitive' } },
      ];
    }
    return this.prisma.project.findMany({
      where,
      orderBy: [{ isFavorite: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findById(id: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    const { key: _immutableKey, ...data } = input;
    if (data.status !== undefined) {
      // Archive state is owned by archive/restore; a direct status change
      // would leave status and archivedAt out of sync.
      const project = await this.findById(id);
      if (project.archivedAt) {
        throw new ConflictException(
          'Restore the project before changing its status',
        );
      }
    }
    return this.updateOrNotFound(id, data);
  }

  async archive(id: string): Promise<Project> {
    const project = await this.findById(id);
    if (project.archivedAt) return project;
    return this.updateOrNotFound(id, {
      status: 'archived',
      archivedAt: new Date(),
    });
  }

  async restore(id: string): Promise<Project> {
    const project = await this.findById(id);
    if (!project.archivedAt && project.status !== 'archived') return project;
    return this.updateOrNotFound(id, { status: 'active', archivedAt: null });
  }

  private async updateOrNotFound(
    id: string,
    data: Prisma.ProjectUpdateInput,
  ): Promise<Project> {
    try {
      return await this.prisma.project.update({ where: { id }, data });
    } catch (error) {
      if (hasPrismaCode(error, RECORD_NOT_FOUND)) {
        throw new NotFoundException('Project not found');
      }
      throw error;
    }
  }
}
