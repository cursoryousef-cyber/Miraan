import {
  Controller, Get, Post, Body, Param, Query,
  UseGuards, BadRequestException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, RequireRoles } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';

const TRAINER_ROLES = ['trainer', 'org_manager', 'platform_owner', 'hospital_training_admin', 'cluster_administrator', 'cluster_manager'];

/** ms → Arabic human-readable (ثانية / دقيقة) */
function humanMs(ms: number | null): string {
  if (ms === null || ms < 0) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} ث`;
  return `${Math.round(sec / 60)} د`;
}

@ApiTags('Calls (النداءات الطارئة)')
@Controller('calls')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class CallsController {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // TRAINER / SUPERVISOR ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('active')
  @RequireRoles(...TRAINER_ROLES)
  @ApiOperation({ summary: 'النداءات النشطة الآن — للمدرب والمشرف' })
  async getActiveCalls(@CurrentUser() user: IAuthenticatedUser) {
    const calls = await this.prisma.trainerCall.findMany({
      where: { organizationId: user.organizationId, status: 'active' },
      include: {
        participants: {
          include: { traineeProfile: { include: { person: true } } },
          orderBy: { notifiedAt: 'asc' },
        },
      },
      orderBy: { launchedAt: 'desc' },
    });
    return { success: true, data: calls };
  }

  @Post('launch')
  @RequireRoles(...TRAINER_ROLES)
  @ApiOperation({ summary: 'إطلاق نداء جديد (مع حد: نداء واحد نشط لكل مدرب)' })
  async launchCall(
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: {
      callType: string;
      customTitle?: string;
      note?: string;
      location?: string;
      expectedMinutes?: number;
      departmentId?: string;
      targetType?: string;
      targetTrainerIds?: string[];
      targetTraineeIds?: string[];
    },
  ) {
    let trainerProfile = await this.prisma.trainerProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
      select: { id: true, departmentId: true },
    });

    if (!trainerProfile) {
      // Admin / supervisor launching on behalf of hospital
      const fallbackTrainer = await this.prisma.trainerProfile.findFirst({
        where: { organizationId: user.organizationId },
        select: { id: true, departmentId: true },
      });
      trainerProfile = fallbackTrainer;
    }

    let departmentId: string = trainerProfile?.departmentId ?? dto.departmentId ?? '';
    if (!departmentId) {
      const anyDept = await this.prisma.department.findFirst({
        where: { organizationId: user.organizationId },
        select: { id: true },
      });
      departmentId = anyDept?.id ?? '';
    }

    const trainerProfileId: string = trainerProfile?.id ?? '';

    if (!trainerProfileId) {
      throw new BadRequestException('لم يتم العثور على مدرب مرخص بالمستشفى لإطلاق النداء باسمه');
    }

    // ── Explicitly named recipients must be the caller's own trainees ────────
    // Hospital scope is enforced on every recipient query below, so a trainee
    // from another hospital was already unreachable. Within one hospital it was
    // not: naming `targetTraineeIds` with any targetType other than 'department'
    // skipped the rotation filter entirely, so a trainer could summon another
    // trainer's trainees. Department broadcast is deliberately left alone — a
    // trainer calling everyone on active rotation in their department is the
    // designed behaviour, and narrowing it would be a policy change.
    //
    // This also runs *before* the call row is created: validating afterwards
    // left a failed launch holding the trainer's one active-call slot. Unknown
    // or out-of-scope ids are refused rather than silently dropped, so a caller
    // is told the recipient list was wrong instead of quietly getting fewer
    // notifications than they asked for.
    if (dto.targetTraineeIds?.length) {
      const namedIds = [...new Set(dto.targetTraineeIds)];
      const reachable = await this.prisma.traineeProfile.findMany({
        where: { id: { in: namedIds }, organizationId: user.organizationId },
        select: { id: true },
      });
      if (reachable.length !== namedIds.length) {
        throw new BadRequestException(
          'أحد المتدربين المحددين غير موجود أو لا يتبع مستشفاك',
        );
      }

      // Only a caller who is themself a trainer is bound to their own trainees.
      // Hospital training administration launching on the hospital's behalf is
      // not a rotation owner and keeps the reach the route already granted it.
      const isOwnTrainerProfile = await this.prisma.trainerProfile.findFirst({
        where: { id: trainerProfileId, person: { userAccounts: { some: { id: user.accountId } } } },
        select: { id: true },
      });
      if (isOwnTrainerProfile) {
        // The same two links the logbook scope check treats as "this trainee is
        // mine": an active/scheduled rotation, or an open allocation. Counted
        // as a set of distinct trainees so every named id must be covered.
        const [byRotation, byAllocation] = await Promise.all([
          this.prisma.rotation.findMany({
            where: {
              traineeProfileId: { in: namedIds },
              trainerProfileId,
              status: { in: ['scheduled', 'active'] },
            },
            select: { traineeProfileId: true },
          }),
          this.prisma.traineeAllocation.findMany({
            where: { traineeProfileId: { in: namedIds }, trainerProfileId, status: 'open' },
            select: { traineeProfileId: true },
          }),
        ]);
        const owned = new Set<string>([
          ...byRotation.map((r) => r.traineeProfileId),
          ...byAllocation.map((a) => a.traineeProfileId).filter((id): id is string => !!id),
        ]);
        // Checked per id rather than by comparing counts: a count match only
        // means "as many rows as ids", which is the right answer for the wrong
        // reason if the two sets ever differ.
        if (!namedIds.every((id) => owned.has(id))) {
          throw new ForbiddenException(
            'لا يمكنك إطلاق نداء لمتدرب غير مسند إليك',
          );
        }
      }
    }

    // ── Concurrent-call cap: one active call per trainer profile ─────────────
    const existing = await this.prisma.trainerCall.findFirst({
      where: { trainerProfileId, status: 'active' },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('يوجد نداء نشط بالفعل لهذا المدرب — أنهِ النداء الحالي أولاً');
    }

    const call = await this.prisma.trainerCall.create({
      data: {
        organizationId: user.organizationId,
        departmentId: departmentId || 'default-dept',
        trainerProfileId,
        callType: dto.callType || 'urgent',
        customTitle: dto.customTitle,
        note: dto.note,
        location: dto.location,
        expectedMinutes: dto.expectedMinutes ?? 15,
        launchedAt: new Date(),
        status: 'active',
      },
    });

    // ── Target Recipients Scoped Strictly to Current Hospital ──────────────
    const targetUserAccountIds = new Set<string>();

    // 1. Trainees inside hospital
    const trainees = await this.prisma.traineeProfile.findMany({
      where: {
        organizationId: user.organizationId,
        ...(departmentId && (!dto.targetType || dto.targetType === 'department')
          ? { rotations: { some: { departmentId, status: 'active' } } }
          : {}),
        ...(dto.targetTraineeIds?.length ? { id: { in: dto.targetTraineeIds } } : {}),
      },
      include: {
        person: { include: { userAccounts: { select: { id: true } } } },
      },
    });

    const now = new Date();
    for (const trainee of trainees) {
      await this.prisma.callParticipant.create({
        data: {
          callId: call.id,
          traineeProfileId: trainee.id,
          state: 'notified',
          notifiedAt: now,
        },
      });
      const accountId = trainee.person?.userAccounts?.[0]?.id;
      if (accountId) targetUserAccountIds.add(accountId);
    }

    // 2. Trainers inside hospital (if all_trainers or all_both or selected_trainers)
    if (['all_trainers', 'all_both', 'selected_trainers'].includes(dto.targetType || '')) {
      const trainers = await this.prisma.trainerProfile.findMany({
        where: {
          organizationId: user.organizationId,
          ...(dto.targetTrainerIds?.length ? { id: { in: dto.targetTrainerIds } } : {}),
        },
        include: {
          person: { include: { userAccounts: { select: { id: true } } } },
        },
      });
      trainers.forEach((tr) => {
        const accountId = tr.person?.userAccounts?.[0]?.id;
        if (accountId) targetUserAccountIds.add(accountId);
      });
    }

    // 3. Dispatch Notifications via Prisma Notification System
    for (const accountId of targetUserAccountIds) {
      await this.prisma.notification.create({
        data: {
          organizationId: user.organizationId,
          userId: accountId,
          titleAr: `🔔 نداء جديد: ${dto.customTitle ?? call.callType}`,
          bodyAr: dto.note ?? 'يُرجى التوجه فوراً للموقع المحدد',
          type: 'call_alert',
          // Without these the notification named no record, so opening it had
          // nowhere to go — the reader was told a call exists and left to find
          // it. Every other notification in the system carries its reference;
          // this one is the same Notification model and the call id already
          // exists at this point, so no schema change is involved.
          referenceType: 'TrainerCall',
          referenceId: call.id,
          isRead: false,
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.accountId,
        action: 'call.launch',
        entityType: 'TrainerCall',
        entityId: call.id,
        newValues: { callType: call.callType, departmentId, traineesNotified: trainees.length } as any,
      },
    });

    return { success: true, data: { call, traineesNotified: trainees.length } };
  }

  @Post(':id/confirm-arrival')
  @RequireRoles(...TRAINER_ROLES)
  @ApiOperation({ summary: 'تأكيد وصول المتدرب فعلياً — للمدرب' })
  async confirmArrival(
    @Param('id') callId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { traineeProfileId: string },
  ) {
    const call = await this.prisma.trainerCall.findFirst({
      where: { id: callId, organizationId: user.organizationId },
    });
    if (!call) throw new NotFoundException('النداء غير موجود');
    if (call.status !== 'active') throw new BadRequestException('النداء منتهٍ بالفعل');
    await this._assertCallOperator(call, user);

    const participant = await this.prisma.callParticipant.findFirst({
      where: { callId, traineeProfileId: dto.traineeProfileId },
    });
    if (!participant) throw new NotFoundException('المتدرب ليس مشاركاً في هذا النداء');

    const updated = await this.prisma.callParticipant.update({
      where: { id: participant.id },
      data: { state: 'confirmed_arrived', confirmedAt: new Date() },
    });
    return { success: true, data: updated };
  }

  @Post(':id/end')
  @RequireRoles(...TRAINER_ROLES)
  @ApiOperation({ summary: 'إنهاء النداء وإغلاق المشاركة — للمدرب' })
  async endCall(
    @Param('id') callId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { summary?: string },
  ) {
    const call = await this.prisma.trainerCall.findFirst({
      where: { id: callId, organizationId: user.organizationId },
      include: { participants: true },
    });
    if (!call) throw new NotFoundException('النداء غير موجود');
    if (call.status === 'ended') throw new BadRequestException('النداء منتهٍ بالفعل');
    await this._assertCallOperator(call, user);

    const endedAt = new Date();
    await this.prisma.trainerCall.update({
      where: { id: callId },
      data: { status: 'ended', endedAt },
    });

    // Mark any still-notified participants as 'no_show'
    await this.prisma.callParticipant.updateMany({
      where: { callId, state: 'notified' },
      data: { state: 'no_show' },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.accountId,
        action: 'call.end',
        entityType: 'TrainerCall',
        entityId: callId,
        newValues: { summary: dto.summary, endedAt } as any,
      },
    });

    const stats = await this._computeCallStats(callId, call.participants);
    return { success: true, data: { callId, endedAt, stats } };
  }

  @Get(':id/stats')
  @RequireRoles(...TRAINER_ROLES, 'academic_supervisor')
  @ApiOperation({ summary: 'إحصائيات نداء محدد — الاستجابة، المعدلات، الأوقات' })
  async getCallStats(
    @Param('id') callId: string,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    const call = await this.prisma.trainerCall.findFirst({
      where: { id: callId, organizationId: user.organizationId },
      include: {
        participants: {
          include: { traineeProfile: { include: { person: true } } },
        },
      },
    });
    if (!call) throw new NotFoundException('النداء غير موجود');

    const stats = await this._computeCallStats(callId, call.participants);
    return { success: true, data: { call, stats } };
  }

  @Get('history')
  @RequireRoles(...TRAINER_ROLES, 'academic_supervisor')
  @ApiOperation({ summary: 'سجل النداءات مع إحصائياتها — مرتبة زمنياً' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getCallHistory(
    @CurrentUser() user: IAuthenticatedUser,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [calls, total] = await Promise.all([
      this.prisma.trainerCall.findMany({
        where: { organizationId: user.organizationId },
        include: {
          participants: { select: { state: true, ackAt: true, confirmedAt: true, notifiedAt: true } },
        },
        orderBy: { launchedAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      this.prisma.trainerCall.count({ where: { organizationId: user.organizationId } }),
    ]);

    const enriched = calls.map((c) => {
      const stats = this._computeStatsSync(c.participants);
      return { ...c, stats };
    });

    return { success: true, data: enriched, meta: { total, page: parseInt(page), limit: parseInt(limit) } };
  }

  @Get('diligence')
  @RequireRoles(...TRAINER_ROLES, 'academic_supervisor')
  @ApiOperation({ summary: 'درجات الحرص — ترتيب المتدربين حسب نسبة الاستجابة للنداءات' })
  async getDiligenceScores(@CurrentUser() user: IAuthenticatedUser) {
    // Fetch all call participants for this org's ended calls
    const participants = await this.prisma.callParticipant.findMany({
      where: {
        call: { organizationId: user.organizationId, status: 'ended' },
      },
      include: {
        traineeProfile: { include: { person: true } },
      },
    });

    // Group by traineeProfileId
    const map = new Map<string, { nameAr: string; notified: number; acked: number; arrived: number; confirmed: number }>();
    for (const p of participants) {
      const id = p.traineeProfileId;
      const nameAr = p.traineeProfile.person?.nameAr ?? 'غير معروف';
      if (!map.has(id)) map.set(id, { nameAr, notified: 0, acked: 0, arrived: 0, confirmed: 0 });
      const entry = map.get(id)!;
      entry.notified++;
      if (['acknowledged', 'self_arrived', 'confirmed_arrived'].includes(p.state)) entry.acked++;
      if (['self_arrived', 'confirmed_arrived'].includes(p.state)) entry.arrived++;
      if (p.state === 'confirmed_arrived') entry.confirmed++;
    }

    const scores = Array.from(map.entries()).map(([traineeProfileId, d]) => ({
      traineeProfileId,
      nameAr: d.nameAr,
      totalCalls: d.notified,
      acked: d.acked,
      arrived: d.arrived,
      confirmedArrived: d.confirmed,
      ackRate: d.notified ? Math.round((d.acked / d.notified) * 100) : 0,
      arrivalRate: d.notified ? Math.round((d.arrived / d.notified) * 100) : 0,
      diligenceScore: d.notified
        ? Math.round(((d.acked * 0.3 + d.arrived * 0.4 + d.confirmed * 0.3) / d.notified) * 100)
        : 0,
    }));

    scores.sort((a, b) => b.diligenceScore - a.diligenceScore);
    return { success: true, data: scores };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRAINEE ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':id/ack')
  @RequireRoles('trainee')
  @ApiOperation({ summary: 'تأكيد استلام النداء — للمتدرب' })
  async acknowledgeCall(@Param('id') callId: string, @CurrentUser() user: IAuthenticatedUser) {
    const participant = await this._getParticipant(callId, user.accountId);
    return this.prisma.callParticipant.update({
      where: { id: participant.id },
      data: { state: 'acknowledged', ackAt: new Date() },
    });
  }

  @Post(':id/on-way')
  @RequireRoles('trainee')
  @ApiOperation({ summary: 'أنا في الطريق — للمتدرب' })
  async onWay(@Param('id') callId: string, @CurrentUser() user: IAuthenticatedUser) {
    const participant = await this._getParticipant(callId, user.accountId);
    return this.prisma.callParticipant.update({
      where: { id: participant.id },
      data: { state: 'self_arrived', selfArrivedAt: new Date() },
    });
  }

  @Post(':id/arrived')
  @RequireRoles('trainee')
  @ApiOperation({ summary: 'وصلت (إقرار ذاتي من المتدرب) — يبقى تأكيد المدرب منفصلاً' })
  async arrived(@Param('id') callId: string, @CurrentUser() user: IAuthenticatedUser) {
    const participant = await this._getParticipant(callId, user.accountId);
    // A trainee reports their own arrival; only the trainer attests to it.
    // This wrote `confirmed_arrived`/`confirmedAt` — the trainer's attestation —
    // so a trainee could record the confirmation themselves, and the
    // `confirmed` figure in the call statistics counted self-reports as
    // trainer-verified arrivals. The schema already separates the two with
    // `selfArrivedAt` and `confirmedAt`; this now writes the trainee's half.
    return this.prisma.callParticipant.update({
      where: { id: participant.id },
      data: { state: 'self_arrived', selfArrivedAt: new Date() },
    });
  }

  @Get('my-incoming')
  @RequireRoles('trainee')
  @ApiOperation({ summary: 'النداءات الواردة (النشطة أولاً) — للمتدرب' })
  async getMyIncomingCalls(@CurrentUser() user: IAuthenticatedUser) {
    const traineeProfile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
      select: { id: true },
    });
    if (!traineeProfile) return { success: true, data: [] };

    const participants = await this.prisma.callParticipant.findMany({
      where: { traineeProfileId: traineeProfile.id },
      include: {
        call: {
          include: {
            participants: { select: { state: true } },
          },
        },
      },
      orderBy: { notifiedAt: 'desc' },
      take: 50,
    });

    // Enrich with per-call summary stats visible to trainee
    const enriched = participants.map((p) => ({
      ...p,
      callSummary: this._computeStatsSync(p.call.participants),
    }));

    return { success: true, data: enriched };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * A call belongs to the trainer who launched it. Hospital scope alone let any
   * trainer in the same hospital confirm arrivals on, or end, a colleague's
   * call — the caller was never compared against `call.trainerProfileId`.
   *
   * Hospital training administration is deliberately still allowed: it does not
   * own a call but does supervise the floor, and the route already admitted it.
   * What is closed is one trainer acting on another trainer's call.
   */
  private async _assertCallOperator(
    call: { trainerProfileId: string },
    user: IAuthenticatedUser,
  ): Promise<void> {
    if (!user.roles?.includes('trainer')) return;

    const ownProfile = await this.prisma.trainerProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
      select: { id: true },
    });
    if (!ownProfile || ownProfile.id !== call.trainerProfileId) {
      throw new ForbiddenException('لا يمكنك التحكم في نداء أطلقه مدرب آخر');
    }
  }

  private async _getParticipant(callId: string, accountId: string) {
    const traineeProfile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: accountId } } } },
      select: { id: true },
    });
    if (!traineeProfile) throw new BadRequestException('ليس متدرباً مسجلاً');

    const participant = await this.prisma.callParticipant.findFirst({
      where: { callId, traineeProfileId: traineeProfile.id },
    });
    if (!participant) throw new NotFoundException('غير مشارك في هذا النداء');

    const call = await this.prisma.trainerCall.findUnique({ where: { id: callId }, select: { status: true } });
    if (call?.status === 'ended') throw new BadRequestException('النداء منتهٍ بالفعل');

    return participant;
  }

  private _computeStatsSync(participants: { state: string; ackAt?: Date | null; confirmedAt?: Date | null; notifiedAt?: Date | null }[]) {
    const total = participants.length;
    const acked = participants.filter((p) => ['acknowledged', 'self_arrived', 'confirmed_arrived'].includes(p.state)).length;
    const arrived = participants.filter((p) => ['self_arrived', 'confirmed_arrived'].includes(p.state)).length;
    const confirmed = participants.filter((p) => p.state === 'confirmed_arrived').length;
    const noShow = participants.filter((p) => p.state === 'no_show').length;

    // Avg ack time in ms (for those who acked)
    const ackTimes = participants
      .filter((p) => p.ackAt && p.notifiedAt)
      .map((p) => p.ackAt!.getTime() - p.notifiedAt!.getTime());
    const avgAckMs = ackTimes.length ? Math.round(ackTimes.reduce((a, b) => a + b, 0) / ackTimes.length) : null;

    return {
      total,
      acked,
      arrived,
      confirmedArrived: confirmed,
      noShow,
      ackRatePct: total ? Math.round((acked / total) * 100) : 0,
      arrivalRatePct: total ? Math.round((arrived / total) * 100) : 0,
      avgAckTime: humanMs(avgAckMs),
      avgAckMs,
    };
  }

  private async _computeCallStats(callId: string, participants: any[]) {
    return this._computeStatsSync(participants);
  }
}
