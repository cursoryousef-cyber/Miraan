import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../../common/interfaces';
import { ScopeContext, ScopeContextService } from '../../common/authz';

/**
 * Operational training activity — the unified layer behind urgent calls,
 * courses, lectures, sessions, videos, meetings, tasks and announcements.
 *
 * What it is not: an assignment. Assignment and Rotation decide who belongs to
 * whom; an event is something that happens *between* people that relationship
 * already connects. Nothing here writes to Rotation, TraineeAllocation or any
 * organisation membership — those relations are read to decide who may be
 * addressed, never modified. TrainerCall is untouched and keeps its own flow.
 */

export const EVENT_TYPES = [
  'urgent_call',
  'training_course',
  'lecture',
  'training_session',
  'video',
  'meeting',
  'task',
  'announcement',
] as const;

export const RESPONSE_MODES = [
  'information_only',
  'acknowledge',
  'accept_decline',
  'attendance',
  'arrival',
  'completion',
] as const;

export const AUDIENCE_TYPES = [
  'all_trainers',
  'all_trainees',
  'selected_trainers',
  'selected_trainees',
  'my_trainees',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export type ResponseMode = (typeof RESPONSE_MODES)[number];
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

export const RECIPIENT_STATUS = {
  PENDING: 'pending',
  ACKNOWLEDGED: 'acknowledged',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  ATTENDING: 'attending',
  ARRIVED: 'arrived',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
} as const;

/**
 * Which actions a response mode admits. An action absent from its event's mode
 * is refused regardless of who asks: an announcement cannot collect arrivals,
 * and an information-only event collects nothing at all.
 */
const MODE_ACTIONS: Record<ResponseMode, string[]> = {
  information_only: [],
  acknowledge: ['acknowledge'],
  accept_decline: ['accept', 'decline'],
  attendance: ['accept', 'decline', 'attend', 'complete'],
  arrival: ['acknowledge', 'arrive', 'complete'],
  completion: ['accept', 'decline', 'complete'],
};

/**
 * Legal predecessors for each recipient action. Confirmation is deliberately
 * absent — it is not a recipient action at all, and lives on the operator path.
 */
const ACTION_PRECONDITIONS: Record<string, string[]> = {
  acknowledge: [RECIPIENT_STATUS.PENDING],
  accept: [RECIPIENT_STATUS.PENDING, RECIPIENT_STATUS.ACKNOWLEDGED],
  decline: [RECIPIENT_STATUS.PENDING, RECIPIENT_STATUS.ACKNOWLEDGED],
  attend: [RECIPIENT_STATUS.ACCEPTED],
  arrive: [RECIPIENT_STATUS.PENDING, RECIPIENT_STATUS.ACKNOWLEDGED],
  complete: [
    RECIPIENT_STATUS.ACCEPTED,
    RECIPIENT_STATUS.ATTENDING,
    RECIPIENT_STATUS.CONFIRMED,
  ],
};

export interface CreateEventInput {
  eventType: string;
  title: string;
  description?: string;
  priority?: string;
  responseMode: string;
  audienceType: string;
  /** Only for the `selected_*` audiences. */
  recipientProfileIds?: string[];
  startAt?: string;
  endAt?: string;
  /** Optional training context. All three are read-only associations. */
  rotationId?: string;
  scheduleId?: string;
  resourceFileId?: string;
}

@Injectable()
export class TrainingEventsService {
  constructor(
    private prisma: PrismaService,
    private scopeContext: ScopeContextService,
  ) {}

  // ── Creation ───────────────────────────────────────────────────────────────

  /**
   * Resolve → validate → create. The order matters and is the lesson from the
   * call-launch defect: an event created before its audience is validated
   * leaves an orphan behind when validation then fails. Nothing is written
   * until every recipient has been proved reachable.
   */
  async create(user: IAuthenticatedUser, scope: ScopeContext, dto: CreateEventInput) {
    this.assertEnum(dto.eventType, EVENT_TYPES, 'نوع الفعالية');
    this.assertEnum(dto.responseMode, RESPONSE_MODES, 'نمط الاستجابة');
    this.assertEnum(dto.audienceType, AUDIENCE_TYPES, 'نوع الجمهور');

    if (!dto.title?.trim()) {
      throw new BadRequestException('عنوان الفعالية إلزامي');
    }

    const startAt = dto.startAt ? new Date(dto.startAt) : null;
    const endAt = dto.endAt ? new Date(dto.endAt) : null;
    if (startAt && Number.isNaN(startAt.getTime())) {
      throw new BadRequestException('تاريخ بداية الفعالية غير صالح');
    }
    if (endAt && Number.isNaN(endAt.getTime())) {
      throw new BadRequestException('تاريخ نهاية الفعالية غير صالح');
    }
    if (startAt && endAt && startAt >= endAt) {
      throw new BadRequestException('تاريخ البداية يجب أن يسبق تاريخ النهاية');
    }

    // Checked before anything is written, like the audience below it: a link
    // that fails validation must not leave a half-created event behind.
    await this.assertContextLinksUsable(scope, dto);

    const recipients = await this.resolveRecipients(user, scope, dto);
    if (recipients.length === 0) {
      throw new BadRequestException('لا يوجد مستلمون مطابقون لهذا الجمهور');
    }

    const event = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trainingEvent.create({
        data: {
          organizationId: scope.organizationId,
          createdById: user.accountId,
          eventType: dto.eventType,
          title: dto.title.trim(),
          description: dto.description,
          priority: dto.priority ?? 'normal',
          responseMode: dto.responseMode,
          audienceType: dto.audienceType,
          rotationId: dto.rotationId ?? null,
          scheduleId: dto.scheduleId ?? null,
          resourceFileId: dto.resourceFileId ?? null,
          startAt,
          endAt,
          status: 'sent',
          sentAt: new Date(),
        },
      });

      await tx.trainingEventRecipient.createMany({
        data: recipients.map((r) => ({
          eventId: created.id,
          recipientAccountId: r.accountId,
          trainerProfileId: r.trainerProfileId,
          traineeProfileId: r.traineeProfileId,
        })),
        // The unique index is the real guard; this keeps a retry from erroring.
        skipDuplicates: true,
      });

      // Notifications go to exactly the resolved set — the same list the
      // recipient rows were built from, so no one outside the event is told.
      await tx.notification.createMany({
        data: recipients.map((r) => ({
          // The recipient's own organisation, not the sender's. NotificationService
          // filters a reader's notifications by *their* visibleOrgIds, so a
          // cluster-stamped row is invisible to the hospital trainee it was
          // written for — the notification existed but never reached a badge or
          // a list. Falls back to the sender's organisation only when a
          // recipient carries none.
          organizationId: r.organizationId ?? scope.organizationId,
          userId: r.accountId,
          titleAr: `فعالية تدريبية جديدة: ${dto.title.trim()}`,
          bodyAr: dto.description ?? 'لديك فعالية تدريبية جديدة تتطلب اطلاعك',
          type: 'training_event',
          referenceType: 'TrainingEvent',
          referenceId: created.id,
          sentVia: 'in_app',
        })),
        skipDuplicates: true,
      });

      await tx.auditLog.create({
        data: {
          organizationId: scope.organizationId,
          actorId: user.accountId,
          action: 'training_event.created',
          entityType: 'TrainingEvent',
          entityId: created.id,
          newValues: {
            eventType: dto.eventType,
            audienceType: dto.audienceType,
            responseMode: dto.responseMode,
            recipientCount: recipients.length,
          },
        },
      });

      return created;
    });

    return { success: true, data: { event, recipientCount: recipients.length } };
  }

  // ── Audience resolution ────────────────────────────────────────────────────

  /**
   * Turns an audience choice into concrete accounts, bounded by what the
   * caller may actually address. The audience is a *request*; this is the
   * authority. A cluster session resolves across its own cluster, a hospital
   * session across its own hospital, and a trainer only across the trainees
   * assigned to them — the same rotation/allocation link the logbook scope
   * check treats as ownership.
   */
  private async resolveRecipients(
    user: IAuthenticatedUser,
    scope: ScopeContext,
    dto: CreateEventInput,
  ): Promise<
    Array<{
      accountId: string;
      trainerProfileId?: string;
      traineeProfileId?: string;
      organizationId?: string;
    }>
  > {
    const isTrainer = user.roles?.includes('trainer') ?? false;

    // A trainer addresses their own trainees and nothing else — regardless of
    // which audience they asked for.
    if (isTrainer && !this.hasOrgWideReach(scope)) {
      if (dto.audienceType === 'all_trainers' || dto.audienceType === 'selected_trainers') {
        throw new ForbiddenException('لا يمكن للمدرب إرسال فعالية إلى المدربين');
      }
      return this.resolveOwnTrainees(user, dto.recipientProfileIds);
    }

    // Everyone else is bounded by their organisational visibility. A platform
    // session (null) is unrestricted by design and is not widened here.
    const orgFilter =
      scope.visibleOrgIds === null ? {} : { organizationId: { in: scope.visibleOrgIds } };

    switch (dto.audienceType) {
      case 'all_trainers':
        return this.loadTrainers({ ...orgFilter });
      case 'all_trainees':
        return this.loadTrainees({ ...orgFilter });
      case 'selected_trainers': {
        const ids = this.requireSelection(dto.recipientProfileIds);
        const found = await this.loadTrainers({ ...orgFilter, id: { in: ids } });
        this.assertAllSelected(found.length, ids.length, 'المدربين');
        return found;
      }
      case 'selected_trainees':
      case 'my_trainees': {
        const ids = this.requireSelection(dto.recipientProfileIds);
        const found = await this.loadTrainees({ ...orgFilter, id: { in: ids } });
        this.assertAllSelected(found.length, ids.length, 'المتدربين');
        return found;
      }
      default:
        throw new BadRequestException('نوع الجمهور غير مدعوم لهذا الدور');
    }
  }

  /** Cluster/hospital/platform sessions address organisations; trainers do not. */
  private hasOrgWideReach(scope: ScopeContext): boolean {
    return (
      scope.visibleOrgIds === null ||
      scope.roles.some((r) =>
        [
          'platform_owner',
          'system_admin',
          'holding_administrator',
          'cluster_manager',
          'cluster_administrator',
          'training_director',
          'hospital_training_admin',
        ].includes(r),
      )
    );
  }

  private async resolveOwnTrainees(user: IAuthenticatedUser, selection?: string[]) {
    let trainer = await this.prisma.trainerProfile.findFirst({
      where: {
        OR: [
          { person: { userAccounts: { some: { id: user.accountId } } } },
          ...(user.personId ? [{ personId: user.personId }] : []),
        ],
      },
      select: { id: true },
    });
    if (!trainer && user.roles?.includes('trainer') && user.personId) {
      trainer = await this.prisma.trainerProfile.create({
        data: {
          personId: user.personId,
          organizationId: user.organizationId,
          maxTrainees: 5,
        },
        select: { id: true },
      });
    }
    if (!trainer) throw new ForbiddenException('لا يوجد ملف مدرب مرتبط بهذا الحساب');

    const [byRotation, byAllocation, bySession] = await Promise.all([
      this.prisma.rotation.findMany({
        where: { trainerProfileId: trainer.id, status: { in: ['scheduled', 'active'] } },
        select: { traineeProfileId: true },
      }),
      this.prisma.traineeAllocation.findMany({
        where: { trainerProfileId: trainer.id, status: 'open' },
        select: { traineeProfileId: true },
      }),
      this.prisma.scheduleSession?.findMany
        ? this.prisma.scheduleSession.findMany({
            where: { trainerProfileId: trainer.id, status: { in: ['scheduled', 'in_progress', 'completed'] } },
            select: { traineeProfileId: true },
          })
        : Promise.resolve([]),
    ]);
    const ownedIds = [
      ...new Set(
        [
          ...byRotation.map((r) => r.traineeProfileId),
          ...byAllocation.map((a) => a.traineeProfileId),
          ...bySession.map((s) => s.traineeProfileId),
        ].filter((id): id is string => !!id),
      ),
    ];

    if (selection?.length) {
      // Named recipients are refused outright rather than filtered away, so a
      // trainer is told they addressed someone else's trainee.
      const requested = [...new Set(selection)];
      if (!requested.every((id) => ownedIds.includes(id))) {
        throw new ForbiddenException('لا يمكنك إرسال فعالية لمتدرب غير مسند إليك');
      }
      return this.loadTrainees({ id: { in: requested } });
    }
    if (ownedIds.length === 0) return [];
    return this.loadTrainees({ id: { in: ownedIds } });
  }

  private async loadTrainees(where: Record<string, unknown>) {
    const rows = await this.prisma.traineeProfile.findMany({
      where: { ...where, isLocked: false },
      select: {
        id: true,
        organizationId: true,
        person: { select: { userAccounts: { select: { id: true }, take: 1 } } },
      },
    });
    return rows
      .filter((r) => r.person?.userAccounts?.[0]?.id)
      .map((r) => ({
        accountId: r.person!.userAccounts[0].id,
        traineeProfileId: r.id,
        organizationId: r.organizationId,
      }));
  }

  private async loadTrainers(where: Record<string, unknown>) {
    const rows = await this.prisma.trainerProfile.findMany({
      where,
      select: {
        id: true,
        organizationId: true,
        person: { select: { userAccounts: { select: { id: true }, take: 1 } } },
      },
    });
    return rows
      .filter((r) => r.person?.userAccounts?.[0]?.id)
      .map((r) => ({
        accountId: r.person!.userAccounts[0].id,
        trainerProfileId: r.id,
        organizationId: r.organizationId,
      }));
  }

  private requireSelection(ids?: string[]): string[] {
    if (!ids?.length) {
      throw new BadRequestException('يجب تحديد مستلم واحد على الأقل');
    }
    return [...new Set(ids)];
  }

  private assertAllSelected(found: number, asked: number, label: string) {
    if (found !== asked) {
      throw new ForbiddenException(`أحد ${label} المحددين خارج نطاق صلاحياتك`);
    }
  }

  private assertEnum(value: string, allowed: readonly string[], label: string) {
    if (!allowed.includes(value)) {
      throw new BadRequestException(`${label} غير مدعوم: ${value}`);
    }
  }

  /**
   * Optional training-context links. All three are read-only associations: the
   * event points at a rotation, a schedule or a stored file, and never writes to
   * any of them. Each id arrives from the client, so each is resolved from the
   * database and checked against the caller's own organisational visibility —
   * naming another hospital's rotation or another organisation's file is
   * refused rather than silently attached.
   *
   * All three stay optional by design: a cluster-wide announcement has no
   * rotation and no schedule, and forcing one would invent a rule nobody asked
   * for.
   */
  private async assertContextLinksUsable(
    scope: ScopeContext,
    links: { rotationId?: string; scheduleId?: string; resourceFileId?: string },
  ): Promise<void> {
    const visible = scope.visibleOrgIds;
    const inScope = (orgId: string) => visible === null || visible.includes(orgId);

    if (links.rotationId) {
      const rotation = await this.prisma.rotation.findUnique({
        where: { id: links.rotationId },
        select: { organizationId: true },
      });
      if (!rotation) throw new NotFoundException('الروتيشن المحدد غير موجود');
      if (!inScope(rotation.organizationId)) {
        throw new ForbiddenException('هذا الروتيشن خارج نطاق صلاحياتك التنظيمية');
      }
    }

    if (links.scheduleId) {
      const schedule = await this.prisma.trainingSchedule.findUnique({
        where: { id: links.scheduleId },
        select: { organizationId: true },
      });
      if (!schedule) throw new NotFoundException('الجدول المحدد غير موجود');
      if (!inScope(schedule.organizationId)) {
        throw new ForbiddenException('هذا الجدول خارج نطاق صلاحياتك التنظيمية');
      }
    }

    if (links.resourceFileId) {
      const file = await this.prisma.storedFile.findUnique({
        where: { id: links.resourceFileId },
        select: { organizationId: true, deletedAt: true, isPublic: true },
      });
      if (!file || file.deletedAt) throw new NotFoundException('الملف المحدد غير موجود');
      // A file shared platform-wide is reachable by anyone; everything else is
      // bounded by the caller's own organisations.
      if (!file.isPublic && !inScope(file.organizationId)) {
        throw new ForbiddenException('هذا الملف خارج نطاق صلاحياتك التنظيمية');
      }
    }
  }

  /**
   * The people this caller may address, for the audience picker and for the
   * "will reach N recipients" preview.
   *
   * Deliberately built from the same reach rules `create` enforces rather than
   * from the general trainer/trainee listings: if the picker drew on a
   * different query it could offer someone the create path would then reject,
   * and the two would drift apart silently. One source, so the list shown and
   * the list allowed cannot disagree.
   */
  async audienceOptions(user: IAuthenticatedUser, scope: ScopeContext) {
    const isTrainer = user.roles?.includes('trainer') ?? false;

    if (isTrainer && !this.hasOrgWideReach(scope)) {
      const own = await this.resolveOwnTrainees(user);
      const ids = own.map((o) => o.traineeProfileId!).filter(Boolean);
      return {
        data: {
          canAddressTrainers: false,
          trainers: [],
          trainees: await this.describeTrainees(ids),
        },
      };
    }

    const orgFilter =
      scope.visibleOrgIds === null ? {} : { organizationId: { in: scope.visibleOrgIds } };
    const [trainers, trainees] = await Promise.all([
      this.prisma.trainerProfile.findMany({
        where: orgFilter,
        select: {
          id: true,
          organization: { select: { nameAr: true } },
          person: { select: { nameAr: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.traineeProfile.findMany({
        where: { ...orgFilter, isLocked: false },
        select: {
          id: true,
          organization: { select: { nameAr: true } },
          person: { select: { nameAr: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: {
        canAddressTrainers: true,
        trainers: trainers.map((t) => ({
          id: t.id,
          nameAr: t.person?.nameAr ?? 'بدون اسم',
          orgAr: t.organization?.nameAr ?? '',
        })),
        trainees: trainees.map((t) => ({
          id: t.id,
          nameAr: t.person?.nameAr ?? 'بدون اسم',
          orgAr: t.organization?.nameAr ?? '',
        })),
      },
    };
  }

  private async describeTrainees(ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await this.prisma.traineeProfile.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        organization: { select: { nameAr: true } },
        person: { select: { nameAr: true } },
      },
    });
    return rows.map((t) => ({
      id: t.id,
      nameAr: t.person?.nameAr ?? 'بدون اسم',
      orgAr: t.organization?.nameAr ?? '',
    }));
  }

  // ── Recipient responses ────────────────────────────────────────────────────

  /**
   * A recipient acting on their own row. The row is looked up by event *and*
   * by the caller's own account, so there is no way to act on someone else's
   * participation — an id in the request cannot redirect it.
   */
  async respond(eventId: string, user: IAuthenticatedUser, action: string) {
    const recipient = await this.prisma.trainingEventRecipient.findFirst({
      where: { eventId, recipientAccountId: user.accountId },
      include: { event: { select: { responseMode: true, status: true, organizationId: true } } },
    });
    if (!recipient) throw new NotFoundException('لست ضمن مستلمي هذه الفعالية');
    if (recipient.event.status === 'cancelled') {
      throw new BadRequestException('الفعالية ملغاة');
    }

    const allowed = MODE_ACTIONS[recipient.event.responseMode as ResponseMode] ?? [];
    if (!allowed.includes(action)) {
      throw new BadRequestException(
        `الإجراء «${action}» غير متاح لفعالية بنمط «${recipient.event.responseMode}»`,
      );
    }

    const preconditions = ACTION_PRECONDITIONS[action] ?? [];
    if (!preconditions.includes(recipient.status)) {
      throw new BadRequestException(
        `لا يمكن تنفيذ «${action}» والحالة الحالية «${recipient.status}»`,
      );
    }

    const now = new Date();
    const patch: { status?: string; [key: string]: string | Date | undefined } = {};
    switch (action) {
      case 'acknowledge':
        patch.status = RECIPIENT_STATUS.ACKNOWLEDGED;
        patch.acknowledgedAt = now;
        break;
      case 'accept':
        patch.status = RECIPIENT_STATUS.ACCEPTED;
        patch.acceptedAt = now;
        break;
      case 'decline':
        patch.status = RECIPIENT_STATUS.DECLINED;
        patch.declinedAt = now;
        break;
      case 'attend':
        patch.status = RECIPIENT_STATUS.ATTENDING;
        patch.attendedAt = now;
        break;
      case 'arrive':
        // Self-report only. `confirmedAt` stays untouched: the recipient states
        // they arrived, the authorised operator is the one who attests to it.
        patch.status = RECIPIENT_STATUS.ARRIVED;
        patch.arrivedAt = now;
        break;
      case 'complete':
        patch.status = RECIPIENT_STATUS.COMPLETED;
        patch.completedAt = now;
        break;
    }

    const updated = await this.prisma.trainingEventRecipient.update({
      where: { id: recipient.id },
      data: patch,
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: recipient.event.organizationId,
        actorId: user.accountId,
        action: `training_event.${action}`,
        entityType: 'TrainingEventRecipient',
        entityId: recipient.id,
        oldValues: { status: recipient.status },
        newValues: { status: patch.status },
      },
    });

    return { success: true, data: updated };
  }

  /**
   * The operator's attestation that a recipient really turned up. Reserved to
   * whoever owns the event: its creator, or a session whose organisational
   * visibility covers the event. A recipient can never reach this path — it is
   * keyed on the event's own organisation, not on the caller's claim.
   */
  async confirmAttendance(
    eventId: string,
    recipientId: string,
    user: IAuthenticatedUser,
    scope: ScopeContext,
  ) {
    const event = await this.prisma.trainingEvent.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, createdById: true, status: true },
    });
    if (!event) throw new NotFoundException('الفعالية غير موجودة');
    if (event.status === 'cancelled') throw new BadRequestException('الفعالية ملغاة');

    const isCreator = event.createdById === user.accountId;
    const inScope =
      scope.visibleOrgIds === null || scope.visibleOrgIds.includes(event.organizationId);
    if (!isCreator && !inScope) {
      throw new ForbiddenException('هذه الفعالية خارج نطاق صلاحياتك التنظيمية');
    }

    const recipient = await this.prisma.trainingEventRecipient.findFirst({
      where: { id: recipientId, eventId },
    });
    if (!recipient) throw new NotFoundException('المستلم ليس ضمن هذه الفعالية');
    if (recipient.recipientAccountId === user.accountId) {
      throw new ForbiddenException('لا يمكنك تأكيد حضور نفسك');
    }

    // Being inside the event's organisation is enough for a supervisor, whose
    // authority is the hospital or the cluster. It is not enough for a trainer:
    // their authority is their own trainees, and a hospital-wide event sent by
    // the supervisor would otherwise let any trainer in that hospital attest to
    // a colleague's trainee. The organisational check above bounds the event,
    // this one bounds the person.
    const isTrainer = user.roles?.includes('trainer') ?? false;
    if (isTrainer && !this.hasOrgWideReach(scope)) {
      const own = await this.resolveOwnTrainees(user);
      const ownIds = new Set(own.map((o) => o.traineeProfileId));
      if (!recipient.traineeProfileId || !ownIds.has(recipient.traineeProfileId)) {
        throw new ForbiddenException('لا يمكنك تأكيد حضور متدرب غير مسند إليك');
      }
    }
    if (
      ![RECIPIENT_STATUS.ATTENDING, RECIPIENT_STATUS.ARRIVED].includes(
        recipient.status as never,
      )
    ) {
      throw new BadRequestException(
        `لا يمكن تأكيد الحضور والحالة الحالية «${recipient.status}»`,
      );
    }

    const updated = await this.prisma.trainingEventRecipient.update({
      where: { id: recipient.id },
      data: {
        status: RECIPIENT_STATUS.CONFIRMED,
        confirmedAt: new Date(),
        confirmedById: user.accountId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: event.organizationId,
        actorId: user.accountId,
        action: 'training_event.confirmed',
        entityType: 'TrainingEventRecipient',
        entityId: recipient.id,
        oldValues: { status: recipient.status },
        newValues: { status: RECIPIENT_STATUS.CONFIRMED },
      },
    });

    return { success: true, data: updated };
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  /** Events addressed to the caller. The recipient row is the access grant. */
  async findMine(user: IAuthenticatedUser) {
    const rows = await this.prisma.trainingEventRecipient.findMany({
      where: { recipientAccountId: user.accountId },
      include: { event: true },
      orderBy: { createdAt: 'desc' },
    });
    return { data: rows };
  }

  /**
   * One event with its recipient roster, for the sender console.
   *
   * `eventId` alone is never enough: the event must sit inside the caller's
   * organisational visibility, or have been created by them. And the roster is
   * filtered a second time — a trainer sees only the recipients who are their
   * own trainees, even on an event a hospital supervisor sent to the whole
   * hospital, because reading a colleague's trainees is not something creating
   * or receiving an event should unlock.
   */
  async findOneDetailed(eventId: string, user: IAuthenticatedUser, scope: ScopeContext) {
    const event = await this.prisma.trainingEvent.findUnique({
      where: { id: eventId },
      include: {
        createdBy: { select: { id: true, person: { select: { nameAr: true } } } },
        recipients: {
          include: {
            recipientAccount: { select: { id: true, person: { select: { nameAr: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!event) throw new NotFoundException('الفعالية غير موجودة');

    const isCreator = event.createdById === user.accountId;
    const inScope =
      scope.visibleOrgIds === null || scope.visibleOrgIds.includes(event.organizationId);
    if (!isCreator && !inScope) {
      throw new ForbiddenException('هذه الفعالية خارج نطاق صلاحياتك التنظيمية');
    }

    let recipients = event.recipients;
    const isTrainer = user.roles?.includes('trainer') ?? false;
    if (isTrainer && !this.hasOrgWideReach(scope)) {
      const own = await this.resolveOwnTrainees(user);
      const ownIds = new Set(own.map((o) => o.traineeProfileId));
      recipients = recipients.filter(
        (r) => r.traineeProfileId && ownIds.has(r.traineeProfileId),
      );
    }

    // The summary is computed over the rows the caller may actually see, so the
    // totals can never leak the size of a roster they are not entitled to.
    const by = (s: string) => recipients.filter((r) => r.status === s).length;

    return {
      data: {
        event: {
          id: event.id,
          eventType: event.eventType,
          title: event.title,
          description: event.description,
          priority: event.priority,
          responseMode: event.responseMode,
          audienceType: event.audienceType,
          startAt: event.startAt,
          endAt: event.endAt,
          status: event.status,
          sentAt: event.sentAt,
          rotationId: event.rotationId,
          scheduleId: event.scheduleId,
          resourceFileId: event.resourceFileId,
          createdByNameAr: event.createdBy?.person?.nameAr ?? null,
        },
        summary: {
          total: recipients.length,
          pending: by('pending'),
          acknowledged: by('acknowledged'),
          accepted: by('accepted'),
          declined: by('declined'),
          attending: by('attending'),
          arrived: by('arrived'),
          confirmed: by('confirmed'),
          completed: by('completed'),
        },
        recipients: recipients.map((r) => ({
          id: r.id,
          nameAr: r.recipientAccount?.person?.nameAr ?? 'بدون اسم',
          // Which profile carried the entitlement, so the console can label the
          // row rather than guessing from the name.
          recipientKind: r.trainerProfileId ? 'trainer' : 'trainee',
          status: r.status,
          // Each stage keeps its own timestamp: "attended" and "arrived" and
          // "confirmed" are different facts about different moments, and
          // collapsing them into one column would hide who attested to what.
          acknowledgedAt: r.acknowledgedAt,
          acceptedAt: r.acceptedAt,
          declinedAt: r.declinedAt,
          attendedAt: r.attendedAt,
          arrivedAt: r.arrivedAt,
          confirmedAt: r.confirmedAt,
          completedAt: r.completedAt,
          // The most recent thing that happened, for a compact "last action".
          lastActionAt:
            r.completedAt ?? r.confirmedAt ?? r.arrivedAt ?? r.attendedAt ??
            r.declinedAt ?? r.acceptedAt ?? r.acknowledgedAt ?? null,
          // Whether this row is at a point where an operator may attest. The UI
          // uses it to render the button; the server re-derives it regardless.
          canConfirm: ['attending', 'arrived'].includes(r.status),
        })),
      },
    };
  }

  /** Events created inside the caller's organisational scope. */
  async findForScope(scope: ScopeContext) {
    const rows = await this.prisma.trainingEvent.findMany({
      where:
        scope.visibleOrgIds === null
          ? {}
          : { organizationId: { in: scope.visibleOrgIds } },
      include: { recipients: { select: { id: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { data: rows };
  }
}
