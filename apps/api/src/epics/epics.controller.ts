import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  createEpicSchema,
  listEpicsQuerySchema,
  updateEpicSchema,
  type CreateEpicInput,
  type Epic,
  type EpicList,
  type ListEpicsQuery,
  type UpdateEpicInput,
} from '@mimir/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { EpicsService, toEpicDto } from './epics.service.js';

@Controller('projects/:projectId/epics')
export class ProjectEpicsController {
  constructor(private readonly epics: EpicsService) {}

  @Get()
  async list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query(new ZodValidationPipe(listEpicsQuerySchema)) query: ListEpicsQuery,
  ): Promise<EpicList> {
    const epics = await this.epics.list(projectId, query);
    return { items: epics.map(toEpicDto) };
  }

  @Post()
  async create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(createEpicSchema)) input: CreateEpicInput,
  ): Promise<Epic> {
    return toEpicDto(await this.epics.create(projectId, input));
  }
}

@Controller('epics')
export class EpicsController {
  constructor(private readonly epics: EpicsService) {}

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Epic> {
    return toEpicDto(await this.epics.findById(id));
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEpicSchema)) input: UpdateEpicInput,
  ): Promise<Epic> {
    return toEpicDto(await this.epics.update(id, input));
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(@Param('id', ParseUUIDPipe) id: string): Promise<Epic> {
    return toEpicDto(await this.epics.archive(id));
  }

  @Post(':id/restore')
  @HttpCode(200)
  async restore(@Param('id', ParseUUIDPipe) id: string): Promise<Epic> {
    return toEpicDto(await this.epics.restore(id));
  }
}
