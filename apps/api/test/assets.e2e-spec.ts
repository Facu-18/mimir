import { createHash } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDatabase } from './support/reset-database.js';

const UNKNOWN_ID = '00000000-0000-4000-8000-0000000000ff';
const MAX_BYTES = 10 * 1024 * 1024;

const PNG_HEADER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
  Buffer.from('IHDR', 'latin1'),
]);
const png = (fill = 'pixels') => Buffer.concat([PNG_HEADER, Buffer.from(fill)]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([4, 0, 0, 0]),
  Buffer.from('WEBPVP8 ', 'latin1'),
]);

const sha256 = (buffer: Buffer) =>
  createHash('sha256').update(buffer).digest('hex');

/** supertest hands binary bodies back only through an explicit parser. */
const collectBinary = (
  response: NodeJS.ReadableStream,
  done: (error: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => done(null, Buffer.concat(chunks)));
};

describe('Canvas assets (e2e)', () => {
  const assetsDir = process.env.ASSETS_DIR!;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let canvasId: string;

  const api = () => request(app.getHttpServer());

  async function startApp(): Promise<void> {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  }

  const upload = (
    file: Buffer,
    options: { filename?: string; contentType?: string } = {},
    id = canvasId,
  ) =>
    api()
      .post(`/api/v1/canvases/${id}/assets`)
      .attach('file', file, {
        filename: options.filename ?? 'photo.png',
        contentType: options.contentType ?? 'image/png',
      });

  const content = (id: string) =>
    api()
      .get(`/api/v1/assets/${id}/content`)
      .buffer(true)
      .parse(collectBinary as never);

  const storedFiles = () =>
    readdirSync(assetsDir).filter((name) => name !== '.tmp');

  beforeAll(startApp);

  beforeEach(async () => {
    await resetDatabase(prisma);
    rmSync(assetsDir, { recursive: true, force: true });
    const canvas = await api().post('/api/v1/canvases').send({}).expect(201);
    canvasId = canvas.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/canvases/:id/assets', () => {
    it('stores a PNG and answers its metadata', async () => {
      const file = png();

      const response = await upload(file).expect(201);

      expect(response.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        filename: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: file.length,
        checksum: sha256(file),
        createdAt: expect.any(String),
      });
      const row = await prisma.asset.findUniqueOrThrow({
        where: { id: response.body.id },
      });
      expect(row.storageKey).toBe(`${response.body.id}.png`);
      expect(readFileSync(join(assetsDir, row.storageKey))).toEqual(file);
    });

    it('takes the type from the bytes, not from what the client declares', async () => {
      const jpeg = await upload(JPEG, {
        filename: 'x.png',
        contentType: 'image/png',
      }).expect(201);
      const webp = await upload(WEBP, {
        filename: 'x.bin',
        contentType: 'application/octet-stream',
      }).expect(201);

      expect(jpeg.body.mimeType).toBe('image/jpeg');
      expect(webp.body.mimeType).toBe('image/webp');
    });

    it('rejects files that are not supported images and stores nothing', async () => {
      const invalid = [
        Buffer.from('not an image'),
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
        Buffer.from('GIF89a-------'),
        Buffer.alloc(0),
      ];

      for (const file of invalid) {
        const response = await upload(file).expect(415);
        expect(response.body.message).toBe('Unsupported image type');
      }

      expect(await prisma.asset.count()).toBe(0);
      expect(existsSync(assetsDir) ? storedFiles() : []).toEqual([]);
    });

    it('accepts exactly the size limit and rejects one byte more', async () => {
      const atLimit = Buffer.concat([
        PNG_HEADER,
        Buffer.alloc(MAX_BYTES - PNG_HEADER.length),
      ]);

      const accepted = await upload(atLimit);
      const rejected = await upload(Buffer.concat([atLimit, Buffer.alloc(1)]));

      expect(accepted.status).toBe(201);
      expect(rejected.status).toBe(413);
      expect(await prisma.asset.count()).toBe(1);
    }, 30_000);

    it('asks for a file when none arrives', async () => {
      const multipart = await api()
        .post(`/api/v1/canvases/${canvasId}/assets`)
        .field('other', 'value')
        .expect(400);
      const json = await api()
        .post(`/api/v1/canvases/${canvasId}/assets`)
        .send({ file: 'x' })
        .expect(400);

      expect(multipart.body.message).toBe('File is required');
      expect(json.body.message).toBe('File is required');
    });

    it('rejects files in another field and more than one file', async () => {
      await api()
        .post(`/api/v1/canvases/${canvasId}/assets`)
        .attach('other', png(), 'a.png')
        .expect(400);
      await api()
        .post(`/api/v1/canvases/${canvasId}/assets`)
        .attach('file', png(), 'a.png')
        .attach('file', png(), 'b.png')
        .expect(400);

      expect(await prisma.asset.count()).toBe(0);
    });

    it('answers 404 for an unknown canvas and 400 for a malformed id, storing nothing', async () => {
      await upload(png(), {}, UNKNOWN_ID).expect(404);
      await upload(png(), {}, 'not-a-uuid').expect(400);

      expect(await prisma.asset.count()).toBe(0);
      expect(existsSync(assetsDir) ? storedFiles() : []).toEqual([]);
    });

    it('still accepts uploads on an archived canvas', async () => {
      await api().post(`/api/v1/canvases/${canvasId}/archive`).expect(200);

      await upload(png()).expect(201);
    });

    it('treats the filename as metadata, never as a path', async () => {
      const hostile = [
        '../../../outside.png',
        '..\\..\\outside.png',
        '/etc/passwd',
        'C:\\Windows\\system.ini',
      ];

      const names: string[] = [];
      for (const filename of hostile) {
        const response = await upload(png(), { filename }).expect(201);
        names.push(response.body.filename);
      }

      expect(names).toEqual([
        'outside.png',
        'outside.png',
        'passwd',
        'system.ini',
      ]);
      const rows = await prisma.asset.findMany();
      expect(rows.map((row) => row.storageKey).sort()).toEqual(
        storedFiles().sort(),
      );
      for (const row of rows) {
        expect(row.storageKey).toMatch(/^[0-9a-f-]{36}\.png$/);
      }
    });

    it('keeps accents in the filename', async () => {
      const response = await upload(png(), { filename: 'Diseño.png' }).expect(
        201,
      );

      expect(response.body.filename).toBe('Diseño.png');
    });

    it('does not link the asset until a scene references it', async () => {
      const uploaded = await upload(png()).expect(201);

      expect(await prisma.canvasAsset.count()).toBe(0);

      await api()
        .put(`/api/v1/canvases/${canvasId}/scene`)
        .send({
          expectedRevision: 0,
          schemaVersion: 1,
          scene: { elements: [], files: { f1: { assetId: uploaded.body.id } } },
        })
        .expect(200);

      expect(await prisma.canvasAsset.count()).toBe(1);
    });

    it('rolls the file back when the row cannot be inserted', async () => {
      const spy = vi
        .spyOn(prisma.asset, 'create')
        .mockRejectedValueOnce(new Error('insert failed'));

      await upload(png()).expect(500);

      expect(spy).toHaveBeenCalledOnce();
      expect(storedFiles()).toEqual([]);
      spy.mockRestore();
    });
  });

  describe('GET /api/v1/assets/:id/content', () => {
    it('returns the exact bytes with safe headers', async () => {
      const file = png();
      const uploaded = await upload(file, { filename: 'Mi foto.png' }).expect(
        201,
      );

      const response = await content(uploaded.body.id).expect(200);

      expect(response.body).toEqual(file);
      expect(response.headers['content-type']).toBe('image/png');
      expect(response.headers['content-length']).toBe(String(file.length));
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toBe(
        "default-src 'none'; sandbox",
      );
      expect(response.headers['cache-control']).toBe(
        'private, max-age=31536000, immutable',
      );
      expect(response.headers['content-disposition']).toBe(
        'inline; filename="mi-foto.png"',
      );
    });

    it('answers 404 for an unknown asset and 400 for a malformed id', async () => {
      await content(UNKNOWN_ID).expect(404);
      await content('..%2F..%2Fetc%2Fpasswd').expect(400);
    });

    it('answers 404 when the file disappeared from disk', async () => {
      const uploaded = await upload(png()).expect(201);
      rmSync(join(assetsDir, `${uploaded.body.id}.png`));

      const response = await content(uploaded.body.id).expect(404);

      expect(response.status).toBe(404);
    });

    it('never follows a storage key that points outside the directory', async () => {
      // A real target, so a key that escapes would serve it instead of missing.
      const outside = join(assetsDir, '..', 'mimir-assets-e2e-outside.png');
      writeFileSync(outside, 'secret');
      const row = await prisma.asset.create({
        data: {
          filename: 'evil.png',
          mimeType: 'image/png',
          sizeBytes: 6n,
          checksum: 'x',
          storageKey: '../mimir-assets-e2e-outside.png',
        },
      });

      try {
        await content(row.id).expect(404);
      } finally {
        rmSync(outside, { force: true });
      }
    });
  });

  describe('durability', () => {
    it('serves the same bytes after an API restart', async () => {
      const file = png('survives');
      const uploaded = await upload(file).expect(201);

      await app.close();
      await startApp();

      const response = await content(uploaded.body.id).expect(200);
      expect(response.body).toEqual(file);
    });

    it('keeps the scene and its image through archive and restore', async () => {
      const file = png('restored');
      const uploaded = await upload(file).expect(201);
      const scene = {
        elements: [],
        appState: {},
        files: { f1: { assetId: uploaded.body.id, mimeType: 'image/png' } },
      };
      await api()
        .put(`/api/v1/canvases/${canvasId}/scene`)
        .send({ expectedRevision: 0, schemaVersion: 1, scene })
        .expect(200);

      await api().post(`/api/v1/canvases/${canvasId}/archive`).expect(200);
      const restored = await api()
        .post(`/api/v1/canvases/${canvasId}/restore`)
        .expect(200);

      expect(restored.body.scene).toEqual(scene);
      const response = await content(uploaded.body.id).expect(200);
      expect(response.body).toEqual(file);
    });
  });

  describe('GET /api/v1/canvases/:id/export', () => {
    it('lists the assets the scene references, and only those', async () => {
      const kept = await upload(png('kept'), { filename: 'kept.png' }).expect(
        201,
      );
      await upload(png('unused')).expect(201);
      await api()
        .put(`/api/v1/canvases/${canvasId}/scene`)
        .send({
          expectedRevision: 0,
          schemaVersion: 1,
          scene: { elements: [], files: { f1: { assetId: kept.body.id } } },
        })
        .expect(200);

      const response = await api()
        .get(`/api/v1/canvases/${canvasId}/export`)
        .expect(200);

      expect(response.body.assets).toEqual([kept.body]);
      expect(response.body.scene.files).toEqual({
        f1: { assetId: kept.body.id },
      });
    });

    it('lists no assets for a canvas without images', async () => {
      const response = await api()
        .get(`/api/v1/canvases/${canvasId}/export`)
        .expect(200);

      expect(response.body.assets).toEqual([]);
    });
  });

  describe('scenes', () => {
    it('rejects an image embedded in an element', async () => {
      const response = await api()
        .put(`/api/v1/canvases/${canvasId}/scene`)
        .send({
          expectedRevision: 0,
          schemaVersion: 1,
          scene: {
            elements: [
              { id: 'a', type: 'image', dataURL: 'data:image/png;base64,AAAA' },
            ],
          },
        })
        .expect(400);

      expect(response.body.issues[0].message).toBe(
        'Images must be uploaded as assets, not embedded in the scene',
      );
    });
  });
});
