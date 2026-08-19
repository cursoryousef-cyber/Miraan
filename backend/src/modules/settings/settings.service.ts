import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSettingDto } from './dto/setting.dto';
import { IAuthenticatedUser } from '../../common/interfaces';
import { Prisma } from '@prisma/client';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getSettings(orgId?: string) {
    return this.prisma.setting.findMany({
      where: {
        OR: [{ organizationId: null }, { organizationId: orgId }],
      },
    });
  }

  async getSettingByKey(key: string, orgId?: string) {
    const setting = await this.prisma.setting.findFirst({
      where: {
        key,
        OR: [{ organizationId: null }, { organizationId: orgId }],
      },
      orderBy: { organizationId: 'desc' }, // org-specific takes precedence
    });

    if (!setting) throw new NotFoundException(`الإعداد المطلوب (${key}) غير موجود`);
    return setting;
  }

  async updateSetting(dto: UpdateSettingDto, user: IAuthenticatedUser) {
    const targetOrgId = dto.organizationId !== undefined ? dto.organizationId : user.organizationId;

    return this.prisma.setting.upsert({
      where: {
        organizationId_key: {
          organizationId: targetOrgId || '',
          key: dto.key,
        },
      },
      create: {
        organizationId: targetOrgId || null,
        key: dto.key,
        value: dto.value as unknown as Prisma.InputJsonValue,
        descriptionAr: dto.descriptionAr,
        updatedById: user.accountId,
      },
      update: {
        value: dto.value as unknown as Prisma.InputJsonValue,
        descriptionAr: dto.descriptionAr,
        updatedById: user.accountId,
      },
    });
  }
}
