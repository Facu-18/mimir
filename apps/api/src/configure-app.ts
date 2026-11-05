import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import { requireSessionToken } from './common/session-token.js';

export const API_PREFIX = 'api/v1';

/** Largest JSON body accepted (rich documents); bigger requests get 413. */
export const JSON_BODY_LIMIT = '2mb';

/** Scenes hold freehand strokes, so they get more room; images stay assets. */
export const CANVAS_JSON_BODY_LIMIT = '20mb';

/**
 * Set when the desktop shell starts the API. Without a token, as in development
 * and tests, there is no CORS and no check; the API still binds to loopback.
 */
export type LocalAccessOptions = {
  sessionToken?: string;
  corsOrigins?: string[];
};

export function configureApp(
  app: INestApplication,
  { sessionToken, corsOrigins = [] }: LocalAccessOptions = {},
): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  if (sessionToken !== undefined) {
    // CORS goes first: preflight requests cannot carry the token.
    app.enableCors({
      origin: corsOrigins,
      allowedHeaders: ['Authorization', 'Content-Type'],
    });
    app.use(requireSessionToken(sessionToken));
  }
  // Must come first: the general parser skips bodies that are already parsed.
  app.use(`/${API_PREFIX}/canvases`, json({ limit: CANVAS_JSON_BODY_LIMIT }));
  (app as NestExpressApplication).useBodyParser('json', {
    limit: JSON_BODY_LIMIT,
  });
}
