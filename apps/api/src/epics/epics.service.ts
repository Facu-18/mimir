import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateEpicInput,
  Epic as EpicDto,
  ListEpicsQuery,
  UpdateEpicInput,
} from '@mimir/contracts';
import type { Epic, Prisma } from '../generated/prisma/client.js';
import { hasPrismaCode } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';

const RECORD_NOT_FOUND = 'P2025';

export function toEpicDto(epic: Epic): EpicDto {
  return {
    id: epic.id,
    projectId: epic.projectId,
    title: epic.title,
    description: epic.description,
    status: epic.status,
    createdAt: epic.createdAt.toISOString(),
    updatedAt: epic.updatedAt.toISOString(),
    archivedAt: epic.archivedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class EpicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  async create(projectId: string, input: CreateEpicInput): Promise<Epic> {
    const project = await this.projects.findById(projectId);
    if (project.archivedAt) {
      throw new ConflictException('Cannot add epics to an archived project');
    }
    return this.prisma.epic.create({ data: { ...input, projectId } });
  }

  async list(projectId: string, query: ListEpicsQuery): Promise<Epic[]> {
    await this.projects.findById(projectId);
    const where: Prisma.EpicWhereInput = { projectId };
    if (query.archived === 'exclude') where.archivedAt = null;
    if (query.archived === 'only') where.archivedAt = { not: null };
    return this.prisma.epic.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async findById(id: string): Promise<Epic> {
    const epic = await this.prisma.epic.findUnique({ where: { id } });
    if (!epic) throw new NotFoundException('Epic not found');
    return epic;
  }

  update(id: string, input: UpdateEpicInput): Promise<Epic> {
    return this.updateOrNotFound(id, input);
  }

  async archive(id: string): Promise<Epic> {
    const epic = await this.findById(id);
    if (epic.archivedAt) return epic;
    return this.updateOrNotFound(id, { archivedAt: new Date() });
  }

  async restore(id: string): Promise<Epic> {
    const epic = await this.findById(id);
    if (!epic.archivedAt) return epic;
    return this.updateOrNotFound(id, { archivedAt: null });
  }

  private async updateOrNotFound(
    id: string,
    data: Prisma.EpicUpdateInput,
  ): Promise<Epic> {
    try {
      return await this.prisma.epic.update({ where: { id }, data });
    } catch (error) {
      if (hasPrismaCode(error, RECORD_NOT_FOUND)) {
        throw new NotFoundException('Epic not found');
      }
      throw error;
    }
  }
}
