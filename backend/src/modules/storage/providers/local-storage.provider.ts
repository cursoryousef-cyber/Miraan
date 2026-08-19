import { Injectable } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { IStorageProvider, UploadOptions, StorageResult } from './storage-provider.interface';

@Injectable()
export class LocalStorageProvider implements IStorageProvider {
  providerName = 'local';
  private uploadDir: string;

  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads');
    fs.ensureDirSync(this.uploadDir);
  }

  async upload(options: UploadOptions): Promise<StorageResult> {
    const filePath = path.join(this.uploadDir, options.key);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, options.buffer);

    return {
      storageKey: options.key,
      storageProvider: this.providerName,
      fileSize: options.buffer.length,
      url: `/uploads/${options.key}`,
    };
  }

  async download(storageKey: string): Promise<Buffer> {
    const filePath = path.join(this.uploadDir, storageKey);
    if (!(await fs.pathExists(filePath))) {
      throw new Error(`الملف غير موجود: ${storageKey}`);
    }
    return fs.readFile(filePath);
  }

  async getSignedUrl(storageKey: string): Promise<string> {
    return `/uploads/${storageKey}`;
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = path.join(this.uploadDir, storageKey);
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    const filePath = path.join(this.uploadDir, storageKey);
    return fs.pathExists(filePath);
  }
}
