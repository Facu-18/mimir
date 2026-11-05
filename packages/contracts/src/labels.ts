import { z } from 'zod';

const nameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Name is required' })
  .max(50, { error: 'Name must be at most 50 characters' });

const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, { error: 'Color must be a hex value like #81917E' });

export const createLabelSchema = z.strictObject({
  name: nameSchema,
  color: colorSchema.default('#81917E'),
  projectId: z.uuid({ error: 'Project id must be a UUID' }).nullable().default(null),
});

/** The scope (projectId) of a label cannot change once created. */
export const updateLabelSchema = z
  .strictObject({
    name: nameSchema.optional(),
    color: colorSchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    error: 'At least one field must be provided',
  });

export const listLabelsQuerySchema = z.strictObject({
  projectId: z.uuid({ error: 'Project id must be a UUID' }).optional(),
});

export const setTicketLabelsSchema = z.strictObject({
  labelIds: z
    .array(z.uuid({ error: 'Label id must be a UUID' }))
    .max(50, { error: 'A ticket can have at most 50 labels' })
    .transform((ids) => [...new Set(ids)]),
});

export const labelSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid().nullable(),
  name: z.string(),
  color: z.string(),
});

export type CreateLabelInput = z.infer<typeof createLabelSchema>;
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;
export type ListLabelsQuery = z.infer<typeof listLabelsQuerySchema>;
export type SetTicketLabelsInput = z.infer<typeof setTicketLabelsSchema>;
export type Label = z.infer<typeof labelSchema>;
export type LabelList = { items: Label[] };
