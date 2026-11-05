import { z } from 'zod';
import { assetSchema } from './assets.js';

export const CURRENT_SCENE_SCHEMA_VERSION = 1;
export const MAX_SCENE_DEPTH = 64;
export const MAX_SCENE_ELEMENTS = 200_000;

const NUL = String.fromCharCode(0);
const EMBEDDED_IMAGE_MESSAGE = 'Images must be uploaded as assets, not embedded in the scene';

// With the u flag this only matches a surrogate that is not part of a pair,
// such as text cut in the middle of an emoji.
const UNPAIRED_SURROGATE = /\p{Cs}/u;

function findTextProblem(text: string): string | null {
  if (text.includes(NUL)) return 'Scene contains invalid NUL characters';
  if (UNPAIRED_SURROGATE.test(text)) {
    return 'Scene contains invalid text (unpaired surrogate)';
  }
  return null;
}

/**
 * Walks an untrusted value iteratively, so hostile nesting cannot overflow
 * the stack, and reports the first problem Postgres `jsonb` could not store.
 */
function findSceneProblem(root: unknown): string | null {
  const stack: [unknown, number][] = [[root, 1]];
  while (stack.length > 0) {
    const [value, depth] = stack.pop()!;
    if (typeof value === 'string') {
      const problem = findTextProblem(value);
      if (problem) return problem;
      continue;
    }
    if (typeof value !== 'object' || value === null) continue;
    if (depth > MAX_SCENE_DEPTH) return 'Scene is nested too deeply';
    if (Array.isArray(value)) {
      for (const item of value) stack.push([item, depth + 1]);
      continue;
    }
    for (const [key, item] of Object.entries(value)) {
      const problem = findTextProblem(key);
      if (problem) return problem;
      if (key === 'dataURL' && typeof item === 'string' && /^data:/i.test(item)) {
        return EMBEDDED_IMAGE_MESSAGE;
      }
      stack.push([item, depth + 1]);
    }
  }
  return null;
}

const elementSchema = z.looseObject({
  id: z.string().min(1, { error: 'Element id is required' }),
  type: z.string().min(1, { error: 'Element type is required' }),
});

const fileReferenceSchema = z
  .unknown()
  .superRefine((value, ctx) => {
    if (typeof value === 'object' && value !== null && 'dataURL' in value) {
      ctx.addIssue({
        code: 'custom',
        message: EMBEDDED_IMAGE_MESSAGE,
        abort: true,
      });
    }
  })
  .pipe(
    z.strictObject({
      assetId: z.uuid({ error: 'Asset id must be a UUID' }),
      mimeType: z.string().max(100).optional(),
    }),
  );

export const sceneSchema = z
  .unknown()
  .superRefine((value, ctx) => {
    const problem = findSceneProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem, abort: true });
  })
  .pipe(
    z.strictObject({
      elements: z
        .array(elementSchema)
        .max(MAX_SCENE_ELEMENTS, { error: 'Scene has too many elements' }),
      appState: z.record(z.string(), z.unknown()).default({}),
      files: z.record(z.string(), fileReferenceSchema).default({}),
    }),
  );

export type Scene = z.infer<typeof sceneSchema>;

export const EMPTY_SCENE: Scene = { elements: [], appState: {}, files: {} };

/** The assets a scene references; `canvas_assets` is derived from this. */
export function sceneAssetIds(scene: Scene): string[] {
  return [...new Set(Object.values(scene.files).map((file) => file.assetId))];
}

const schemaVersionSchema = z.literal(CURRENT_SCENE_SCHEMA_VERSION, {
  error: 'Unsupported scene schema version',
});

const titleSchema = z
  .string()
  .trim()
  .min(1, { error: 'Title is required' })
  .max(200, { error: 'Title must be at most 200 characters' })
  .refine((title) => !title.includes(NUL), {
    error: 'Title contains invalid NUL characters',
  });

const projectIdSchema = z.uuid({ error: 'Project id must be a UUID' }).nullable();

export const createCanvasSchema = z.strictObject({
  title: titleSchema.default('Untitled'),
  projectId: projectIdSchema.default(null),
  schemaVersion: schemaVersionSchema.default(CURRENT_SCENE_SCHEMA_VERSION),
  scene: sceneSchema.default(EMPTY_SCENE),
});

/** Metadata only: the scene changes exclusively through the save contract. */
export const updateCanvasSchema = z
  .strictObject({
    title: titleSchema.optional(),
    projectId: projectIdSchema.optional(),
    thumbnailAssetId: z.uuid({ error: 'Asset id must be a UUID' }).nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    error: 'At least one field must be provided',
  });

export const saveSceneSchema = z.strictObject({
  expectedRevision: z
    .number({ error: 'expectedRevision must be a number' })
    .int({ error: 'expectedRevision must be an integer' })
    .min(0, { error: 'expectedRevision must not be negative' })
    .max(2_147_483_647, { error: 'expectedRevision is too large' }),
  schemaVersion: schemaVersionSchema,
  scene: sceneSchema,
});

export const listCanvasesQuerySchema = z.strictObject({
  projectId: z
    .union([z.literal('none'), z.uuid()], {
      error: 'Project id must be a UUID or "none"',
    })
    .optional(),
  q: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((q) => !q.includes(NUL), { error: 'Search contains invalid NUL characters' })
    .optional(),
  archived: z.enum(['exclude', 'include', 'only']).default('exclude'),
});

const canvasFields = {
  id: z.uuid(),
  projectId: z.uuid().nullable(),
  title: z.string(),
  schemaVersion: z.number().int(),
  revision: z.number().int(),
  thumbnailAssetId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
};

/** List item: no scene, to keep lists light. */
export const canvasSummarySchema = z.object(canvasFields);

export const canvasSchema = z.object({ ...canvasFields, scene: sceneSchema });

export const sceneSavedSchema = z.object({
  id: z.uuid(),
  revision: z.number().int(),
  schemaVersion: z.number().int(),
  updatedAt: z.iso.datetime(),
});

export const CANVAS_EXPORT_FORMAT = 'mimir-canvas';
export const CANVAS_EXPORT_FORMAT_VERSION = 1;

export const canvasExportSchema = z.object({
  format: z.literal(CANVAS_EXPORT_FORMAT),
  formatVersion: z.literal(CANVAS_EXPORT_FORMAT_VERSION),
  title: z.string(),
  schemaVersion: z.number().int(),
  revision: z.number().int(),
  scene: sceneSchema,
  /** What the scene references; the bytes stay in `GET /assets/:id/content`. */
  assets: z.array(assetSchema),
});

export const CANVAS_LINK_TARGET_TYPES = ['project', 'ticket', 'document'] as const;

export type CanvasLinkTargetType = (typeof CANVAS_LINK_TARGET_TYPES)[number];

export const createCanvasLinkSchema = z.strictObject({
  targetType: z.enum(CANVAS_LINK_TARGET_TYPES, {
    error: 'Target type must be project, ticket or document',
  }),
  targetId: z.uuid({ error: 'Target id must be a UUID' }),
});

/** Carries what the client needs to show and open the target. */
export const canvasLinkSchema = z.object({
  id: z.uuid(),
  targetType: z.enum(CANVAS_LINK_TARGET_TYPES),
  targetId: z.uuid(),
  title: z.string(),
  code: z.string().nullable(),
  archived: z.boolean(),
  createdAt: z.iso.datetime(),
});

export type CreateCanvasLinkInput = z.infer<typeof createCanvasLinkSchema>;
export type CanvasLink = z.infer<typeof canvasLinkSchema>;
export type CanvasLinkList = { items: CanvasLink[] };

export type CreateCanvasInput =z.infer<typeof createCanvasSchema>;
export type UpdateCanvasInput = z.infer<typeof updateCanvasSchema>;
export type SaveSceneInput = z.infer<typeof saveSceneSchema>;
export type ListCanvasesQuery = z.infer<typeof listCanvasesQuerySchema>;
export type CanvasSummary = z.infer<typeof canvasSummarySchema>;
export type Canvas = z.infer<typeof canvasSchema>;
export type SceneSaved = z.infer<typeof sceneSavedSchema>;
export type CanvasExport = z.infer<typeof canvasExportSchema>;
export type CanvasList = { items: CanvasSummary[] };
