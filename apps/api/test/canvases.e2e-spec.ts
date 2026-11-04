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

type CanvasBody = {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
  [key: string]: unknown;
};

const rectangle = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'rectangle',
  x: 10.25,
  y: -3,
  angle: 0.5,
  groupIds: ['g1'],
  boundElements: null,
  customData: { nested: { value: [1, 'two', null] } },
  ...extra,
});

const scene = (...elements: Record<string, unknown>[]) => ({
  elements,
  appState: { viewBackgroundColor: '#222624', zoom: { value: 1.25 } },
  files: {},
});

describe('Canvases (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let projectId: string;

  const api = () => request(app.getHttpServer());

  async function createCanvas(
    body: Record<string, unknown> = {},
  ): Promise<CanvasBody> {
    const response = await api()
      .post('/api/v1/canvases')
      .send(body)
      .expect(201);
    return response.body;
  }

  const save = (
    id: string,
    expectedRevision: number,
    body: Record<string, unknown>,
  ) =>
    api()
      .put(`/api/v1/canvases/${id}/scene`)
      .send({ expectedRevision, schemaVersion: 1, scene: body });

  const createAsset = (key: string) =>
    prisma.asset.create({
      data: {
        filename: `${key}.png`,
        mimeType: 'image/png',
        sizeBytes: 10n,
        checksum: `sha256:${key}`,
        storageKey: `assets/${key}.png`,
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
    await app.get(WorkspacesService).ensureDefault();
    const project = await api()
      .post('/api/v1/projects')
      .send({ key: 'SB', name: 'Second Brain' })
      .expect(201);
    projectId = project.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('create and reopen', () => {
    it('creates an untitled free canvas at revision 0 by default', async () => {
      const created = await createCanvas();

      expect(created).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        projectId: null,
        title: 'Untitled',
        schemaVersion: 1,
        revision: 0,
        thumbnailAssetId: null,
        scene: { elements: [], appState: {}, files: {} },
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        archivedAt: null,
      });
    });

    it('restores exactly the saved elements when reopened', async () => {
      const created = await createCanvas({ title: 'Map', projectId });
      const content = scene(
        rectangle('a'),
        rectangle('b', { isDeleted: true }),
      );

      await save(created.id, 0, content).expect(200);

      const reopened = await api()
        .get(`/api/v1/canvases/${created.id}`)
        .expect(200);
      expect(reopened.body.scene).toEqual(content);
      expect(reopened.body).toMatchObject({
        title: 'Map',
        projectId,
        revision: 1,
      });
    });

    it('rejects invalid scenes and unknown canvases', async () => {
      await api()
        .post('/api/v1/canvases')
        .send({ scene: { elements: [{ type: 'text' }] } })
        .expect(400);
      await api().get(`/api/v1/canvases/${UNKNOWN_ID}`).expect(404);
      await api().get('/api/v1/canvases/not-a-uuid').expect(400);
      await expect(prisma.canvas.count()).resolves.toBe(0);
    });
  });

  describe('PUT /api/v1/canvases/:id/scene', () => {
    it('increments the revision and answers without echoing the scene', async () => {
      const created = await createCanvas();

      const response = await save(created.id, 0, scene(rectangle('a'))).expect(
        200,
      );

      expect(response.body).toEqual({
        id: created.id,
        revision: 1,
        schemaVersion: 1,
        updatedAt: expect.any(String),
      });
    });

    it('applies rapid consecutive edits in order', async () => {
      const created = await createCanvas();

      for (let revision = 0; revision < 30; revision++) {
        await save(
          created.id,
          revision,
          scene(rectangle(`edit-${revision}`)),
        ).expect(200);
      }

      const reopened = await api()
        .get(`/api/v1/canvases/${created.id}`)
        .expect(200);
      expect(reopened.body.revision).toBe(30);
      expect(reopened.body.scene.elements[0].id).toBe('edit-29');
    });

    it('answers 409 for a stale revision without overwriting', async () => {
      const created = await createCanvas();
      const current = await save(
        created.id,
        0,
        scene(rectangle('current')),
      ).expect(200);

      const stale = await save(
        created.id,
        0,
        scene(rectangle('old-tab')),
      ).expect(409);

      expect(stale.body).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: 'Canvas was modified elsewhere',
        currentRevision: 1,
        updatedAt: current.body.updatedAt,
      });
      const reopened = await api()
        .get(`/api/v1/canvases/${created.id}`)
        .expect(200);
      expect(reopened.body.scene.elements[0].id).toBe('current');
      expect(reopened.body.revision).toBe(1);
    });

    it('lets exactly one of many concurrent saves from the same revision win', async () => {
      const created = await createCanvas();

      for (let revision = 0; revision < 5; revision++) {
        const responses = await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            save(created.id, revision, scene(rectangle(`writer-${i}`))),
          ),
        );

        const winners = responses.filter((r) => r.status === 200);
        expect(winners).toHaveLength(1);
        expect(responses.filter((r) => r.status === 409)).toHaveLength(9);
        const reopened = await api()
          .get(`/api/v1/canvases/${created.id}`)
          .expect(200);
        expect(reopened.body.revision).toBe(revision + 1);
        // The stored scene must be the one sent by the single winner.
        const winner = responses.findIndex((r) => r.status === 200);
        expect(reopened.body.scene.elements[0].id).toBe(`writer-${winner}`);
      }
    });

    it('rejects unsupported schema versions and invalid payloads', async () => {
      const created = await createCanvas();
      const url = `/api/v1/canvases/${created.id}/scene`;

      const unsupported = await api()
        .put(url)
        .send({ expectedRevision: 0, schemaVersion: 2, scene: scene() })
        .expect(400);
      expect(unsupported.body.issues[0].message).toBe(
        'Unsupported scene schema version',
      );
      await api()
        .put(url)
        .send({ schemaVersion: 1, scene: scene() })
        .expect(400);
      await api()
        .put(url)
        .send({ expectedRevision: 0, schemaVersion: 1 })
        .expect(400);

      const embedded = await save(created.id, 0, {
        elements: [],
        files: {
          f: {
            id: 'f',
            dataURL: 'data:image/png;base64,AA',
            mimeType: 'image/png',
          },
        },
      }).expect(400);
      expect(embedded.body.issues[0].message).toBe(
        'Images must be uploaded as assets, not embedded in the scene',
      );
      await save(UNKNOWN_ID, 0, scene()).expect(404);

      const reopened = await api()
        .get(`/api/v1/canvases/${created.id}`)
        .expect(200);
      expect(reopened.body.revision).toBe(0);
    });

    it('stores large scenes beyond the general limit and answers 413 above 20 MB', async () => {
      const created = await createCanvas();
      const points = Array.from({ length: 400 }, (_, i) => [
        (i + 1) * 1.5,
        (i + 1) * -0.5,
      ]);
      const big = scene(
        ...Array.from({ length: 1000 }, (_, i) =>
          rectangle(`stroke-${i}`, { type: 'freedraw', points }),
        ),
      );
      expect(JSON.stringify(big).length).toBeGreaterThan(3_000_000);

      await save(created.id, 0, big).expect(200);
      const reopened = await api()
        .get(`/api/v1/canvases/${created.id}`)
        .expect(200);
      expect(reopened.body.scene).toEqual(big);

      const tooBig = scene(
        rectangle('huge', { blob: 'x'.repeat(21 * 1024 * 1024) }),
      );
      await save(created.id, 1, tooBig).expect(413);
    }, 30_000);

    it('keeps the 2 MB limit on other endpoints', async () => {
      await api()
        .post('/api/v1/projects')
        .send({ key: 'BIG', name: 'x', description: 'x'.repeat(3_000_000) })
        .expect(413);
    });
  });

  describe('asset references', () => {
    const files = (...assetIds: string[]) =>
      Object.fromEntries(
        assetIds.map((assetId, i) => [`file-${i}`, { assetId }]),
      );

    const linked = async (canvasId: string) => {
      const rows = await prisma.canvasAsset.findMany({ where: { canvasId } });
      return rows.map((row) => row.assetId).sort((a, b) => a.localeCompare(b));
    };

    it('derives references from the scene when creating and saving', async () => {
      const a = await createAsset('a');
      const b = await createAsset('b');
      const created = await createCanvas({
        scene: { elements: [], files: files(a.id) },
      });
      expect(await linked(created.id)).toEqual([a.id]);

      await save(created.id, 0, {
        elements: [],
        files: files(b.id, b.id),
      }).expect(200);
      expect(await linked(created.id)).toEqual([b.id]);

      await save(created.id, 1, { elements: [] }).expect(200);
      expect(await linked(created.id)).toEqual([]);
    });

    it('rejects unknown assets atomically', async () => {
      const a = await createAsset('a');
      const created = await createCanvas({
        scene: { elements: [], files: files(a.id) },
      });

      const response = await save(created.id, 0, {
        elements: [rectangle('lost')],
        files: files(UNKNOWN_ID),
      }).expect(404);

      expect(response.body.message).toBe('Asset not found');
      const reopened = await api()
        .get(`/api/v1/canvases/${created.id}`)
        .expect(200);
      expect(reopened.body.revision).toBe(0);
      expect(reopened.body.scene.elements).toEqual([]);
      expect(await linked(created.id)).toEqual([a.id]);
      await api()
        .post('/api/v1/canvases')
        .send({ scene: { elements: [], files: files(UNKNOWN_ID) } })
        .expect(404);
    });

    it('associates a free canvas with a project without altering scene or references', async () => {
      const a = await createAsset('a');
      const content = { ...scene(rectangle('a')), files: files(a.id) };
      const created = await createCanvas({ scene: content });

      const updated = await api()
        .patch(`/api/v1/canvases/${created.id}`)
        .send({ projectId, title: 'Renamed' })
        .expect(200);

      expect(updated.body).toMatchObject({
        projectId,
        title: 'Renamed',
        revision: 0,
        scene: content,
      });
      expect(await linked(created.id)).toEqual([a.id]);

      await save(created.id, 0, content).expect(200);
      const unlinked = await api()
        .patch(`/api/v1/canvases/${created.id}`)
        .send({ projectId: null })
        .expect(200);
      expect(unlinked.body).toMatchObject({ projectId: null, revision: 1 });
    });
  });

  describe('project links', () => {
    it('rejects unknown and archived projects', async () => {
      const created = await createCanvas();

      await api()
        .patch(`/api/v1/canvases/${created.id}`)
        .send({ projectId: UNKNOWN_ID })
        .expect(404);
      await api().post(`/api/v1/projects/${projectId}/archive`).expect(200);
      const conflict = await api()
        .patch(`/api/v1/canvases/${created.id}`)
        .send({ projectId })
        .expect(409);

      expect(conflict.body.message).toBe('Cannot link to an archived project');
      await api().post('/api/v1/canvases').send({ projectId }).expect(409);
      await api()
        .patch(`/api/v1/canvases/${UNKNOWN_ID}`)
        .send({ title: 'x' })
        .expect(404);
      await api().patch(`/api/v1/canvases/${created.id}`).send({}).expect(400);
    });
  });

  describe('archive and restore', () => {
    it('archives and restores idempotently, still accepting saves from an open tab', async () => {
      const created = await createCanvas();

      const archived = await api()
        .post(`/api/v1/canvases/${created.id}/archive`)
        .expect(200);
      const again = await api()
        .post(`/api/v1/canvases/${created.id}/archive`)
        .expect(200);
      expect(archived.body.archivedAt).toEqual(expect.any(String));
      expect(again.body.archivedAt).toBe(archived.body.archivedAt);

      await save(created.id, 0, scene(rectangle('late'))).expect(200);

      const restored = await api()
        .post(`/api/v1/canvases/${created.id}/restore`)
        .expect(200);
      expect(restored.body).toMatchObject({ archivedAt: null, revision: 1 });
      await api().post(`/api/v1/canvases/${UNKNOWN_ID}/archive`).expect(404);
      await api().post(`/api/v1/canvases/${UNKNOWN_ID}/restore`).expect(404);
    });
  });

  describe('GET /api/v1/canvases/:id/export', () => {
    it('downloads an editable file that can be imported back exactly', async () => {
      const content = scene(rectangle('a'), rectangle('b'));
      const created = await createCanvas({ title: 'Diseño: mapa / v2' });
      await save(created.id, 0, content).expect(200);

      const response = await api()
        .get(`/api/v1/canvases/${created.id}/export`)
        .expect(200);

      expect(response.headers['content-type']).toBe(
        'application/json; charset=utf-8',
      );
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="diseno-mapa-v2.mimir-canvas.json"',
      );
      expect(response.body).toEqual({
        format: 'mimir-canvas',
        formatVersion: 1,
        title: 'Diseño: mapa / v2',
        schemaVersion: 1,
        revision: 1,
        scene: content,
      });

      const imported = await createCanvas({
        title: response.body.title,
        schemaVersion: response.body.schemaVersion,
        scene: response.body.scene,
      });
      expect(imported).toMatchObject({ revision: 0, scene: content });
      expect(imported.id).not.toBe(created.id);
    });

    it('names the file after the canvas when the title has no usable characters', async () => {
      const created = await createCanvas({ title: '???' });

      const response = await api()
        .get(`/api/v1/canvases/${created.id}/export`)
        .expect(200);

      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="canvas.mimir-canvas.json"',
      );
    });

    it('answers 404 for an unknown canvas', async () => {
      await api().get(`/api/v1/canvases/${UNKNOWN_ID}/export`).expect(404);
    });
  });

  describe('GET /api/v1/canvases', () => {
    const titles = (body: { items: { title: string }[] }) =>
      body.items.map((c) => c.title);

    async function seed() {
      await createCanvas({ title: 'Free ideas' });
      await createCanvas({ title: '100% Architecture', projectId });
      const old = await createCanvas({ title: 'Old board', projectId });
      await api().post(`/api/v1/canvases/${old.id}/archive`).expect(200);
    }

    it('lists unarchived canvases, latest change first, without scenes', async () => {
      await seed();

      const response = await api().get('/api/v1/canvases').expect(200);

      expect(titles(response.body)).toEqual([
        '100% Architecture',
        'Free ideas',
      ]);
      expect(response.body.items[0]).not.toHaveProperty('scene');
      expect(response.body.items[0]).toMatchObject({
        revision: 0,
        schemaVersion: 1,
      });
    });

    it('filters by project, free canvases, archived state and literal title', async () => {
      await seed();

      const ofProject = await api()
        .get(`/api/v1/canvases?projectId=${projectId}`)
        .expect(200);
      const free = await api()
        .get('/api/v1/canvases?projectId=none')
        .expect(200);
      const archived = await api()
        .get('/api/v1/canvases?archived=only')
        .expect(200);
      const search = await api().get('/api/v1/canvases?q=IDEAS').expect(200);
      const literal = await api().get('/api/v1/canvases?q=%25').expect(200);

      expect(titles(ofProject.body)).toEqual(['100% Architecture']);
      expect(titles(free.body)).toEqual(['Free ideas']);
      expect(titles(archived.body)).toEqual(['Old board']);
      expect(titles(search.body)).toEqual(['Free ideas']);
      expect(titles(literal.body)).toEqual(['100% Architecture']);
    });

    it('answers 400 for invalid filters', async () => {
      await api().get('/api/v1/canvases?projectId=abc').expect(400);
      await api().get('/api/v1/canvases?archived=all').expect(400);
    });
  });
});
