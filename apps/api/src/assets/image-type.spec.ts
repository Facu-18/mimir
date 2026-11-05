import { detectImageType } from './image-type.js';

const bytes = (...values: number[]) => Buffer.from(values);
const ascii = (text: string) => Buffer.from(text, 'latin1');

const PNG = Buffer.concat([
  bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
  bytes(0, 0, 0, 13),
  ascii('IHDR'),
]);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00);
const webp = (chunk: string) =>
  Buffer.concat([
    ascii('RIFF'),
    bytes(4, 0, 0, 0),
    ascii('WEBP'),
    ascii(chunk),
  ]);

describe('detectImageType', () => {
  it('recognizes PNG, JPEG and every WebP variant by their bytes', () => {
    expect(detectImageType(PNG)).toEqual({
      mimeType: 'image/png',
      extension: 'png',
    });
    expect(detectImageType(JPEG)).toEqual({
      mimeType: 'image/jpeg',
      extension: 'jpg',
    });
    for (const chunk of ['VP8 ', 'VP8L', 'VP8X']) {
      expect(detectImageType(webp(chunk))).toEqual({
        mimeType: 'image/webp',
        extension: 'webp',
      });
    }
  });

  it('rejects everything else', () => {
    const rejected = [
      Buffer.alloc(0),
      ascii('plain text'),
      ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      ascii('GIF89a'),
      PNG.subarray(0, 8),
      JPEG.subarray(0, 2),
      Buffer.concat([ascii('RIFF'), bytes(4, 0, 0, 0), ascii('WAVEfmt ')]),
      webp('JUNK'),
    ];

    for (const buffer of rejected) {
      expect(detectImageType(buffer)).toBeNull();
    }
  });
});
