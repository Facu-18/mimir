import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import { resetDatabase } from './support/reset-database.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const EXPECTED_TABLES = [
  'activity_events',
  'app_settings',
  'assets',
  'canvas_assets',
  'canvases',
  'documents',
  'entity_links',
  'epics',
  'labels',
  'project_counters',
  'projects',
  'ticket_dependencies',
  'ticket_labels',
  'tickets',
  'workspaces',
];

async function expectDbError(
  promise: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  await expect(promise).rejects.toThrow(pattern);
}

async function createWorkspace(name = 'Main') {
  return prisma.workspace.create({ data: { name } });
}

async function createProject(workspaceId: string, key = 'SB') {
  return prisma.project.create({
    data: { workspaceId, key, name: `Project ${key}` },
  });
}

async function createTicket(projectId: string, number: number) {
  return prisma.ticket.create({
    data: { projectId, number, title: `Ticket ${number}` },
  });
}

describe('Database schema', () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates every MVP table on an empty database', async () => {
    const rows = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      ORDER BY tablename`;

    expect(rows.map((row) => row.tablename)).toEqual(EXPECTED_TABLES);
  });

  describe('projects', () => {
    it('persists CRUD operations with UUID ids and defaults', async () => {
      const workspace = await createWorkspace();
      const created = await createProject(workspace.id);

      expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(created.status).toBe('active');
      expect(created.isFavorite).toBe(false);
      expect(created.archivedAt).toBeNull();

      await prisma.project.update({
        where: { id: created.id },
        data: { name: 'Renamed', isFavorite: true },
      });
      const read = await prisma.project.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(read).toMatchObject({ name: 'Renamed', isFavorite: true });

      await prisma.project.delete({ where: { id: created.id } });
      await expect(
        prisma.project.findUnique({ where: { id: created.id } }),
      ).resolves.toBeNull();
    });

    it('rejects a duplicate key within the same workspace', async () => {
      const workspace = await createWorkspace();
      await createProject(workspace.id, 'SB');

      await expectDbError(createProject(workspace.id, 'SB'), /Unique constraint/);
    });

    it('allows the same key in different workspaces', async () => {
      const first = await createWorkspace('First');
      const second = await createWorkspace('Second');
      await createProject(first.id, 'SB');

      await expect(createProject(second.id, 'SB')).resolves.toBeDefined();
    });

    it('rejects keys that are not 2-10 uppercase letters or digits', async () => {
      const workspace = await createWorkspace();

      await expectDbError(createProject(workspace.id, 'sb'), /projects_key_format/);
      await expectDbError(createProject(workspace.id, '1AB'), /projects_key_format/);
    });

    it('rejects a project whose workspace does not exist', async () => {
      await expectDbError(
        createProject('00000000-0000-4000-8000-000000000999'),
        /Foreign key constraint/,
      );
    });
  });

  describe('tickets', () => {
    it('rejects a duplicate number within the same project', async () => {
      const workspace = await createWorkspace();
      const project = await createProject(workspace.id);
      await createTicket(project.id, 1);

      await expectDbError(createTicket(project.id, 1), /Unique constraint/);
    });

    it('allows the same number in different projects', async () => {
      const workspace = await createWorkspace();
      const first = await createProject(workspace.id, 'AA');
      const second = await createProject(workspace.id, 'BB');
      await createTicket(first.id, 1);

      await expect(createTicket(second.id, 1)).resolves.toBeDefined();
    });

    it('uses the documented defaults for type, status and priority', async () => {
      const workspace = await createWorkspace();
      const project = await createProject(workspace.id);
      const ticket = await createTicket(project.id, 1);

      expect(ticket).toMatchObject({
        type: 'task',
        status: 'backlog',
        priority: 'none',
        parentId: null,
        epicId: null,
      });
    });

    it('rejects a non-positive ticket number', async () => {
      const workspace = await createWorkspace();
      const project = await createProject(workspace.id);

      await expectDbError(createTicket(project.id, 0), /tickets_number_positive/);
    });
  });

  describe('ticket_dependencies', () => {
    it('rejects a ticket depending on itself', async () => {
      const workspace = await createWorkspace();
      const project = await createProject(workspace.id);
      const ticket = await createTicket(project.id, 1);

      await expectDbError(
        prisma.ticketDependency.create({
          data: { ticketId: ticket.id, dependsOnTicketId: ticket.id },
        }),
        /ticket_dependencies_no_self_reference/,
      );
    });

    it('rejects a duplicate dependency pair', async () => {
      const workspace = await createWorkspace();
      const project = await createProject(workspace.id);
      const a = await createTicket(project.id, 1);
      const b = await createTicket(project.id, 2);
      const data = { ticketId: a.id, dependsOnTicketId: b.id };
      await prisma.ticketDependency.create({ data });

      await expectDbError(
        prisma.ticketDependency.create({ data }),
        /Unique constraint/,
      );
    });
  });

  describe('labels', () => {
    it('rejects duplicate global label names', async () => {
      await prisma.label.create({ data: { name: 'bug', color: '#C6AF98' } });

      await expectDbError(
        prisma.label.create({ data: { name: 'bug', color: '#81917E' } }),
        /Unique constraint/,
      );
    });

    it('rejects duplicate label names within a project but allows them across projects', async () => {
      const workspace = await createWorkspace();
      const first = await createProject(workspace.id, 'AA');
      const second = await createProject(workspace.id, 'BB');
      await prisma.label.create({
        data: { projectId: first.id, name: 'ui', color: '#81917E' },
      });

      await expectDbError(
        prisma.label.create({
          data: { projectId: first.id, name: 'ui', color: '#81917E' },
        }),
        /Unique constraint/,
      );
      await expect(
        prisma.label.create({
          data: { projectId: second.id, name: 'ui', color: '#81917E' },
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('canvases and assets', () => {
    it('stores a free canvas with revision 0 and links assets', async () => {
      const canvas = await prisma.canvas.create({
        data: { title: 'Ideas', sceneJson: { elements: [] } },
      });
      const asset = await prisma.asset.create({
        data: {
          filename: 'diagram.png',
          mimeType: 'image/png',
          sizeBytes: 1024n,
          checksum: 'sha256:abc',
          storageKey: 'assets/ab/abc.png',
        },
      });
      await prisma.canvasAsset.create({
        data: { canvasId: canvas.id, assetId: asset.id },
      });

      const read = await prisma.canvas.findUniqueOrThrow({
        where: { id: canvas.id },
        include: { assets: true },
      });
      expect(read).toMatchObject({
        projectId: null,
        revision: 0,
        sceneSchemaVersion: 1,
      });
      expect(read.assets).toHaveLength(1);
    });

    it('rejects two assets with the same storage key', async () => {
      const data = {
        filename: 'a.png',
        mimeType: 'image/png',
        sizeBytes: 1n,
        checksum: 'sha256:a',
        storageKey: 'assets/aa/a.png',
      };
      await prisma.asset.create({ data });

      await expectDbError(prisma.asset.create({ data }), /Unique constraint/);
    });
  });

  describe('documents', () => {
    it('stores standalone documents and nests them under a parent', async () => {
      const parent = await prisma.document.create({
        data: { title: 'Parent', contentJson: { type: 'doc' } },
      });
      const child = await prisma.document.create({
        data: { title: 'Child', parentDocumentId: parent.id },
      });

      expect(parent.projectId).toBeNull();
      expect(child.parentDocumentId).toBe(parent.id);
      expect(child.contentText).toBe('');
    });
  });

  describe('transactions', () => {
    it('rolls back every write when a transaction fails', async () => {
      const workspace = await createWorkspace();

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.project.create({
            data: { workspaceId: workspace.id, key: 'OK', name: 'Ok' },
          });
          await tx.project.create({
            data: { workspaceId: workspace.id, key: 'OK', name: 'Duplicate' },
          });
        }),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

      await expect(prisma.project.count()).resolves.toBe(0);
    });
  });
});
