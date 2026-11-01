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

type TicketBody = {
  id: string;
  code: string;
  number: number;
  sortOrder: number;
  [key: string]: unknown;
};

describe('Ticket lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let projectId: string;

  const api = () => request(app.getHttpServer());

  async function createTicket(
    body: Record<string, unknown>,
  ): Promise<TicketBody> {
    const response = await api()
      .post(`/api/v1/projects/${projectId}/tickets`)
      .send(body)
      .expect(201);
    return response.body as TicketBody;
  }

  const patch = (id: string, body: Record<string, unknown>) =>
    api().patch(`/api/v1/tickets/${id}`).send(body);

  async function events(ticketId: string) {
    const rows = await prisma.activityEvent.findMany({
      where: { entityType: 'ticket', entityId: ticketId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      type: row.eventType,
      payload: row.payloadJson,
    }));
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
    const response = await api()
      .post('/api/v1/projects')
      .send({ key: 'SB', name: 'Second Brain' })
      .expect(201);
    projectId = response.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('PATCH /api/v1/tickets/:id', () => {
    it('updates fields, persists them and keeps the code', async () => {
      const ticket = await createTicket({
        title: 'Draft',
        dueAt: '2026-12-01T10:00:00.000Z',
      });

      const response = await patch(ticket.id, {
        title: 'Final',
        priority: 'high',
        type: 'bug',
        descriptionJson: { type: 'doc', content: [] },
        descriptionText: 'Steps to reproduce',
        dueAt: null,
      }).expect(200);

      expect(response.body).toMatchObject({
        code: 'SB-001',
        title: 'Final',
        priority: 'high',
        type: 'bug',
        descriptionJson: { type: 'doc', content: [] },
        descriptionText: 'Steps to reproduce',
        dueAt: null,
      });
      await expect(
        prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
      ).resolves.toMatchObject({
        title: 'Final',
        priority: 'high',
        dueAt: null,
      });
    });

    it('sets completedAt when moved to done and clears it when reopened', async () => {
      const ticket = await createTicket({
        title: 'Work',
        status: 'in_progress',
      });

      const done = await patch(ticket.id, { status: 'done' }).expect(200);
      expect(done.body.completedAt).toEqual(expect.any(String));

      const reopened = await patch(ticket.id, { status: 'todo' }).expect(200);
      expect(reopened.body.completedAt).toBeNull();
    });

    it('moves a ticket to the end of its new status column', async () => {
      await createTicket({ title: 'Todo 1', status: 'todo' });
      await createTicket({ title: 'Todo 2', status: 'todo' });
      const moving = await createTicket({
        title: 'Backlog',
        status: 'backlog',
      });

      const response = await patch(moving.id, { status: 'todo' }).expect(200);

      expect(response.body.sortOrder).toBe(3);
    });

    it('keeps the position when the status does not change', async () => {
      await createTicket({ title: 'First', status: 'todo' });
      const ticket = await createTicket({ title: 'Second', status: 'todo' });

      const response = await patch(ticket.id, {
        status: 'todo',
        title: 'Renamed',
      }).expect(200);

      expect(response.body.sortOrder).toBe(ticket.sortOrder);
    });

    it('rejects invalid updates', async () => {
      const ticket = await createTicket({ title: 'x' });

      await patch(ticket.id, {}).expect(400);
      await patch(ticket.id, { status: 'open' }).expect(400);
      await patch(ticket.id, { number: 99 }).expect(400);
      await patch(ticket.id, { projectId: UNKNOWN_ID }).expect(400);
      await api()
        .patch('/api/v1/tickets/SB-001')
        .send({ title: 'y' })
        .expect(400);
      const missing = await patch(UNKNOWN_ID, { title: 'y' }).expect(404);
      expect(missing.body.message).toBe('Ticket not found');
    });
  });

  describe('archive and restore', () => {
    it('archives and restores idempotently', async () => {
      const ticket = await createTicket({ title: 'Archive me' });

      const archived = await api()
        .post(`/api/v1/tickets/${ticket.id}/archive`)
        .expect(200);
      const again = await api()
        .post(`/api/v1/tickets/${ticket.id}/archive`)
        .expect(200);
      expect(archived.body.archivedAt).toEqual(expect.any(String));
      expect(again.body.archivedAt).toBe(archived.body.archivedAt);

      const restored = await api()
        .post(`/api/v1/tickets/${ticket.id}/restore`)
        .expect(200);
      await api().post(`/api/v1/tickets/${ticket.id}/restore`).expect(200);
      expect(restored.body.archivedAt).toBeNull();
    });

    it('answers 404 for an unknown ticket', async () => {
      await api().post(`/api/v1/tickets/${UNKNOWN_ID}/archive`).expect(404);
      await api().post(`/api/v1/tickets/${UNKNOWN_ID}/restore`).expect(404);
    });
  });

  describe('POST /api/v1/tickets/:id/duplicate', () => {
    it('copies the ticket under the next number, back in the backlog', async () => {
      const source = await createTicket({
        title: 'Original',
        type: 'feature',
        priority: 'urgent',
        status: 'done',
        descriptionJson: { type: 'doc' },
        descriptionText: 'Body',
        dueAt: '2026-12-24T00:00:00.000Z',
      });
      await api().post(`/api/v1/tickets/${source.id}/archive`).expect(200);

      const response = await api()
        .post(`/api/v1/tickets/${source.id}/duplicate`)
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.not.stringMatching(source.id),
        number: 2,
        code: 'SB-002',
        title: 'Original',
        type: 'feature',
        priority: 'urgent',
        status: 'backlog',
        descriptionJson: { type: 'doc' },
        descriptionText: 'Body',
        dueAt: '2026-12-24T00:00:00.000Z',
        completedAt: null,
        archivedAt: null,
      });
    });

    it('answers 409 when the project is archived and 404 for an unknown ticket', async () => {
      const source = await createTicket({ title: 'x' });
      await api().post(`/api/v1/projects/${projectId}/archive`).expect(200);

      const conflict = await api()
        .post(`/api/v1/tickets/${source.id}/duplicate`)
        .expect(409);
      await api().post(`/api/v1/tickets/${UNKNOWN_ID}/duplicate`).expect(404);

      expect(conflict.body.message).toBe(
        'Cannot add tickets to an archived project',
      );
    });
  });

  describe('activity events', () => {
    it('records one event when the same archive is sent concurrently', async () => {
      const ticket = await createTicket({ title: 'Double click' });

      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          api().post(`/api/v1/tickets/${ticket.id}/archive`),
        ),
      );

      expect(responses.map((r) => r.status)).toEqual(Array(10).fill(200));
      const archived = (await events(ticket.id)).filter(
        (event) => event.type === 'ticket.archived',
      );
      expect(archived).toHaveLength(1);
    });

    it('records one event when the same update is sent concurrently', async () => {
      const ticket = await createTicket({ title: 'Retry', status: 'todo' });

      const responses = await Promise.all(
        Array.from({ length: 10 }, () => patch(ticket.id, { status: 'done' })),
      );

      expect(responses.map((r) => r.status)).toEqual(Array(10).fill(200));
      const updates = (await events(ticket.id)).filter(
        (event) => event.type === 'ticket.updated',
      );
      expect(updates).toEqual([
        {
          type: 'ticket.updated',
          payload: { changes: { status: { from: 'todo', to: 'done' } } },
        },
      ]);
    });

    it('records creation, real changes, archive and restore', async () => {
      const ticket = await createTicket({ title: 'Tracked' });

      await patch(ticket.id, {
        status: 'todo',
        priority: 'low',
        title: 'Tracked',
      }).expect(200);
      await patch(ticket.id, { descriptionText: 'Now with details' }).expect(
        200,
      );
      await patch(ticket.id, { priority: 'low' }).expect(200);
      await api().post(`/api/v1/tickets/${ticket.id}/archive`).expect(200);
      await api().post(`/api/v1/tickets/${ticket.id}/archive`).expect(200);
      await api().post(`/api/v1/tickets/${ticket.id}/restore`).expect(200);

      expect(await events(ticket.id)).toEqual([
        { type: 'ticket.created', payload: { number: 1 } },
        {
          type: 'ticket.updated',
          payload: {
            changes: {
              status: { from: 'backlog', to: 'todo' },
              priority: { from: 'none', to: 'low' },
            },
          },
        },
        {
          type: 'ticket.updated',
          payload: { changes: { description: { changed: true } } },
        },
        { type: 'ticket.archived', payload: {} },
        { type: 'ticket.restored', payload: {} },
      ]);
    });

    it('records duplication on the new ticket', async () => {
      const source = await createTicket({ title: 'Source' });

      const copy = await api()
        .post(`/api/v1/tickets/${source.id}/duplicate`)
        .expect(201);

      expect(await events(copy.body.id)).toEqual([
        {
          type: 'ticket.duplicated',
          payload: { sourceTicketId: source.id, number: 2 },
        },
      ]);
    });

    it('records nothing when a ticket is rejected', async () => {
      await api()
        .post(`/api/v1/projects/${projectId}/tickets`)
        .send({ title: '' })
        .expect(400);

      await expect(prisma.activityEvent.count()).resolves.toBe(0);
    });
  });
});
