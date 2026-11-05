import { Prisma } from '../generated/prisma/client.js';

/** True for a Prisma known request error with the given code (e.g. P2002). */
export function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
