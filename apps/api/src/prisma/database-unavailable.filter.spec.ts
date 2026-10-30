import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../generated/prisma/client.js';
import { DatabaseUnavailableFilter } from './database-unavailable.filter.js';

function unreachableError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    "Can't reach database server at 127.0.0.1:1",
    {
      code,
      clientVersion: '7.10.1',
      meta: {
        driverAdapterError: {
          name: 'DriverAdapterError',
          cause: { kind: 'DatabaseNotReachable', host: '127.0.0.1', port: 1 },
        },
      },
    },
  );
}

function httpHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('DatabaseUnavailableFilter', () => {
  it.each(['P1001', 'P2010'])(
    'answers 503 when a query fails with %s because the database is unreachable',
    (code) => {
      const { host, status, json } = httpHost();

      new DatabaseUnavailableFilter().catch(unreachableError(code), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(json).toHaveBeenCalledWith({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Database unavailable',
      });
    },
  );

  it('delegates database errors unrelated to connectivity to Nest', () => {
    const { host, status } = httpHost();
    const delegate = vi
      .spyOn(BaseExceptionFilter.prototype, 'catch')
      .mockImplementation(() => undefined);
    const uniqueViolation = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '7.10.1' },
    );

    new DatabaseUnavailableFilter().catch(uniqueViolation, host);

    expect(delegate).toHaveBeenCalledWith(uniqueViolation, host);
    expect(status).not.toHaveBeenCalled();
    delegate.mockRestore();
  });
});
