import { z } from 'zod';

export const EPIC_STATUSES = ['planned', 'in_progress', 'done', 'canceled'] as const;

export const epicStatusSchema = z.enum(EPIC_STATUSES);

const titleSchema = z
  .string()
  .trim()
  .min(1, { error: 'Title is required' })
  .max(200, { error: 'Title must be at most 200 characters' });

const descriptionSchema = z
  .string()
  .max(10_000, { error: 'Description must be at most 10000 characters' });

export const createEpicSchema = z.strictObject({
  title: titleSchema,
  description: descriptionSchema.default(''),
  status: epicStatusSchema.default('planned'),
});

export const updateEpicSchema = z
  .strictObject({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    status: epicStatusSchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    error: 'At least one field must be provided',
  });

export const listEpicsQuerySchema = z.strictObject({
  archived: z.enum(['exclude', 'include', 'only']).default('exclude'),
});

export const epicSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  title: z.string(),
  description: z.string(),
  status: epicStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
});

export type EpicStatus = z.infer<typeof epicStatusSchema>;
export type CreateEpicInput = z.infer<typeof createEpicSchema>;
export type UpdateEpicInput = z.infer<typeof updateEpicSchema>;
export type ListEpicsQuery = z.infer<typeof listEpicsQuerySchema>;
export type Epic = z.infer<typeof epicSchema>;
export type EpicList = { items: Epic[] };
