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

type LabelBody = { id: string; name: string; projectId: string | null };

describe('Labels (e2e)', () => {
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

  async function createLabel(
    body: Record<string, unknown>,
  ): Promise<LabelBody> {
    const response = await api().post('/api/v1/labels').send(body).expect(201);
    return response.body;
  }

  async function createTicket(project = projectId): Promise<{ id: string }> {
    const response = await api()
      .post(`/api/v1/projects/${project}/tickets`)
      .send({ title: 'Ticket' })
      .expect(201);
    return response.body;
  }

  const setLabels = (ticketId: string, labelIds: string[]) =>
    api().put(`/api/v1/tickets/${ticketId}/labels`).send({ labelIds });

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

  describe('label CRUD', () => {
    it('creates global and project labels and lists them by scope', async () => {
      const other = await createProject('MIM');
      const global = await createLabel({ name: 'bug', color: '#C6AF98' });
      const local = await createLabel({ name: 'ui', projectId });
      await createLabel({ name: 'infra', projectId: other });

      expect(global).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        projectId: null,
        name: 'bug',
        color: '#C6AF98',
      });
      const scoped = await api()
        .get(`/api/v1/labels?projectId=${projectId}`)
        .expect(200);
      const all = await api().get('/api/v1/labels').expect(200);

      expect(scoped.body.items.map((l: LabelBody) => l.name)).toEqual([
        'bug',
        'ui',
      ]);
      expect(all.body.items.map((l: LabelBody) => l.name)).toEqual([
        'bug',
        'infra',
        'ui',
      ]);
      expect(local.projectId).toBe(projectId);
    });

    it('answers 409 for a duplicate name in the same scope', async () => {
      await createLabel({ name: 'bug' });
      await createLabel({ name: 'bug', projectId });

      const response = await api()
        .post('/api/v1/labels')
        .send({ name: 'bug' })
        .expect(409);

      expect(response.body.message).toBe('Label "bug" already exists');
    });

    it('renames and recolors, rejecting duplicates and unknown ids', async () => {
      const label = await createLabel({ name: 'bug' });
      await createLabel({ name: 'feature' });

      const updated = await api()
        .patch(`/api/v1/labels/${label.id}`)
        .send({ name: 'defect', color: '#343C36' })
        .expect(200);
      expect(updated.body).toMatchObject({ name: 'defect', color: '#343C36' });

      await api()
        .patch(`/api/v1/labels/${label.id}`)
        .send({ name: 'feature' })
        .expect(409);
      await api()
        .patch(`/api/v1/labels/${UNKNOWN_ID}`)
        .send({ name: 'x' })
        .expect(404);
    });

    it('rejects a label for an unknown project', async () => {
      const response = await api()
        .post('/api/v1/labels')
        .send({ name: 'x', projectId: UNKNOWN_ID })
        .expect(404);

      expect(response.body.message).toBe('Project not found');
    });
  });

  describe('PUT /api/v1/tickets/:id/labels', () => {
    it('replaces the label set, persists it and records the change', async () => {
      const bug = await createLabel({ name: 'bug' });
      const ui = await createLabel({ name: 'ui', projectId });
      const ticket = await createTicket();

      const first = await setLabels(ticket.id, [bug.id, ui.id]).expect(200);
      expect([...first.body.labelIds].sort()).toEqual([bug.id, ui.id].sort());

      const second = await setLabels(ticket.id, [ui.id]).expect(200);
      expect(second.body.labelIds).toEqual([ui.id]);
      await setLabels(ticket.id, [ui.id]).expect(200);

      const read = await api().get(`/api/v1/tickets/${ticket.id}`).expect(200);
      expect(read.body.labelIds).toEqual([ui.id]);

      const filtered = await api()
        .get(`/api/v1/projects/${projectId}/tickets?labelId=${ui.id}`)
        .expect(200);
      expect(filtered.body.items.map((t: { id: string }) => t.id)).toEqual([
        ticket.id,
      ]);

      const events = await prisma.activityEvent.findMany({
        where: { entityId: ticket.id, eventType: 'ticket.labels_changed' },
        orderBy: { createdAt: 'asc' },
      });
      expect(events.map((e) => e.payloadJson)).toEqual([
        { added: expect.arrayContaining([bug.id, ui.id]), removed: [] },
        { added: [], removed: [bug.id] },
      ]);
    });

    it('rejects labels of another project and unknown labels', async () => {
      const other = await createProject('MIM');
      const foreign = await createLabel({ name: 'infra', projectId: other });
      const ticket = await createTicket();

      const cross = await setLabels(ticket.id, [foreign.id]).expect(400);
      expect(cross.body.message).toBe(
        'Label must belong to the same project or be global',
      );
      const missing = await setLabels(ticket.id, [UNKNOWN_ID]).expect(404);
      expect(missing.body.message).toBe('Label not found');
      await setLabels(UNKNOWN_ID, []).expect(404);
      await api()
        .put(`/api/v1/tickets/${ticket.id}/labels`)
        .send({})
        .expect(400);

      await expect(prisma.ticketLabel.count()).resolves.toBe(0);
    });

    it('removes a deleted label from every ticket', async () => {
      const bug = await createLabel({ name: 'bug' });
      const a = await createTicket();
      const b = await createTicket();
      await setLabels(a.id, [bug.id]).expect(200);
      await setLabels(b.id, [bug.id]).expect(200);

      await api().delete(`/api/v1/labels/${bug.id}`).expect(204);
      await api().delete(`/api/v1/labels/${bug.id}`).expect(404);

      const read = await api().get(`/api/v1/tickets/${a.id}`).expect(200);
      expect(read.body.labelIds).toEqual([]);
      await expect(prisma.ticketLabel.count()).resolves.toBe(0);
    });
  });
});
