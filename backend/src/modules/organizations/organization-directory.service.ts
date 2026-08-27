import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationAssignmentService } from '../organization-assignments/organization-assignment.service';

/**
 * Directory-specific listing with server-side filtering and pagination.
 * Kept separate from the general OrganizationsService so the directory's
 * status tabs have one authoritative query path without changing the other
 * organization read/write flows.
 */
@Injectable()
export class OrganizationDirectoryService {
  constructor(
    private prisma: PrismaService,
    private orgAssignments: OrganizationAssignmentService,
  ) {}

  async findAll(
    page = 1,
    limit = 20,
    search?: string,
    typeId?: string,
    parentId?: string,
    status?: string,
    visibleOrgIds?: string[] | null,
  ) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;
    const where: Record<string, unknown> = { deletedAt: null };

    // null means unrestricted (platform-level session); everyone else is
    // confined to the organizations already resolved by ScopeContextService.
    if (visibleOrgIds) where.id = { in: visibleOrgIds };
    if (typeId) where.organizationTypeId = typeId;
    if (parentId) where.parentId = parentId;

    const normalizedStatus = status?.trim();
    if (normalizedStatus) where.status = normalizedStatus;

    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      where.OR = [
        { nameAr: { contains: normalizedSearch, mode: 'insensitive' } },
        { nameEn: { contains: normalizedSearch, mode: 'insensitive' } },
        { code: { contains: normalizedSearch, mode: 'insensitive' } },
        { cityAr: { contains: normalizedSearch, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
        include: {
          organizationType: true,
          parent: { select: { id: true, nameAr: true, code: true } },
          license: true,
          _count: {
            select: {
              children: true,
              traineeProfiles: true,
              trainerProfiles: true,
              departments: true,
            },
          },
        },
      }),
    ]);

    const memberCounts = await this.orgAssignments.countMembershipsByOrg(
      data.map((o) => o.id),
    );
    const withCounts = data.map((o) => ({
      ...o,
      _count: {
        ...o._count,
        userOrganizations: memberCounts.get(o.id) ?? 0,
      },
    }));

    return {
      data: withCounts,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }
}
