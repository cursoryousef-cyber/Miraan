import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateIntegrationConfigDto, CreateWebhookSubDto } from './dto/integration.dto';
import { IAuthenticatedUser } from '../../common/interfaces';
import { Prisma } from '@prisma/client';

@Injectable()
export class IntegrationsService {
  constructor(private prisma: PrismaService) {}

  // Integration Configs
  async findAllConfigs(orgId?: string) {
    return this.prisma.integrationConfig.findMany({
      where: orgId ? { OR: [{ organizationId: null }, { organizationId: orgId }] } : {},
      include: {
        syncLogs: { take: 5, orderBy: { createdAt: 'desc' } },
      },
    });
  }

  async createConfig(dto: CreateIntegrationConfigDto, user?: IAuthenticatedUser) {
    return this.prisma.integrationConfig.create({
      data: {
        code: dto.code,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        integrationType: dto.integrationType,
        baseUrl: dto.baseUrl,
        authType: dto.authType,
        credentials: (dto.credentials || {}) as unknown as Prisma.InputJsonValue,
        organizationId: user?.organizationId || null,
        createdById: user?.accountId,
      },
    });
  }

  // Webhook Subscriptions
  async findAllWebhooks(orgId?: string) {
    return this.prisma.webhookSubscription.findMany({
      where: orgId ? { OR: [{ organizationId: null }, { organizationId: orgId }] } : {},
      include: {
        deliveryLogs: { take: 10, orderBy: { deliveredAt: 'desc' } },
      },
    });
  }

  async createWebhook(dto: CreateWebhookSubDto, user?: IAuthenticatedUser) {
    return this.prisma.webhookSubscription.create({
      data: {
        ...dto,
        organizationId: user?.organizationId || null,
        createdById: user?.accountId,
      },
    });
  }

  async removeWebhook(id: string) {
    const sub = await this.prisma.webhookSubscription.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('اشتراك الـ Webhook غير موجود');
    return this.prisma.webhookSubscription.delete({ where: { id } });
  }
}
