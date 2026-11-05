import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('HealthController', () => {
  it('reports the database as up when the probe query succeeds', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const controller = new HealthController(prisma as unknown as PrismaService);

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('responds 503 with database down when the probe query fails', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('connection refused')),
    };
    const controller = new HealthController(prisma as unknown as PrismaService);

    const result = controller.check();

    await expect(result).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(result).rejects.toMatchObject({
      response: { status: 'error', database: 'down' },
    });
  });
});
