import {
  createDocumentSchema,
  documentContentSchema,
  listDocumentsQuerySchema,
  updateDocumentSchema,
} from './documents.js';

const doc = (...content: unknown[]) => ({ type: 'doc', content });
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (value: string, marks?: unknown[]) => ({ type: 'text', text: value, marks });
const link = (href: string) => ({ type: 'link', attrs: { href } });
const image = (src: string) => ({ type: 'image', attrs: { src, alt: 'x' } });

const messages = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message);

describe('documentContentSchema', () => {
  it('accepts a Tiptap document with nested nodes and marks', () => {
    const content = doc(
      { type: 'heading', attrs: { level: 1 }, content: [text('Title')] },
      paragraph(text('bold', [{ type: 'bold' }]), text(' link', [link('https://mimir.dev')])),
      { type: 'customWidget', attrs: { anything: true } },
    );

    expect(documentContentSchema.parse(content)).toEqual(content);
  });

  it('requires a doc root', () => {
    expect(documentContentSchema.safeParse(paragraph()).success).toBe(false);
    expect(documentContentSchema.safeParse({ content: [] }).success).toBe(false);
  });

  it.each(['https://a.b/c', 'http://a.b', 'mailto:me@a.b', '/docs/1', '#section'])(
    'accepts the link %s',
    (href) => {
      expect(documentContentSchema.safeParse(doc(paragraph(text('x', [link(href)])))).success).toBe(
        true,
      );
    },
  );

  it.each(['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.example'])(
    'rejects the link %j',
    (href) => {
      const result = documentContentSchema.safeParse(doc(paragraph(text('x', [link(href)]))));

      expect(messages(result)).toEqual([
        'Links must use http, https or mailto, or be relative',
      ]);
    },
  );

  it('accepts http(s) and relative images but rejects other schemes', () => {
    expect(documentContentSchema.safeParse(doc(image('https://a.b/i.png'))).success).toBe(true);
    expect(documentContentSchema.safeParse(doc(image('/api/v1/assets/1'))).success).toBe(true);
    expect(messages(documentContentSchema.safeParse(doc(image('mailto:x@y.z'))))).toEqual([
      'Images must use http or https, or be relative',
    ]);
  });

  it('rejects documents nested deeper than 64 levels', () => {
    let node: Record<string, unknown> = text('deep');
    for (let i = 0; i < 70; i++) node = { type: 'blockquote', content: [node] };

    expect(messages(documentContentSchema.safeParse(doc(node)))).toEqual([
      'Document is nested too deeply',
    ]);
  });
});

describe('document schemas', () => {
  it('creates an untitled empty document by default', () => {
    expect(createDocumentSchema.parse({})).toEqual({
      title: 'Untitled',
      contentJson: { type: 'doc', content: [] },
      projectId: null,
    });
  });

  it('never accepts client-provided search text', () => {
    expect(createDocumentSchema.safeParse({ contentText: 'x' }).success).toBe(false);
    expect(updateDocumentSchema.safeParse({ contentText: 'x' }).success).toBe(false);
  });

  it('accepts expectedUpdatedAt with an update and refuses an empty update', () => {
    expect(
      updateDocumentSchema.parse({
        title: 'Notes',
        expectedUpdatedAt: '2026-11-01T10:00:00.000Z',
      }),
    ).toEqual({ title: 'Notes', expectedUpdatedAt: '2026-11-01T10:00:00.000Z' });
    expect(updateDocumentSchema.safeParse({}).success).toBe(false);
    expect(
      updateDocumentSchema.safeParse({ expectedUpdatedAt: '2026-11-01T10:00:00.000Z' }).success,
    ).toBe(false);
  });

  it('parses list filters', () => {
    expect(listDocumentsQuerySchema.parse({ projectId: 'none', q: ' notes ' })).toEqual({
      projectId: 'none',
      q: 'notes',
      archived: 'exclude',
    });
  });
});
