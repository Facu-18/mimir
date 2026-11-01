import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  DEFAULT_WORKSPACE_ID,
  WorkspacesService,
} from '../src/workspaces/workspaces.service.js';
import { resetDatabase } from './support/reset-database.js';

const UNKNOWN_ID = '00000000-0000-4000-8000-0000000000ff';

describe('Projects (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const api = () => request(app.getHttpServer());

  async function createProject(body: Record<string, unknown>) {
    const response = await api()
      .post('/api/v1/projects')
      .send(body)
      .expect(201);
    return response.body as { id: string; [key: string]: unknown };
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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/projects', () => {
    it('creates a project with a normalized key, defaults and a ticket counter', async () => {
      const response = await api()
        .post('/api/v1/projects')
        .send({ key: ' sb ', name: 'Second Brain' })
        .expect(201);

      expect(response.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        key: 'SB',
        name: 'Second Brain',
        description: '',
        icon: null,
        color: null,
        status: 'active',
        isFavorite: false,
        sortOrder: 0,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        archivedAt: null,
      });
      const stored = await prisma.project.findUniqueOrThrow({
        where: { id: response.body.id },
        include: { counter: true },
      });
      expect(stored.workspaceId).toBe(DEFAULT_WORKSPACE_ID);
      expect(stored.counter?.nextTicketNumber).toBe(1);
    });

    it('answers 409 when the key already exists, whatever its case', async () => {
      await createProject({ key: 'SB', name: 'First' });

      const response = await api()
        .post('/api/v1/projects')
        .send({ key: 'sb', name: 'Second' })
        .expect(409);

      expect(response.body).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: 'Project key "SB" already exists',
      });
      await expect(prisma.project.count()).resolves.toBe(1);
    });

    it('answers 400 with every validation issue', async () => {
      const response = await api()
        .post('/api/v1/projects')
        .send({ key: '1', name: '', color: 'red' })
        .expect(400);

      expect(response.body).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        issues: [
          {
            path: 'key',
            message:
              'Key must be 2-10 uppercase letters or digits and start with a letter',
          },
          { path: 'name', message: 'Name is required' },
          { path: 'color', message: 'Color must be a hex value like #81917E' },
        ],
      });
      await expect(prisma.project.count()).resolves.toBe(0);
    });

    it('refuses to create an archived project directly', async () => {
      await api()
        .post('/api/v1/projects')
        .send({ key: 'SB', name: 'X', status: 'archived' })
        .expect(400);
    });
  });

  describe('GET /api/v1/projects/:id', () => {
    it('returns the project', async () => {
      const created = await createProject({ key: 'SB', name: 'Second Brain' });

      const response = await api()
        .get(`/api/v1/projects/${created.id}`)
        .expect(200);

      expect(response.body).toEqual(created);
    });

    it('answers 404 for an unknown id', async () => {
      const response = await api()
        .get(`/api/v1/projects/${UNKNOWN_ID}`)
        .expect(404);

      expect(response.body).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: 'Project not found',
      });
    });

    it('answers 400 for an id that is not a UUID', async () => {
      await api().get('/api/v1/projects/not-a-uuid').expect(400);
    });
  });

  describe('PATCH /api/v1/projects/:id', () => {
    it('updates the given fields and persists them', async () => {
      const created = await createProject({ key: 'SB', name: 'Second Brain' });

      const response = await api()
        .patch(`/api/v1/projects/${created.id}`)
        .send({
          name: 'Renamed',
          isFavorite: true,
          status: 'paused',
          color: '#81917E',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        key: 'SB',
        name: 'Renamed',
        isFavorite: true,
        status: 'paused',
        color: '#81917E',
      });
      await expect(
        prisma.project.findUniqueOrThrow({ where: { id: created.id } }),
      ).resolves.toMatchObject({
        name: 'Renamed',
        isFavorite: true,
        status: 'paused',
      });
    });

    it('refuses to change the key', async () => {
      const created = await createProject({ key: 'SB', name: 'Second Brain' });

      const response = await api()
        .patch(`/api/v1/projects/${created.id}`)
        .send({ key: 'NEW' })
        .expect(400);

      expect(response.body.issues).toEqual([
        { path: 'key', message: 'Project key cannot be changed' },
      ]);
    });

    it('refuses to set the archived status', async () => {
      const created = await createProject({ key: 'SB', name: 'Second Brain' });

      await api()
        .patch(`/api/v1/projects/${created.id}`)
        .send({ status: 'archived' })
        .expect(400);
    });

    it('refuses to change the status of an archived project', async () => {
      const created = await createProject({ key: 'SB', name: 'Second Brain' });
      await api().post(`/api/v1/projects/${created.id}/archive`).expect(200);

      const response = await api()
        .patch(`/api/v1/projects/${created.id}`)
        .send({ status: 'paused' })
        .expect(409);

      expect(response.body).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: 'Restore the project before changing its status',
      });
      await expect(
        prisma.project.findUniqueOrThrow({ where: { id: created.id } }),
      ).resolves.toMatchObject({
        status: 'archived',
        archivedAt: expect.any(Date),
      });
    });

    it('still allows other edits on an archived project', async () => {
      const created = await createProject({ key: 'SB', name: 'Second Brain' });
      await api().post(`/api/v1/projects/${created.id}/archive`).expect(200);

      const response = await api()
        .patch(`/api/v1/projects/${created.id}`)
        .send({ name: 'Renamed' })
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'Renamed',
        status: 'archived',
        archivedAt: expect.any(String),
      });
    });

    it('answers 404 for an unknown id', async () => {
      await api()
        .patch(`/api/v1/projects/${UNKNOWN_ID}`)
        .send({ name: 'X' })
        .expect(404);
    });
  });

  describe('archive and restore', () => {
    it('archives a project and restores it as active', async () => {
      const created = await createProject({ key: 'SB', name: 'Second Brain' });

      const archived = await api()
        .post(`/api/v1/projects/${created.id}/archive`)
        .expect(200);
      expect(archived.body).toMatchObject({
        status: 'archived',
        archivedAt: expect.any(String),
      });

      const restored = await api()
        .post(`/api/v1/projects/${created.id}/restore`)
        .expect(200);
      expect(restored.body).toMatchObject({
        status: 'active',
        archivedAt: null,
      });
    });

    it('is idempotent', async () => {
      const created = await createProject({ key: 'SB', name: 'Second Brain' });
      const first = await api()
        .post(`/api/v1/projects/${created.id}/archive`)
        .expect(200);

      const second = await api()
        .post(`/api/v1/projects/${created.id}/archive`)
        .expect(200);
      await api().post(`/api/v1/projects/${created.id}/restore`).expect(200);
      await api().post(`/api/v1/projects/${created.id}/restore`).expect(200);

      expect(second.body.archivedAt).toBe(first.body.archivedAt);
    });

    it('answers 404 for an unknown id', async () => {
      await api().post(`/api/v1/projects/${UNKNOWN_ID}/archive`).expect(404);
      await api().post(`/api/v1/projects/${UNKNOWN_ID}/restore`).expect(404);
    });
  });

  describe('GET /api/v1/projects', () => {
    async function seed() {
      const brain = await createProject({ key: 'SB', name: 'Second Brain' });
      const mimir = await createProject({
        key: 'MIM',
        name: 'Mimir',
        isFavorite: true,
      });
      const paused = await createProject({
        key: 'OLD',
        name: 'Old Idea',
        status: 'paused',
      });
      const gone = await createProject({ key: 'ARC', name: 'Archived Brain' });
      await api().post(`/api/v1/projects/${gone.id}/archive`).expect(200);
      return { brain, mimir, paused, gone };
    }

    const keys = (body: { items: { key: string }[] }) =>
      body.items.map((p) => p.key);

    it('lists active projects with favorites first, then by name', async () => {
      await seed();

      const response = await api().get('/api/v1/projects').expect(200);

      expect(keys(response.body)).toEqual(['MIM', 'OLD', 'SB']);
    });

    it('searches name and key case-insensitively', async () => {
      await seed();

      const byName = await api().get('/api/v1/projects?q=BRAIN').expect(200);
      const byKey = await api().get('/api/v1/projects?q=mi').expect(200);

      expect(keys(byName.body)).toEqual(['SB']);
      expect(keys(byKey.body)).toEqual(['MIM']);
    });

    it('treats % and _ in the search text literally', async () => {
      await seed();
      await createProject({ key: 'UND', name: 'a_b' });
      await createProject({ key: 'AXB', name: 'aXb' });
      await createProject({ key: 'PCT', name: '100% done' });

      const underscore = await api().get('/api/v1/projects?q=a_b').expect(200);
      const percent = await api().get('/api/v1/projects?q=%25').expect(200);
      const backslash = await api().get('/api/v1/projects?q=%5C').expect(200);

      expect(keys(underscore.body)).toEqual(['UND']);
      expect(keys(percent.body)).toEqual(['PCT']);
      expect(keys(backslash.body)).toEqual([]);
    });

    it('filters by status and favorite', async () => {
      await seed();

      const paused = await api()
        .get('/api/v1/projects?status=paused')
        .expect(200);
      const favorites = await api()
        .get('/api/v1/projects?isFavorite=true')
        .expect(200);

      expect(keys(paused.body)).toEqual(['OLD']);
      expect(keys(favorites.body)).toEqual(['MIM']);
    });

    it('includes or isolates archived projects on request', async () => {
      await seed();

      const all = await api()
        .get('/api/v1/projects?archived=include')
        .expect(200);
      const only = await api()
        .get('/api/v1/projects?archived=only&q=brain')
        .expect(200);

      expect(keys(all.body)).toEqual(['MIM', 'ARC', 'OLD', 'SB']);
      expect(keys(only.body)).toEqual(['ARC']);
    });

    it('answers 400 for an invalid filter', async () => {
      const response = await api()
        .get('/api/v1/projects?isFavorite=yes')
        .expect(400);

      expect(response.body.issues).toEqual([
        { path: 'isFavorite', message: 'Must be true or false' },
      ]);
    });
  });
});
