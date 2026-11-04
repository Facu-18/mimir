/**
 * ASCII slug of a title, safe inside a quoted Content-Disposition filename:
 * accents are dropped, everything else becomes dashes.
 */
export function exportFileName(title: string, fallback = 'document'): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return slug.length > 0 ? slug : fallback;
}
