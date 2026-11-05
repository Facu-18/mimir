import { extname } from 'node:path';
import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  StreamableFile,
} from '@nestjs/common';
import { exportFileName } from '../common/export-file-name.js';
import { AssetsService } from './assets.service.js';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get(':id/content')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  // Bytes never change for an id, so the client can keep them.
  @Header('Cache-Control', 'private, max-age=31536000, immutable')
  async content(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { asset, file } = await this.assets.openContent(id);
    const extension = extname(asset.storageKey);
    const name = exportFileName(
      asset.filename.replace(/\.[^.]*$/, ''),
      'image',
    );
    const { size } = await file.stat();
    return new StreamableFile(file.createReadStream(), {
      type: asset.mimeType,
      length: size,
      disposition: `inline; filename="${name}${extension}"`,
    });
  }
}
