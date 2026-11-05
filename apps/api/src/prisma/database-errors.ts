import { Prisma } from '../generated/prisma/client.js';

// Error codes for "cannot reach / talk to the database server": Prisma's own
// codes plus the Node network errno the pg driver can surface directly
// (for example ECONNREFUSED when the Postgres container is stopped).
const CONNECTION_ERROR_CODES = new Set([
  'P1001',
  'P1002',
  'P1017',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'EAI_AGAIN',
]);

// Driver adapter error kinds that mean the database itself is unavailable.
const UNAVAILABLE_KINDS = new Set([
  'DatabaseNotReachable',
  'DatabaseDoesNotExist',
  'DatabaseAccessDenied',
  'AuthenticationFailed',
  'ConnectionClosed',
  'SocketTimeout',
  'TooManyConnections',
]);

function driverAdapterErrorKind(meta: unknown): string | undefined {
  const cause = (
    meta as { driverAdapterError?: { cause?: { kind?: unknown } } }
  )?.driverAdapterError?.cause;
  return typeof cause?.kind === 'string' ? cause.kind : undefined;
}

/** True when an error means the database is down or unreachable. */
export function isDatabaseUnavailableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (CONNECTION_ERROR_CODES.has(error.code)) return true;
  const kind = driverAdapterErrorKind(error.meta);
  return kind !== undefined && UNAVAILABLE_KINDS.has(kind);
}
