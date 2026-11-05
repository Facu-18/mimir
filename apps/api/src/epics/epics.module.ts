import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { EpicsController, ProjectEpicsController } from './epics.controller.js';
import { EpicsService } from './epics.service.js';

@Module({
  imports: [ProjectsModule],
  controllers: [ProjectEpicsController, EpicsController],
  providers: [EpicsService],
  exports: [EpicsService],
})
export class EpicsModule {}
