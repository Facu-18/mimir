import type { Asset as AssetDto, AssetMimeType } from '@mimir/contracts';
import type { Asset } from '../generated/prisma/client.js';

export function toAssetDto(asset: Asset): AssetDto {
  return {
    id: asset.id,
    filename: asset.filename,
    mimeType: asset.mimeType as AssetMimeType,
    sizeBytes: Number(asset.sizeBytes),
    checksum: asset.checksum,
    createdAt: asset.createdAt.toISOString(),
  };
}
