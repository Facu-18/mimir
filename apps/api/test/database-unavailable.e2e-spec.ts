import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

// Port 1 is never a Postgres server, so every query fails to connect.
const UNREACHABLE_DATABASE_URL =
  'postgresql://mimir:mimir@127.0.0.1:1/mimir_test';

describe('Database unavailable (e2e)', () => {
  const originalUrl = process.env.DATABASE_URL;
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.DATABASE_URL = UNREACHABLE_DATABASE_URL;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    process.env.DATABASE_URL = originalUrl;
  });

  it('starts the API instead of crashing', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const another = moduleRef.createNestApplication({ logger: false });

    await expect(another.init()).resolves.toBe(another);
    await another.close();
  });

  it('GET /api/v1/health responds 503 with the database down', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(503)
      .expect({ status: 'error', database: 'down' });
  });
});
