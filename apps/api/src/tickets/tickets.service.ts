import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  parseTicketCode,
  type CreateTicketInput,
  type ListTicketsQuery,
  type TicketStatus,
} from '@mimir/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { escapeLike } from '../common/escape-like.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { TICKET_INCLUDE, type TicketWithProjectKey } from './ticket.mapper.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Tx = Prisma.TransactionClient;

/** Nullable JSON columns need DbNull to store SQL NULL. */
function toJsonInput(
  value: Record<string, unknown> | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly workspaces: WorkspacesService,
  ) {}

  async create(
    projectId: string,
    input: CreateTicketInput,
  ): Promise<TicketWithProjectKey> {
    await this.assertProjectAcceptsTickets(projectId);
    return this.prisma.$transaction(async (tx) => {
      const number = await this.reserveNumber(tx, projectId);
      return tx.ticket.create({
        data: {
          projectId,
          number,
          title: input.title,
          descriptionJson: toJsonInput(input.descriptionJson),
          descriptionText: input.descriptionText,
          type: input.type,
          status: input.status,
          priority: input.priority,
          dueAt: input.dueAt === null ? null : new Date(input.dueAt),
          completedAt: input.status === 'done' ? new Date() : null,
          sortOrder: await this.nextSortOrder(tx, projectId, input.status),
        },
        include: TICKET_INCLUDE,
      });
    });
  }

  /** Resolves a ticket by UUID or by code (`SB-001`, case-insensitive). */
  async findByRef(ref: string): Promise<TicketWithProjectKey> {
    let ticket: TicketWithProjectKey | null;
    if (UUID_PATTERN.test(ref)) {
      ticket = await this.prisma.ticket.findUnique({
        where: { id: ref },
        include: TICKET_INCLUDE,
      });
    } else {
      const code = parseTicketCode(ref);
      if (!code) {
        throw new BadRequestException(
          'Expected a ticket id or code like SB-001',
        );
      }
      const workspace = await this.workspaces.getDefault();
      ticket = await this.prisma.ticket.findFirst({
        where: {
          number: code.number,
          project: { key: code.key, workspaceId: workspace.id },
        },
        include: TICKET_INCLUDE,
      });
    }
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async list(
    projectId: string,
    query: ListTicketsQuery,
  ): Promise<TicketWithProjectKey[]> {
    const project = await this.projects.findById(projectId);
    const where: Prisma.TicketWhereInput = {
      projectId,
      status: query.status ? { in: query.status } : undefined,
      type: query.type ? { in: query.type } : undefined,
      priority: query.priority ? { in: query.priority } : undefined,
    };
    if (query.archived === 'exclude') where.archivedAt = null;
    if (query.archived === 'only') where.archivedAt = { not: null };
    if (query.q) {
      const code = parseTicketCode(query.q);
      where.OR = [
        { title: { contains: escapeLike(query.q), mode: 'insensitive' } },
        ...(code?.key === project.key ? [{ number: code.number }] : []),
      ];
    }
    return this.prisma.ticket.findMany({
      where,
      orderBy: this.orderBy(query),
      include: TICKET_INCLUDE,
    });
  }

  private orderBy(
    query: ListTicketsQuery,
  ): Prisma.TicketOrderByWithRelationInput[] {
    const { sort, order } = query;
    const byNumber = { number: order } as const;
    switch (sort) {
      case 'position':
        return [{ sortOrder: order }, byNumber];
      case 'number':
        return [byNumber];
      case 'dueAt':
        return [{ dueAt: { sort: order, nulls: 'last' } }, byNumber];
      default:
        return [{ [sort]: order }, byNumber];
    }
  }

  private async assertProjectAcceptsTickets(projectId: string): Promise<void> {
    const project = await this.projects.findById(projectId);
    if (project.archivedAt) {
      throw new ConflictException('Cannot add tickets to an archived project');
    }
  }

  /**
   * Atomically reserves the next ticket number. The UPDATE row lock is held
   * until the transaction ends, so concurrent creators are serialized and a
   * failed insert rolls the reservation back.
   */
  private async reserveNumber(tx: Tx, projectId: string): Promise<number> {
    const counter = await tx.projectCounter.upsert({
      where: { projectId },
      create: { projectId, nextTicketNumber: 2 },
      update: { nextTicketNumber: { increment: 1 } },
    });
    return counter.nextTicketNumber - 1;
  }

  /** Position at the end of a status column. */
  private async nextSortOrder(
    tx: Tx,
    projectId: string,
    status: TicketStatus,
  ): Promise<number> {
    const { _max } = await tx.ticket.aggregate({
      where: { projectId, status },
      _max: { sortOrder: true },
    });
    return (_max.sortOrder ?? 0) + 1;
  }
}
