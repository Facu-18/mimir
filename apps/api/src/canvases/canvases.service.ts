import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateCanvasInput,
  ListCanvasesQuery,
  SaveSceneInput,
  UpdateCanvasInput,
} from '@mimir/contracts';
import type { Asset, Canvas, Prisma } from '../generated/prisma/client.js';
import { AssetsService, type IncomingFile } from '../assets/assets.service.js';
import { escapeLike } from '../common/escape-like.js';
import { ProjectsService } from '../projects/projects.service.js';
import {
  CanvasRepository,
  type CanvasSummaryRow,
} from './canvas.repository.js';

@Injectable()
export class CanvasesService {
  constructor(
    private readonly canvases: CanvasRepository,
    private readonly projects: ProjectsService,
    private readonly assets: AssetsService,
  ) {}

  async create(input: CreateCanvasInput): Promise<Canvas> {
    if (input.projectId) await this.projects.assertLinkable(input.projectId);
    const result = await this.canvases.create(input);
    if (result.status === 'asset_not_found') {
      throw new NotFoundException('Asset not found');
    }
    return result.canvas;
  }

  list(query: ListCanvasesQuery): Promise<CanvasSummaryRow[]> {
    const where: Prisma.CanvasWhereInput = {
      projectId: query.projectId === 'none' ? null : query.projectId,
    };
    if (query.archived === 'exclude') where.archivedAt = null;
    if (query.archived === 'only') where.archivedAt = { not: null };
    if (query.q) {
      where.title = { contains: escapeLike(query.q), mode: 'insensitive' };
    }
    return this.canvases.list(where);
  }

  async findById(id: string): Promise<Canvas> {
    return this.orNotFound(await this.canvases.findById(id));
  }

  async update(id: string, input: UpdateCanvasInput): Promise<Canvas> {
    if (input.projectId) await this.projects.assertLinkable(input.projectId);
    return this.orNotFound(await this.canvases.updateMetadata(id, input));
  }

  async saveScene(
    id: string,
    input: SaveSceneInput,
  ): Promise<CanvasSummaryRow> {
    const result = await this.canvases.saveScene(id, input);
    switch (result.status) {
      case 'saved':
        return result.canvas;
      case 'not_found':
        throw new NotFoundException('Canvas not found');
      case 'asset_not_found':
        throw new NotFoundException('Asset not found');
      case 'conflict':
        // The scene stays out of the error: it can be large, and the client
        // recovers by reopening the canvas.
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'Canvas was modified elsewhere',
          currentRevision: result.current.revision,
          updatedAt: result.current.updatedAt.toISOString(),
        });
    }
  }

  async archive(id: string): Promise<Canvas> {
    return this.orNotFound(await this.canvases.setArchived(id, true));
  }

  async restore(id: string): Promise<Canvas> {
    return this.orNotFound(await this.canvases.setArchived(id, false));
  }

  /** `canvas_assets` only changes on save: it follows what the scene references. */
  async addAsset(id: string, file: IncomingFile): Promise<Asset> {
    await this.findById(id);
    return this.assets.store(file);
  }

  listAssets(id: string): Promise<Asset[]> {
    return this.canvases.findAssets(id);
  }

  private orNotFound(canvas: Canvas | null): Canvas {
    if (!canvas) throw new NotFoundException('Canvas not found');
    return canvas;
  }
}
