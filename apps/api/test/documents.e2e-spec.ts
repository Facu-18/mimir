import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { WorkspacesService } from '../src/workspaces/workspaces.service.js';
import { resetDatabase } from './support/reset-database.js';

const UNKNOWN_ID = '00000000-0000-4000-8000-0000000000ff';

type DocumentBody = {
  id: string;
  title: string;
  updatedAt: string;
  [key: string]: unknown;
};

const doc = (...content: unknown[]) => ({ type: 'doc', content });
const paragraph = (text: string, marks?: unknown[]) => ({
  type: 'paragraph',
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
});

const RICH = doc(
  {
    type: 'heading',
    attrs: { level: 1 },
    content: [{ type: 'text', text: 'Architecture' }],
  },
  paragraph('Hexagonal ', [{ type: 'bold' }]),
  {
    type: 'taskList',
    content: [
      {
        type: 'taskItem',
        attrs: { checked: true },
        content: [paragraph('ports')],
      },
    ],
  },
  {
    type: 'codeBlock',
    attrs: { language: 'ts' },
    content: [{ type: 'text', text: 'const a = 1;' }],
  },
);

describe('Documents (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let projectId: string;

  const api = () => request(app.getHttpServer());

  async function createProject(key: string): Promise<string> {
    const response = await api()
      .post('/api/v1/projects')
      .send({ key, name: key })
      .expect(201);
    return response.body.id;
  }

  async function createDocument(
    body: Record<string, unknown> = {},
  ): Promise<DocumentBody> {
    const response = await api()
      .post('/api/v1/documents')
      .send(body)
      .expect(201);
    return response.body;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await app.get(WorkspacesService).ensureDefault();
    projectId = await createProject('SB');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('create and reopen', () => {
    it('creates an untitled empty standalone document by default', async () => {
      const created = await createDocument();

      expect(created).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        projectId: null,
        title: 'Untitled',
        contentJson: { type: 'doc', content: [] },
        contentText: '',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        archivedAt: null,
      });
    });

    it('keeps rich content exactly and derives the search text', async () => {
      const created = await createDocument({
        title: 'Design',
        contentJson: RICH,
        projectId,
      });

      const reopened = await api()
        .get(`/api/v1/documents/${created.id}`)
        .expect(200);

      expect(reopened.body.contentJson).toEqual(RICH);
      expect(reopened.body.contentText).toBe(
        'Architecture\nHexagonal\nports\nconst a = 1;',
      );
      expect(reopened.body.projectId).toBe(projectId);
    });

    it('rejects unsafe links, client search text and malformed content', async () => {
      const unsafe = await api()
        .post('/api/v1/documents')
        .send({
          contentJson: doc(
            paragraph('click', [
              { type: 'link', attrs: { href: 'javascript:alert(1)' } },
            ]),
          ),
        })
        .expect(400);
      expect(unsafe.body.issues[0].message).toBe(
        'Links must use http, https or mailto, or be relative',
      );

      await api()
        .post('/api/v1/documents')
        .send({ contentText: 'x' })
        .expect(400);
      await api()
        .post('/api/v1/documents')
        .send({ contentJson: { type: 'paragraph' } })
        .expect(400);
      await expect(prisma.document.count()).resolves.toBe(0);
    });

    it('accepts large documents up to the body limit and answers 413 above it', async () => {
      const big = (bytes: number) => doc(paragraph('x'.repeat(bytes)));

      await api()
        .post('/api/v1/documents')
        .send({ contentJson: big(1_500_000) })
        .expect(201);
      await api()
        .post('/api/v1/documents')
        .send({ contentJson: big(3_000_000) })
        .expect(413);
    });
  });

  describe('PATCH /api/v1/documents/:id', () => {
    it('updates title and content and re-derives the search text', async () => {
      const created = await createDocument({ title: 'Draft' });

      const response = await api()
        .patch(`/api/v1/documents/${created.id}`)
        .send({ title: 'Final', contentJson: doc(paragraph('Saved text')) })
        .expect(200);

      expect(response.body).toMatchObject({
        title: 'Final',
        contentText: 'Saved text',
      });
      await expect(
        prisma.document.findUniqueOrThrow({ where: { id: created.id } }),
      ).resolves.toMatchObject({ title: 'Final', contentText: 'Saved text' });
    });

    it('saves when expectedUpdatedAt matches and refuses stale saves with the current version', async () => {
      const created = await createDocument({
        contentJson: doc(paragraph('v1')),
      });

      const first = await api()
        .patch(`/api/v1/documents/${created.id}`)
        .send({
          contentJson: doc(paragraph('v2')),
          expectedUpdatedAt: created.updatedAt,
        })
        .expect(200);

      const stale = await api()
        .patch(`/api/v1/documents/${created.id}`)
        .send({
          contentJson: doc(paragraph('old tab')),
          expectedUpdatedAt: created.updatedAt,
        })
        .expect(409);

      expect(stale.body).toMatchObject({
        statusCode: 409,
        error: 'Conflict',
        message: 'Document was modified elsewhere',
        current: {
          id: created.id,
          updatedAt: first.body.updatedAt,
          contentText: 'v2',
        },
      });
      await expect(
        prisma.document.findUniqueOrThrow({ where: { id: created.id } }),
      ).resolves.toMatchObject({ contentText: 'v2' });
    });

    it('lets exactly one of two concurrent saves with the same base win', async () => {
      const created = await createDocument();

      const responses = await Promise.all(
        ['tab A', 'tab B'].map((text) =>
          api()
            .patch(`/api/v1/documents/${created.id}`)
            .send({
              contentJson: doc(paragraph(text)),
              expectedUpdatedAt: created.updatedAt,
            }),
        ),
      );

      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
    });

    it('links to a project, unlinks, and rejects unknown or archived projects', async () => {
      const created = await createDocument();

      const linked = await api()
        .patch(`/api/v1/documents/${created.id}`)
        .send({ projectId })
        .expect(200);
      expect(linked.body.projectId).toBe(projectId);

      const unlinked = await api()
        .patch(`/api/v1/documents/${created.id}`)
        .send({ projectId: null })
        .expect(200);
      expect(unlinked.body.projectId).toBeNull();

      await api()
        .patch(`/api/v1/documents/${created.id}`)
        .send({ projectId: UNKNOWN_ID })
        .expect(404);
      await api().post(`/api/v1/projects/${projectId}/archive`).expect(200);
      const conflict = await api()
        .patch(`/api/v1/documents/${created.id}`)
        .send({ projectId })
        .expect(409);
      expect(conflict.body.message).toBe('Cannot link to an archived project');
      await api().post('/api/v1/documents').send({ projectId }).expect(409);
    });

    it('answers 404 for unknown documents and 400 for invalid input', async () => {
      const created = await createDocument();

      await api()
        .patch(`/api/v1/documents/${UNKNOWN_ID}`)
        .send({ title: 'x' })
        .expect(404);
      await api().get(`/api/v1/documents/${UNKNOWN_ID}`).expect(404);
      await api().get('/api/v1/documents/not-a-uuid').expect(400);
      await api().patch(`/api/v1/documents/${created.id}`).send({}).expect(400);
      await api()
        .patch(`/api/v1/documents/${created.id}`)
        .send({ title: '' })
        .expect(400);
    });
  });

  describe('archive and restore', () => {
    it('archives and restores idempotently', async () => {
      const created = await createDocument();

      const archived = await api()
        .post(`/api/v1/documents/${created.id}/archive`)
        .expect(200);
      const again = await api()
        .post(`/api/v1/documents/${created.id}/archive`)
        .expect(200);
      expect(again.body.archivedAt).toBe(archived.body.archivedAt);

      const restored = await api()
        .post(`/api/v1/documents/${created.id}/restore`)
        .expect(200);
      expect(restored.body.archivedAt).toBeNull();
      await api().post(`/api/v1/documents/${UNKNOWN_ID}/archive`).expect(404);
    });
  });

  describe('GET /api/v1/documents', () => {
    const titles = (body: { items: { title: string }[] }) =>
      body.items.map((d) => d.title);

    async function seed() {
      await createDocument({
        title: 'Standalone',
        contentJson: doc(paragraph('free idea')),
      });
      await createDocument({
        title: 'Spec',
        projectId,
        contentJson: doc(paragraph('100% done')),
      });
      const old = await createDocument({ title: 'Old notes', projectId });
      await api().post(`/api/v1/documents/${old.id}/archive`).expect(200);
    }

    it('lists unarchived documents, newest change first, without content', async () => {
      await seed();

      const response = await api().get('/api/v1/documents').expect(200);

      expect(titles(response.body)).toEqual(['Spec', 'Standalone']);
      expect(response.body.items[0]).not.toHaveProperty('contentJson');
      expect(response.body.items[0]).not.toHaveProperty('contentText');
    });

    it('filters by project, standalone and archived state', async () => {
      await seed();

      const ofProject = await api()
        .get(`/api/v1/documents?projectId=${projectId}`)
        .expect(200);
      const standalone = await api()
        .get('/api/v1/documents?projectId=none')
        .expect(200);
      const archived = await api()
        .get('/api/v1/documents?archived=only')
        .expect(200);

      expect(titles(ofProject.body)).toEqual(['Spec']);
      expect(titles(standalone.body)).toEqual(['Standalone']);
      expect(titles(archived.body)).toEqual(['Old notes']);
    });

    it('searches title and text literally', async () => {
      await seed();

      const byTitle = await api().get('/api/v1/documents?q=SPEC').expect(200);
      const byText = await api()
        .get('/api/v1/documents?q=free%20idea')
        .expect(200);
      const literal = await api().get('/api/v1/documents?q=%25').expect(200);

      expect(titles(byTitle.body)).toEqual(['Spec']);
      expect(titles(byText.body)).toEqual(['Standalone']);
      expect(titles(literal.body)).toEqual(['Spec']);
    });

    it('answers 400 for invalid filters', async () => {
      await api().get('/api/v1/documents?projectId=abc').expect(400);
      await api().get('/api/v1/documents?archived=all').expect(400);
    });
  });
});
