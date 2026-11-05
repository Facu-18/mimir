import { z } from 'zod';

/** Largest image accepted; bigger uploads get 413. */
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;

/** SVG stays out on purpose: it can carry scripts. */
export const ASSET_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type AssetMimeType = (typeof ASSET_MIME_TYPES)[number];

export const assetSchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  mimeType: z.enum(ASSET_MIME_TYPES),
  sizeBytes: z.number().int().nonnegative(),
  checksum: z.string(),
  createdAt: z.iso.datetime(),
});

export type Asset = z.infer<typeof assetSchema>;
