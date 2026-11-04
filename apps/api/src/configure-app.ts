import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';

export const API_PREFIX = 'api/v1';

/** Largest JSON body accepted (rich documents); bigger requests get 413. */
export const JSON_BODY_LIMIT = '2mb';

/** Scenes hold freehand strokes, so they get more room; images stay assets. */
export const CANVAS_JSON_BODY_LIMIT = '20mb';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  // Must come first: the general parser skips bodies that are already parsed.
  app.use(`/${API_PREFIX}/canvases`, json({ limit: CANVAS_JSON_BODY_LIMIT }));
  (app as NestExpressApplication).useBodyParser('json', {
    limit: JSON_BODY_LIMIT,
  });
}
