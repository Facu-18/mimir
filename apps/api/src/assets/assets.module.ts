import { Module } from '@nestjs/common';
import { AssetStorage } from './asset-storage.js';
import { AssetsController } from './assets.controller.js';
import { AssetsService } from './assets.service.js';

@Module({
  controllers: [AssetsController],
  providers: [AssetStorage, AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
