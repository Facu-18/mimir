import { z } from 'zod';

/** A Tiptap / ProseMirror JSON node. The editor owns the node vocabulary. */
export interface DocumentNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocumentNode[];
  marks?: DocumentMark[];
  text?: string;
}

export interface DocumentMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export const MAX_DOCUMENT_DEPTH = 64;

const attrsSchema = z.record(z.string(), z.unknown());

const markSchema: z.ZodType<DocumentMark> = z.object({
  type: z.string().min(1).max(100),
  attrs: attrsSchema.optional(),
});

const nodeSchema: z.ZodType<DocumentNode> = z.lazy(() =>
  z.object({
    type: z.string().min(1).max(100),
    attrs: attrsSchema.optional(),
    content: z.array(nodeSchema).optional(),
    marks: z.array(markSchema).optional(),
    text: z.string().optional(),
  }),
);

const RELATIVE_URL = /^(\/(?!\/)|#)/;
const LINK_URL = /^(https?:|mailto:)/i;
const IMAGE_URL = /^https?:/i;
// Whitespace, control characters and Markdown/HTML delimiters are never
// valid unencoded in a URL; allowing them lets a URL break out of the
// exported Markdown (e.g. a newline followed by raw HTML).
const UNSAFE_URL_CHARS = /[\x00-\x20\x7f<>"`\\]/;

function isSafeUrl(value: unknown, allowed: RegExp): boolean {
  if (typeof value !== 'string' || UNSAFE_URL_CHARS.test(value)) return false;
  return allowed.test(value) || RELATIVE_URL.test(value);
}

type AttrRule = {
  node: string;
  key: string;
  valid: (value: unknown) => boolean;
  message: string;
};

const isOptionalString = (value: unknown) =>
  value === undefined || value === null || typeof value === 'string';

/** Attributes the Markdown export reads must have the type it expects. */
const ATTR_RULES: AttrRule[] = [
  { node: 'image', key: 'alt', valid: isOptionalString, message: 'Image alt must be a string' },
  { node: 'image', key: 'title', valid: isOptionalString, message: 'Image title must be a string' },
  {
    node: 'heading',
    key: 'level',
    valid: (v) => v === undefined || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 6),
    message: 'Heading level must be 1-6',
  },
  {
    node: 'orderedList',
    key: 'start',
    valid: (v) => v === undefined || v === null || (Number.isInteger(v) && (v as number) >= 1),
    message: 'List start must be a positive integer',
  },
  {
    node: 'taskItem',
    key: 'checked',
    valid: (v) => v === undefined || typeof v === 'boolean',
    message: 'Task checked must be a boolean',
  },
  {
    node: 'codeBlock',
    key: 'language',
    valid: isOptionalString,
    message: 'Code language must be a string',
  },
];

/** Depth check done iteratively so hostile nesting cannot overflow the stack. */
function depthOf(root: unknown): number {
  let max = 0;
  const stack: [unknown, number][] = [[root, 1]];
  while (stack.length > 0) {
    const [node, depth] = stack.pop()!;
    max = Math.max(max, depth);
    if (max > MAX_DOCUMENT_DEPTH) return max;
    const children = (node as { content?: unknown })?.content;
    if (Array.isArray(children)) {
      for (const child of children) stack.push([child, depth + 1]);
    }
  }
  return max;
}

function* walk(node: DocumentNode): Generator<DocumentNode> {
  yield node;
  for (const child of node.content ?? []) yield* walk(child);
}

export const documentContentSchema = z
  .unknown()
  .superRefine((value, ctx) => {
    if (depthOf(value) > MAX_DOCUMENT_DEPTH) {
      ctx.addIssue({ code: 'custom', message: 'Document is nested too deeply', abort: true });
    }
  })
  .pipe(nodeSchema)
  .superRefine((root, ctx) => {
    if (root.type !== 'doc') {
      ctx.addIssue({ code: 'custom', message: 'Document root must be a doc node' });
      return;
    }
    for (const node of walk(root)) {
      for (const mark of node.marks ?? []) {
        if (mark.type === 'link' && !isSafeUrl(mark.attrs?.href, LINK_URL)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Links must use http, https or mailto, or be relative',
          });
        }
      }
      if (node.type === 'image' && !isSafeUrl(node.attrs?.src, IMAGE_URL)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Images must use http or https, or be relative',
        });
      }
      for (const rule of ATTR_RULES) {
        if (node.type === rule.node && !rule.valid(node.attrs?.[rule.key])) {
          ctx.addIssue({ code: 'custom', message: rule.message });
        }
      }
    }
  });

export const EMPTY_DOCUMENT: DocumentNode = { type: 'doc', content: [] };

const titleSchema = z
  .string()
  .trim()
  .min(1, { error: 'Title is required' })
  .max(200, { error: 'Title must be at most 200 characters' });

const projectIdSchema = z.uuid({ error: 'Project id must be a UUID' }).nullable();

export const createDocumentSchema = z.strictObject({
  title: titleSchema.default('Untitled'),
  contentJson: documentContentSchema.default(EMPTY_DOCUMENT),
  projectId: projectIdSchema.default(null),
});

export const updateDocumentSchema = z
  .strictObject({
    title: titleSchema.optional(),
    contentJson: documentContentSchema.optional(),
    projectId: projectIdSchema.optional(),
    /** Optimistic concurrency: the `updatedAt` the client last saw. */
    expectedUpdatedAt: z.iso
      .datetime({ offset: true, error: 'expectedUpdatedAt must be an ISO 8601 date-time' })
      .optional(),
  })
  .refine(
    (input) =>
      Object.keys(input).some((key) => key !== 'expectedUpdatedAt'),
    { error: 'At least one field must be provided' },
  );

export const listDocumentsQuerySchema = z.strictObject({
  projectId: z
    .union([z.literal('none'), z.uuid()], {
      error: 'Project id must be a UUID or "none"',
    })
    .optional(),
  q: z.string().trim().min(1).max(200).optional(),
  archived: z.enum(['exclude', 'include', 'only']).default('exclude'),
});

export const exportDocumentQuerySchema = z.strictObject({
  format: z.enum(['markdown'], { error: 'Format must be markdown' }).default('markdown'),
});

const documentFields = {
  id: z.uuid(),
  projectId: z.uuid().nullable(),
  title: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
};

/** List item: no content, to keep lists light. */
export const documentSummarySchema = z.object(documentFields);

export const documentSchema = z.object({
  ...documentFields,
  contentJson: nodeSchema,
  contentText: z.string(),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
export type ExportDocumentQuery = z.infer<typeof exportDocumentQuerySchema>;
export type DocumentSummary = z.infer<typeof documentSummarySchema>;
export type Document = z.infer<typeof documentSchema>;
export type DocumentList = { items: DocumentSummary[] };
