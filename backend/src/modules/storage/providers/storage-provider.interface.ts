export interface UploadOptions {
  key: string;
  buffer: Buffer;
  mimeType: string;
  category?: string;
  isPublic?: boolean;
}

export interface StorageResult {
  storageKey: string;
  storageProvider: string;
  url?: string;
  fileSize: number;
}

export interface IStorageProvider {
  providerName: string;
  upload(options: UploadOptions): Promise<StorageResult>;
  download(storageKey: string): Promise<Buffer>;
  getSignedUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}
