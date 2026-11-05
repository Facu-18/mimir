import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  formatTicketCode,
  type CanvasLink,
  type CanvasLinkTargetType,
  type CreateCanvasLinkInput,
} from '@mimir/contracts';
import type { EntityLink } from '../generated/prisma/client.js';
import { hasPrismaCode } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CanvasesService } from './canvases.service.js';

const UNIQUE_VIOLATION = 'P2002';

const TARGET_NAMES: Record<CanvasLinkTargetType, string> = {
  project: 'Project',
  ticket: 'Ticket',
  document: 'Document',
};

type Target = {
  id: string;
  title: string;
  code: string | null;
  archived: boolean;
};

/** `entity_links` has no foreign keys, so targets are validated here. */
@Injectable()
export class CanvasLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly canvases: CanvasesService,
  ) {}

  async list(canvasId: string): Promise<CanvasLink[]> {
    await this.canvases.findById(canvasId);
    const rows = await this.prisma.entityLink.findMany({
      where: { sourceType: 'canvas', sourceId: canvasId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const targets = new Map(
      await Promise.all(
        (Object.keys(TARGET_NAMES) as CanvasLinkTargetType[]).map(
          async (type) => {
            const ids = rows
              .filter((row) => row.targetType === type)
              .map((row) => row.targetId);
            return [type, await this.findTargets(type, ids)] as const;
          },
        ),
      ),
    );
    return rows.flatMap((row) => {
      const type = row.targetType as CanvasLinkTargetType;
      const target = targets.get(type)?.find(({ id }) => id === row.targetId);
      return target ? [toCanvasLink(row, type, target)] : [];
    });
  }

  async create(
    canvasId: string,
    input: CreateCanvasLinkInput,
  ): Promise<CanvasLink> {
    await this.canvases.findById(canvasId);
    const [target] = await this.findTargets(input.targetType, [input.targetId]);
    if (!target) {
      throw new NotFoundException(
        `${TARGET_NAMES[input.targetType]} not found`,
      );
    }
    if (target.archived) {
      throw new ConflictException(
        `Cannot link to an archived ${input.targetType}`,
      );
    }
    try {
      const row = await this.prisma.entityLink.create({
        data: {
          sourceType: 'canvas',
          sourceId: canvasId,
          targetType: input.targetType,
          targetId: input.targetId,
        },
      });
      return toCanvasLink(row, input.targetType, target);
    } catch (error) {
      if (hasPrismaCode(error, UNIQUE_VIOLATION)) {
        throw new ConflictException('Link already exists');
      }
      throw error;
    }
  }

  async remove(canvasId: string, linkId: string): Promise<void> {
    const { count } = await this.prisma.entityLink.deleteMany({
      where: { id: linkId, sourceType: 'canvas', sourceId: canvasId },
    });
    if (count === 0) throw new NotFoundException('Link not found');
  }

  private async findTargets(
    type: CanvasLinkTargetType,
    ids: string[],
  ): Promise<Target[]> {
    if (ids.length === 0) return [];
    const where = { id: { in: ids } };
    switch (type) {
      case 'project': {
        const rows = await this.prisma.project.findMany({ where });
        return rows.map((row) => ({
          id: row.id,
          title: row.name,
          code: null,
          archived: row.archivedAt !== null,
        }));
      }
      case 'ticket': {
        const rows = await this.prisma.ticket.findMany({
          where,
          include: { project: { select: { key: true } } },
        });
        return rows.map((row) => ({
          id: row.id,
          title: row.title,
          code: formatTicketCode(row.project.key, row.number),
          archived: row.archivedAt !== null,
        }));
      }
      case 'document': {
        const rows = await this.prisma.document.findMany({ where });
        return rows.map((row) => ({
          id: row.id,
          title: row.title,
          code: null,
          archived: row.archivedAt !== null,
        }));
      }
    }
  }
}

function toCanvasLink(
  row: EntityLink,
  targetType: CanvasLinkTargetType,
  target: Target,
): CanvasLink {
  return {
    id: row.id,
    targetType,
    targetId: row.targetId,
    title: target.title,
    code: target.code,
    archived: target.archived,
    createdAt: row.createdAt.toISOString(),
  };
}
