import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  createLabelSchema,
  listLabelsQuerySchema,
  updateLabelSchema,
  type CreateLabelInput,
  type Label,
  type LabelList,
  type ListLabelsQuery,
  type UpdateLabelInput,
} from '@mimir/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { LabelsService, toLabelDto } from './labels.service.js';

@Controller('labels')
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listLabelsQuerySchema)) query: ListLabelsQuery,
  ): Promise<LabelList> {
    const labels = await this.labels.list(query);
    return { items: labels.map(toLabelDto) };
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createLabelSchema)) input: CreateLabelInput,
  ): Promise<Label> {
    return toLabelDto(await this.labels.create(input));
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLabelSchema)) input: UpdateLabelInput,
  ): Promise<Label> {
    return toLabelDto(await this.labels.update(id, input));
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.labels.delete(id);
  }
}
