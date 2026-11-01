import type { DocumentMark, DocumentNode } from '@mimir/contracts';

// Converters from Tiptap JSON to plain text (search) and Markdown (export).
// Content depth is capped by the contract, so recursion here is bounded.

const INLINE_TYPES = new Set(['text', 'hardBreak']);

function isInlineList(nodes: DocumentNode[]): boolean {
  return nodes.every((node) => INLINE_TYPES.has(node.type));
}

function attr<T>(
  node: { attrs?: Record<string, unknown> },
  key: string,
): T | undefined {
  return node.attrs?.[key] as T | undefined;
}

/** Plain text for search: blocks on their own lines, inline text joined. */
export function toPlainText(root: DocumentNode): string {
  return plain(root)
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function plain(node: DocumentNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'image') return attr<string>(node, 'alt') ?? '';
  const children = node.content ?? [];
  const separator = isInlineList(children) ? '' : '\n';
  return children
    .map(plain)
    .filter((text) => text.length > 0)
    .join(separator);
}

/** CommonMark-flavoured Markdown (GFM strikethrough and task lists). */
export function toMarkdown(root: DocumentNode): string {
  const body = blocks(root.content ?? []).join('\n\n');
  return body.length > 0 ? `${body}\n` : '';
}

function blocks(nodes: DocumentNode[]): string[] {
  return nodes.map(block).filter((text) => text.length > 0);
}

function block(node: DocumentNode): string {
  const children = node.content ?? [];
  switch (node.type) {
    case 'paragraph':
      return escapeBlockStart(inline(children));
    case 'heading': {
      const level = Math.min(Math.max(Number(attr(node, 'level')) || 1, 1), 6);
      const text = inline(children);
      return text.length > 0 ? `${'#'.repeat(level)} ${text}` : '';
    }
    case 'bulletList':
      return children.map((item) => listItem(item, '- ')).join('\n');
    case 'orderedList': {
      const start = Number(attr(node, 'start')) || 1;
      return children
        .map((item, index) => listItem(item, `${start + index}. `))
        .join('\n');
    }
    case 'taskList':
      return children
        .map((item) =>
          listItem(item, attr<boolean>(item, 'checked') ? '- [x] ' : '- [ ] '),
        )
        .join('\n');
    case 'blockquote':
      return blocks(children)
        .join('\n\n')
        .split('\n')
        .map((line) => (line.length > 0 ? `> ${line}` : '>'))
        .join('\n');
    case 'codeBlock':
      return codeBlock(
        children.map(plain).join(''),
        attr<string>(node, 'language'),
      );
    case 'horizontalRule':
      return '---';
    case 'image':
      return image(node);
    default:
      // Unknown nodes: keep their content rather than dropping it.
      return isInlineList(children)
        ? escapeBlockStart(inline(children))
        : blocks(children).join('\n\n');
  }
}

/** First block after the marker, continuation lines indented to align. */
function listItem(item: DocumentNode, marker: string): string {
  const indent = ' '.repeat(marker.length);
  const body = blocks(item.content ?? []).join('\n');
  return body
    .split('\n')
    .map((line, index) =>
      index === 0 ? marker + line : line ? indent + line : line,
    )
    .join('\n');
}

function codeBlock(code: string, language: string | undefined): string {
  const longestRun = Math.max(
    0,
    ...(code.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  const info =
    typeof language === 'string' ? language.replace(/[`\s]/g, '') : '';
  return `${fence}${info}\n${code}\n${fence}`;
}

function image(node: DocumentNode): string {
  const alt = escapeText(attr<string>(node, 'alt') ?? '');
  const src = encodeUrl(attr<string>(node, 'src') ?? '');
  const title = attr<string>(node, 'title');
  return title
    ? `![${alt}](${src} "${title.replace(/"/g, '\\"')}")`
    : `![${alt}](${src})`;
}

function inline(nodes: DocumentNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '\\\n';
      if (node.type === 'text')
        return markedText(node.text ?? '', node.marks ?? []);
      return escapeText(plain(node));
    })
    .join('');
}

function markedText(text: string, marks: DocumentMark[]): string {
  const has = (type: string) => marks.find((mark) => mark.type === type);
  let out = has('code') ? codeSpan(text) : escapeText(text);
  if (has('bold')) out = `**${out}**`;
  if (has('italic')) out = `*${out}*`;
  if (has('strike')) out = `~~${out}~~`;
  const link = has('link');
  if (link) out = `[${out}](${encodeUrl(attr<string>(link, 'href') ?? '')})`;
  return out;
}

function codeSpan(text: string): string {
  const longestRun = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = '`'.repeat(longestRun + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

function escapeText(text: string): string {
  return text.replace(/[\\`*_[\]<>~]/g, '\\$&');
}

/** Text that would otherwise start a heading, list or numbered list. */
function escapeBlockStart(text: string): string {
  if (/^[#+-]/.test(text)) return `\\${text}`;
  return text.replace(/^(\d+)([.)])/, '$1\\$2');
}

function encodeUrl(url: string): string {
  return url
    .trim()
    .replace(/ /g, '%20')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}
