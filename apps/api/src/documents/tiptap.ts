import type { DocumentMark, DocumentNode } from '@mimir/contracts';

// Converters from Tiptap JSON to plain text (search) and Markdown (export).
// Content depth is capped by the contract, so recursion here is bounded.
// Attribute readers check types themselves: stored content must never be
// able to crash an export, even if it predates a validation rule.

const INLINE_TYPES = new Set(['text', 'hardBreak']);

type WithAttrs = { attrs?: Record<string, unknown> };

function isInlineList(nodes: DocumentNode[]): boolean {
  return nodes.every((node) => INLINE_TYPES.has(node.type));
}

function stringAttr(node: WithAttrs, key: string): string | undefined {
  const value = node.attrs?.[key];
  return typeof value === 'string' ? value : undefined;
}

function intAttr(node: WithAttrs, key: string): number | undefined {
  const value = node.attrs?.[key];
  return typeof value === 'number' && Number.isInteger(value)
    ? value
    : undefined;
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
  if (node.type === 'image') return stringAttr(node, 'alt') ?? '';
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
      const level = Math.min(Math.max(intAttr(node, 'level') ?? 1, 1), 6);
      const text = inline(children);
      return text.length > 0 ? `${'#'.repeat(level)} ${text}` : '';
    }
    case 'bulletList':
      return children.map((item) => listItem(item, '- ')).join('\n');
    case 'orderedList': {
      const start = Math.max(intAttr(node, 'start') ?? 1, 1);
      return children
        .map((item, index) => listItem(item, `${start + index}. `))
        .join('\n');
    }
    case 'taskList':
      return children
        .map((item) =>
          listItem(item, item.attrs?.checked === true ? '- [x] ' : '- [ ] '),
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
        stringAttr(node, 'language'),
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
  const info = language ? language.replace(/[`\s]/g, '') : '';
  return `${fence}${info}\n${code}\n${fence}`;
}

function image(node: DocumentNode): string {
  const alt = escapeText(singleLine(stringAttr(node, 'alt') ?? ''));
  const src = encodeUrl(stringAttr(node, 'src') ?? '');
  const title = stringAttr(node, 'title');
  if (!title) return `![${alt}](${src})`;
  const quoted = singleLine(title).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `![${alt}](${src} "${quoted}")`;
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
  if (link) out = `[${out}](${encodeUrl(stringAttr(link, 'href') ?? '')})`;
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

/** Line breaks would end the surrounding Markdown construct. */
function singleLine(text: string): string {
  return text.replace(/[\r\n]/g, ' ');
}

/** Text that would otherwise start a heading, list or numbered list. */
function escapeBlockStart(text: string): string {
  if (/^[#+-]/.test(text)) return `\\${text}`;
  return text.replace(/^(\d+)([.)])/, '$1\\$2');
}

/**
 * Percent-encodes every character that could end a Markdown link
 * destination or start HTML: whitespace, controls, quotes, backticks,
 * backslashes, angle brackets and parentheses.
 */
function encodeUrl(url: string): string {
  return url
    .trim()
    .replace(
      // Control characters are matched on purpose: they must be encoded.
      // oxlint-disable-next-line no-control-regex
      /[\x00-\x20\x7f<>"`\\()]/g,
      (char) =>
        `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
    );
}
