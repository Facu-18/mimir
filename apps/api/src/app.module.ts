import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
import { EpicsModule } from './epics/epics.module.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    WorkspacesModule,
    ProjectsModule,
    TicketsModule,
    EpicsModule,
  ],
})
export class AppModule {}
