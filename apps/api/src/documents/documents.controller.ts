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
  createDocumentSchema,
  listDocumentsQuerySchema,
  updateDocumentSchema,
  type CreateDocumentInput,
  type Document,
  type DocumentList,
  type ListDocumentsQuery,
  type UpdateDocumentInput,
} from '@mimir/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
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
