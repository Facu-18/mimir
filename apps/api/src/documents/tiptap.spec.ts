import type { DocumentNode } from '@mimir/contracts';
import { toMarkdown, toPlainText } from './tiptap.js';

const doc = (...content: DocumentNode[]): DocumentNode => ({
  type: 'doc',
  content,
});
const p = (...content: DocumentNode[]): DocumentNode => ({
  type: 'paragraph',
  content,
});
const t = (
  text: string,
  ...marks: DocumentNode['marks'] & object
): DocumentNode => ({
  type: 'text',
  text,
  ...(marks.length > 0 ? { marks } : {}),
});
const li = (...content: DocumentNode[]): DocumentNode => ({
  type: 'listItem',
  content,
});

describe('toPlainText', () => {
  it('joins blocks with newlines and keeps inline text together', () => {
    const content = doc(
      { type: 'heading', attrs: { level: 2 }, content: [t('Plan')] },
      p(
        t('Ship '),
        t('it', { type: 'bold' }),
        { type: 'hardBreak' },
        t('today'),
      ),
      { type: 'bulletList', content: [li(p(t('one'))), li(p(t('two')))] },
      { type: 'codeBlock', content: [t('const a = 1;')] },
      { type: 'image', attrs: { src: '/a.png', alt: 'Diagram' } },
    );

    expect(toPlainText(content)).toBe(
      'Plan\nShip it\ntoday\none\ntwo\nconst a = 1;\nDiagram',
    );
  });

  it('returns an empty string for an empty document', () => {
    expect(toPlainText(doc())).toBe('');
  });
});

describe('toMarkdown', () => {
  it('renders headings, paragraphs and inline marks', () => {
    const content = doc(
      { type: 'heading', attrs: { level: 1 }, content: [t('Title')] },
      p(
        t('bold', { type: 'bold' }),
        t(' '),
        t('italic', { type: 'italic' }),
        t(' '),
        t('gone', { type: 'strike' }),
        t(' '),
        t('npm i', { type: 'code' }),
        t(' '),
        t('site', { type: 'link', attrs: { href: 'https://mimir.dev/a b' } }),
      ),
    );

    expect(toMarkdown(content)).toBe(
      '# Title\n\n**bold** *italic* ~~gone~~ `npm i` [site](https://mimir.dev/a%20b)\n',
    );
  });

  it('renders bullet, ordered and task lists with nesting', () => {
    const content = doc(
      {
        type: 'bulletList',
        content: [
          li(p(t('a')), { type: 'bulletList', content: [li(p(t('a.1')))] }),
          li(p(t('b'))),
        ],
      },
      {
        type: 'orderedList',
        attrs: { start: 3 },
        content: [li(p(t('three'))), li(p(t('four')))],
      },
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: true },
            content: [p(t('done'))],
          },
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [p(t('todo'))],
          },
        ],
      },
    );

    expect(toMarkdown(content)).toBe(
      '- a\n  - a.1\n- b\n\n3. three\n4. four\n\n- [x] done\n- [ ] todo\n',
    );
  });

  it('renders quotes, code blocks, rules, images and hard breaks', () => {
    const content = doc(
      { type: 'blockquote', content: [p(t('quoted')), p(t('twice'))] },
      {
        type: 'codeBlock',
        attrs: { language: 'ts' },
        content: [t('const a = `x`;\n```')],
      },
      { type: 'horizontalRule' },
      {
        type: 'image',
        attrs: { src: '/img.png', alt: 'Diagram', title: 'Arch' },
      },
      p(t('line'), { type: 'hardBreak' }, t('next')),
    );

    expect(toMarkdown(content)).toBe(
      '> quoted\n>\n> twice\n\n' +
        '````ts\nconst a = `x`;\n```\n````\n\n' +
        '---\n\n' +
        '![Diagram](/img.png "Arch")\n\n' +
        'line\\\nnext\n',
    );
  });

  it('escapes Markdown control characters in text', () => {
    const content = doc(
      p(t('# not a heading *nor* _this_ [x](y) 1. <b>')),
      p(t('- not a list')),
    );

    expect(toMarkdown(content)).toBe(
      '\\# not a heading \\*nor\\* \\_this\\_ \\[x\\](y) 1. \\<b\\>\n\n\\- not a list\n',
    );
  });

  it('falls back to the text of unknown nodes', () => {
    expect(toMarkdown(doc({ type: 'callout', content: [p(t('Note'))] }))).toBe(
      'Note\n',
    );
  });

  it('returns an empty string for an empty document', () => {
    expect(toMarkdown(doc())).toBe('');
  });
});
