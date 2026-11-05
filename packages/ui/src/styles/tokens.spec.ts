import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');

type Rgba = { r: number; g: number; b: number; a: number };

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing ${selector}`).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const entries = [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)];
  return Object.fromEntries(
    entries.map((match) => [match[1], match[2]!.trim()]),
  );
}

function parseColor(value: string | undefined): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value ?? '');
  if (hex) {
    const number = Number.parseInt(hex[1]!, 16);
    return { r: number >> 16, g: (number >> 8) & 255, b: number & 255, a: 1 };
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(value ?? '');
  if (rgb) {
    return { r: +rgb[1]!, g: +rgb[2]!, b: +rgb[3]!, a: +rgb[4]! };
  }
  throw new Error(`Unparseable color: ${value}`);
}

function over(top: Rgba, bottom: Rgba): Rgba {
  const mix = (a: number, b: number) => a * top.a + b * (1 - top.a);
  return {
    r: mix(top.r, bottom.r),
    g: mix(top.g, bottom.g),
    b: mix(top.b, bottom.b),
    a: 1,
  };
}

function luminance({ r, g, b }: Rgba): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

const THEMES = { light: block(':root'), dark: block('[data-theme="dark"]') };

const TEXT_ROLES = [
  '--text',
  '--text-muted',
  '--accent-text',
  '--danger-text',
  '--success-text',
  '--warning-text',
];

describe('plan palette', () => {
  it('keeps the reference colors in the dark theme', () => {
    expect(THEMES.dark).toMatchObject({
      '--bg': '#222624',
      '--surface': '#343c36',
      '--accent': '#81917e',
      '--secondary': '#c6af98',
      '--text': '#e8dfd2',
    });
  });
});

describe.each(Object.entries(THEMES))('%s theme contrast', (_name, tokens) => {
  const color = (name: string) => parseColor(tokens[name]);
  const backgrounds = () => {
    const bg = color('--bg');
    return {
      bg,
      surface: color('--surface'),
      raised: color('--surface-raised'),
      glass: over(color('--glass'), bg),
      'glass over surface': over(color('--glass'), color('--surface')),
    };
  };

  it.each(TEXT_ROLES)('%s reaches 4.5:1 on every background', (role) => {
    for (const [name, background] of Object.entries(backgrounds())) {
      expect(
        contrast(color(role), background),
        `${role} on ${name}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ['--on-accent', '--accent'],
    ['--on-danger', '--danger'],
  ])('%s reaches 4.5:1 on %s', (text, background) => {
    expect(contrast(color(text), color(background))).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it.each(['--focus', '--border-strong'])(
    '%s reaches 3:1 on every background',
    (role) => {
      for (const [name, background] of Object.entries(backgrounds())) {
        expect(
          contrast(color(role), background),
          `${role} on ${name}`,
        ).toBeGreaterThanOrEqual(3);
      }
    },
  );
});

describe('light and dark definitions', () => {
  it('define the same semantic tokens', () => {
    const colorKeys = (tokens: Record<string, string>) =>
      Object.keys(tokens)
        .filter((key) => /^(#|rgb)/.test(tokens[key]!))
        .sort();

    expect(colorKeys(THEMES.dark)).toEqual(colorKeys(THEMES.light));
  });
});

describe('motion and glass', () => {
  const duration = (name: string) => Number.parseInt(THEMES.light[name]!, 10);

  it('stays inside the plan timings', () => {
    expect(duration('--duration-hover')).toBeGreaterThanOrEqual(100);
    expect(duration('--duration-hover')).toBeLessThanOrEqual(160);
    expect(duration('--duration-view')).toBeGreaterThanOrEqual(150);
    expect(duration('--duration-view')).toBeLessThanOrEqual(220);
    expect(duration('--duration-panel')).toBeGreaterThanOrEqual(180);
    expect(duration('--duration-panel')).toBeLessThanOrEqual(260);
  });

  it('keeps the blur light', () => {
    expect(
      Number.parseInt(THEMES.light['--glass-blur']!, 10),
    ).toBeLessThanOrEqual(12);
  });

  it('removes the durations when the user asks for reduced motion', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^}]*--duration-hover: 0ms;[^}]*--duration-view: 0ms;[^}]*--duration-panel: 0ms;/,
    );
  });
});
