import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  createCanvasSchema,
  listCanvasesQuerySchema,
  saveSceneSchema,
  updateCanvasSchema,
  type Canvas,
  type CanvasList,
  type CreateCanvasInput,
  type ListCanvasesQuery,
  type SaveSceneInput,
  type SceneSaved,
  type UpdateCanvasInput,
} from '@mimir/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { toCanvasDto, toCanvasSummary, toSceneSaved } from './canvas.mapper.js';
import { CanvasesService } from './canvases.service.js';

@Controller('canvases')
export class CanvasesController {
  constructor(private readonly canvases: CanvasesService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listCanvasesQuerySchema))
    query: ListCanvasesQuery,
  ): Promise<CanvasList> {
    const rows = await this.canvases.list(query);
    return { items: rows.map(toCanvasSummary) };
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createCanvasSchema)) input: CreateCanvasInput,
  ): Promise<Canvas> {
    return toCanvasDto(await this.canvases.create(input));
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Canvas> {
    return toCanvasDto(await this.canvases.findById(id));
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCanvasSchema)) input: UpdateCanvasInput,
  ): Promise<Canvas> {
    return toCanvasDto(await this.canvases.update(id, input));
  }

  @Put(':id/scene')
  async saveScene(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(saveSceneSchema)) input: SaveSceneInput,
  ): Promise<SceneSaved> {
    return toSceneSaved(await this.canvases.saveScene(id, input));
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(@Param('id', ParseUUIDPipe) id: string): Promise<Canvas> {
    return toCanvasDto(await this.canvases.archive(id));
  }

  @Post(':id/restore')
  @HttpCode(200)
  async restore(@Param('id', ParseUUIDPipe) id: string): Promise<Canvas> {
    return toCanvasDto(await this.canvases.restore(id));
  }
}
