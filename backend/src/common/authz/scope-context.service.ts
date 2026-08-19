// ============================================================================
// ScopeContext — one resolver for "who is asking, from where, and what may they
// see". Every training service filters through this and nothing else.
//
// The bug this replaces
// --------------------
// Services were each deciding scope for themselves. Notifications filtered on
// the organisationId frozen into the row when it was written; training requests
// filtered on the organisationId currently in the JWT. When those two disagreed
// — which they do the moment an account is a member of more than one cluster —
// the notification bell counted requests the requests screen could not show.
// Same user, same instant, two different answers, because there were two
// different notions of "my organisation".
//
// There is now one. `visibleOrgIds` is computed once per request from the active
// context, and both screens filter on it.
// ============================================================================

import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../interfaces';
import {
  Capability,
  ContextType,
  capabilitiesForRoles,
  capabilityAllowedInContext,
} from './capabilities';

export type ScopeLevel =
  'PLATFORM' | 'ORGANIZATION' | 'HOSPITAL' | 'DEPARTMENT';

export interface ScopeContext {
  accountId: string;
  personId: string;
  email: string;
  roles: string[];
  capabilities: Set<Capability>;
  /** Vantage point of the active organisation. */
  contextType: ContextType;
  level: ScopeLevel;
  /** The active organisation from the JWT. */
  organizationId: string;
  /** Cluster this context sits under, resolved upwards. Null for universities. */
  clusterId: string | null;
  /** Set when the active organisation is a hospital. */
  hospitalId: string | null;
  /** Departments this session is confined to. Empty means "not department-bound". */
  departmentIds: string[];
  /**
   * Every organisation whose records this session may touch. Platform sessions
   * get null, meaning "unrestricted" — callers must treat null as no filter
   * rather than as an empty list.
   */
  visibleOrgIds: string[] | null;
}

const PLATFORM_ROLES = [
  'platform_owner',
  'system_admin',
  'holding_administrator',
];
/** Roles that are confined to a single hospital when that hospital is active. */
const HOSPITAL_ROLES = [
  'hospital_training_admin',
  'hospital_administrator',
  'trainer',
  'trainee',
];

const KNOWN_ROLES = [
  ...PLATFORM_ROLES,
  ...HOSPITAL_ROLES,
  'cluster_manager',
  'cluster_administrator',
  'training_director',
  'university_administrator',
  'academic_supervisor',
  'academic_affairs',
  'org_manager',
];

@Injectable()
export class ScopeContextService {
  constructor(private prisma: PrismaService) {}

  async resolve(user: IAuthenticatedUser): Promise<ScopeContext> {
    const roles = user.roles ?? [];
    const hasValidRole = roles.some((r) => KNOWN_ROLES.includes(r));
    if (!hasValidRole) {
      throw new ForbiddenException('الدور الوظيفي للمستخدم غير معروف أو غير معتمد في المنصة');
    }

    const capabilities = new Set<Capability>(capabilitiesForRoles(roles));
    const isPlatform = roles.some((r) => PLATFORM_ROLES.includes(r));

    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: {
        id: true,
        parentId: true,
        organizationType: { select: { code: true } },
      },
    });

    const orgTypeCode = org?.organizationType?.code ?? null;
    const contextType = this.contextTypeFor(orgTypeCode, isPlatform);
    const clusterId = await this.resolveClusterId(
      org?.id ?? null,
      orgTypeCode,
      org?.parentId ?? null,
    );
    const isHospitalContext = orgTypeCode === 'hospital';

    // No role is department-scoped: department_head is not a role in this model.
    const departmentIds: string[] = [];

    const level: ScopeLevel = isPlatform
      ? 'PLATFORM'
      : isHospitalContext && roles.some((r) => HOSPITAL_ROLES.includes(r))
        ? 'HOSPITAL'
        : 'ORGANIZATION';

    return {
      accountId: user.accountId,
      personId: user.personId,
      email: user.email,
      roles,
      capabilities,
      contextType,
      level,
      organizationId: user.organizationId,
      clusterId,
      hospitalId: isHospitalContext ? user.organizationId : null,
      departmentIds,
      visibleOrgIds: isPlatform
        ? null
        : await this.resolveVisibleOrgIds(user.organizationId, orgTypeCode),
    };
  }

  private contextTypeFor(
    orgTypeCode: string | null,
    isPlatform: boolean,
  ): ContextType {
    if (orgTypeCode === 'hospital') return 'hospital';
    if (orgTypeCode === 'cluster') return 'cluster';
    if (orgTypeCode === 'university' || orgTypeCode === 'college')
      return 'university';
    // Holding and anything unrecognised behaves as platform only when the roles
    // say so; otherwise it is treated as a cluster-level vantage point.
    return isPlatform ? 'platform' : 'cluster';
  }

  /**
   * Walks up `parentId` to the enclosing cluster. Bounded to a handful of hops so
   * a cycle in the hierarchy table cannot spin a request forever.
   */
  private async resolveClusterId(
    orgId: string | null,
    orgTypeCode: string | null,
    parentId: string | null,
  ): Promise<string | null> {
    if (!orgId) return null;
    if (orgTypeCode === 'cluster') return orgId;

    let cursor = parentId;
    for (let hops = 0; cursor && hops < 8; hops++) {
      const parent: {
        id: string;
        parentId: string | null;
        organizationType: { code: string } | null;
      } | null = await this.prisma.organization.findUnique({
        where: { id: cursor },
        select: {
          id: true,
          parentId: true,
          organizationType: { select: { code: true } },
        },
      });
      if (!parent) return null;
      if (parent.organizationType?.code === 'cluster') return parent.id;
      cursor = parent.parentId;
    }
    return null;
  }

  /**
   * A cluster sees itself and every organisation beneath it; everyone else sees
   * only their own organisation. Hospitals deliberately do NOT see their sibling
   * hospitals — that is the boundary the hospital training manager must not cross.
   */
  private async resolveVisibleOrgIds(
    orgId: string,
    orgTypeCode: string | null,
  ): Promise<string[]> {
    if (orgTypeCode !== 'cluster') return [orgId];

    const children = await this.prisma.organization.findMany({
      where: { parentId: orgId, deletedAt: null },
      select: { id: true },
    });
    return [orgId, ...children.map((c) => c.id)];
  }

  private async resolveDepartmentIds(
    accountId: string,
    organizationId: string,
  ): Promise<string[]> {
    const assignments = await this.prisma.organizationAssignment.findMany({
      where: {
        userAccountId: accountId,
        organizationId,
        isActive: true,
        departmentId: { not: null },
      },
      select: { departmentId: true },
    });
    return assignments
      .map((a) => a.departmentId)
      .filter((d): d is string => !!d);
  }

  // ── Assertions used by services ─────────────────────────────────────────────

  /** Capability held AND usable from the active context. */
  hasCapability(ctx: ScopeContext, cap: Capability): boolean {
    return (
      ctx.capabilities.has(cap) &&
      capabilityAllowedInContext(cap, ctx.contextType)
    );
  }

  assertCapability(ctx: ScopeContext, cap: Capability): void {
    if (!ctx.capabilities.has(cap)) {
      throw new ForbiddenException(
        `لا تملك الصلاحية المطلوبة لهذا الإجراء (${cap})`,
      );
    }
    if (!capabilityAllowedInContext(cap, ctx.contextType)) {
      throw new ForbiddenException(
        `هذا الإجراء غير متاح من سياق العمل الحالي — بدّل إلى السياق المناسب (${cap})`,
      );
    }
  }

  /** The organisation owning a record must be inside the session's scope. */
  assertOrgInScope(
    ctx: ScopeContext,
    organizationId: string | null | undefined,
  ): void {
    if (ctx.visibleOrgIds === null) return;
    if (!organizationId || !ctx.visibleOrgIds.includes(organizationId)) {
      throw new ForbiddenException('هذا السجل خارج نطاق صلاحياتك التنظيمية');
    }
  }

  /**
   * Hospital-internal writes must target the active hospital — not merely a
   * hospital the session can see. A cluster session can *see* every hospital in
   * its cluster; that must never become permission to edit one from the inside.
   */
  assertActiveHospital(
    ctx: ScopeContext,
    hospitalId: string | null | undefined,
  ): void {
    if (ctx.visibleOrgIds === null) return;
    if (!ctx.hospitalId || hospitalId !== ctx.hospitalId) {
      throw new ForbiddenException(
        'لا يمكنك تنفيذ هذا الإجراء على مستشفى غير مستشفاك',
      );
    }
  }

  assertDepartmentInScope(
    ctx: ScopeContext,
    departmentId: string | null | undefined,
  ): void {
    if (ctx.level !== 'DEPARTMENT') return;
    if (!departmentId || !ctx.departmentIds.includes(departmentId)) {
      throw new ForbiddenException('هذا القسم خارج نطاق صلاحياتك');
    }
  }

  /** Prisma filter fragment for any model with an `organizationId` column. */
  orgFilter(ctx: ScopeContext): Record<string, unknown> {
    return ctx.visibleOrgIds === null
      ? {}
      : { organizationId: { in: ctx.visibleOrgIds } };
  }
}
