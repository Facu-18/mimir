import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { DatabaseUnavailableFilter } from './database-unavailable.filter.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [
    PrismaService,
    { provide: APP_FILTER, useClass: DatabaseUnavailableFilter },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
