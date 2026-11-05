const MAX_FILENAME_LENGTH = 255;

/**
 * Cleans the client's filename. It is display metadata only: storage keys
 * never derive from it.
 */
export function cleanAssetFilename(
  name: string | undefined,
  extension: string,
): string {
  const lastSegment = (name ?? '').split(/[\\/]/).at(-1) ?? '';
  const cleaned = lastSegment.replace(/\p{Cc}/gu, '').trim();
  if (cleaned === '' || cleaned === '.' || cleaned === '..') {
    return `image.${extension}`;
  }
  // By code point, so the cut cannot leave half an emoji.
  return Array.from(cleaned).slice(0, MAX_FILENAME_LENGTH).join('');
}
