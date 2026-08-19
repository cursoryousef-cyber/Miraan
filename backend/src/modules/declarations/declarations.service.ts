import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDeclarationDto, AcceptDeclarationDto } from './dto/declaration.dto';

@Injectable()
export class DeclarationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createDeclaration(orgId: String, dto: CreateDeclarationDto, userId?: string) {
    return this.prisma.declaration.create({
      data: {
        organizationId: orgId as string,
        type: dto.type,
        titleAr: dto.titleAr,
        titleEn: dto.titleEn,
        contentAr: dto.contentAr,
        contentEn: dto.contentEn,
        isMandatory: dto.isMandatory ?? true,
        createdById: userId,
      },
    });
  }

  async getDeclarationsByOrg(orgId: string) {
    return this.prisma.declaration.findMany({
      where: { organizationId: orgId, isActive: true },
      include: {
        _count: {
          select: { acceptances: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingDeclarationsForUser(userId: string, orgId: string) {
    const activeDeclarations = await this.prisma.declaration.findMany({
      where: { organizationId: orgId, isActive: true, isMandatory: true },
    });

    const userAcceptances = await this.prisma.declarationAcceptance.findMany({
      where: { userId, organizationId: orgId },
    });

    const acceptedMap = new Set(
      userAcceptances.map((a) => `${a.declarationId}_${a.version}`),
    );

    const pending = activeDeclarations.filter(
      (d) => !acceptedMap.has(`${d.id}_${d.version}`),
    );

    return pending;
  }

  async acceptDeclaration(userId: string, orgId: string, dto: AcceptDeclarationDto, ipAddress?: string) {
    const dec = await this.prisma.declaration.findUnique({
      where: { id: dto.declarationId },
    });

    if (!dec) {
      throw new NotFoundException('الإقرار غير موجود');
    }

    return this.prisma.declarationAcceptance.upsert({
      where: {
        declarationId_userId_version: {
          declarationId: dto.declarationId,
          userId,
          version: dto.version,
        },
      },
      update: {
        acceptedAt: new Date(),
        ipAddress,
        deviceInfo: dto.deviceInfo,
      },
      create: {
        declarationId: dto.declarationId,
        userId,
        organizationId: orgId,
        version: dto.version,
        ipAddress,
        deviceInfo: dto.deviceInfo,
      },
    });
  }

  async getAcceptanceStatistics(orgId: string) {
    const totalDeclarations = await this.prisma.declaration.count({
      where: { organizationId: orgId },
    });

    const totalAcceptances = await this.prisma.declarationAcceptance.count({
      where: { organizationId: orgId },
    });

    const acceptancesList = await this.prisma.declarationAcceptance.findMany({
      where: { organizationId: orgId },
      include: {
        declaration: true,
        user: {
          include: { person: true },
        },
      },
      orderBy: { acceptedAt: 'desc' },
      take: 100,
    });

    return {
      totalDeclarations,
      totalAcceptances,
      recentAcceptances: acceptancesList,
    };
  }
}
