import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  // Loopback only: the API must never be reachable from other machines.
  await app.listen(
    process.env.API_PORT ?? 3000,
    process.env.API_HOST ?? '127.0.0.1',
  );
}
await bootstrap();
