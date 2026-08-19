import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { IStorageProvider } from './providers/storage-provider.interface';
import { IAuthenticatedUser } from '../../common/interfaces';

@Injectable()
export class StorageService {
  private activeProvider: IStorageProvider;

  constructor(
    private prisma: PrismaService,
    localStorageProvider: LocalStorageProvider,
  ) {
    // Inject active provider based on environment setting
    this.activeProvider = localStorageProvider;
  }

  async uploadFile(
    file: Express.Multer.File,
    category = 'general',
    isPublic = false,
    user: IAuthenticatedUser,
  ) {
    const ext = file.originalname.split('.').pop() || '';
    const key = `${user.organizationId}/${category}/${uuidv4()}.${ext}`;

    const result = await this.activeProvider.upload({
      key,
      buffer: file.buffer,
      mimeType: file.mimetype,
      category,
      isPublic,
    });

    const storedFile = await this.prisma.storedFile.create({
      data: {
        organizationId: user.organizationId,
        uploadedById: user.accountId,
        fileName: file.originalname,
        storageKey: result.storageKey,
        storageProvider: result.storageProvider,
        fileSize: file.size,
        mimeType: file.mimetype,
        category,
        isPublic,
      },
    });

    return {
      fileId: storedFile.id,
      fileName: storedFile.fileName,
      storageKey: storedFile.storageKey,
      storageProvider: storedFile.storageProvider,
      url: await this.activeProvider.getSignedUrl(result.storageKey),
    };
  }

  async getFileDownload(fileId: string) {
    const storedFile = await this.prisma.storedFile.findUnique({
      where: { id: fileId },
    });

    if (!storedFile || storedFile.deletedAt) {
      throw new NotFoundException('الملف غير موجود');
    }

    const buffer = await this.activeProvider.download(storedFile.storageKey);

    return {
      storedFile,
      buffer,
    };
  }

  async getSignedUrl(fileId: string) {
    const storedFile = await this.prisma.storedFile.findUnique({
      where: { id: fileId },
    });

    if (!storedFile || storedFile.deletedAt) {
      throw new NotFoundException('الملف غير موجود');
    }

    return {
      url: await this.activeProvider.getSignedUrl(storedFile.storageKey),
    };
  }
}
