import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailChannelService } from './channels/email-channel.service';
import { PushChannelService } from './channels/push-channel.service';
import { NotificationChannel } from './channels/notification-channel.interface';
import { Capability, rolesWithCapability } from '../../common/authz/capabilities';
import { ScopeContext } from '../../common/authz/scope-context.service';

export type NotificationChannelName = 'in_app' | 'email' | 'push';

export interface CreateNotificationPayload {
  organizationId: string;
  userId: string;
  titleAr: string;
  titleEn?: string;
  bodyAr?: string;
  bodyEn?: string;
  type: string;
  referenceType?: string;
  referenceId?: string;
  sentVia?: string;
  channels?: NotificationChannelName[];
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private emailChannel: EmailChannelService,
    private pushChannel: PushChannelService,
  ) {}

  async create(payload: CreateNotificationPayload) {
    if (payload.referenceId && payload.referenceType) {
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId: payload.userId,
          type: payload.type,
          referenceType: payload.referenceType,
          referenceId: payload.referenceId,
        },
      });
      if (existing) return existing;
    }

    const notification = await this.prisma.notification.create({
      data: {
        organizationId: payload.organizationId,
        userId: payload.userId,
        titleAr: payload.titleAr,
        titleEn: payload.titleEn || '',
        bodyAr: payload.bodyAr,
        bodyEn: payload.bodyEn,
        type: payload.type,
        referenceType: payload.referenceType,
        referenceId: payload.referenceId,
        sentVia: payload.channels?.join(',') || payload.sentVia || 'in_app',
      },
    });

    await this.fanOut(payload);
    return notification;
  }

  /**
   * Delivers to the external channels requested by the caller. Never throws —
   * a failed email/push must not roll back the in-app notification or the
   * workflow transition that triggered it.
   */
  private async fanOut(payload: CreateNotificationPayload) {
    const requested = payload.channels || [];
    const externals: NotificationChannel[] = [];
    if (requested.includes('email')) externals.push(this.emailChannel);
    if (requested.includes('push')) externals.push(this.pushChannel);
    if (externals.length === 0) return;

    const account = await this.prisma.userAccount.findUnique({
      where: { id: payload.userId },
      select: { email: true },
    });

    for (const channel of externals) {
      if (!channel.isConfigured()) continue;
      try {
        await channel.send({
          userId: payload.userId,
          email: account?.email,
          title: payload.titleAr,
          body: payload.bodyAr,
          data: payload.referenceId
            ? { referenceType: payload.referenceType || '', referenceId: payload.referenceId }
            : undefined,
        });
      } catch (e) {
        this.logger.warn(`تعذر الإرسال عبر قناة ${channel.name}: ${(e as Error).message}`);
      }
    }
  }

  async createBulk(payloads: CreateNotificationPayload[]) {
    const results: any[] = [];
    for (const payload of payloads) {
      const n = await this.create(payload);
      results.push(n);
    }
    return results;
  }

  async notifyOrgUsers(orgId: string, roleCode: string, notification: Omit<CreateNotificationPayload, 'userId' | 'organizationId'>) {
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        organizationId: orgId,
        role: { code: roleCode },
      },
      select: { userAccountId: true },
    });

    const payloads: CreateNotificationPayload[] = userRoles.map((ur) => ({
      ...notification,
      organizationId: orgId,
      userId: ur.userAccountId,
    }));

    return this.createBulk(payloads);
  }

  /**
   * Notifies whoever can actually act on the thing being announced, identified by
   * capability rather than by role code.
   *
   * Hard-coding a role code meant the notification and the authority to respond
   * could drift apart, and they did: new training requests were announced to
   * `cluster_administrator` alone, so `training_director` — the role that owns
   * request review — was never told about the work waiting for it. Addressing the
   * capability keeps the two aligned by construction, including for roles added
   * later.
   *
   * Roles are read from both role models, since a user assigned through
   * OrganizationAssignment is no less entitled to the notification.
   */
  async notifyCapableUsers(
    orgId: string,
    capability: Capability,
    notification: Omit<CreateNotificationPayload, 'userId' | 'organizationId'>,
  ) {
    const grantingRoles = rolesWithCapability(capability);
    if (grantingRoles.length === 0) return [];

    const [userRoles, assignments] = await Promise.all([
      this.prisma.userRole.findMany({
        where: { organizationId: orgId, role: { code: { in: grantingRoles } } },
        select: { userAccountId: true },
      }),
      this.prisma.organizationAssignment.findMany({
        where: {
          organizationId: orgId,
          isActive: true,
          role: { code: { in: grantingRoles } },
        },
        select: { userAccountId: true },
      }),
    ]);

    const recipients = new Set<string>([
      ...userRoles.map((r) => r.userAccountId),
      ...assignments.map((a) => a.userAccountId),
    ]);

    if (recipients.size === 0) {
      // Worth surfacing: a workflow step just completed with nobody authorised to
      // pick it up, which is a configuration problem rather than a code one.
      this.logger.warn(
        `No user in organisation ${orgId} holds ${capability} — notification "${notification.titleAr}" has no recipient`,
      );
      return [];
    }

    return this.createBulk(
      [...recipients].map((userId) => ({ ...notification, organizationId: orgId, userId })),
    );
  }

  /**
   * Notifications visible from the session's *current* context.
   *
   * Two filters matter here, and both exist to stop the bell disagreeing with the
   * screen it links to.
   *
   * Scope: a notification row carries the organisationId it was written for. That
   * frozen value is not the session's scope — an account that is a member of two
   * clusters was being shown notifications belonging to the cluster it was not
   * currently working in, while the requests list correctly showed the active one.
   * Filtering on `visibleOrgIds` makes both answer to the same context.
   *
   * Liveness: a notification pointing at a deleted record is noise that can never
   * be reconciled with any list, because the thing it announces no longer exists.
   * Production holds eight such rows for TrainingRequest ids that are simply gone.
   * They are excluded from both the feed and the count rather than deleted, so the
   * rows remain available for the migration report.
   */
  async findAll(
    userId: string,
    scope: ScopeContext,
    page = 1,
    limit = 20,
    type?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { userId, ...this.scopeWhere(scope) };
    if (type) where.type = type;

    const candidates = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const live = await this.filterLiveReferences(candidates);

    return {
      data: live.slice(skip, skip + limit),
      meta: {
        total: live.length,
        page,
        limit,
        totalPages: Math.ceil(live.length / limit),
        // Surfaced deliberately: a non-zero value here is a data-integrity signal,
        // not something to hide behind a corrected count.
        suppressedStaleCount: candidates.length - live.length,
      },
    };
  }

  async getUnreadCount(userId: string, scope: ScopeContext) {
    const unread = await this.prisma.notification.findMany({
      where: { userId, isRead: false, ...this.scopeWhere(scope) },
      select: { id: true, referenceType: true, referenceId: true },
    });
    const live = await this.filterLiveReferences(unread);
    return live.length;
  }

  private scopeWhere(scope: ScopeContext): Record<string, unknown> {
    if (!scope || !scope.visibleOrgIds || scope.visibleOrgIds === null) return {};
    // Notification.organizationId is non-nullable, so an `organizationId: null`
    // branch is not a valid filter — Prisma rejects it with "Argument
    // organizationId is missing" rather than matching org-less rows.
    //
    // The ids are also filtered defensively: an empty or malformed entry inside
    // visibleOrgIds would otherwise reach Prisma as part of the `in` list, and an
    // empty resulting list must fall back to the unscoped `{}` rather than
    // `{ in: [] }`, which would silently match nothing.
    const validOrgIds = scope.visibleOrgIds.filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    if (validOrgIds.length === 0) return {};
    return { organizationId: { in: validOrgIds } };
  }

  /**
   * Drops notifications whose referenced entity has gone. Grouped by reference
   * type so this costs one query per type present, not one per notification.
   * Unrecognised reference types are kept — absence of a check is not evidence of
   * a dangling row.
   */
  private async filterLiveReferences<
    T extends { referenceType: string | null; referenceId: string | null },
  >(notifications: T[]): Promise<T[]> {
    const idsByType = new Map<string, Set<string>>();
    for (const n of notifications) {
      if (!n.referenceType || !n.referenceId) continue;
      if (!idsByType.has(n.referenceType)) idsByType.set(n.referenceType, new Set());
      idsByType.get(n.referenceType)!.add(n.referenceId);
    }
    if (idsByType.size === 0) return notifications;

    const liveByType = new Map<string, Set<string>>();
    for (const [refType, ids] of idsByType) {
      const idList = [...ids];
      let found: Array<{ id: string }> | null = null;

      try {
        switch (refType) {
          case 'TrainingRequest':
            found = await this.prisma.trainingRequest.findMany({
              where: { id: { in: idList } }, select: { id: true },
            });
            break;
          case 'TrainingRequestTrainee':
            found = await this.prisma.trainingRequestTrainee.findMany({
              where: { id: { in: idList } }, select: { id: true },
            });
            break;
          case 'AcademicIntake':
            found = await this.prisma.academicIntake.findMany({
              where: { id: { in: idList } }, select: { id: true },
            });
            break;
          case 'TraineeProfile':
            found = await this.prisma.traineeProfile.findMany({
              where: { id: { in: idList } }, select: { id: true },
            });
            break;
          case 'TraineeAllocation':
            found = await this.prisma.traineeAllocation.findMany({
              where: { id: { in: idList } }, select: { id: true },
            });
            break;
          // Recipient rows cascade when an event is deleted, but the
          // notifications do not — without this a deleted event would leave its
          // notifications counted in the unread badge with nothing behind them.
          case 'TrainingEvent':
            found = await this.prisma.trainingEvent.findMany({
              where: { id: { in: idList } }, select: { id: true },
            });
            break;
          default:
            // Unchecked reference type — treat every id as live.
            liveByType.set(refType, ids);
            continue;
        }
        liveByType.set(refType, new Set((found || []).map((r) => r.id)));
      } catch (e) {
        this.logger.warn(`Error verifying reference type ${refType}: ${(e as Error).message}`);
        liveByType.set(refType, ids);
      }
    }

    return notifications.filter((n) => {
      if (!n.referenceType || !n.referenceId) return true;
      const live = liveByType.get(n.referenceType);
      return !live || live.has(n.referenceId);
    });
  }

  /**
   * Diagnostic for the migration report: notifications whose referenced entity is
   * missing. Read-only — it never deletes.
   */
  async findStaleReferences() {
    const all = await this.prisma.notification.findMany({
      where: { referenceId: { not: null } },
      select: {
        id: true, type: true, referenceType: true, referenceId: true,
        organizationId: true, userId: true, isRead: true, createdAt: true,
      },
    });
    const live = await this.filterLiveReferences(all);
    const liveIds = new Set(live.map((n) => n.id));
    return all.filter((n) => !liveIds.has(n.id));
  }

  async isOwnedBy(notificationId: string, userAccountId: string): Promise<boolean> {
    const n = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { userId: true },
    });
    return n?.userId === userAccountId;
  }

  async markAsRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }
}
