import type { AddressInfo } from 'node:net';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';

/** The desktop shell waits for this line to learn the port the API got. */
const READY_PREFIX = 'MIMIR_API_READY port=';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app, {
    sessionToken: process.env.API_SESSION_TOKEN,
    corsOrigins: process.env.API_CORS_ORIGINS?.split(','),
  });
  // Loopback only: the API must never be reachable from other machines.
  await app.listen(
    process.env.API_PORT ?? 3000,
    process.env.API_HOST ?? '127.0.0.1',
  );
  const { port } = app.getHttpServer().address() as AddressInfo;
  process.stdout.write(`${READY_PREFIX}${port}\n`);
}
await bootstrap();
