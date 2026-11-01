import {
  formatTicketCode,
  type Ticket as TicketDto,
  type TicketStatus,
} from '@mimir/contracts';
import type { Ticket } from '../generated/prisma/client.js';

export type TicketWithProjectKey = Ticket & {
  project: { key: string };
  labels: { labelId: string }[];
  dependencies: {
    dependsOnTicketId: string;
    dependsOn: { status: TicketStatus; archivedAt: Date | null };
  }[];
};

/**
 * Every ticket query must include these relations: the project key builds
 * the code, label links fill `labelIds` and dependencies drive `isBlocked`.
 */
export const TICKET_INCLUDE = {
  project: { select: { key: true } },
  labels: { select: { labelId: true } },
  dependencies: {
    select: {
      dependsOnTicketId: true,
      dependsOn: { select: { status: true, archivedAt: true } },
    },
  },
} as const;

const RESOLVED_STATUSES: readonly TicketStatus[] = ['done', 'canceled'];

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
    labelIds: ticket.labels.map((link) => link.labelId).sort(),
    dependsOnTicketIds: ticket.dependencies
      .map((link) => link.dependsOnTicketId)
      .sort(),
    isBlocked: ticket.dependencies.some(
      ({ dependsOn }) =>
        dependsOn.archivedAt === null &&
        !RESOLVED_STATUSES.includes(dependsOn.status),
    ),
    sortOrder: ticket.sortOrder,
    dueAt: ticket.dueAt?.toISOString() ?? null,
    completedAt: ticket.completedAt?.toISOString() ?? null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    archivedAt: ticket.archivedAt?.toISOString() ?? null,
  };
}
