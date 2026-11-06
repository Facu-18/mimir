import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import {
  configureApp,
  type LocalAccessOptions,
} from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDatabase } from './support/reset-database.js';

const TOKEN = 'a'.repeat(64);
const APP_ORIGIN = 'http://tauri.localhost';
const HEALTH = '/api/v1/health';
const UNAUTHORIZED = {
  statusCode: 401,
  error: 'Unauthorized',
  message: 'Invalid session token',
};

describe('Local access', () => {
  let app: INestApplication<App>;

  async function start(options?: LocalAccessOptions) {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app, options);
    await app.init();
    await resetDatabase(app.get(PrismaService));
  }

  afterEach(async () => {
    await app.close();
  });

  describe('without a session token', () => {
    beforeEach(() => start());

    it('answers without a header, as development and tests expect', async () => {
      await request(app.getHttpServer()).get(HEALTH).expect(200);
    });

    it('sends no CORS headers', async () => {
      const response = await request(app.getHttpServer())
        .get(HEALTH)
        .set('Origin', APP_ORIGIN)
        .expect(200);
      expect(response.headers).not.toHaveProperty(
        'access-control-allow-origin',
      );
    });
  });

  describe('with a session token', () => {
    beforeEach(() =>
      start({ sessionToken: TOKEN, corsOrigins: [APP_ORIGIN] }),
    );

    it('accepts the right token', async () => {
      await request(app.getHttpServer())
        .get(HEALTH)
        .set('Authorization', `Bearer ${TOKEN}`)
        .expect(200)
        .expect({ status: 'ok', database: 'up' });
    });

    it.each([
      ['no header', undefined],
      ['a wrong token', `Bearer ${'b'.repeat(64)}`],
      ['a token of another length', 'Bearer short'],
      ['another scheme', `Basic ${TOKEN}`],
      ['the bare token', TOKEN],
      ['an empty bearer', 'Bearer '],
    ])('rejects %s', async (_name, header) => {
      const call = request(app.getHttpServer()).get(HEALTH);
      if (header !== undefined) call.set('Authorization', header);
      await call.expect(401).expect(UNAUTHORIZED);
    });

    it('does not read the token from the query string', async () => {
      await request(app.getHttpServer())
        .get(`${HEALTH}?token=${TOKEN}`)
        .expect(401);
    });

    it('hides which routes exist', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/nothing-here')
        .expect(401)
        .expect(UNAUTHORIZED);
    });

    it('stores nothing from a rejected write', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/projects')
        .send({ name: 'Rejected', key: 'REJ' })
        .expect(401);
      expect(await app.get(PrismaService).project.count()).toBe(0);
    });

    it('rejects an upload sent as a simple cross-site request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/canvases/00000000-0000-4000-8000-0000000000ff/assets')
        .set('Origin', 'http://evil.example')
        .attach('file', Buffer.from('x'), 'x.png')
        .expect(401);
    });

    it('lets the app origin read responses', async () => {
      const response = await request(app.getHttpServer())
        .get(HEALTH)
        .set('Origin', APP_ORIGIN)
        .set('Authorization', `Bearer ${TOKEN}`)
        .expect(200);
      expect(response.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
    });

    it('answers the app preflight without a token', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/v1/projects')
        .set('Origin', APP_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,content-type')
        .expect(204);
      expect(response.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
    });

    it('gives other origins no CORS permission', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/v1/projects')
        .set('Origin', 'http://evil.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(response.headers).not.toHaveProperty(
        'access-control-allow-origin',
      );
    });
  });

  it.each([[''], ['too-short']])(
    'refuses to start with the weak token %j',
    async (sessionToken) => {
      await expect(start({ sessionToken })).rejects.toThrow(
        'API_SESSION_TOKEN must have at least 32 characters',
      );
    },
  );
});
