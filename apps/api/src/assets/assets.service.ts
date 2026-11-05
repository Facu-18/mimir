import { createHash, randomUUID } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import {
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Asset } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { cleanAssetFilename } from './asset-filename.js';
import { AssetStorage } from './asset-storage.js';
import { detectImageType } from './image-type.js';

export type IncomingFile = { originalname?: string; buffer: Buffer };

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: AssetStorage,
  ) {}

  /**
   * The file lands before the row, so a crash can leave an unreferenced file
   * but never a row without its file.
   */
  async store(file: IncomingFile): Promise<Asset> {
    const type = detectImageType(file.buffer);
    if (!type)
      throw new UnsupportedMediaTypeException('Unsupported image type');

    const id = randomUUID();
    const storageKey = this.storage.newKey(id, type.extension);
    await this.storage.write(storageKey, file.buffer);
    try {
      return await this.prisma.asset.create({
        data: {
          id,
          storageKey,
          filename: cleanAssetFilename(file.originalname, type.extension),
          mimeType: type.mimeType,
          sizeBytes: file.buffer.length,
          checksum: createHash('sha256').update(file.buffer).digest('hex'),
        },
      });
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  /** The caller owns the returned handle. */
  async openContent(id: string): Promise<{ asset: Asset; file: FileHandle }> {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    const file = asset && (await this.storage.open(asset.storageKey));
    if (!asset || !file) throw new NotFoundException('Asset not found');
    return { asset, file };
  }
}
