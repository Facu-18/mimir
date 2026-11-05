import { Prisma } from '../generated/prisma/client.js';
import { isDatabaseUnavailableError } from './database-errors.js';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('query failed', {
    code,
    clientVersion: '7.10.1',
    meta,
  });
}

describe('isDatabaseUnavailableError', () => {
  // Observed when the Postgres container is stopped: the pg driver's errno
  // surfaces as the Prisma error code, with no driverAdapterError meta.
  it.each([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EHOSTUNREACH',
  ])('treats a %s network error as unavailable', (code) => {
    expect(
      isDatabaseUnavailableError(knownError(code, { modelName: 'Workspace' })),
    ).toBe(true);
  });

  it('treats a driver adapter DatabaseNotReachable error as unavailable', () => {
    const error = knownError('P2010', {
      driverAdapterError: { cause: { kind: 'DatabaseNotReachable' } },
    });

    expect(isDatabaseUnavailableError(error)).toBe(true);
  });

  it('does not treat constraint violations or plain errors as unavailable', () => {
    expect(isDatabaseUnavailableError(knownError('P2002'))).toBe(false);
    expect(isDatabaseUnavailableError(new Error('ECONNREFUSED'))).toBe(false);
  });
});
