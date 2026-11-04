import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateDocumentInput,
  Document as DocumentDto,
  DocumentNode,
  DocumentSummary,
  ListDocumentsQuery,
  UpdateDocumentInput,
} from '@mimir/contracts';
import type { Document, Prisma } from '../generated/prisma/client.js';
import { escapeLike } from '../common/escape-like.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { toPlainText } from './tiptap.js';

type Tx = Prisma.TransactionClient;

const EMPTY_CONTENT: DocumentNode = { type: 'doc', content: [] };

const SUMMARY_SELECT = {
  id: true,
  projectId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
} as const;

type DocumentSummaryRow = Prisma.DocumentGetPayload<{
  select: typeof SUMMARY_SELECT;
}>;

export function toDocumentSummary(row: DocumentSummaryRow): DocumentSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

export function toDocumentDto(document: Document): DocumentDto {
  return {
    ...toDocumentSummary(document),
    contentJson: (document.contentJson as DocumentNode | null) ?? EMPTY_CONTENT,
    contentText: document.contentText,
  };
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  async create(input: CreateDocumentInput): Promise<Document> {
    if (input.projectId) await this.projects.assertLinkable(input.projectId);
    return this.prisma.document.create({
      data: {
        title: input.title,
        projectId: input.projectId,
        contentJson: input.contentJson as unknown as Prisma.InputJsonObject,
        contentText: toPlainText(input.contentJson),
      },
    });
  }

  async list(query: ListDocumentsQuery): Promise<DocumentSummaryRow[]> {
    const where: Prisma.DocumentWhereInput = {
      projectId: query.projectId === 'none' ? null : query.projectId,
    };
    if (query.archived === 'exclude') where.archivedAt = null;
    if (query.archived === 'only') where.archivedAt = { not: null };
    if (query.q) {
      const q = escapeLike(query.q);
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { contentText: { contains: q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.document.findMany({
      where,
      select: SUMMARY_SELECT,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
  }

  async findById(id: string): Promise<Document> {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  async update(id: string, input: UpdateDocumentInput): Promise<Document> {
    if (input.projectId) await this.projects.assertLinkable(input.projectId);
    return this.prisma.$transaction(async (tx) => {
      // Lock first so two saves based on the same version cannot both pass
      // the expectedUpdatedAt check.
      const current = await this.lockAndFind(tx, id);
      if (
        input.expectedUpdatedAt !== undefined &&
        new Date(input.expectedUpdatedAt).getTime() !==
          current.updatedAt.getTime()
      ) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'Document was modified elsewhere',
          current: toDocumentDto(current),
        });
      }
      const data: Prisma.DocumentUncheckedUpdateInput = {
        title: input.title,
        projectId: input.projectId,
      };
      if (input.contentJson !== undefined) {
        data.contentJson =
          input.contentJson as unknown as Prisma.InputJsonObject;
        data.contentText = toPlainText(input.contentJson);
      }
      return tx.document.update({ where: { id }, data });
    });
  }

  archive(id: string): Promise<Document> {
    return this.setArchived(id, true);
  }

  restore(id: string): Promise<Document> {
    return this.setArchived(id, false);
  }

  private async setArchived(id: string, archived: boolean): Promise<Document> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockAndFind(tx, id);
      if ((current.archivedAt !== null) === archived) return current;
      return tx.document.update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null },
      });
    });
  }

  private async lockAndFind(tx: Tx, id: string): Promise<Document> {
    await tx.$queryRaw`SELECT id FROM documents WHERE id = ${id}::uuid FOR NO KEY UPDATE`;
    const document = await tx.document.findUnique({ where: { id } });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }
}
