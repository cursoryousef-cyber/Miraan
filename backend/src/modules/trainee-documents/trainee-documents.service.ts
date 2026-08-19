import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { IAuthenticatedUser } from '../../common/interfaces';
import { ReviewDocumentDto, UploadTraineeDocumentDto } from './dto/trainee-document.dto';

/** أنواع المستندات المعتمدة — تُقرأ من LookupTable ولا تُثبّت في الكود */
const DOCUMENT_LOOKUP_CATEGORY = 'document_type';

@Injectable()
export class TraineeDocumentsService {
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
  ) {}

  async getAllowedTypes() {
    const data = await this.prisma.lookupTable.findMany({
      where: { category: DOCUMENT_LOOKUP_CATEGORY, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return { data };
  }

  async upload(file: Express.Multer.File, dto: UploadTraineeDocumentDto, user: IAuthenticatedUser) {
    if (!file) throw new BadRequestException('لم يتم إرفاق ملف');
    if (!dto.traineeProfileId && !dto.trainingRequestTraineeId) {
      throw new BadRequestException('يجب تحديد المتدرب (traineeProfileId أو trainingRequestTraineeId)');
    }

    const allowed = await this.prisma.lookupTable.findUnique({
      where: { category_code: { category: DOCUMENT_LOOKUP_CATEGORY, code: dto.documentType } },
    });
    if (!allowed || !allowed.isActive) {
      throw new BadRequestException(`نوع المستند (${dto.documentType}) غير معتمد`);
    }

    const uploaded = await this.storageService.uploadFile(file, 'trainee-documents', false, user);

    const document = await this.prisma.document.create({
      data: {
        organizationId: user.organizationId,
        userId: dto.traineeProfileId ? await this.resolveAccountId(dto.traineeProfileId) : null,
        traineeProfileId: dto.traineeProfileId,
        trainingRequestTraineeId: dto.trainingRequestTraineeId,
        documentType: dto.documentType,
        titleAr: dto.titleAr || allowed.nameAr,
        titleEn: allowed.nameEn,
        storageKey: uploaded.storageKey,
        fileSize: file.size,
        mimeType: file.mimetype,
        isMandatory: dto.isMandatory ?? false,
        hasExpiry: Boolean(dto.expiryDate),
        issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        createdById: user.accountId,
      },
    });

    return { data: document, success: true, message: 'تم رفع المستند بنجاح' };
  }

  async findAll(traineeProfileId?: string, trainingRequestTraineeId?: string) {
    if (!traineeProfileId && !trainingRequestTraineeId) {
      throw new BadRequestException('يجب تحديد المتدرب لعرض مستنداته');
    }

    const data = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        ...(traineeProfileId ? { traineeProfileId } : {}),
        ...(trainingRequestTraineeId ? { trainingRequestTraineeId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return { data };
  }

  async review(id: string, dto: ReviewDocumentDto, user: IAuthenticatedUser) {
    const existing = await this.prisma.document.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('المستند غير موجود');

    const document = await this.prisma.document.update({
      where: { id },
      data: {
        status: dto.status,
        reviewerNote: dto.reviewerNote,
        reviewedById: user.accountId,
        reviewedAt: new Date(),
        updatedById: user.accountId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: existing.organizationId,
        actorId: user.accountId,
        action: 'review_trainee_document',
        entityType: 'Document',
        entityId: id,
        oldValues: { status: existing.status },
        newValues: { status: dto.status, reviewerNote: dto.reviewerNote },
      },
    });

    return { data: document, success: true, message: 'تم حفظ نتيجة مراجعة المستند' };
  }

  private async resolveAccountId(traineeProfileId: string): Promise<string | null> {
    const profile = await this.prisma.traineeProfile.findUnique({
      where: { id: traineeProfileId },
      select: { person: { select: { userAccounts: { select: { id: true }, take: 1 } } } },
    });
    return profile?.person.userAccounts[0]?.id ?? null;
  }
}
