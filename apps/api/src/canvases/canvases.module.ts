import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { CanvasRepository } from './canvas.repository.js';
import { CanvasesController } from './canvases.controller.js';
import { CanvasesService } from './canvases.service.js';

@Module({
  imports: [ProjectsModule, AssetsModule],
  controllers: [CanvasesController],
  providers: [CanvasRepository, CanvasesService],
})
export class CanvasesModule {}
