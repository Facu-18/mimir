import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm, type FileHandle } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TEMP_FOLDER = '.tmp';

// The only keys this class generates. Requiring this exact shape rules out
// separators and dots, so no key can leave the directory, even a corrupt row.
const STORAGE_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

export function resolveAssetsDir(configured: string | undefined): string {
  if (!configured) return join(homedir(), '.mimir', 'assets');
  if (!isAbsolute(configured)) {
    throw new Error('ASSETS_DIR must be an absolute path');
  }
  return configured;
}

/** The managed directory that holds image files, addressed by storage key. */
@Injectable()
export class AssetStorage {
  private readonly logger = new Logger(AssetStorage.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolveAssetsDir(config.get<string>('ASSETS_DIR'));
  }

  newKey(id: string, extension: string): string {
    return `${id}.${extension}`;
  }

  /** Flushes before the rename, so a key never names a partial file. */
  async write(key: string, bytes: Buffer): Promise<void> {
    const target = this.pathFor(key);
    if (!target) throw new Error('Invalid storage key');

    const tempFolder = join(this.root, TEMP_FOLDER);
    await mkdir(tempFolder, { recursive: true });
    const temp = join(tempFolder, randomUUID());
    try {
      const file = await open(temp, 'wx');
      try {
        await file.writeFile(bytes);
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temp, target);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }

  /** The caller owns the handle. Null when the key is invalid or the file is gone. */
  async open(key: string): Promise<FileHandle | null> {
    const path = this.pathFor(key);
    if (!path) {
      this.logger.warn(`Refused invalid storage key: ${JSON.stringify(key)}`);
      return null;
    }
    try {
      return await open(path, 'r');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.logger.warn(`Asset file is missing: ${key}`);
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    const path = this.pathFor(key);
    if (path) await rm(path, { force: true });
  }

  private pathFor(key: string): string | null {
    return STORAGE_KEY.test(key) ? join(this.root, key) : null;
  }
}
