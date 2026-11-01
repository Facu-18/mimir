import { formatTicketCode, type Ticket as TicketDto } from '@mimir/contracts';
import type { Ticket } from '../generated/prisma/client.js';

export type TicketWithProjectKey = Ticket & { project: { key: string } };

/** Every ticket query must include the project key so the code can be built. */
export const TICKET_INCLUDE = { project: { select: { key: true } } } as const;

export function toTicketDto(ticket: TicketWithProjectKey): TicketDto {
  return {
    id: ticket.id,
    projectId: ticket.projectId,
    number: ticket.number,
    code: formatTicketCode(ticket.project.key, ticket.number),
    title: ticket.title,
    descriptionJson: ticket.descriptionJson as TicketDto['descriptionJson'],
    descriptionText: ticket.descriptionText,
    type: ticket.type,
    status: ticket.status,
    priority: ticket.priority,
    parentId: ticket.parentId,
    epicId: ticket.epicId,
    sortOrder: ticket.sortOrder,
    dueAt: ticket.dueAt?.toISOString() ?? null,
    completedAt: ticket.completedAt?.toISOString() ?? null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    archivedAt: ticket.archivedAt?.toISOString() ?? null,
  };
}
