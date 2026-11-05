import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  imports: [ProjectsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
