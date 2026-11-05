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

describe('Epics (e2e)', () => {
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

  async function createEpic(
    body: Record<string, unknown>,
    project = projectId,
  ) {
    const response = await api()
      .post(`/api/v1/projects/${project}/epics`)
      .send(body)
      .expect(201);
    return response.body as { id: string; [key: string]: unknown };
  }

  async function createTicket(project = projectId) {
    const response = await api()
      .post(`/api/v1/projects/${project}/tickets`)
      .send({ title: 'Ticket' })
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
    projectId = await createProject('SB');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('epic CRUD', () => {
    it('creates, reads, updates and lists epics', async () => {
      const created = await createEpic({ title: ' Onboarding ' });
      expect(created).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        projectId,
        title: 'Onboarding',
        description: '',
        status: 'planned',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        archivedAt: null,
      });

      const updated = await api()
        .patch(`/api/v1/epics/${created.id}`)
        .send({ status: 'in_progress', description: 'First run' })
        .expect(200);
      expect(updated.body).toMatchObject({
        status: 'in_progress',
        description: 'First run',
      });

      const read = await api().get(`/api/v1/epics/${created.id}`).expect(200);
      expect(read.body).toEqual(updated.body);

      const list = await api()
        .get(`/api/v1/projects/${projectId}/epics`)
        .expect(200);
      expect(list.body.items.map((e: { id: string }) => e.id)).toEqual([
        created.id,
      ]);
    });

    it('archives and restores idempotently, hiding archived epics by default', async () => {
      const epic = await createEpic({ title: 'Old' });

      const archived = await api()
        .post(`/api/v1/epics/${epic.id}/archive`)
        .expect(200);
      const again = await api()
        .post(`/api/v1/epics/${epic.id}/archive`)
        .expect(200);
      expect(again.body.archivedAt).toBe(archived.body.archivedAt);

      const visible = await api()
        .get(`/api/v1/projects/${projectId}/epics`)
        .expect(200);
      const only = await api()
        .get(`/api/v1/projects/${projectId}/epics?archived=only`)
        .expect(200);
      expect(visible.body.items).toEqual([]);
      expect(only.body.items).toHaveLength(1);

      const restored = await api()
        .post(`/api/v1/epics/${epic.id}/restore`)
        .expect(200);
      expect(restored.body.archivedAt).toBeNull();
    });

    it('rejects invalid input, unknown ids and archived projects', async () => {
      await api()
        .post(`/api/v1/projects/${projectId}/epics`)
        .send({ title: '' })
        .expect(400);
      await api()
        .post(`/api/v1/projects/${UNKNOWN_ID}/epics`)
        .send({ title: 'x' })
        .expect(404);
      const missing = await api()
        .get(`/api/v1/epics/${UNKNOWN_ID}`)
        .expect(404);
      expect(missing.body.message).toBe('Epic not found');
      await api()
        .patch(`/api/v1/epics/${UNKNOWN_ID}`)
        .send({ title: 'x' })
        .expect(404);

      await api().post(`/api/v1/projects/${projectId}/archive`).expect(200);
      const conflict = await api()
        .post(`/api/v1/projects/${projectId}/epics`)
        .send({ title: 'x' })
        .expect(409);
      expect(conflict.body.message).toBe(
        'Cannot add epics to an archived project',
      );
    });
  });

  describe('assigning tickets to epics', () => {
    it('sets and clears the epic of a ticket and records the change', async () => {
      const epic = await createEpic({ title: 'Onboarding' });
      const ticket = await createTicket();

      const assigned = await api()
        .patch(`/api/v1/tickets/${ticket.id}`)
        .send({ epicId: epic.id })
        .expect(200);
      expect(assigned.body.epicId).toBe(epic.id);

      const filtered = await api()
        .get(`/api/v1/projects/${projectId}/tickets?epicId=${epic.id}`)
        .expect(200);
      expect(filtered.body.items.map((t: { id: string }) => t.id)).toEqual([
        ticket.id,
      ]);

      const cleared = await api()
        .patch(`/api/v1/tickets/${ticket.id}`)
        .send({ epicId: null })
        .expect(200);
      expect(cleared.body.epicId).toBeNull();

      const updates = await prisma.activityEvent.findMany({
        where: { entityId: ticket.id, eventType: 'ticket.updated' },
        orderBy: { createdAt: 'asc' },
      });
      expect(updates.map((e) => e.payloadJson)).toEqual([
        { changes: { epicId: { from: null, to: epic.id } } },
        { changes: { epicId: { from: epic.id, to: null } } },
      ]);
    });

    it('rejects epics from another project, unknown epics and archived epics', async () => {
      const otherProject = await createProject('MIM');
      const foreign = await createEpic({ title: 'Foreign' }, otherProject);
      const archived = await createEpic({ title: 'Archived' });
      await api().post(`/api/v1/epics/${archived.id}/archive`).expect(200);
      const ticket = await createTicket();

      const cross = await api()
        .patch(`/api/v1/tickets/${ticket.id}`)
        .send({ epicId: foreign.id })
        .expect(400);
      expect(cross.body.message).toBe('Epic must belong to the same project');

      await api()
        .patch(`/api/v1/tickets/${ticket.id}`)
        .send({ epicId: UNKNOWN_ID })
        .expect(404);

      const conflict = await api()
        .patch(`/api/v1/tickets/${ticket.id}`)
        .send({ epicId: archived.id })
        .expect(409);
      expect(conflict.body.message).toBe('Cannot assign an archived epic');

      await expect(
        prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
      ).resolves.toMatchObject({ epicId: null });
    });
  });
});
