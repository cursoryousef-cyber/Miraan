import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAffiliationDto, UpdateAffiliationDto } from './dto/affiliation.dto';
import { IAuthenticatedUser } from '../../common/interfaces';

@Injectable()
export class OrganizationAffiliationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId?: string, page = 1, limit = 20, visibleOrgIds?: string[] | null) {
    const skip = (page - 1) * limit;
    const conditions: Record<string, unknown>[] = [];

    if (orgId) {
      conditions.push({ OR: [{ sourceOrgId: orgId }, { targetOrgId: orgId }] });
    }
    // null means unrestricted (platform-level session). Everyone else only
    // sees affiliations where one side is an organisation they can see —
    // never an unrelated pair.
    if (visibleOrgIds) {
      conditions.push({ OR: [{ sourceOrgId: { in: visibleOrgIds } }, { targetOrgId: { in: visibleOrgIds } }] });
    }
    const where: Record<string, unknown> = conditions.length ? { AND: conditions } : {};

    const [total, data] = await Promise.all([
      this.prisma.organizationAffiliation.count({ where }),
      this.prisma.organizationAffiliation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sourceOrg: true,
          targetOrg: true,
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(dto: CreateAffiliationDto, user?: IAuthenticatedUser) {
    const existing = await this.prisma.organizationAffiliation.findUnique({
      where: {
        sourceOrgId_targetOrgId_affiliationType: {
          sourceOrgId: dto.sourceOrgId,
          targetOrgId: dto.targetOrgId,
          affiliationType: dto.affiliationType,
        },
      },
    });

    if (existing) {
      throw new ConflictException('الاتفاقية بين هاتين الجهتين موجودة مسبقاً بنفس النوع');
    }

    return this.prisma.organizationAffiliation.create({
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        createdById: user?.accountId,
      },
      include: {
        sourceOrg: true,
        targetOrg: true,
      },
    });
  }

  async update(id: string, dto: UpdateAffiliationDto, user?: IAuthenticatedUser) {
    const affiliation = await this.prisma.organizationAffiliation.findUnique({
      where: { id },
    });

    if (!affiliation) {
      throw new NotFoundException('الاتفاقية غير موجودة');
    }

    return this.prisma.organizationAffiliation.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        updatedById: user?.accountId,
      },
    });
  }

  async remove(id: string) {
    return this.prisma.organizationAffiliation.delete({
      where: { id },
    });
  }
}
