import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationHierarchyService } from './organization-hierarchy.service';
import { CapacityService } from './capacity.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { IAuthenticatedUser } from '../../common/interfaces';
import { OrganizationAssignmentService } from '../organization-assignments/organization-assignment.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private prisma: PrismaService,
    private hierarchyService: OrganizationHierarchyService,
    private capacityService: CapacityService,
    private orgAssignments: OrganizationAssignmentService,
  ) {}

  /**
   * Health clusters a sponsor may address a training request to.
   *
   * A university is scoped to its own organisation, so the general listing can
   * never show it the cluster it submits to — which left the target dropdown in
   * the new-request dialog empty and blocked submission from the UI entirely.
   * This returns nothing but the identity of active clusters (no capacity, no
   * members, no hospitals), which is exactly what addressing a request needs and
   * no more.
   */
  async findRequestTargetClusters() {
    const data = await this.prisma.organization.findMany({
      where: {
        deletedAt: null,
        status: 'active',
        organizationType: { code: 'cluster' },
      },
      select: { id: true, code: true, nameAr: true, nameEn: true },
      orderBy: { nameAr: 'asc' },
    });
    return { data };
  }

  async findAll(page = 1, limit = 20, search?: string, typeId?: string, parentId?: string, visibleOrgIds?: string[] | null) {
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { deletedAt: null };

    // null means unrestricted (platform-level session); everyone else is
    // confined to their own organisation and, for a cluster, its children —
    // never a sibling hospital or an unrelated organisation.
    if (visibleOrgIds) where.id = { in: visibleOrgIds };
    if (typeId) where.organizationTypeId = typeId;
    if (parentId) where.parentId = parentId;

    if (search) {
      where.OR = [
        { nameAr: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { cityAr: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        skip,
        take: limit,
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

    // Member count now comes from OrganizationAssignment; the response keeps the
    // original _count.userOrganizations key so callers are unaffected.
    const memberCounts = await this.orgAssignments.countMembershipsByOrg(data.map((o) => o.id));
    const withCounts = data.map((o) => ({
      ...o,
      _count: { ...o._count, userOrganizations: memberCounts.get(o.id) ?? 0 },
    }));

    return {
      data: withCounts,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
      include: {
        organizationType: true,
        parent: true,
        children: {
          include: { organizationType: true },
        },
        license: true,
        featureFlags: true,
        orgSettings: true,
        affiliationsAsSource: { include: { targetOrg: true } },
        affiliationsAsTarget: { include: { sourceOrg: true } },
        _count: {
          select: {
            traineeProfiles: true,
            trainerProfiles: true,
            departments: true,
            programs: true,
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException('الجهة غير موجودة');
    }

    const memberCounts = await this.orgAssignments.countMembershipsByOrg([org.id]);
    return {
      ...org,
      _count: { ...org._count, userOrganizations: memberCounts.get(org.id) ?? 0 },
    };
  }

  async create(dto: CreateOrganizationDto, user?: IAuthenticatedUser) {
    const existing = await this.prisma.organization.findUnique({
      where: { code: dto.code.toUpperCase() },
    });

    if (existing) {
      throw new ConflictException(`رمز الجهة (${dto.code}) مستخدم مسبقاً`);
    }

    const org = await this.prisma.organization.create({
      data: {
        ...dto,
        nameEn: dto.nameEn || dto.nameAr,
        code: dto.code.toUpperCase(),
        createdById: user?.accountId,
      },
      include: { organizationType: true },
    });

    // Add closure hierarchy entry
    await this.hierarchyService.addNode(org.id, dto.parentId);

    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto, user?: IAuthenticatedUser) {
    await this.findOne(id);

    // `create` normalises the code to upper case and refuses a duplicate; this
    // did neither. Two consequences, both reachable through the edit dialog:
    // a code saved as `hosp-x` sat alongside a created `HOSP-X` because the
    // unique index is case-sensitive, so the same organisation could be
    // addressed by two codes; and a genuine collision surfaced as a raw P2002
    // reported to the user as "بيانات الحساب متعارضة" — an account error on an
    // organisation form. Normalising and checking here keeps update and create
    // on the same rule and names the actual conflict.
    let code: string | undefined;
    if (dto.code !== undefined) {
      code = dto.code.trim().toUpperCase();
      if (!code) throw new BadRequestException('رمز الجهة لا يمكن أن يكون فارغاً');

      const clash = await this.prisma.organization.findFirst({
        where: { code, id: { not: id } },
        select: { id: true, nameAr: true },
      });
      if (clash) {
        throw new ConflictException(
          `رمز الجهة (${code}) مستخدم مسبقاً من قبل «${clash.nameAr}»`,
        );
      }
    }

    return this.prisma.organization.update({
      where: { id },
      data: {
        ...dto,
        ...(code !== undefined ? { code } : {}),
        updatedById: user?.accountId,
      },
      include: { organizationType: true },
    });
  }

  async softDelete(id: string, user?: IAuthenticatedUser) {
    await this.findOne(id);

    return this.prisma.organization.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: user?.accountId,
      },
    });
  }

  async getTree(visibleOrgIds: string[] | null = null) {
    const orgInclude = {
      organizationType: true,
      userRoles: {
        where: { userAccount: { deletedAt: null } },
        include: {
          role: true,
          userAccount: {
            select: { id: true, email: true, username: true, isActive: true, person: { select: { nameAr: true, nameEn: true, nationalId: true } } },
          },
        },
      },
      departments: {
        where: { isActive: true },
        select: { id: true, nameAr: true, nameEn: true, capacity: true, code: true },
      },
      _count: {
        select: { traineeProfiles: true, trainerProfiles: true, departments: true },
      },
    };

    if (visibleOrgIds !== null) {
      const scopedOrgs = await this.prisma.organization.findMany({
        where: { id: { in: visibleOrgIds }, deletedAt: null },
        include: orgInclude,
        orderBy: { createdAt: 'asc' },
      });

      const orgMap = new Map(scopedOrgs.map((o) => [o.id, { ...o, children: [] as any[] }]));
      const tree: any[] = [];

      for (const org of orgMap.values()) {
        if (org.parentId && orgMap.has(org.parentId)) {
          orgMap.get(org.parentId)!.children.push(org);
        } else {
          tree.push(org);
        }
      }
      return tree;
    }

    const roots = await this.prisma.organization.findMany({
      where: { parentId: null, deletedAt: null },
      include: {
        ...orgInclude,
        children: {
          where: { deletedAt: null },
          include: {
            ...orgInclude,
            children: {
              where: { deletedAt: null },
              include: {
                ...orgInclude,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return roots;
  }

  async getTypes() {
    return this.prisma.organizationType.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Hospitals under an organisation, for the organisation → hospital cascade.
   *
   * Passing no organisation returns every hospital, which is what a platform
   * owner needs; passing one returns only its children, which is what keeps a
   * cluster administrator from attaching an account to another cluster's
   * hospital. The backend re-checks this on write — this endpoint exists so the
   * form cannot offer an invalid combination in the first place.
   */
  /**
   * Canonical organisation KPIs.
   *
   * The dashboards and the directory page were each deriving these from their
   * own paginated fetch, so the directory's totals only covered the page being
   * viewed and disagreed with the dashboard. Both now read this one endpoint,
   * which counts across the whole set with one definition per figure.
   */
  async getStatistics(visibleOrgIds: string[] | null = null) {
    // Same semantics as getTree: null is the platform's unrestricted view,
    // anything else is exactly the caller's own visibleOrgIds — already
    // widened to include a cluster's hospitals by ScopeContextService, so no
    // separate descendant walk is needed here.
    const scopeWhere = visibleOrgIds !== null ? { id: { in: visibleOrgIds } } : {};

    const [types, orgs] = await Promise.all([
      this.prisma.organizationType.findMany({ select: { id: true, code: true } }),
      this.prisma.organization.findMany({
        where: { deletedAt: null, ...scopeWhere },
        select: {
          id: true, status: true, capacity: true, organizationTypeId: true,
          _count: { select: { traineeProfiles: true, trainerProfiles: true, departments: true } },
        },
      }),
    ]);
    const typeById = new Map(types.map((t) => [t.id, t.code]));
    const countOf = (code: string) =>
      orgs.filter((o) => typeById.get(o.organizationTypeId) === code).length;

    const hospitals = orgs.filter((o) => typeById.get(o.organizationTypeId) === 'hospital');
    const totalTrainees = orgs.reduce((sum, o) => sum + o._count.traineeProfiles, 0);
    const totalTrainers = orgs.reduce((sum, o) => sum + o._count.trainerProfiles, 0);
    const totalDepartments = orgs.reduce((sum, o) => sum + o._count.departments, 0);

    // Hospital capacity/occupancy must come from CapacityService — the single
    // source of truth — not the deprecated `organizations.capacity` column,
    // which the service explicitly no longer reads (capacity lives on the
    // department rows). This mirrors getHospitalCardsMetrics so the statistics
    // endpoint and the hospital cards never disagree.
    const hospitalOccupancies = await Promise.all(
      hospitals.map((h) => this.capacityService.getHospitalOccupancy(h.id)),
    );

    // Occupancy is measured against hospital capacity only, since that is the
    // only capacity that exists — clusters and universities do not host.
    const totalCapacity = hospitalOccupancies.reduce((sum, o) => sum + o.capacity, 0);
    const hospitalTrainees = hospitalOccupancies.reduce((sum, o) => sum + o.occupied, 0);
    const occupancyPercentage = totalCapacity > 0
      ? Math.min(100, Math.round((hospitalTrainees / totalCapacity) * 100)) : 0;

    const pressured = hospitalOccupancies.filter(
      (o) => o.capacity > 0 && o.occupied / o.capacity >= 0.8,
    ).length;

    return {
      data: {
        totalOrganizations: orgs.length,
        activeOrganizations: orgs.filter((o) => o.status === 'active').length,
        inactiveOrganizations: orgs.filter((o) => o.status !== 'active').length,
        universities: countOf('university'),
        clusters: countOf('cluster'),
        hospitals: hospitals.length,
        totalCapacity,
        totalTrainees,
        hospitalTrainees,
        totalTrainers,
        totalDepartments,
        availableSeats: Math.max(0, totalCapacity - hospitalTrainees),
        occupancyPercentage,
        pressuredHospitals: pressured,
        hospitalsWithoutCapacity: hospitalOccupancies.filter((o) => o.capacity === 0).length,
      },
    };
  }

  async getHospitalsForOrganization(organizationId?: string) {
    const hospitalType = await this.prisma.organizationType.findUnique({
      where: { code: 'hospital' },
      select: { id: true },
    });
    if (!hospitalType) return { data: [] };

    const data = await this.prisma.organization.findMany({
      where: {
        organizationTypeId: hospitalType.id,
        deletedAt: null,
        ...(organizationId ? { OR: [{ parentId: organizationId }, { id: organizationId }] } : {}),
      },
      select: {
        id: true,
        code: true,
        nameAr: true,
        nameEn: true,
        parentId: true,
        status: true,
        capacity: true,
        parent: { select: { id: true, nameAr: true } },
      },
      orderBy: { nameAr: 'asc' },
    });
    return { data };
  }

  async getHospitalCardsMetrics(clusterId?: string) {
    // Restricted to actual hospitals — without the type filter this returned
    // clusters and universities as "hospital cards" whenever no cluster was
    // supplied, which is what made the counts disagree with the dashboards.
    const hospitalType = await this.prisma.organizationType.findUnique({
      where: { code: 'hospital' },
      select: { id: true },
    });
    const where: any = { deletedAt: null };
    if (hospitalType) where.organizationTypeId = hospitalType.id;
    if (clusterId) {
      where.OR = [{ id: clusterId }, { parentId: clusterId }];
    }

    const hospitals = await this.prisma.organization.findMany({
      where,
      include: {
        organizationType: true,
        departments: { where: { isActive: true } },
        trainerProfiles: { where: { isActive: true }, include: { person: true } },
        _count: {
          select: {
            traineeProfiles: true,
          },
        },
      },
      orderBy: { nameAr: 'asc' },
    });

    const memberCounts = await this.orgAssignments.countMembershipsByOrg(hospitals.map((h) => h.id));

    return Promise.all(
      hospitals.map(async (hosp) => {
        const { capacity, occupied, available, occupancyPercentage } =
          await this.capacityService.getHospitalOccupancy(hosp.id);

        const trainerCount = hosp.trainerProfiles.length;
        const supervisorCount = memberCounts.get(hosp.id) ?? 0;

        return {
          id: hosp.id,
          code: hosp.code,
          nameAr: hosp.nameAr,
          nameEn: hosp.nameEn,
          cityAr: hosp.cityAr,
          cityEn: hosp.cityEn,
          status: hosp.status,
          capacity,
          occupied,
          available,
          occupancyPercentage,
          departmentsCount: hosp.departments.length,
          departments: hosp.departments.map((d) => ({ id: d.id, nameAr: d.nameAr, capacity: d.capacity })),
          trainerCount,
          supervisorCount,
        };
      }),
    );
  }
}
