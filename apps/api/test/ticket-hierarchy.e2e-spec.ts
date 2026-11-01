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

type TicketBody = { id: string; code: string; [key: string]: unknown };

describe('Ticket hierarchy (e2e)', () => {
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

  const setParent = (id: string, parentId: string | null) =>
    api().patch(`/api/v1/tickets/${id}`).send({ parentId });

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

  it('nests subtasks, lists children and top-level tickets, and records the change', async () => {
    const parent = await createTicket('Parent');
    const child = await createTicket('Child');

    const response = await setParent(child.id, parent.id).expect(200);
    expect(response.body.parentId).toBe(parent.id);

    const base = `/api/v1/projects/${projectId}/tickets`;
    const children = await api()
      .get(`${base}?parentId=${parent.id}`)
      .expect(200);
    const topLevel = await api().get(`${base}?parentId=none`).expect(200);
    expect(children.body.items.map((t: TicketBody) => t.id)).toEqual([
      child.id,
    ]);
    expect(topLevel.body.items.map((t: TicketBody) => t.id)).toEqual([
      parent.id,
    ]);

    const event = await prisma.activityEvent.findFirstOrThrow({
      where: { entityId: child.id, eventType: 'ticket.updated' },
    });
    expect(event.payloadJson).toEqual({
      changes: { parentId: { from: null, to: parent.id } },
    });

    const detached = await setParent(child.id, null).expect(200);
    expect(detached.body.parentId).toBeNull();
  });

  it('does not complete children when the parent is completed', async () => {
    const parent = await createTicket('Parent');
    const child = await createTicket('Child');
    await setParent(child.id, parent.id).expect(200);

    await api()
      .patch(`/api/v1/tickets/${parent.id}`)
      .send({ status: 'done' })
      .expect(200);

    const read = await api().get(`/api/v1/tickets/${child.id}`).expect(200);
    expect(read.body).toMatchObject({ status: 'backlog', completedAt: null });
  });

  it('rejects a ticket as its own parent', async () => {
    const ticket = await createTicket('Self');

    const response = await setParent(ticket.id, ticket.id).expect(400);

    expect(response.body.message).toBe('A ticket cannot be its own parent');
  });

  it('rejects a parent inside its own subtree', async () => {
    const root = await createTicket('Root');
    const child = await createTicket('Child');
    const grandchild = await createTicket('Grandchild');
    await setParent(child.id, root.id).expect(200);
    await setParent(grandchild.id, child.id).expect(200);

    const direct = await setParent(root.id, child.id).expect(409);
    const deep = await setParent(root.id, grandchild.id).expect(409);

    expect(direct.body.message).toBe('Parent would create a cycle');
    expect(deep.body.message).toBe('Parent would create a cycle');
    await expect(
      prisma.ticket.findUniqueOrThrow({ where: { id: root.id } }),
    ).resolves.toMatchObject({ parentId: null });
  });

  it('allows moving a whole subtree under another ticket', async () => {
    const a = await createTicket('A');
    const b = await createTicket('B');
    const bChild = await createTicket('B child');
    await setParent(bChild.id, b.id).expect(200);

    await setParent(b.id, a.id).expect(200);

    const read = await api().get(`/api/v1/tickets/${bChild.id}`).expect(200);
    expect(read.body.parentId).toBe(b.id);
  });

  it('rejects unknown, foreign and archived parents', async () => {
    const other = await createProject('MIM');
    const foreign = await createTicket('Foreign', other);
    const archived = await createTicket('Archived');
    await api().post(`/api/v1/tickets/${archived.id}/archive`).expect(200);
    const ticket = await createTicket('Ticket');

    const missing = await setParent(ticket.id, UNKNOWN_ID).expect(404);
    const cross = await setParent(ticket.id, foreign.id).expect(400);
    const gone = await setParent(ticket.id, archived.id).expect(409);

    expect(missing.body.message).toBe('Parent ticket not found');
    expect(cross.body.message).toBe('Parent must belong to the same project');
    expect(gone.body.message).toBe('Cannot link to an archived ticket');
  });

  it('cannot create a cycle with concurrent opposite parent assignments', async () => {
    const a = await createTicket('A');
    const b = await createTicket('B');

    const [first, second] = await Promise.all([
      setParent(a.id, b.id),
      setParent(b.id, a.id),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const rows = await prisma.ticket.findMany({
      where: { id: { in: [a.id, b.id] } },
      select: { parentId: true },
    });
    expect(rows.filter((row) => row.parentId !== null)).toHaveLength(1);
  });

  it('never closes a cycle when a ring of parents is assigned concurrently', async () => {
    const ring = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createTicket(`Ring ${i}`)),
    );

    for (let attempt = 0; attempt < 3; attempt++) {
      await prisma.ticket.updateMany({ data: { parentId: null } });
      const responses = await Promise.all(
        ring.map((ticket, i) =>
          setParent(ticket.id, ring[(i + 1) % ring.length].id),
        ),
      );

      expect(
        responses.filter((r) => r.status === 409).length,
      ).toBeGreaterThanOrEqual(1);
      const rows = await prisma.ticket.findMany({
        select: { id: true, parentId: true },
      });
      const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
      for (const start of ring) {
        let node: string | null | undefined = parentOf.get(start.id);
        for (let steps = 0; node && steps <= ring.length; steps++) {
          expect(node).not.toBe(start.id);
          node = parentOf.get(node);
        }
      }
    }
  });
});
