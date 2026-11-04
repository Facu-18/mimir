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
  Res,
} from '@nestjs/common';
import {
  createDocumentSchema,
  exportDocumentQuerySchema,
  listDocumentsQuerySchema,
  updateDocumentSchema,
  type CreateDocumentInput,
  type Document,
  type DocumentList,
  type ExportDocumentQuery,
  type ListDocumentsQuery,
  type UpdateDocumentInput,
} from '@mimir/contracts';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { exportFileName } from '../common/export-file-name.js';
import { toMarkdown } from './tiptap.js';
import {
  DocumentsService,
  toDocumentDto,
  toDocumentSummary,
} from './documents.service.js';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listDocumentsQuerySchema))
    query: ListDocumentsQuery,
  ): Promise<DocumentList> {
    const rows = await this.documents.list(query);
    return { items: rows.map(toDocumentSummary) };
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createDocumentSchema))
    input: CreateDocumentInput,
  ): Promise<Document> {
    return toDocumentDto(await this.documents.create(input));
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Document> {
    return toDocumentDto(await this.documents.findById(id));
  }

  @Get(':id/export')
  async export(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(exportDocumentQuerySchema))
    _query: ExportDocumentQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const document = await this.documents.findById(id);
    response.set({
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFileName(document.title)}.md"`,
    });
    return toMarkdown(toDocumentDto(document).contentJson);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateDocumentSchema))
    input: UpdateDocumentInput,
  ): Promise<Document> {
    return toDocumentDto(await this.documents.update(id, input));
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(@Param('id', ParseUUIDPipe) id: string): Promise<Document> {
    return toDocumentDto(await this.documents.archive(id));
  }

  @Post(':id/restore')
  @HttpCode(200)
  async restore(@Param('id', ParseUUIDPipe) id: string): Promise<Document> {
    return toDocumentDto(await this.documents.restore(id));
  }
}
