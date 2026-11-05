import type {
  Canvas as CanvasDto,
  CanvasSummary,
  Scene,
  SceneSaved,
} from '@mimir/contracts';
import type { Canvas } from '../generated/prisma/client.js';
import type { CanvasSummaryRow } from './canvas.repository.js';

export function toCanvasSummary(row: CanvasSummaryRow): CanvasSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    schemaVersion: row.sceneSchemaVersion,
    revision: row.revision,
    thumbnailAssetId: row.thumbnailAssetId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

export function toCanvasDto(canvas: Canvas): CanvasDto {
  return {
    ...toCanvasSummary(canvas),
    scene: canvas.sceneJson as unknown as Scene,
  };
}

export function toSceneSaved(row: CanvasSummaryRow): SceneSaved {
  return {
    id: row.id,
    revision: row.revision,
    schemaVersion: row.sceneSchemaVersion,
    updatedAt: row.updatedAt.toISOString(),
  };
}
