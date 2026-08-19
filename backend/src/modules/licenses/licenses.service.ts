import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateLicenseDto } from './dto/license.dto';
import { IAuthenticatedUser } from '../../common/interfaces';

@Injectable()
export class LicensesService {
  constructor(private prisma: PrismaService) {}

  async getLicense(organizationId: string) {
    const license = await this.prisma.organizationLicense.findUnique({
      where: { organizationId },
      include: { organization: true },
    });

    if (!license) throw new NotFoundException('لا يوجد ترخيص فعال لهذه الجهة');
    return license;
  }

  async updateLicense(dto: UpdateLicenseDto, user: IAuthenticatedUser) {
    return this.prisma.organizationLicense.upsert({
      where: { organizationId: dto.organizationId },
      create: {
        organizationId: dto.organizationId,
        plan: dto.plan,
        maxUsers: dto.maxUsers,
        maxTrainees: dto.maxTrainees,
        maxStorageGb: dto.maxStorageGb,
        features: dto.features || [],
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        status: dto.status || 'active',
        autoRenew: dto.autoRenew || false,
        createdById: user.accountId,
      },
      update: {
        plan: dto.plan,
        maxUsers: dto.maxUsers,
        maxTrainees: dto.maxTrainees,
        maxStorageGb: dto.maxStorageGb,
        features: dto.features || [],
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        status: dto.status || 'active',
        autoRenew: dto.autoRenew || false,
        updatedById: user.accountId,
      },
    });
  }
}
