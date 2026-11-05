import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { AssetStorage, resolveAssetsDir } from './asset-storage.js';

const KEY = '00000000-0000-4000-8000-000000000001.png';

describe('resolveAssetsDir', () => {
  it('uses the configured absolute directory', () => {
    const dir = resolve(tmpdir(), 'mimir-configured');

    expect(resolveAssetsDir(dir)).toBe(dir);
  });

  it('defaults to a stable directory in the home folder', () => {
    expect(resolveAssetsDir(undefined)).toMatch(/\.mimir[\\/]assets$/);
  });

  it('refuses a relative directory, which would depend on where the API starts', () => {
    expect(() => resolveAssetsDir('data/assets')).toThrow(
      'ASSETS_DIR must be an absolute path',
    );
  });
});

describe('AssetStorage', () => {
  let base: string;
  let root: string;
  let storage: AssetStorage;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'mimir-storage-spec-'));
    root = join(base, 'assets');
    mkdirSync(root);
    // A real target, so a key that escapes would open it instead of missing.
    writeFileSync(join(base, 'outside.png'), 'secret');
    storage = new AssetStorage({
      get: () => root,
    } as unknown as ConfigService);
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('writes the bytes under their key and leaves no temporary file', async () => {
    await storage.write(KEY, Buffer.from('bytes'));

    expect(readFileSync(join(root, KEY), 'utf8')).toBe('bytes');
    expect(readdirSync(join(root, '.tmp'))).toEqual([]);
  });

  it('removes what it wrote', async () => {
    await storage.write(KEY, Buffer.from('bytes'));

    await storage.remove(KEY);

    expect(existsSync(join(root, KEY))).toBe(false);
  });

  it('opens a stored file and reports a missing one as null', async () => {
    await storage.write(KEY, Buffer.from('bytes'));

    const file = await storage.open(KEY);

    expect(file).not.toBeNull();
    await file?.close();
    expect(await storage.open(KEY.replace('1.png', '2.png'))).toBeNull();
  });

  it('refuses keys that are not ones it generates, before touching the disk', async () => {
    const keys = [
      '../outside.png',
      '..\\outside.png',
      '/etc/passwd',
      'C:\\Windows\\win.ini',
      `${KEY}/../../outside.png`,
      '.tmp/file',
      'file.png',
      `${KEY}.exe`,
      '',
    ];

    for (const key of keys) {
      expect(await storage.open(key)).toBeNull();
      await expect(storage.write(key, Buffer.from('x'))).rejects.toThrow(
        'Invalid storage key',
      );
    }
    expect(readdirSync(root).filter((name) => name !== '.tmp')).toEqual([]);
    expect(readFileSync(join(base, 'outside.png'), 'utf8')).toBe('secret');
  });

  it('generates keys it accepts', async () => {
    const key = storage.newKey('00000000-0000-4000-8000-000000000002', 'webp');

    expect(key).toBe('00000000-0000-4000-8000-000000000002.webp');
    await storage.write(key, Buffer.from('x'));
    expect(existsSync(join(root, key))).toBe(true);
  });
});
