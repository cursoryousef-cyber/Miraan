import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ToggleFeatureFlagDto } from './dto/feature-flag.dto';
import { IAuthenticatedUser } from '../../common/interfaces';
import { Prisma } from '@prisma/client';

@Injectable()
export class FeatureFlagsService {
  constructor(private prisma: PrismaService) {}

  async getOrgFlags(organizationId: string) {
    return this.prisma.featureFlag.findMany({
      where: { organizationId },
    });
  }

  async toggleFlag(dto: ToggleFeatureFlagDto, user: IAuthenticatedUser) {
    return this.prisma.featureFlag.upsert({
      where: {
        organizationId_featureCode: {
          organizationId: dto.organizationId,
          featureCode: dto.featureCode,
        },
      },
      create: {
        organizationId: dto.organizationId,
        featureCode: dto.featureCode,
        isEnabled: dto.isEnabled,
        configuration: (dto.configuration || {}) as unknown as Prisma.InputJsonValue,
        enabledAt: dto.isEnabled ? new Date() : null,
        disabledAt: !dto.isEnabled ? new Date() : null,
        updatedById: user.accountId,
      },
      update: {
        isEnabled: dto.isEnabled,
        configuration: (dto.configuration || {}) as unknown as Prisma.InputJsonValue,
        enabledAt: dto.isEnabled ? new Date() : undefined,
        disabledAt: !dto.isEnabled ? new Date() : undefined,
        updatedById: user.accountId,
      },
    });
  }
}
