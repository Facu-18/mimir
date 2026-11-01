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
const byText = (a: string, b: string) => a.localeCompare(b);

type TicketBody = { id: string; code: string; [key: string]: unknown };

describe('Ticket dependencies (e2e)', () => {
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

  async function createTicket(
    title: string,
    project = projectId,
  ): Promise<TicketBody> {
    const response = await api()
      .post(`/api/v1/projects/${project}/tickets`)
      .send({ title })
      .expect(201);
    return response.body;
  }

  const setDeps = (id: string, dependsOnTicketIds: string[]) =>
    api()
      .put(`/api/v1/tickets/${id}/dependencies`)
      .send({ dependsOnTicketIds });

  const read = async (id: string) =>
    (await api().get(`/api/v1/tickets/${id}`).expect(200)).body;

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

  it('sets dependencies and shows the ticket as blocked until they are resolved', async () => {
    const blocker = await createTicket('Blocker');
    const other = await createTicket('Other blocker');
    const ticket = await createTicket('Blocked');

    const response = await setDeps(ticket.id, [blocker.id, other.id]).expect(
      200,
    );
    expect([...response.body.dependsOnTicketIds].sort(byText)).toEqual(
      [blocker.id, other.id].sort(byText),
    );
    expect(response.body.isBlocked).toBe(true);

    await api()
      .patch(`/api/v1/tickets/${blocker.id}`)
      .send({ status: 'done' })
      .expect(200);
    expect((await read(ticket.id)).isBlocked).toBe(true);

    await api()
      .patch(`/api/v1/tickets/${other.id}`)
      .send({ status: 'canceled' })
      .expect(200);
    expect((await read(ticket.id)).isBlocked).toBe(false);
  });

  it('does not count an archived dependency as blocking, and keeps the link', async () => {
    const blocker = await createTicket('Blocker');
    const ticket = await createTicket('Blocked');
    await setDeps(ticket.id, [blocker.id]).expect(200);

    await api().post(`/api/v1/tickets/${blocker.id}/archive`).expect(200);

    const body = await read(ticket.id);
    expect(body.dependsOnTicketIds).toEqual([blocker.id]);
    expect(body.isBlocked).toBe(false);
  });

  it('shows blocking in the ticket list', async () => {
    const blocker = await createTicket('Blocker');
    const ticket = await createTicket('Blocked');
    await setDeps(ticket.id, [blocker.id]).expect(200);

    const list = await api()
      .get(`/api/v1/projects/${projectId}/tickets`)
      .expect(200);

    const blocked = list.body.items.find((t: TicketBody) => t.id === ticket.id);
    expect(blocked.isBlocked).toBe(true);
  });

  it('replaces the set and records added and removed dependencies', async () => {
    const a = await createTicket('A');
    const b = await createTicket('B');
    const ticket = await createTicket('Ticket');

    await setDeps(ticket.id, [a.id]).expect(200);
    await setDeps(ticket.id, [b.id]).expect(200);
    await setDeps(ticket.id, [b.id]).expect(200);
    await setDeps(ticket.id, []).expect(200);

    const events = await prisma.activityEvent.findMany({
      where: { entityId: ticket.id, eventType: 'ticket.dependencies_changed' },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.payloadJson)).toEqual([
      { added: [a.id], removed: [] },
      { added: [b.id], removed: [a.id] },
      { added: [], removed: [b.id] },
    ]);
    await expect(prisma.ticketDependency.count()).resolves.toBe(0);
  });

  it('rejects self, unknown, foreign and newly archived dependencies', async () => {
    const other = await createProject('MIM');
    const foreign = await createTicket('Foreign', other);
    const archived = await createTicket('Archived');
    await api().post(`/api/v1/tickets/${archived.id}/archive`).expect(200);
    const ticket = await createTicket('Ticket');

    const self = await setDeps(ticket.id, [ticket.id]).expect(400);
    const missing = await setDeps(ticket.id, [UNKNOWN_ID]).expect(404);
    const cross = await setDeps(ticket.id, [foreign.id]).expect(400);
    const gone = await setDeps(ticket.id, [archived.id]).expect(409);
    await setDeps(UNKNOWN_ID, []).expect(404);
    await api()
      .put(`/api/v1/tickets/${ticket.id}/dependencies`)
      .send({})
      .expect(400);

    expect(self.body.message).toBe('A ticket cannot depend on itself');
    expect(missing.body.message).toBe('Dependency ticket not found');
    expect(cross.body.message).toBe(
      'Dependencies must belong to the same project',
    );
    expect(gone.body.message).toBe('Cannot link to an archived ticket');
    await expect(prisma.ticketDependency.count()).resolves.toBe(0);
  });

  it('rejects direct and indirect cycles, naming the path', async () => {
    const a = await createTicket('A');
    const b = await createTicket('B');
    const c = await createTicket('C');
    await setDeps(a.id, [b.id]).expect(200);
    await setDeps(b.id, [c.id]).expect(200);

    const direct = await setDeps(b.id, [c.id, a.id]).expect(409);
    const indirect = await setDeps(c.id, [a.id]).expect(409);

    expect(direct.body.message).toBe(
      'Dependency would create a cycle: SB-002 → SB-001 → SB-002',
    );
    expect(indirect.body.message).toBe(
      'Dependency would create a cycle: SB-003 → SB-001 → SB-002 → SB-003',
    );
    await expect(prisma.ticketDependency.count()).resolves.toBe(2);
  });

  it('allows diamonds, which are not cycles', async () => {
    const top = await createTicket('Top');
    const left = await createTicket('Left');
    const right = await createTicket('Right');
    const bottom = await createTicket('Bottom');

    await setDeps(top.id, [left.id, right.id]).expect(200);
    await setDeps(left.id, [bottom.id]).expect(200);
    await setDeps(right.id, [bottom.id]).expect(200);
  });

  it('never closes a cycle when a ring of dependencies is set concurrently', async () => {
    const ring = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createTicket(`Ring ${i}`)),
    );

    for (let attempt = 0; attempt < 3; attempt++) {
      await prisma.ticketDependency.deleteMany();
      const responses = await Promise.all(
        ring.map((ticket, i) =>
          setDeps(ticket.id, [ring[(i + 1) % ring.length].id]),
        ),
      );

      expect(
        responses.filter((r) => r.status === 409).length,
      ).toBeGreaterThanOrEqual(1);
      const edges = await prisma.ticketDependency.findMany();
      const next = new Map(edges.map((e) => [e.ticketId, e.dependsOnTicketId]));
      for (const start of ring) {
        let node = next.get(start.id);
        for (let steps = 0; node && steps <= ring.length; steps++) {
          expect(node).not.toBe(start.id);
          node = next.get(node);
        }
      }
    }
  });
});
