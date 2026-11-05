import { cleanAssetFilename } from './asset-filename.js';

describe('cleanAssetFilename', () => {
  it('keeps a normal name, accents included', () => {
    expect(cleanAssetFilename('Diseño final.png', 'png')).toBe(
      'Diseño final.png',
    );
  });

  it('keeps only the last path segment', () => {
    expect(cleanAssetFilename('../../etc/passwd', 'png')).toBe('passwd');
    expect(cleanAssetFilename('..\\..\\windows\\win.ini', 'png')).toBe(
      'win.ini',
    );
  });

  it('drops control characters', () => {
    const name = `a${String.fromCharCode(0)}b${String.fromCharCode(10)}c.png`;

    expect(cleanAssetFilename(name, 'png')).toBe('abc.png');
  });

  it('falls back when nothing usable remains', () => {
    for (const name of [undefined, '', '   ', '..', '.', '../']) {
      expect(cleanAssetFilename(name, 'webp')).toBe('image.webp');
    }
  });

  it('caps the length without splitting an emoji', () => {
    const name = String.fromCodePoint(0x1f600).repeat(300);

    const cleaned = cleanAssetFilename(name, 'png');

    expect(Array.from(cleaned)).toHaveLength(255);
    expect(cleaned).not.toMatch(/\p{Cs}/u);
  });
});
