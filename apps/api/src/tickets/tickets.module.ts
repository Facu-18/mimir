import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import {
  ProjectTicketsController,
  TicketsController,
} from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

@Module({
  imports: [ProjectsModule, WorkspacesModule],
  controllers: [ProjectTicketsController, TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
