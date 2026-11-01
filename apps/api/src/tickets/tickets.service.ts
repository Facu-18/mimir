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
  type UpdateTicketInput,
} from '@mimir/contracts';
import { isDeepStrictEqual } from 'node:util';
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
      const ticket = await this.insertTicket(tx, projectId, {
        ...input,
        descriptionJson: toJsonInput(input.descriptionJson),
        dueAt: input.dueAt === null ? null : new Date(input.dueAt),
      });
      await this.recordEvent(tx, ticket.id, 'ticket.created', {
        number: ticket.number,
      });
      return ticket;
    });
  }

  async update(
    id: string,
    input: UpdateTicketInput,
  ): Promise<TicketWithProjectKey> {
    if (input.parentId === id) {
      throw new BadRequestException('A ticket cannot be its own parent');
    }
    return this.prisma.$transaction(async (tx) => {
      // Graph writes take the project graph lock before any row lock.
      if (input.parentId !== undefined) {
        await this.lockGraph(tx, await this.projectIdOf(tx, id));
      }
      const current = await this.lockAndFind(tx, id);
      const data: Prisma.TicketUncheckedUpdateInput = {};
      const changes: Record<string, Prisma.InputJsonObject> = {};

      for (const field of ['title', 'type', 'status', 'priority'] as const) {
        const next = input[field];
        if (next !== undefined && next !== current[field]) {
          data[field] = next;
          changes[field] = { from: current[field], to: next };
        }
      }
      if (input.dueAt !== undefined) {
        const next = input.dueAt === null ? null : new Date(input.dueAt);
        if (next?.getTime() !== current.dueAt?.getTime()) {
          data.dueAt = next;
          changes.dueAt = {
            from: current.dueAt?.toISOString() ?? null,
            to: next?.toISOString() ?? null,
          };
        }
      }
      let descriptionChanged = false;
      if (
        input.descriptionJson !== undefined &&
        !isDeepStrictEqual(input.descriptionJson, current.descriptionJson)
      ) {
        data.descriptionJson = toJsonInput(input.descriptionJson);
        descriptionChanged = true;
      }
      if (
        input.descriptionText !== undefined &&
        input.descriptionText !== current.descriptionText
      ) {
        data.descriptionText = input.descriptionText;
        descriptionChanged = true;
      }
      // Rich text can be large; the history only notes that it changed.
      if (descriptionChanged) changes.description = { changed: true };

      if (input.epicId !== undefined && input.epicId !== current.epicId) {
        if (input.epicId !== null) {
          await this.assertAssignableEpic(tx, current.projectId, input.epicId);
        }
        data.epicId = input.epicId;
        changes.epicId = { from: current.epicId, to: input.epicId };
      }

      if (input.parentId !== undefined && input.parentId !== current.parentId) {
        if (input.parentId !== null) {
          await this.assertAssignableParent(tx, current, input.parentId);
        }
        data.parentId = input.parentId;
        changes.parentId = { from: current.parentId, to: input.parentId };
      }

      if (data.status !== undefined) {
        const status = data.status as TicketStatus;
        data.sortOrder = await this.nextSortOrder(
          tx,
          current.projectId,
          status,
        );
        if (status === 'done') data.completedAt = new Date();
        else if (current.status === 'done') data.completedAt = null;
      }

      if (Object.keys(changes).length === 0) return current;
      const updated = await tx.ticket.update({
        where: { id },
        data,
        include: TICKET_INCLUDE,
      });
      await this.recordEvent(tx, id, 'ticket.updated', { changes });
      return updated;
    });
  }

  /** Replaces the ticket's labels with exactly `labelIds`. */
  async setLabels(
    id: string,
    labelIds: string[],
  ): Promise<TicketWithProjectKey> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockAndFind(tx, id);
      const labels = await tx.label.findMany({
        where: { id: { in: labelIds } },
      });
      if (labels.length !== labelIds.length) {
        throw new NotFoundException('Label not found');
      }
      if (
        labels.some(
          (l) => l.projectId !== null && l.projectId !== current.projectId,
        )
      ) {
        throw new BadRequestException(
          'Label must belong to the same project or be global',
        );
      }
      const existing = current.labels.map((link) => link.labelId);
      const added = labelIds.filter((labelId) => !existing.includes(labelId));
      const removed = existing.filter((labelId) => !labelIds.includes(labelId));
      if (added.length === 0 && removed.length === 0) return current;

      await tx.ticketLabel.deleteMany({
        where: { ticketId: id, labelId: { in: removed } },
      });
      await tx.ticketLabel.createMany({
        data: added.map((labelId) => ({ ticketId: id, labelId })),
      });
      await this.recordEvent(tx, id, 'ticket.labels_changed', {
        added,
        removed,
      });
      return this.findByIdOrThrow(tx, id);
    });
  }

  archive(id: string): Promise<TicketWithProjectKey> {
    return this.setArchived(id, true);
  }

  restore(id: string): Promise<TicketWithProjectKey> {
    return this.setArchived(id, false);
  }

  /** Copies a ticket under a new number, back in the backlog. */
  async duplicate(id: string): Promise<TicketWithProjectKey> {
    const source = await this.findByIdOrThrow(this.prisma, id);
    await this.assertProjectAcceptsTickets(source.projectId);
    return this.prisma.$transaction(async (tx) => {
      const ticket = await this.insertTicket(tx, source.projectId, {
        title: source.title,
        descriptionJson: toJsonInput(
          source.descriptionJson as Record<string, unknown> | null,
        ),
        descriptionText: source.descriptionText,
        type: source.type,
        status: 'backlog',
        priority: source.priority,
        dueAt: source.dueAt,
      });
      await this.recordEvent(tx, ticket.id, 'ticket.duplicated', {
        sourceTicketId: source.id,
        number: ticket.number,
      });
      return ticket;
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
      epicId: query.epicId,
      parentId: query.parentId === 'none' ? null : query.parentId,
      labels: query.labelId ? { some: { labelId: query.labelId } } : undefined,
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

  private async setArchived(
    id: string,
    archived: boolean,
  ): Promise<TicketWithProjectKey> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockAndFind(tx, id);
      if ((current.archivedAt !== null) === archived) return current;
      const updated = await tx.ticket.update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null },
        include: TICKET_INCLUDE,
      });
      await this.recordEvent(
        tx,
        id,
        archived ? 'ticket.archived' : 'ticket.restored',
        {},
      );
      return updated;
    });
  }

  /**
   * Inserts a ticket with a freshly reserved number at the end of its status
   * column. Must run inside the caller's transaction.
   */
  private async insertTicket(
    tx: Tx,
    projectId: string,
    fields: Omit<
      Prisma.TicketUncheckedCreateInput,
      'projectId' | 'number' | 'sortOrder' | 'completedAt'
    > & { status: TicketStatus },
  ): Promise<TicketWithProjectKey> {
    const number = await this.reserveNumber(tx, projectId);
    return tx.ticket.create({
      data: {
        ...fields,
        projectId,
        number,
        completedAt: fields.status === 'done' ? new Date() : null,
        sortOrder: await this.nextSortOrder(tx, projectId, fields.status),
      },
      include: TICKET_INCLUDE,
    });
  }

  /**
   * Locks the ticket row for the rest of the transaction before reading it,
   * so concurrent writers (double clicks, retries) see each other's changes
   * and never record the same change twice.
   */
  private async lockAndFind(tx: Tx, id: string): Promise<TicketWithProjectKey> {
    // NO KEY UPDATE still serializes writers of this row but, unlike FOR
    // UPDATE, does not block foreign-key checks from rows that reference it.
    await tx.$queryRaw`SELECT id FROM tickets WHERE id = ${id}::uuid FOR NO KEY UPDATE`;
    return this.findByIdOrThrow(tx, id);
  }

  private async projectIdOf(tx: Tx, id: string): Promise<string> {
    const ticket = await tx.ticket.findUnique({
      where: { id },
      select: { projectId: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket.projectId;
  }

  /**
   * Serializes parent/dependency writes within a project for the rest of the
   * transaction, so two concurrent writes cannot jointly close a cycle.
   * Lock order: graph lock first, then row locks.
   */
  private async lockGraph(tx: Tx, projectId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ticket-graph:${projectId}`}, 0))`;
  }

  private async assertAssignableParent(
    tx: Tx,
    ticket: TicketWithProjectKey,
    parentId: string,
  ): Promise<void> {
    const parent = await tx.ticket.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Parent ticket not found');
    if (parent.projectId !== ticket.projectId) {
      throw new BadRequestException('Parent must belong to the same project');
    }
    if (parent.archivedAt) {
      throw new ConflictException('Cannot link to an archived ticket');
    }
    // Walk up from the new parent; reaching the ticket means it would become
    // its own ancestor.
    const [cycle] = await tx.$queryRaw<{ found: boolean }[]>`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id FROM tickets WHERE id = ${parentId}::uuid
        UNION
        SELECT t.id, t.parent_id FROM tickets t
        JOIN ancestors a ON t.id = a.parent_id
      )
      SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = ${ticket.id}::uuid) AS found`;
    if (cycle?.found) {
      throw new ConflictException('Parent would create a cycle');
    }
  }

  private async findByIdOrThrow(
    client: Tx,
    id: string,
  ): Promise<TicketWithProjectKey> {
    const ticket = await client.ticket.findUnique({
      where: { id },
      include: TICKET_INCLUDE,
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  private async recordEvent(
    tx: Tx,
    ticketId: string,
    eventType: string,
    payload: Prisma.InputJsonObject,
  ): Promise<void> {
    await tx.activityEvent.create({
      data: {
        entityType: 'ticket',
        entityId: ticketId,
        eventType,
        payloadJson: payload,
      },
    });
  }

  private async assertAssignableEpic(
    tx: Tx,
    projectId: string,
    epicId: string,
  ): Promise<void> {
    const epic = await tx.epic.findUnique({ where: { id: epicId } });
    if (!epic) throw new NotFoundException('Epic not found');
    if (epic.projectId !== projectId) {
      throw new BadRequestException('Epic must belong to the same project');
    }
    if (epic.archivedAt) {
      throw new ConflictException('Cannot assign an archived epic');
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
