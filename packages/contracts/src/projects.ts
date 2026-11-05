import { z } from 'zod';

export const PROJECT_STATUSES = ['active', 'paused', 'completed', 'archived'] as const;

export const projectStatusSchema = z.enum(PROJECT_STATUSES);

/** Statuses a client may set directly; `archived` goes through the archive endpoint. */
export const editableProjectStatusSchema = z.enum(['active', 'paused', 'completed'], {
  error: 'Status must be active, paused or completed (use the archive endpoint to archive)',
});

export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, {
    error: 'Key must be 2-10 uppercase letters or digits and start with a letter',
  });

const nameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Name is required' })
  .max(120, { error: 'Name must be at most 120 characters' });

const descriptionSchema = z
  .string()
  .max(10_000, { error: 'Description must be at most 10000 characters' });

const iconSchema = z
  .string()
  .trim()
  .min(1)
  .max(64, { error: 'Icon must be at most 64 characters' })
  .nullable();

const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, { error: 'Color must be a hex value like #81917E' })
  .nullable();

const sortOrderSchema = z.number().finite();

export const createProjectSchema = z.strictObject({
  key: projectKeySchema,
  name: nameSchema,
  description: descriptionSchema.default(''),
  icon: iconSchema.default(null),
  color: colorSchema.default(null),
  status: editableProjectStatusSchema.default('active'),
  isFavorite: z.boolean().default(false),
  sortOrder: sortOrderSchema.default(0),
});

export const updateProjectSchema = z
  .strictObject({
    key: z.never({ error: 'Project key cannot be changed' }).optional(),
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
    icon: iconSchema.optional(),
    color: colorSchema.optional(),
    status: editableProjectStatusSchema.optional(),
    isFavorite: z.boolean().optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    error: 'At least one field must be provided',
  });

const queryBooleanSchema = z
  .enum(['true', 'false'], { error: 'Must be true or false' })
  .transform((value) => value === 'true');

export const listProjectsQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(120).optional(),
  status: projectStatusSchema.optional(),
  isFavorite: queryBooleanSchema.optional(),
  archived: z.enum(['exclude', 'include', 'only']).default('exclude'),
});

export const projectSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  status: projectStatusSchema,
  isFavorite: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
});

export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectList = { items: Project[] };
