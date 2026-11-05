import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { CanvasLinksController } from './canvas-links.controller.js';
import { CanvasLinksService } from './canvas-links.service.js';
import { CanvasRepository } from './canvas.repository.js';
import { CanvasesController } from './canvases.controller.js';
import { CanvasesService } from './canvases.service.js';

@Module({
  imports: [ProjectsModule, AssetsModule],
  controllers: [CanvasesController, CanvasLinksController],
  providers: [CanvasRepository, CanvasesService, CanvasLinksService],
})
export class CanvasesModule {}
