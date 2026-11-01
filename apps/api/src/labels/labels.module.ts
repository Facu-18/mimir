import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { LabelsController } from './labels.controller.js';
import { LabelsService } from './labels.service.js';

@Module({
  imports: [ProjectsModule],
  controllers: [LabelsController],
  providers: [LabelsService],
})
export class LabelsModule {}
