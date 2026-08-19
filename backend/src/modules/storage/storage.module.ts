import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { LocalStorageProvider } from './providers/local-storage.provider';

@Module({
  controllers: [StorageController],
  providers: [StorageService, LocalStorageProvider],
  exports: [StorageService, LocalStorageProvider],
})
export class StorageModule {}
