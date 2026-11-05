import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDatabase } from './support/reset-database.js';

const UNKNOWN_ID = '00000000-0000-4000-8000-0000000000ff';
const SCENE = {
  elements: [{ id: 'a', type: 'rectangle', x: 1.5 }],
  appState: { zoom: { value: 2 } },
  files: {},
};

describe('Canvas library (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let canvasId: string;
  let projectId: string;
  let ticketId: string;
  let documentId: string;

  const api = () => request(app.getHttpServer());
  const links = (id = canvasId) => `/api/v1/canvases/${id}/links`;
  const link = (targetType: string, targetId: string, id = canvasId) =>
    api().post(links(id)).send({ targetType, targetId });

  const createAsset = (key: string) =>
    prisma.asset.create({
      data: {
        filename: `${key}.png`,
        mimeType: 'image/png',
        sizeBytes: 10n,
        checksum: key,
        storageKey: `${key}.png`,
      },
    });

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
    const canvas = await api()
      .post('/api/v1/canvases')
      .send({ title: 'Mapa', scene: SCENE })
      .expect(201);
    canvasId = canvas.body.id;
    const project = await api()
      .post('/api/v1/projects')
      .send({ key: 'SB', name: 'Sandbox' })
      .expect(201);
    projectId = project.body.id;
    const ticket = await api()
      .post(`/api/v1/projects/${projectId}/tickets`)
      .send({ title: 'Primer ticket' })
      .expect(201);
    ticketId = ticket.body.id;
    const document = await api()
      .post('/api/v1/documents')
      .send({ title: 'Notas' })
      .expect(201);
    documentId = document.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('library flow', () => {
    it('keeps the scene and revision while a free canvas moves between projects', async () => {
      const list = await api()
        .get('/api/v1/canvases?projectId=none&q=map')
        .expect(200);
      expect(list.body.items.map((item: { id: string }) => item.id)).toEqual([
        canvasId,
      ]);

      const linked = await api()
        .patch(`/api/v1/canvases/${canvasId}`)
        .send({ projectId, title: 'Mapa nuevo' })
        .expect(200);
      expect(linked.body).toMatchObject({
        projectId,
        title: 'Mapa nuevo',
        revision: 0,
        scene: SCENE,
      });

      const freed = await api()
        .patch(`/api/v1/canvases/${canvasId}`)
        .send({ projectId: null })
        .expect(200);
      expect(freed.body).toMatchObject({
        projectId: null,
        revision: 0,
        scene: SCENE,
      });
    });
  });

  describe('previews', () => {
    it('sets and clears the preview without touching the scene or revision', async () => {
      const asset = await createAsset('preview');

      const set = await api()
        .patch(`/api/v1/canvases/${canvasId}`)
        .send({ thumbnailAssetId: asset.id })
        .expect(200);
      expect(set.body).toMatchObject({
        thumbnailAssetId: asset.id,
        revision: 0,
        scene: SCENE,
      });

      const list = await api().get('/api/v1/canvases').expect(200);
      expect(list.body.items[0].thumbnailAssetId).toBe(asset.id);

      const cleared = await api()
        .patch(`/api/v1/canvases/${canvasId}`)
        .send({ thumbnailAssetId: null })
        .expect(200);
      expect(cleared.body).toMatchObject({
        thumbnailAssetId: null,
        revision: 0,
        scene: SCENE,
      });
    });

    it('answers 404 for an unknown asset and keeps the current preview', async () => {
      const asset = await createAsset('preview');
      await api()
        .patch(`/api/v1/canvases/${canvasId}`)
        .send({ thumbnailAssetId: asset.id })
        .expect(200);

      const response = await api()
        .patch(`/api/v1/canvases/${canvasId}`)
        .send({ title: 'Otro', thumbnailAssetId: UNKNOWN_ID })
        .expect(404);

      expect(response.body.message).toBe('Asset not found');
      const row = await prisma.canvas.findUniqueOrThrow({
        where: { id: canvasId },
      });
      expect(row.thumbnailAssetId).toBe(asset.id);
      expect(row.title).toBe('Mapa');
    });

    it('still answers 404 for an unknown canvas', async () => {
      const asset = await createAsset('preview');

      const response = await api()
        .patch(`/api/v1/canvases/${UNKNOWN_ID}`)
        .send({ thumbnailAssetId: asset.id })
        .expect(404);

      expect(response.body.message).toBe('Canvas not found');
    });
  });

  describe('POST /api/v1/canvases/:id/links', () => {
    it('links a ticket with what the client needs to show and open it', async () => {
      const response = await link('ticket', ticketId).expect(201);

      expect(response.body).toEqual({
        id: expect.any(String),
        targetType: 'ticket',
        targetId: ticketId,
        title: 'Primer ticket',
        code: 'SB-001',
        archived: false,
        createdAt: expect.any(String),
      });
      const rows = await prisma.entityLink.findMany();
      expect(rows).toEqual([
        expect.objectContaining({
          sourceType: 'canvas',
          sourceId: canvasId,
          targetType: 'ticket',
          targetId: ticketId,
        }),
      ]);
    });

    it('links projects and documents', async () => {
      const project = await link('project', projectId).expect(201);
      const document = await link('document', documentId).expect(201);

      expect(project.body).toMatchObject({ title: 'Sandbox', code: null });
      expect(document.body).toMatchObject({ title: 'Notas', code: null });
    });

    it('leaves the scene and revision alone', async () => {
      await link('ticket', ticketId).expect(201);

      const canvas = await api()
        .get(`/api/v1/canvases/${canvasId}`)
        .expect(200);

      expect(canvas.body).toMatchObject({ revision: 0, scene: SCENE });
    });

    it('rejects a repeated link, also under concurrency', async () => {
      const responses = await Promise.all(
        Array.from({ length: 10 }, () => link('ticket', ticketId)),
      );

      const statuses = responses
        .map((response) => response.status)
        .sort((a, b) => a - b);
      expect(statuses).toEqual([201, ...Array<number>(9).fill(409)]);
      const conflict = responses.find((response) => response.status === 409);
      expect(conflict?.body.message).toBe('Link already exists');
      expect(await prisma.entityLink.count()).toBe(1);
    });

    it('allows the same target from another canvas', async () => {
      const other = await api().post('/api/v1/canvases').send({}).expect(201);

      await link('ticket', ticketId).expect(201);
      await link('ticket', ticketId, other.body.id).expect(201);

      expect(await prisma.entityLink.count()).toBe(2);
    });

    it('answers 404 for targets and canvases that do not exist', async () => {
      const cases = [
        ['project', 'Project not found'],
        ['ticket', 'Ticket not found'],
        ['document', 'Document not found'],
      ];
      for (const [type, message] of cases) {
        const response = await link(type, UNKNOWN_ID).expect(404);
        expect(response.body.message).toBe(message);
      }

      const canvas = await link('ticket', ticketId, UNKNOWN_ID).expect(404);
      expect(canvas.body.message).toBe('Canvas not found');
      expect(await prisma.entityLink.count()).toBe(0);
    });

    it('refuses to link archived targets', async () => {
      await api().post(`/api/v1/tickets/${ticketId}/archive`).expect(200);
      await api().post(`/api/v1/documents/${documentId}/archive`).expect(200);
      await api().post(`/api/v1/projects/${projectId}/archive`).expect(200);
      const cases = [
        ['project', projectId, 'Cannot link to an archived project'],
        ['ticket', ticketId, 'Cannot link to an archived ticket'],
        ['document', documentId, 'Cannot link to an archived document'],
      ];

      for (const [type, id, message] of cases) {
        const response = await link(type, id).expect(409);
        expect(response.body.message).toBe(message);
      }
      expect(await prisma.entityLink.count()).toBe(0);
    });

    it('validates the body', async () => {
      await link('canvas', UNKNOWN_ID).expect(400);
      await link('ticket', 'not-a-uuid').expect(400);
      await api()
        .post(links())
        .send({ targetType: 'ticket', targetId: ticketId, extra: 1 })
        .expect(400);
      await link('ticket', ticketId, 'not-a-uuid').expect(400);
    });

    it('accepts links on an archived canvas', async () => {
      await api().post(`/api/v1/canvases/${canvasId}/archive`).expect(200);

      await link('ticket', ticketId).expect(201);
    });
  });

  describe('GET /api/v1/canvases/:id/links', () => {
    it('lists only this canvas, oldest first, with current titles', async () => {
      const other = await api().post('/api/v1/canvases').send({}).expect(201);
      await link('document', documentId, other.body.id).expect(201);
      const first = await link('ticket', ticketId).expect(201);
      const second = await link('document', documentId).expect(201);
      await api()
        .patch(`/api/v1/documents/${documentId}`)
        .send({ title: 'Notas nuevas' })
        .expect(200);

      const response = await api().get(links()).expect(200);

      expect(response.body.items).toEqual([
        first.body,
        { ...second.body, title: 'Notas nuevas' },
      ]);
    });

    it('marks a target archived later instead of hiding it', async () => {
      await link('ticket', ticketId).expect(201);
      await api().post(`/api/v1/tickets/${ticketId}/archive`).expect(200);

      const response = await api().get(links()).expect(200);

      expect(response.body.items[0].archived).toBe(true);
    });

    it('keeps links through canvas archive and restore', async () => {
      const created = await link('ticket', ticketId).expect(201);

      await api().post(`/api/v1/canvases/${canvasId}/archive`).expect(200);
      await api().post(`/api/v1/canvases/${canvasId}/restore`).expect(200);

      const response = await api().get(links()).expect(200);
      expect(response.body.items).toEqual([created.body]);
    });

    it('skips a link whose target row no longer exists', async () => {
      await prisma.entityLink.create({
        data: {
          sourceType: 'canvas',
          sourceId: canvasId,
          targetType: 'ticket',
          targetId: UNKNOWN_ID,
        },
      });

      const response = await api().get(links()).expect(200);

      expect(response.body.items).toEqual([]);
    });

    it('answers 404 for an unknown canvas', async () => {
      await api().get(links(UNKNOWN_ID)).expect(404);
    });
  });

  describe('DELETE /api/v1/canvases/:id/links/:linkId', () => {
    it('removes the link and lets it be created again', async () => {
      const created = await link('ticket', ticketId).expect(201);

      await api().delete(`${links()}/${created.body.id}`).expect(204);

      expect(await prisma.entityLink.count()).toBe(0);
      await link('ticket', ticketId).expect(201);
    });

    it('answers 404 when it does not exist or belongs to another canvas', async () => {
      const other = await api().post('/api/v1/canvases').send({}).expect(201);
      const created = await link('ticket', ticketId).expect(201);

      await api().delete(`${links()}/${UNKNOWN_ID}`).expect(404);
      await api()
        .delete(`${links(other.body.id)}/${created.body.id}`)
        .expect(404);

      expect(await prisma.entityLink.count()).toBe(1);
    });
  });
});
