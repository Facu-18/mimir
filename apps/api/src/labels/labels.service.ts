import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateLabelInput,
  Label as LabelDto,
  ListLabelsQuery,
  UpdateLabelInput,
} from '@mimir/contracts';
import type { Label, Prisma } from '../generated/prisma/client.js';
import { hasPrismaCode } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';

const UNIQUE_VIOLATION = 'P2002';
const RECORD_NOT_FOUND = 'P2025';

export function toLabelDto(label: Label): LabelDto {
  return {
    id: label.id,
    projectId: label.projectId,
    name: label.name,
    color: label.color,
  };
}

@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  /** Without a project: every label. With one: global labels plus its own. */
  async list(query: ListLabelsQuery): Promise<Label[]> {
    let where: Prisma.LabelWhereInput = {};
    if (query.projectId) {
      await this.projects.findById(query.projectId);
      where = { OR: [{ projectId: null }, { projectId: query.projectId }] };
    }
    return this.prisma.label.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async create(input: CreateLabelInput): Promise<Label> {
    if (input.projectId) await this.projects.findById(input.projectId);
    return this.translateErrors(input.name, () =>
      this.prisma.label.create({ data: input }),
    );
  }

  update(id: string, input: UpdateLabelInput): Promise<Label> {
    return this.translateErrors(input.name, () =>
      this.prisma.label.update({ where: { id }, data: input }),
    );
  }

  /** Physical delete: labels are tags; ticket_labels rows cascade. */
  async delete(id: string): Promise<void> {
    await this.translateErrors(undefined, () =>
      this.prisma.label.delete({ where: { id } }),
    );
  }

  private async translateErrors<T>(
    name: string | undefined,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (hasPrismaCode(error, UNIQUE_VIOLATION)) {
        throw new ConflictException(`Label "${name}" already exists`);
      }
      if (hasPrismaCode(error, RECORD_NOT_FOUND)) {
        throw new NotFoundException('Label not found');
      }
      throw error;
    }
  }
}
