import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const MIN_TOKEN_LENGTH = 32;

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Rejects any request that does not carry the session token. */
export function requireSessionToken(token: string) {
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new Error(
      `API_SESSION_TOKEN must have at least ${MIN_TOKEN_LENGTH} characters`,
    );
  }
  // Comparing digests keeps the check constant-time whatever the input length.
  const expected = digest(`Bearer ${token}`);

  return (request: Request, response: Response, next: NextFunction): void => {
    const received = digest(request.headers.authorization ?? '');
    if (timingSafeEqual(received, expected)) {
      next();
      return;
    }
    response.status(401).json({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid session token',
    });
  };
}
