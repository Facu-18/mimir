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
  [key: string]: unknown;
};

describe('Tickets (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let projectId: string;

  const api = () => request(app.getHttpServer());

  async function createProject(key: string) {
    const response = await api()
      .post('/api/v1/projects')
      .send({ key, name: `Project ${key}` })
      .expect(201);
    return response.body.id as string;
  }

  async function createTicket(
    body: Record<string, unknown>,
    project = projectId,
  ): Promise<TicketBody> {
    const response = await api()
      .post(`/api/v1/projects/${project}/tickets`)
      .send(body)
      .expect(201);
    return response.body as TicketBody;
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

  describe('POST /api/v1/projects/:projectId/tickets', () => {
    it('creates a ticket with the first number, its code and defaults', async () => {
      const response = await api()
        .post(`/api/v1/projects/${projectId}/tickets`)
        .send({ title: ' Fix login ' })
        .expect(201);

      expect(response.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        projectId,
        number: 1,
        code: 'SB-001',
        title: 'Fix login',
        descriptionJson: null,
        descriptionText: '',
        type: 'task',
        status: 'backlog',
        priority: 'none',
        parentId: null,
        epicId: null,
        sortOrder: 1,
        dueAt: null,
        completedAt: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        archivedAt: null,
      });
    });

    it('numbers tickets sequentially per project', async () => {
      const otherProject = await createProject('MIM');

      const first = await createTicket({ title: 'One' });
      const second = await createTicket({ title: 'Two' });
      const other = await createTicket({ title: 'Other' }, otherProject);

      expect([first.code, second.code, other.code]).toEqual([
        'SB-001',
        'SB-002',
        'MIM-001',
      ]);
    });

    it('assigns unique consecutive numbers under concurrent creation', async () => {
      const responses = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          api()
            .post(`/api/v1/projects/${projectId}/tickets`)
            .send({ title: `Parallel ${i}` }),
        ),
      );

      expect(responses.map((r) => r.status)).toEqual(Array(20).fill(201));
      const numbers = responses
        .map((r) => r.body.number as number)
        .sort((a, b) => a - b);
      expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
      await expect(
        prisma.projectCounter.findUniqueOrThrow({ where: { projectId } }),
      ).resolves.toMatchObject({ nextTicketNumber: 21 });
    });

    it('does not consume a number when the ticket is rejected', async () => {
      await api()
        .post(`/api/v1/projects/${projectId}/tickets`)
        .send({ title: '' })
        .expect(400);

      const ticket = await createTicket({ title: 'Valid' });

      expect(ticket.code).toBe('SB-001');
    });

    it('sets completedAt when created as done', async () => {
      const ticket = await createTicket({
        title: 'Already done',
        status: 'done',
      });

      expect(ticket.completedAt).toEqual(expect.any(String));
    });

    it('places new tickets at the end of their status column', async () => {
      const a = await createTicket({ title: 'A', status: 'todo' });
      const b = await createTicket({ title: 'B', status: 'todo' });
      const c = await createTicket({ title: 'C', status: 'done' });

      expect([a.sortOrder, b.sortOrder, c.sortOrder]).toEqual([1, 2, 1]);
    });

    it('answers 400 with validation issues', async () => {
      const response = await api()
        .post(`/api/v1/projects/${projectId}/tickets`)
        .send({ title: 'x', status: 'open', number: 7 })
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
      expect(
        response.body.issues.map((i: { path: string }) => i.path),
      ).toContain('status');
    });

    it('answers 404 for an unknown project', async () => {
      const response = await api()
        .post(`/api/v1/projects/${UNKNOWN_ID}/tickets`)
        .send({ title: 'x' })
        .expect(404);

      expect(response.body.message).toBe('Project not found');
    });

    it('answers 409 for an archived project', async () => {
      await api().post(`/api/v1/projects/${projectId}/archive`).expect(200);

      const response = await api()
        .post(`/api/v1/projects/${projectId}/tickets`)
        .send({ title: 'x' })
        .expect(409);

      expect(response.body.message).toBe(
        'Cannot add tickets to an archived project',
      );
      await expect(prisma.ticket.count()).resolves.toBe(0);
    });
  });

  describe('GET /api/v1/tickets/:ref', () => {
    it('finds a ticket by id', async () => {
      const ticket = await createTicket({ title: 'By id' });

      const response = await api()
        .get(`/api/v1/tickets/${ticket.id}`)
        .expect(200);

      expect(response.body).toEqual(ticket);
    });

    it('finds a ticket by code, case-insensitively', async () => {
      await createTicket({ title: 'First' });
      const second = await createTicket({ title: 'Second' });

      const response = await api().get('/api/v1/tickets/sb-002').expect(200);

      expect(response.body.id).toBe(second.id);
    });

    it('answers 404 for an unknown id or code', async () => {
      await api().get(`/api/v1/tickets/${UNKNOWN_ID}`).expect(404);
      await api().get('/api/v1/tickets/SB-999').expect(404);
      const response = await api().get('/api/v1/tickets/NOPE-001').expect(404);

      expect(response.body.message).toBe('Ticket not found');
    });

    it('answers 400 for a reference that is neither a UUID nor a code', async () => {
      const response = await api().get('/api/v1/tickets/whatever').expect(400);

      expect(response.body.message).toBe(
        'Expected a ticket id or code like SB-001',
      );
    });
  });

  describe('GET /api/v1/projects/:projectId/tickets', () => {
    const codes = (body: { items: { code: string }[] }) =>
      body.items.map((t) => t.code);

    async function seed() {
      await createTicket({
        title: 'Login bug',
        type: 'bug',
        status: 'todo',
        priority: 'high',
      });
      await createTicket({
        title: 'Dark mode',
        type: 'feature',
        status: 'backlog',
        priority: 'low',
      });
      await createTicket({
        title: 'Ship 100% of it',
        status: 'in_progress',
        priority: 'urgent',
      });
      const old = await createTicket({
        title: 'Old login idea',
        status: 'todo',
      });
      await prisma.ticket.update({
        where: { id: old.id },
        data: { archivedAt: new Date() },
      });
    }

    it('lists unarchived tickets in position order', async () => {
      await seed();

      const response = await api()
        .get(`/api/v1/projects/${projectId}/tickets`)
        .expect(200);

      expect(codes(response.body)).toEqual(['SB-001', 'SB-002', 'SB-003']);
    });

    it('filters by status, type and priority lists', async () => {
      await seed();
      const base = `/api/v1/projects/${projectId}/tickets`;

      const byStatus = await api()
        .get(`${base}?status=todo,in_progress`)
        .expect(200);
      const byType = await api().get(`${base}?type=bug`).expect(200);
      const byPriority = await api()
        .get(`${base}?priority=low,urgent`)
        .expect(200);

      expect(codes(byStatus.body).sort()).toEqual(['SB-001', 'SB-003']);
      expect(codes(byType.body)).toEqual(['SB-001']);
      expect(codes(byPriority.body).sort()).toEqual(['SB-002', 'SB-003']);
    });

    it('searches titles literally and matches exact codes', async () => {
      await seed();
      const base = `/api/v1/projects/${projectId}/tickets`;

      const byTitle = await api().get(`${base}?q=LOGIN`).expect(200);
      const byCode = await api().get(`${base}?q=sb-002`).expect(200);
      const literal = await api().get(`${base}?q=100%25`).expect(200);

      expect(codes(byTitle.body)).toEqual(['SB-001']);
      expect(codes(byCode.body)).toEqual(['SB-002']);
      expect(codes(literal.body)).toEqual(['SB-003']);
    });

    it('includes or isolates archived tickets on request', async () => {
      await seed();
      const base = `/api/v1/projects/${projectId}/tickets`;

      const all = await api()
        .get(`${base}?archived=include&sort=number`)
        .expect(200);
      const only = await api().get(`${base}?archived=only`).expect(200);

      expect(codes(all.body)).toEqual(['SB-001', 'SB-002', 'SB-003', 'SB-004']);
      expect(codes(only.body)).toEqual(['SB-004']);
    });

    it('sorts by priority and number in either direction', async () => {
      await seed();
      const base = `/api/v1/projects/${projectId}/tickets`;

      const byPriority = await api()
        .get(`${base}?sort=priority&order=desc`)
        .expect(200);
      const byNumber = await api()
        .get(`${base}?sort=number&order=desc`)
        .expect(200);

      expect(codes(byPriority.body)).toEqual(['SB-003', 'SB-001', 'SB-002']);
      expect(codes(byNumber.body)).toEqual(['SB-003', 'SB-002', 'SB-001']);
    });

    it('answers 400 for invalid filters and 404 for an unknown project', async () => {
      await api()
        .get(`/api/v1/projects/${projectId}/tickets?status=open`)
        .expect(400);
      await api()
        .get(`/api/v1/projects/${projectId}/tickets?sort=title`)
        .expect(400);
      await api().get(`/api/v1/projects/${UNKNOWN_ID}/tickets`).expect(404);
    });
  });
});
