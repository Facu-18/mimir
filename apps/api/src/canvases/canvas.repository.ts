import { Injectable } from '@nestjs/common';
import { sceneAssetIds, type Scene } from '@mimir/contracts';
import { Prisma, type Canvas } from '../generated/prisma/client.js';
import { hasPrismaCode } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

const RECORD_NOT_FOUND = 'P2025';

export const CANVAS_SUMMARY_SELECT = {
  id: true,
  projectId: true,
  title: true,
  sceneSchemaVersion: true,
  revision: true,
  thumbnailAssetId: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
} as const;

export type CanvasSummaryRow = Prisma.CanvasGetPayload<{
  select: typeof CANVAS_SUMMARY_SELECT;
}>;

export type SaveSceneResult =
  | { status: 'saved'; canvas: CanvasSummaryRow }
  | { status: 'conflict'; current: CanvasSummaryRow }
  | { status: 'not_found' }
  | { status: 'asset_not_found' };

export type CreateCanvasResult =
  { status: 'created'; canvas: Canvas } | { status: 'asset_not_found' };

function toSceneJson(scene: Scene): Prisma.InputJsonObject {
  return scene as unknown as Prisma.InputJsonObject;
}

/**
 * The only place that persists scenes, so the rest of the API does not
 * depend on how a scene is stored (plan section 2).
 */
@Injectable()
export class CanvasRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    title: string;
    projectId: string | null;
    schemaVersion: number;
    scene: Scene;
  }): Promise<CreateCanvasResult> {
    return this.prisma.$transaction(async (tx) => {
      const assetIds = sceneAssetIds(data.scene);
      if (!(await this.assetsExist(tx, assetIds))) {
        return { status: 'asset_not_found' };
      }
      const canvas = await tx.canvas.create({
        data: {
          title: data.title,
          projectId: data.projectId,
          sceneSchemaVersion: data.schemaVersion,
          sceneJson: toSceneJson(data.scene),
          assets: {
            create: assetIds.map((assetId) => ({ assetId })),
          },
        },
      });
      return { status: 'created', canvas };
    });
  }

  findById(id: string): Promise<Canvas | null> {
    return this.prisma.canvas.findUnique({ where: { id } });
  }

  list(where: Prisma.CanvasWhereInput): Promise<CanvasSummaryRow[]> {
    return this.prisma.canvas.findMany({
      where,
      select: CANVAS_SUMMARY_SELECT,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
  }

  /** Metadata only: never touches the scene, revision or asset references. */
  async updateMetadata(
    id: string,
    data: { title?: string; projectId?: string | null },
  ): Promise<Canvas | null> {
    try {
      return await this.prisma.canvas.update({ where: { id }, data });
    } catch (error) {
      if (hasPrismaCode(error, RECORD_NOT_FOUND)) return null;
      throw error;
    }
  }

  /**
   * Compare-and-swap: the conditional UPDATE is atomic, so of many saves from
   * one revision exactly one matches. A failed condition writes nothing.
   */
  saveScene(
    id: string,
    input: { expectedRevision: number; schemaVersion: number; scene: Scene },
  ): Promise<SaveSceneResult> {
    return this.prisma.$transaction(async (tx) => {
      const assetIds = sceneAssetIds(input.scene);
      if (!(await this.assetsExist(tx, assetIds))) {
        return { status: 'asset_not_found' };
      }
      const { count } = await tx.canvas.updateMany({
        where: { id, revision: input.expectedRevision },
        data: {
          sceneJson: toSceneJson(input.scene),
          sceneSchemaVersion: input.schemaVersion,
          revision: { increment: 1 },
        },
      });
      const canvas = await tx.canvas.findUnique({
        where: { id },
        select: CANVAS_SUMMARY_SELECT,
      });
      if (!canvas) return { status: 'not_found' };
      if (count === 0) return { status: 'conflict', current: canvas };

      await tx.canvasAsset.deleteMany({
        where: { canvasId: id, assetId: { notIn: assetIds } },
      });
      await tx.canvasAsset.createMany({
        data: assetIds.map((assetId) => ({ canvasId: id, assetId })),
        skipDuplicates: true,
      });
      return { status: 'saved', canvas };
    });
  }

  /** Conditional, so repeating it keeps the original archive timestamp. */
  async setArchived(id: string, archived: boolean): Promise<Canvas | null> {
    await this.prisma.canvas.updateMany({
      where: { id, archivedAt: archived ? null : { not: null } },
      data: { archivedAt: archived ? new Date() : null },
    });
    return this.findById(id);
  }

  private async assetsExist(
    tx: Prisma.TransactionClient,
    assetIds: string[],
  ): Promise<boolean> {
    if (assetIds.length === 0) return true;
    const found = await tx.asset.count({ where: { id: { in: assetIds } } });
    return found === assetIds.length;
  }
}
