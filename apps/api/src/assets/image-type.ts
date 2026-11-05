import type { AssetMimeType } from '@mimir/contracts';

export type ImageType = { mimeType: AssetMimeType; extension: string };

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const WEBP_CHUNKS = new Set(['VP8 ', 'VP8L', 'VP8X']);

function latin1(buffer: Buffer, start: number, end: number): string {
  return buffer.toString('latin1', start, end);
}

/**
 * Identifies an image by its bytes, so neither the declared type nor the file
 * extension can smuggle something else in. This checks the format's header,
 * not that the whole image decodes.
 */
export function detectImageType(buffer: Buffer): ImageType | null {
  if (
    buffer.subarray(0, 8).equals(PNG_SIGNATURE) &&
    latin1(buffer, 12, 16) === 'IHDR'
  ) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  if (buffer.subarray(0, 3).equals(JPEG_SIGNATURE)) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (
    latin1(buffer, 0, 4) === 'RIFF' &&
    latin1(buffer, 8, 12) === 'WEBP' &&
    WEBP_CHUNKS.has(latin1(buffer, 12, 16))
  ) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }
  return null;
}
