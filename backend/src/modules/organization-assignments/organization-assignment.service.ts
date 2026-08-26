import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Assignment sources that confer *account membership* in an organization —
 * i.e. the right to sign in against it and switch into it.
 *
 * Profile-derived assignments (trainer_profile / trainee_profile) are
 * deliberately excluded: holding a clinical profile at a hospital records where
 * a person trains or teaches, not that their account is a member of that org.
 * Those rows stay in the table for the hospital/trainer queries that legitimately
 * ask "who works here", but they must not widen the auth surface — the legacy
 * model resolved membership from UserOrganization alone, and this keeps the
 * resolved membership identical to it.
 */
export const MEMBERSHIP_SOURCES = ['user_organization', 'user_role', 'manual'];

/**
 * Chooses the active organisation from the memberships a user holds.
 *
 * `find(isPrimary)` alone returns whichever primary row the query happened to
 * order first. That was fine while one primary was guaranteed, but the flag was
 * per-row with nothing enforcing uniqueness, and accounts existed that were
 * primary in a hospital *and* in the cluster above it — so the active
 * organisation, and every scope derived from it, depended on row order.
 *
 * A unique index now prevents new duplicates, but the tie is broken here too: of
 * several primaries the most specific wins, meaning one that is not the parent of
 * another organisation in the same list. Belonging to a hospital and to the
 * cluster that runs it describes one posting, and the hospital is where the work
 * happens.
 */
export function pickActiveEntry<T extends { organization: any; isPrimary: boolean }>(
  available: T[],
): T | null {
  if (available.length === 0) return null;

  const primaries = available.filter((e) => e.isPrimary);
  const candidates = primaries.length > 0 ? primaries : available;
  if (candidates.length === 1) return candidates[0];

  const parentIds = new Set(
    available.map((e) => e.organization?.parentId).filter((id): id is string => !!id),
  );
  // An organisation named as someone else's parent is the less specific of the two.
  const mostSpecific = candidates.find((e) => !parentIds.has(e.organization?.id));
  return mostSpecific ?? candidates[0];
}

/**
 * Prisma `where` fragment selecting UserAccounts that are members of an
 * organization — assignment first, with a per-account fallback to the legacy
 * relation for accounts that have no membership assignments yet.
 */
export function membershipWhere(organizationId: string) {
  return {
    OR: [
      {
        orgAssignments: {
          some: { organizationId, isActive: true, sourceType: { in: MEMBERSHIP_SOURCES } },
        },
      },
      {
        AND: [
          { orgAssignments: { none: { sourceType: { in: MEMBERSHIP_SOURCES } } } },
          { organizations: { some: { organizationId, isActive: true } } },
        ],
      },
    ],
  };
}

@Injectable()
export class OrganizationAssignmentService {
  private readonly logger = new Logger(OrganizationAssignmentService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Compatibility: resolve the active organization for a user ──────────────

  /**
   * Returns the active organization ID for a user.
   * Reads from OrganizationAssignment first; falls back to UserOrganization for
   * users not yet migrated.
   */
  async getActiveOrgId(userAccountId: string): Promise<string | null> {
    const oa = await this.prisma.organizationAssignment.findFirst({
      where: { userAccountId, isActive: true, isPrimary: true },
      select: { organizationId: true },
    });
    if (oa) return oa.organizationId;

    // Legacy fallback
    const uo = await this.prisma.userOrganization.findFirst({
      where: { userAccountId, isActive: true, isPrimary: true },
      select: { organizationId: true },
    });
    return uo?.organizationId ?? null;
  }

  /**
   * Resolves a user's organization context — the active org plus every org they
   * can reach — from OrganizationAssignment, falling back to UserOrganization
   * when the user has no assignment rows at all.
   *
   * The source decision is all-or-nothing per user so a caller never sees a list
   * half-built from each model. Returned organizations are full records, so
   * callers can shape responses exactly as they did against the legacy join.
   *
   * @param activeOnly restrict to currently-active memberships (login) or
   *                   include historical ones (profile), matching legacy scoping.
   */
  async resolveOrgContext(
    userAccountId: string,
    opts: { activeOnly: boolean },
  ): Promise<{
    active: { organization: any; isPrimary: boolean } | null;
    available: Array<{ organization: any; isPrimary: boolean }>;
    source: 'assignment' | 'legacy';
  }> {
    // `parent` is loaded because callers report the administering organisation
    // alongside the training one; /auth/me already read `organization.parent`
    // and, with only organizationType included, silently returned null for it.
    const orgInclude = { include: { organizationType: true, parent: true } } as const;

    const assignments = await this.prisma.organizationAssignment.findMany({
      where: {
        userAccountId,
        sourceType: { in: MEMBERSHIP_SOURCES },
        ...(opts.activeOnly ? { isActive: true } : {}),
      },
      include: { organization: orgInclude },
      orderBy: [{ isPrimary: 'desc' }, { startDate: 'asc' }],
    });

    if (assignments.length > 0) {
      // Only organisations the user can actually enter are offered as contexts.
      // Backfilled rows with roleId = NULL are memberships without authority; a
      // user who has one against a cluster is on that cluster's books but has no
      // role there, so switching in would yield a session with no capabilities.
      // Listing such an organisation invites the user to switch into a context
      // where every screen is empty and every action is refused. UserRole is
      // consulted as well because the two role models coexist during migration.
      const roledOrgIds = await this.roledOrgIds(
        userAccountId,
        assignments.map((a) => a.organizationId),
      );

      const byOrg = new Map<string, { organization: any; isPrimary: boolean }>();
      for (const a of assignments) {
        if (!roledOrgIds.has(a.organizationId)) continue;
        // A user may hold several assignments in one org over time; collapse to
        // one entry per org, preferring the primary.
        const existing = byOrg.get(a.organizationId);
        if (!existing || (a.isPrimary && !existing.isPrimary)) {
          byOrg.set(a.organizationId, { organization: a.organization, isPrimary: a.isPrimary });
        }
      }
      const available = [...byOrg.values()];
      const active = pickActiveEntry(available);
      return { active, available, source: 'assignment' };
    }

    // Legacy fallback — mirrors the original UserOrganization resolution exactly.
    const userOrgs = await this.prisma.userOrganization.findMany({
      where: { userAccountId, ...(opts.activeOnly ? { isActive: true } : {}) },
      include: { organization: orgInclude },
    });
    const available = userOrgs.map((uo) => ({
      organization: uo.organization,
      isPrimary: uo.isPrimary,
    }));
    const active = pickActiveEntry(available);
    return { active, available, source: 'legacy' };
  }

  /**
   * Of the given organisations, those in which the user holds a role — from
   * either role model. Used to keep context lists and switch authorisation
   * agreeing on the same definition of "may act here".
   */
  private async roledOrgIds(userAccountId: string, candidateOrgIds: string[]): Promise<Set<string>> {
    if (candidateOrgIds.length === 0) return new Set();

    const [roledAssignments, userRoles] = await Promise.all([
      this.prisma.organizationAssignment.findMany({
        where: {
          userAccountId,
          organizationId: { in: candidateOrgIds },
          isActive: true,
          sourceType: { in: MEMBERSHIP_SOURCES },
          roleId: { not: null },
        },
        select: { organizationId: true },
      }),
      this.prisma.userRole.findMany({
        where: { userAccountId, organizationId: { in: candidateOrgIds } },
        select: { organizationId: true },
      }),
    ]);

    return new Set([
      ...roledAssignments.map((a) => a.organizationId),
      ...userRoles.map((r) => r.organizationId),
    ]);
  }

  /**
   * Whether a user may act within an organization. Used to authorize organization
   * switching, so it is the gate on which every downstream scope check rests.
   *
   * Access requires a *role* in the organization, not merely a membership row.
   * Bare membership used to be enough, which produced a null context: switching
   * succeeded, `getRolesAndPermissions` found no UserRole for that org, and the
   * session continued with an organisation set and zero roles. Endpoints that had
   * no role annotation then served that session freely — a trainee holding a
   * roleless backfill row against the cluster could read the cluster's training
   * requests. Membership answers "is this person on the books here"; only a role
   * answers "may they act here".
   *
   * A role may be recorded on the assignment itself or in the legacy UserRole
   * table; either is accepted, since the two models coexist during migration.
   */
  async canAccessOrg(userAccountId: string, organizationId: string): Promise<boolean> {
    const roledAssignment = await this.prisma.organizationAssignment.findFirst({
      where: {
        userAccountId,
        organizationId,
        isActive: true,
        sourceType: { in: MEMBERSHIP_SOURCES },
        roleId: { not: null },
      },
      select: { id: true },
    });
    if (roledAssignment) return true;

    // The legacy role table is authoritative for accounts whose assignments were
    // backfilled without a role.
    const userRole = await this.prisma.userRole.findFirst({
      where: { userAccountId, organizationId },
      select: { roleId: true },
    });
    if (userRole) return true;

    const directPermission = await this.prisma.userPermission.findFirst({
      where: { userAccountId, organizationId, granted: true },
      select: { permissionId: true },
    });
    return !!directPermission;
  }

  /**
   * Returns all active assignment rows for a user (may be multiple orgs).
   */
  async getAssignments(userAccountId: string) {
    return this.prisma.organizationAssignment.findMany({
      where: { userAccountId, isActive: true },
      include: {
        organization: { select: { id: true, nameAr: true, nameEn: true } },
        department: { select: { id: true, nameAr: true, nameEn: true } },
        role: { select: { id: true, code: true, nameAr: true } },
      },
      orderBy: [{ isPrimary: 'desc' }, { startDate: 'desc' }],
    });
  }

  /**
   * Member accounts of an organization, resolved from OrganizationAssignment
   * with a UserOrganization fallback for orgs that have no assignment rows yet.
   *
   * A user may hold several assignments in one org over time, so rows are
   * collapsed to one per account (preferring an active/primary row) before
   * paging — otherwise history would show up as duplicate members.
   *
   * Returns the same fields the legacy UserOrganization join exposed, so callers
   * can build byte-identical responses.
   */
  async findMembershipsInOrg(
    organizationId: string | string[],
    opts: { skip?: number; take?: number } = {},
  ): Promise<{
    members: Array<{
      userAccountId: string; isActive: boolean; isPrimary: boolean; userAccount: any;
      assignedRoles: Array<{ id: string; code: string; nameAr: string }>;
    }>;
    total: number;
  }> {
    const orgIds = Array.isArray(organizationId) ? organizationId : [organizationId];

    const userAccountInclude = {
      include: {
        person: true,
        userRoles: { where: { organizationId: { in: orgIds } }, include: { role: true } },
      },
    } as const;

    const assignments = await this.prisma.organizationAssignment.findMany({
      where: { organizationId: { in: orgIds }, sourceType: { in: MEMBERSHIP_SOURCES } },
      include: { userAccount: userAccountInclude, role: true },
      orderBy: [{ isPrimary: 'desc' }, { startDate: 'asc' }],
    });

    // A representative row decides the membership flags (active/primary), the
    // same as before. Roles are collected separately from every assignment the
    // account holds in this org — the earlier version kept only the
    // representative row's own fields and never exposed `role` at all, so an
    // account whose role lived on OrganizationAssignment (rather than the
    // legacy UserRole table) reached the caller with an empty role list. That
    // is what made every role filter and role badge on the org-members screen
    // silently miss anyone assigned through the newer model.
    const byAccount = new Map<string, { userAccountId: string; isActive: boolean; isPrimary: boolean; userAccount: any }>();
    const rolesByAccount = new Map<string, Map<string, { id: string; code: string; nameAr: string }>>();
    for (const a of assignments) {
      const existing = byAccount.get(a.userAccountId);
      if (!existing || (a.isActive && !existing.isActive) || (a.isPrimary && !existing.isPrimary)) {
        byAccount.set(a.userAccountId, {
          userAccountId: a.userAccountId,
          isActive: a.isActive,
          isPrimary: a.isPrimary,
          userAccount: a.userAccount,
        });
      }
      if (a.role) {
        if (!rolesByAccount.has(a.userAccountId)) rolesByAccount.set(a.userAccountId, new Map());
        rolesByAccount.get(a.userAccountId)!.set(a.role.id, {
          id: a.role.id, code: a.role.code, nameAr: a.role.nameAr,
        });
      }
    }

    // Legacy fallback — resolved per account, not per organisation. The
    // previous version only queried UserOrganization when the *whole org* had
    // zero OrganizationAssignment rows, and used OrganizationAssignment
    // exclusively otherwise. Every membership write (POST /org-members) always
    // creates an OrganizationAssignment row for the new member, so the moment
    // one member existed under the new model, this branch flipped for the
    // entire org and every legacy-only member (no assignment row yet) vanished
    // from the very next list call — the exact "11 members disappear after
    // adding one" symptom. Accounts already covered by an assignment row are
    // left untouched; only accounts with no assignment row fall back to their
    // UserOrganization record, so both sources contribute to the same list.
    const coveredAccountIds = [...byAccount.keys()];
    const legacyUserOrgs = await this.prisma.userOrganization.findMany({
      where: {
        organizationId: { in: orgIds },
        ...(coveredAccountIds.length > 0 ? { userAccountId: { notIn: coveredAccountIds } } : {}),
      },
      include: { userAccount: userAccountInclude },
    });
    for (const uo of legacyUserOrgs) {
      if (byAccount.has(uo.userAccountId)) continue;
      byAccount.set(uo.userAccountId, {
        userAccountId: uo.userAccountId,
        isActive: uo.isActive,
        isPrimary: uo.isPrimary,
        userAccount: uo.userAccount,
      });
      // Legacy membership carries no role of its own; the account's UserRole
      // rows (merged in by the controller) are the only source here.
    }

    let rows: Array<{
      userAccountId: string; isActive: boolean; isPrimary: boolean; userAccount: any;
      assignedRoles: Array<{ id: string; code: string; nameAr: string }>;
    }> = [...byAccount.values()].map((r) => ({
      ...r,
      assignedRoles: [...(rolesByAccount.get(r.userAccountId)?.values() ?? [])],
    }));

    // Stable ordering so paging is deterministic (the legacy query had none).
    rows.sort((a, b) => a.userAccountId.localeCompare(b.userAccountId));
    const total = rows.length;
    const skip = opts.skip ?? 0;
    const take = opts.take ?? rows.length;
    return { members: rows.slice(skip, skip + take), total };
  }

  /**
   * Distinct member-account counts per organization, resolved from
   * OrganizationAssignment with a UserOrganization fallback per organization.
   *
   * Counts distinct accounts rather than assignment rows: a user may hold several
   * assignments in one org over time, and Prisma's relation `_count` would count
   * each of them (plus profile-derived rows) — which is not what the legacy
   * UserOrganization count meant.
   */
  async countMembershipsByOrg(organizationIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (organizationIds.length === 0) return counts;

    const rows = await this.prisma.organizationAssignment.findMany({
      where: { organizationId: { in: organizationIds }, sourceType: { in: MEMBERSHIP_SOURCES } },
      select: { organizationId: true, userAccountId: true },
    });

    const distinct = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!distinct.has(r.organizationId)) distinct.set(r.organizationId, new Set());
      distinct.get(r.organizationId)!.add(r.userAccountId);
    }

    // Legacy accounts are merged in per organization, not only for organizations
    // with zero assignment rows — the same per-org "any assignment row present
    // disqualifies the whole legacy fallback" bug that made org-members list
    // drop legacy-only accounts the moment one member existed under the new
    // model also undercounted here, since this powers the same member-count
    // KPI shown on the directory list and hospital cards.
    const legacyRows = await this.prisma.userOrganization.findMany({
      where: { organizationId: { in: organizationIds } },
      select: { organizationId: true, userAccountId: true },
    });
    for (const r of legacyRows) {
      if (!distinct.has(r.organizationId)) distinct.set(r.organizationId, new Set());
      distinct.get(r.organizationId)!.add(r.userAccountId);
    }

    for (const id of organizationIds) {
      counts.set(id, distinct.get(id)?.size ?? 0);
    }

    return counts;
  }

  /**
   * Mirrors a membership write into OrganizationAssignment so the new model
   * stays in step with the legacy row the caller also writes. Never removes or
   * rewrites legacy data.
   */
  async upsertMembership(params: {
    userAccountId: string;
    organizationId: string;
    isPrimary?: boolean;
    roleId?: string | null;
    departmentId?: string | null;
    createdById?: string;
  }) {
    const existing = await this.prisma.organizationAssignment.findFirst({
      where: {
        userAccountId: params.userAccountId,
        organizationId: params.organizationId,
        sourceType: { in: MEMBERSHIP_SOURCES },
      },
      orderBy: [{ isPrimary: 'desc' }, { startDate: 'asc' }],
    });

    if (existing) {
      return this.prisma.organizationAssignment.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          ...(params.roleId !== undefined && params.roleId !== null ? { roleId: params.roleId } : {}),
          ...(params.departmentId !== undefined ? { departmentId: params.departmentId } : {}),
          updatedById: params.createdById ?? null,
        },
      });
    }

    if (params.isPrimary) {
      await this.prisma.organizationAssignment.updateMany({
        where: { userAccountId: params.userAccountId, isPrimary: true, isActive: true },
        data: { isPrimary: false },
      });
    }

    return this.prisma.organizationAssignment.create({
      data: {
        userAccountId: params.userAccountId,
        organizationId: params.organizationId,
        departmentId: params.departmentId ?? null,
        roleId: params.roleId ?? null,
        assignmentType: 'permanent',
        isPrimary: params.isPrimary ?? false,
        isActive: true,
        sourceType: 'user_organization',
        createdById: params.createdById ?? null,
      },
    });
  }

  /**
   * Activates or deactivates a user's membership assignments in an organization,
   * mirroring the legacy UserOrganization.isActive flag.
   */
  async setMembershipActive(userAccountId: string, organizationId: string, isActive: boolean) {
    return this.prisma.organizationAssignment.updateMany({
      where: { userAccountId, organizationId, sourceType: { in: MEMBERSHIP_SOURCES } },
      data: { isActive, ...(isActive ? {} : { isPrimary: false }) },
    });
  }

  /**
   * Returns all users with an active assignment in an organization,
   * optionally filtered by role code.
   */
  async getMembersInOrg(organizationId: string, roleCode?: string) {
    const assignments = await this.prisma.organizationAssignment.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(roleCode ? { role: { code: roleCode } } : {}),
      },
      include: {
        userAccount: {
          include: {
            person: { select: { nameAr: true, nameEn: true, nationalId: true, phone: true } },
            userRoles: {
              where: { organizationId },
              include: { role: true },
            },
          },
        },
        department: { select: { id: true, nameAr: true } },
        role: { select: { id: true, code: true, nameAr: true } },
      },
    });
    return assignments;
  }

  // ─── Assignment lifecycle ────────────────────────────────────────────────────

  async createAssignment(data: {
    userAccountId: string;
    organizationId: string;
    departmentId?: string;
    roleId?: string;
    assignmentType?: string;
    isPrimary?: boolean;
    startDate?: Date;
    endDate?: Date;
    reason?: string;
    notes?: string;
    createdById?: string;
  }) {
    if (data.isPrimary) {
      // Demote other primary assignments for same user
      await this.prisma.organizationAssignment.updateMany({
        where: { userAccountId: data.userAccountId, isPrimary: true, isActive: true },
        data: { isPrimary: false },
      });
    }

    return this.prisma.organizationAssignment.create({
      data: {
        userAccountId: data.userAccountId,
        organizationId: data.organizationId,
        departmentId: data.departmentId ?? null,
        roleId: data.roleId ?? null,
        assignmentType: data.assignmentType ?? 'permanent',
        isPrimary: data.isPrimary ?? false,
        isActive: true,
        startDate: data.startDate ?? new Date(),
        endDate: data.endDate ?? null,
        reason: data.reason ?? null,
        notes: data.notes ?? null,
        sourceType: 'manual',
        createdById: data.createdById ?? null,
      },
    });
  }

  /**
   * Transfer a user: close the current active primary assignment, open a new one.
   * Writes an AuditLog entry capturing the before/after state.
   */
  async transferUser(params: {
    userAccountId: string;
    toOrganizationId: string;
    toDepartmentId?: string;
    toRoleId?: string;
    assignmentType?: string;
    transferDate?: Date;
    reason: string;
    performedById: string;
    notes?: string;
  }) {
    const current = await this.prisma.organizationAssignment.findFirst({
      where: { userAccountId: params.userAccountId, isPrimary: true, isActive: true },
    });

    return this.prisma.$transaction(async (tx) => {
      if (current) {
        await tx.organizationAssignment.update({
          where: { id: current.id },
          data: { isActive: false, isPrimary: false, endDate: params.transferDate ?? new Date() },
        });
      }

      const next = await tx.organizationAssignment.create({
        data: {
          userAccountId: params.userAccountId,
          organizationId: params.toOrganizationId,
          departmentId: params.toDepartmentId ?? null,
          roleId: params.toRoleId ?? null,
          assignmentType: params.assignmentType ?? 'permanent',
          isPrimary: true,
          isActive: true,
          startDate: params.transferDate ?? new Date(),
          reason: params.reason,
          notes: params.notes ?? null,
          sourceType: 'manual',
          createdById: params.performedById,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'user_transferred',
          entityType: 'OrganizationAssignment',
          entityId: next.id,
          organizationId: params.toOrganizationId,
          actorId: params.performedById,
          oldValues: current
            ? ({
                organizationId: current.organizationId,
                departmentId: current.departmentId,
                roleId: current.roleId,
              } as object)
            : undefined,
          newValues: {
            organizationId: params.toOrganizationId,
            departmentId: params.toDepartmentId ?? null,
            roleId: params.toRoleId ?? null,
            reason: params.reason,
          },
        },
      });

      return next;
    });
  }

  // ─── Backfill ────────────────────────────────────────────────────────────────

  /**
   * Backfills OrganizationAssignment from the four legacy org sources:
   * UserOrganization, UserRole, TrainerProfile, TraineeProfile.
   *
   * Idempotent — keyed on (userAccountId, organizationId), so re-running makes
   * no further changes. Never writes to or deletes any legacy row.
   *
   * Exactly one active assignment per user is marked primary, chosen by
   * replaying auth.service's own resolution (first isPrimary among active
   * UserOrganization rows, else the first) so that no user's active
   * organization changes as a result of the migration.
   */
  async backfill(): Promise<{
    created: number;
    skipped: number;
    primariesSet: number;
    unassignableTraineeProfiles: string[];
  }> {
    this.logger.log('Starting OrganizationAssignment backfill...');

    const existing = await this.prisma.organizationAssignment.findMany({
      select: { userAccountId: true, organizationId: true },
    });
    const seen = new Set(existing.map((e) => `${e.userAccountId}|${e.organizationId}`));

    let created = 0;
    let skipped = 0;

    const createIfNew = async (data: {
      userAccountId: string;
      organizationId: string;
      departmentId?: string | null;
      roleId?: string | null;
      isActive: boolean;
      startDate: Date;
      endDate?: Date | null;
      sourceType: string;
      sourceId?: string | null;
    }) => {
      const key = `${data.userAccountId}|${data.organizationId}`;
      if (seen.has(key)) {
        skipped++;
        return;
      }
      seen.add(key);
      await this.prisma.organizationAssignment.create({
        data: {
          userAccountId: data.userAccountId,
          organizationId: data.organizationId,
          departmentId: data.departmentId ?? null,
          roleId: data.roleId ?? null,
          assignmentType: 'permanent',
          isPrimary: false, // resolved in a dedicated pass below
          isActive: data.isActive,
          startDate: data.startDate,
          endDate: data.endDate ?? null,
          sourceType: data.sourceType,
          sourceId: data.sourceId ?? null,
        },
      });
      created++;
    };

    // Role lookup: (userAccountId, organizationId) -> roleId
    const allRoles = await this.prisma.userRole.findMany();
    const roleFor = (userAccountId: string, organizationId: string) =>
      allRoles.find((r) => r.userAccountId === userAccountId && r.organizationId === organizationId)?.roleId ?? null;

    // Department lookup from TrainerProfile: (userAccountId, organizationId) -> departmentId
    const trainerProfiles = await this.prisma.trainerProfile.findMany({
      include: { person: { select: { userAccounts: { select: { id: true } } } } },
    });
    const deptFor = (userAccountId: string, organizationId: string) =>
      trainerProfiles.find(
        (tp) =>
          tp.organizationId === organizationId &&
          tp.person.userAccounts.some((ua) => ua.id === userAccountId),
      )?.departmentId ?? null;

    // ── Source 1: UserOrganization (primary membership record) ──
    const userOrgs = await this.prisma.userOrganization.findMany();
    for (const uo of userOrgs) {
      await createIfNew({
        userAccountId: uo.userAccountId,
        organizationId: uo.organizationId,
        departmentId: deptFor(uo.userAccountId, uo.organizationId),
        roleId: roleFor(uo.userAccountId, uo.organizationId),
        isActive: uo.isActive,
        startDate: uo.joinedAt,
        endDate: uo.leftAt,
        sourceType: 'user_organization',
        sourceId: uo.id,
      });
    }

    // ── Source 2: UserRole — covers users holding a role in an org with no
    //    UserOrganization row (otherwise silently dropped by the migration) ──
    for (const ur of allRoles) {
      await createIfNew({
        userAccountId: ur.userAccountId,
        organizationId: ur.organizationId,
        departmentId: deptFor(ur.userAccountId, ur.organizationId),
        roleId: ur.roleId,
        isActive: true,
        startDate: ur.assignedAt,
        sourceType: 'user_role',
      });
    }

    // ── Source 3: TrainerProfile — trainers whose profile org has no UO row ──
    for (const tp of trainerProfiles) {
      for (const ua of tp.person.userAccounts) {
        await createIfNew({
          userAccountId: ua.id,
          organizationId: tp.organizationId,
          departmentId: tp.departmentId,
          roleId: roleFor(ua.id, tp.organizationId),
          isActive: tp.isActive,
          startDate: tp.createdAt,
          sourceType: 'trainer_profile',
          sourceId: tp.id,
        });
      }
    }

    // ── Source 4: TraineeProfile ──
    const traineeProfiles = await this.prisma.traineeProfile.findMany({
      include: { person: { select: { userAccounts: { select: { id: true } } } } },
    });
    const unassignableTraineeProfiles: string[] = [];
    for (const tp of traineeProfiles) {
      if (tp.person.userAccounts.length === 0) {
        // No login account exists, so there is nothing to assign. The
        // TraineeProfile keeps its own organizationId and stays reachable.
        unassignableTraineeProfiles.push(tp.id);
        continue;
      }
      for (const ua of tp.person.userAccounts) {
        await createIfNew({
          userAccountId: ua.id,
          organizationId: tp.organizationId,
          roleId: roleFor(ua.id, tp.organizationId),
          isActive: tp.deletedAt === null,
          startDate: tp.createdAt,
          sourceType: 'trainee_profile',
          sourceId: tp.id,
        });
      }
    }

    // ── Primary resolution ──
    // Replays auth.service.login's own rule so each user's active organization
    // is byte-for-byte what it resolves to today.
    const accounts = await this.prisma.userAccount.findMany({
      include: { organizations: { where: { isActive: true } } },
    });
    let primariesSet = 0;
    for (const acc of accounts) {
      const legacyPrimary =
        acc.organizations.find((uo) => uo.isPrimary) ?? acc.organizations[0] ?? null;

      const assignments = await this.prisma.organizationAssignment.findMany({
        where: { userAccountId: acc.id, isActive: true },
        orderBy: { startDate: 'asc' },
      });
      if (assignments.length === 0) continue;

      const target =
        (legacyPrimary && assignments.find((a) => a.organizationId === legacyPrimary.organizationId)) ??
        assignments[0];

      await this.prisma.organizationAssignment.updateMany({
        where: { userAccountId: acc.id, isPrimary: true, id: { not: target.id } },
        data: { isPrimary: false },
      });
      if (!target.isPrimary) {
        await this.prisma.organizationAssignment.update({
          where: { id: target.id },
          data: { isPrimary: true },
        });
      }
      primariesSet++;
    }

    this.logger.log(
      `Backfill complete: ${created} created, ${skipped} skipped, ${primariesSet} primaries set, ` +
        `${unassignableTraineeProfiles.length} trainee profiles without a login account.`,
    );
    return { created, skipped, primariesSet, unassignableTraineeProfiles };
  }
}
