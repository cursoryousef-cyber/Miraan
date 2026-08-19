import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePolicyDto } from './dto/policy.dto';
import { IAuthenticatedUser } from '../../common/interfaces';
import { Prisma } from '@prisma/client';

@Injectable()
export class PoliciesService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId?: string) {
    return this.prisma.policy.findMany({
      where: orgId ? { OR: [{ organizationId: null }, { organizationId: orgId }] } : {},
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(dto: CreatePolicyDto, user?: IAuthenticatedUser) {
    return this.prisma.policy.create({
      data: {
        code: dto.code,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        description: dto.description,
        resource: dto.resource,
        action: dto.action,
        effect: dto.effect || 'allow',
        conditions: dto.conditions as unknown as Prisma.InputJsonValue,
        organizationId: user?.organizationId || null,
        createdById: user?.accountId,
      },
    });
  }

  async remove(id: string) {
    const policy = await this.prisma.policy.findUnique({ where: { id } });
    if (!policy) throw new NotFoundException('السياسة غير موجودة');
    return this.prisma.policy.delete({ where: { id } });
  }
}
