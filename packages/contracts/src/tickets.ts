import { z } from 'zod';

export const TICKET_TYPES = ['task', 'bug', 'feature', 'improvement'] as const;
export const TICKET_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'canceled',
] as const;
export const TICKET_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;

export const ticketTypeSchema = z.enum(TICKET_TYPES);
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);

const TICKET_CODE_PATTERN = /^([A-Z][A-Z0-9]{1,9})-(\d+)$/;

/** `tickets.number` is a Postgres int4; larger numbers cannot exist. */
export const MAX_TICKET_NUMBER = 2_147_483_647;

/** `SB` + 1 → `SB-001`; numbers above 999 keep all their digits. */
export function formatTicketCode(projectKey: string, number: number): string {
  return `${projectKey}-${String(number).padStart(3, '0')}`;
}

/** Parses `sb-007` → `{ key: 'SB', number: 7 }`, or null when not a code. */
export function parseTicketCode(text: string): { key: string; number: number } | null {
  const match = TICKET_CODE_PATTERN.exec(text.trim().toUpperCase());
  if (!match) return null;
  const number = Number(match[2]);
  return number >= 1 && number <= MAX_TICKET_NUMBER
    ? { key: match[1], number }
    : null;
}

const titleSchema = z
  .string()
  .trim()
  .min(1, { error: 'Title is required' })
  .max(200, { error: 'Title must be at most 200 characters' });

const descriptionJsonSchema = z
  .record(z.string(), z.unknown(), { error: 'Description must be a JSON object' })
  .nullable();

const descriptionTextSchema = z
  .string()
  .max(100_000, { error: 'Description text must be at most 100000 characters' });

const dueAtSchema = z.iso
  .datetime({ offset: true, error: 'Due date must be an ISO 8601 date-time' })
  .nullable();

export const createTicketSchema = z.strictObject({
  title: titleSchema,
  descriptionJson: descriptionJsonSchema.default(null),
  descriptionText: descriptionTextSchema.default(''),
  type: ticketTypeSchema.default('task'),
  status: ticketStatusSchema.default('backlog'),
  priority: ticketPrioritySchema.default('none'),
  dueAt: dueAtSchema.default(null),
});

export const updateTicketSchema = z
  .strictObject({
    title: titleSchema.optional(),
    descriptionJson: descriptionJsonSchema.optional(),
    descriptionText: descriptionTextSchema.optional(),
    type: ticketTypeSchema.optional(),
    status: ticketStatusSchema.optional(),
    priority: ticketPrioritySchema.optional(),
    dueAt: dueAtSchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    error: 'At least one field must be provided',
  });

/** Query-string list like `todo,in_progress`, validated against `values`. */
function csvEnumList<const T extends readonly [string, ...string[]]>(values: T) {
  const allowed = new Set<string>(values);
  return z.string().transform((raw, ctx) => {
    const items = raw.split(',').map((item) => item.trim());
    const invalid = items.filter((item) => !allowed.has(item));
    if (invalid.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid value(s) ${invalid.map((v) => `"${v}"`).join(', ')}; expected ${values.join(', ')}`,
      });
      return z.NEVER;
    }
    return [...new Set(items)] as T[number][];
  });
}

export const TICKET_SORT_FIELDS = [
  'position',
  'number',
  'createdAt',
  'updatedAt',
  'dueAt',
  'priority',
] as const;

export const listTicketsQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(200).optional(),
  status: csvEnumList(TICKET_STATUSES).optional(),
  type: csvEnumList(TICKET_TYPES).optional(),
  priority: csvEnumList(TICKET_PRIORITIES).optional(),
  archived: z.enum(['exclude', 'include', 'only']).default('exclude'),
  sort: z.enum(TICKET_SORT_FIELDS).default('position'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export const ticketSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  number: z.number().int().positive(),
  code: z.string(),
  title: z.string(),
  descriptionJson: z.record(z.string(), z.unknown()).nullable(),
  descriptionText: z.string(),
  type: ticketTypeSchema,
  status: ticketStatusSchema,
  priority: ticketPrioritySchema,
  parentId: z.uuid().nullable(),
  epicId: z.uuid().nullable(),
  sortOrder: z.number(),
  dueAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
});

export type TicketType = z.infer<typeof ticketTypeSchema>;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type TicketList = { items: Ticket[] };
