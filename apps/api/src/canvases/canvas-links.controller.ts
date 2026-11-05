import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  createCanvasLinkSchema,
  type CanvasLink,
  type CanvasLinkList,
  type CreateCanvasLinkInput,
} from '@mimir/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CanvasLinksService } from './canvas-links.service.js';

@Controller('canvases/:id/links')
export class CanvasLinksController {
  constructor(private readonly links: CanvasLinksService) {}

  @Get()
  async list(@Param('id', ParseUUIDPipe) id: string): Promise<CanvasLinkList> {
    return { items: await this.links.list(id) };
  }

  @Post()
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createCanvasLinkSchema))
    input: CreateCanvasLinkInput,
  ): Promise<CanvasLink> {
    return this.links.create(id, input);
  }

  @Delete(':linkId')
  @HttpCode(204)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
  ): Promise<void> {
    return this.links.remove(id, linkId);
  }
}
