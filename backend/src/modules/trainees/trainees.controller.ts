import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Query,
  ConflictException,
  GoneException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AdminChangeTraineePasswordDto } from './dto/admin-change-trainee-password.dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Public, RequireRoles } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { CapacityService } from '../organizations/capacity.service';
import { TraineeAllocationService } from '../training-requests/trainee-allocation.service';
import {
  CAPABILITIES,
  CapabilityGuard,
  RequireCapability,
  Scope,
  ScopeContext,
  ScopeContextService,
} from '../../common/authz';

@ApiTags('Trainees (المتدربون)')
@Controller('trainees')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
@ApiBearerAuth('JWT-auth')
export class TraineesController {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private capacityService: CapacityService,
    private allocationService: TraineeAllocationService,
    private cardJwt: JwtService,
    private scopeContext: ScopeContextService,
  ) {}

  // ─── بيانات المتدرب الخاصة ────────────────────────────────────────────────
  @Get('me')
  @RequireRoles('trainee', 'platform_owner', 'org_manager')
  @ApiOperation({ summary: 'بيانات المتدرب الحالي — للمتدرب فقط' })
  async getMyProfile(@CurrentUser() user: IAuthenticatedUser) {
    let profile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
      include: {
        person: true,
        organization: true,
        program: true,
        // The trainee's own rotations — their dashboard reads the current one to
        // show that training is actually running. Omitting them left an activated
        // trainee reading "لا يوجد روتيشن" with no way to see their placement.
        rotations: {
          orderBy: { startDate: 'asc' },
          include: {
            department: true,
            trainerProfile: { include: { person: true } },
          },
        },
      },
    });

    if (
      !profile &&
      (user.roles.includes('platform_owner') ||
        user.roles.includes('org_manager'))
    ) {
      profile = await this.prisma.traineeProfile.findFirst({
        include: {
          person: true,
          organization: true,
          program: true,
          rotations: {
            orderBy: { startDate: 'asc' },
            include: {
              department: true,
              trainerProfile: { include: { person: true } },
            },
          },
        },
      });
    }

    if (!profile) return { message: 'لا يوجد ملف متدرب لهذا الحساب' };

    const totalObjectives = await this.prisma.objectiveProgress.count({
      where: { traineeProfileId: profile.id },
    });
    const completedObjectives = await this.prisma.objectiveProgress.count({
      where: { traineeProfileId: profile.id, status: 'completed' },
    });
    const completionPercentage =
      totalObjectives > 0
        ? Math.round((completedObjectives / totalObjectives) * 100)
        : 0;
    const competencies = await this.prisma.competencyProgress.findMany({
      where: { traineeProfileId: profile.id },
      include: { procedure: true },
    });

    return {
      ...profile,
      certifications: [],
      skills: competencies.map((c) => ({
        nameAr: c.procedure.titleAr,
        level:
          c.requiredCount > 0
            ? Math.min(
                100,
                Math.round((c.completedCount / c.requiredCount) * 100),
              )
            : 0,
        category: c.procedure.category,
      })),
      completionPercentage,
      qrCodeData: `MIRAN-DIGITAL-ID-${profile.traineeNumber}-${profile.cardUuid || profile.id}`,
    };
  }

  // ─── زملائي في التدريب ────────────────────────────────────────────────────
  /**
   * Colleagues are derived from the trainee's own active Rotation — same
   * trainer, department and organisation, overlapping the caller's own dates
   * where dates exist. The scope (trainerProfileId/departmentId/organizationId)
   * is resolved server-side from the JWT via the caller's active Rotation; none
   * of it is accepted as input, so a caller cannot widen its own view by
   * passing another scope.
   */
  @Get('my-colleagues')
  @RequireRoles('trainee', 'platform_owner', 'org_manager')
  @ApiOperation({ summary: 'زملاء المتدرب في نفس الروتيشن الفعّال — لا يقبل نطاقاً من العميل' })
  async getMyColleagues(@CurrentUser() user: IAuthenticatedUser) {
    const profile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
    });
    if (!profile) return { data: [] };

    const myRotation = await this.prisma.rotation.findFirst({
      where: { traineeProfileId: profile.id, status: 'active' },
    });
    if (!myRotation) return { data: [] };

    const overlapping = myRotation.startDate && myRotation.endDate
      ? { startDate: { lte: myRotation.endDate }, endDate: { gte: myRotation.startDate } }
      : {};

    const rotations = await this.prisma.rotation.findMany({
      where: {
        status: 'active',
        trainerProfileId: myRotation.trainerProfileId,
        departmentId: myRotation.departmentId,
        organizationId: myRotation.organizationId,
        traineeProfileId: { not: profile.id },
        ...overlapping,
      },
      include: {
        traineeProfile: {
          include: { person: true, program: true },
        },
        department: true,
      },
      distinct: ['traineeProfileId'],
    });

    const data = rotations.map((r) => ({
      traineeProfileId: r.traineeProfileId,
      nameAr: r.traineeProfile.person.nameAr,
      nameEn: r.traineeProfile.person.nameEn,
      specialty: r.traineeProfile.program?.nameAr ?? null,
      departmentNameAr: r.department.nameAr,
      trainingStatus: r.traineeProfile.applicationStatus,
      academicNumber: r.traineeProfile.traineeNumber,
    }));

    return { data };
  }

  // ─── بطاقة طالب امتياز — رمز تحقق موقّع ────────────────────────────────────
  /**
   * The QR payload is a signed, opaque JWT — never the raw national ID or any
   * other sensitive field — carrying only the traineeProfileId and the card's
   * current cardUuid so a reissued card invalidates every QR printed before
   * it. Signed with a secret dedicated to this purpose (see TraineesModule),
   * separate from session tokens, and long-lived to match physical card life;
   * revocation is enforced at verify time against live cardStatus/cardUuid,
   * not by token expiry alone.
   */
  @Get('card/qr-token')
  @RequireRoles('trainee', 'platform_owner', 'org_manager')
  @ApiOperation({ summary: 'إصدار رمز QR موقّع لبطاقة طالب الامتياز' })
  async getCardQrToken(@CurrentUser() user: IAuthenticatedUser) {
    const profile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
    });
    if (!profile) throw new BadRequestException('لا يوجد ملف متدرب لهذا الحساب');
    if (!profile.cardUuid) throw new BadRequestException('لم يتم إصدار بطاقة لهذا المتدرب بعد');

    const token = await this.cardJwt.signAsync(
      { sub: profile.id, cuid: profile.cardUuid },
      { expiresIn: '365d' },
    );
    return { data: { token } };
  }

  // ─── التحقق من بطاقة طالب امتياز — عام (لا يتطلب تسجيل دخول) ──────────────
  @Public()
  @Get('card/verify')
  @ApiOperation({ summary: 'التحقق من صلاحية بطاقة طالب امتياز عبر رمز QR — يعرض الحد الأدنى من البيانات' })
  async verifyCard(@Query('token') token: string) {
    if (!token) throw new BadRequestException('الرمز مطلوب');
    let payload: { sub: string; cuid: string };
    try {
      payload = await this.cardJwt.verifyAsync(token);
    } catch {
      return { data: { valid: false, reason: 'رمز غير صالح أو منتهي الصلاحية' } };
    }

    const profile = await this.prisma.traineeProfile.findUnique({
      where: { id: payload.sub },
      include: {
        person: true,
        program: true,
        organization: true,
        sponsorOrganization: true,
        rotations: { where: { status: 'active' }, take: 1, include: { department: true, trainerProfile: { include: { person: true } } } },
      },
    });

    if (!profile || profile.cardUuid !== payload.cuid) {
      return { data: { valid: false, reason: 'البطاقة غير مرتبطة بأي متدرب فعلي' } };
    }
    if (profile.cardStatus !== 'active') {
      return { data: { valid: false, reason: 'البطاقة ملغاة أو منتهية الصلاحية', cardStatus: profile.cardStatus } };
    }

    const rotation = profile.rotations[0];
    return {
      data: {
        valid: true,
        nameAr: profile.person.nameAr,
        specialty: profile.program?.nameAr ?? null,
        university: profile.sponsorOrganization?.nameAr ?? null,
        hospital: profile.organization?.nameAr ?? null,
        department: rotation?.department?.nameAr ?? null,
        trainer: rotation?.trainerProfile?.person?.nameAr ?? null,
        cardStatus: profile.cardStatus,
      },
    };
  }

  // ─── بيانات ملخص الهوم / الدشبورد التفاعلي للمتدرب ────────────────────────
  @Get('dashboard-summary')
  @RequireRoles('trainee', 'platform_owner', 'org_manager')
  @ApiOperation({ summary: 'بيانات ملخص الدشبورد التفاعلي للمتدرب' })
  async getDashboardSummary(@CurrentUser() user: IAuthenticatedUser) {
    const profile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
    });
    if (!profile) return { message: 'لا يوجد ملف متدرب' };

    // الروتيشن الحالي و الأيام المتبقية
    const activeRotation = await this.prisma.rotation.findFirst({
      where: { traineeProfileId: profile.id, status: 'active' },
      include: {
        department: true,
        trainerProfile: { include: { person: true } },
      },
    });

    let remainingDays = 0;
    if (activeRotation) {
      const now = new Date();
      const end = new Date(activeRotation.endDate);
      const diffTime = end.getTime() - now.getTime();
      remainingDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }

    // الوردية الحالية / اليوم
    const todayShift = await this.prisma.shift.findFirst({
      where: { traineeProfileId: profile.id, date: new Date() },
      include: { department: true },
    });

    // نسبة إنجاز الأهداف
    const totalObjs = await this.prisma.objectiveProgress.count({
      where: { traineeProfileId: profile.id },
    });
    const completedObjs = await this.prisma.objectiveProgress.count({
      where: { traineeProfileId: profile.id, status: 'completed' },
    });
    const objectivePercentage =
      totalObjs > 0 ? Math.round((completedObjs / totalObjs) * 100) : 0;

    // حضور الأسبوع
    const attendanceRecords = await this.prisma.attendance.findMany({
      where: { traineeProfileId: profile.id },
      take: 7,
      orderBy: { date: 'desc' },
    });
    const presentCount = attendanceRecords.filter(
      (a) => a.status === 'present',
    ).length;
    const weeklyAttendanceRate =
      attendanceRecords.length > 0
        ? Math.round((presentCount / attendanceRecords.length) * 100)
        : 0;

    // آخر تقييم
    const lastEvaluation = await this.prisma.evaluation.findFirst({
      where: { evaluateeId: user.accountId },
      orderBy: { submittedAt: 'desc' },
    });

    // آخر إشعار
    const lastNotification = await this.prisma.notification.findFirst({
      where: { userId: user.accountId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      remainingDays,
      activeRotation: activeRotation
        ? {
            id: activeRotation.id,
            departmentName: activeRotation.department.nameAr,
            trainerName: activeRotation.trainerProfile.person.nameAr,
            startDate: activeRotation.startDate,
            endDate: activeRotation.endDate,
            progressPercentage: Math.min(
              100,
              Math.max(10, 100 - Math.round((remainingDays / 30) * 100)),
            ),
          }
        : null,
      currentShift: todayShift
        ? {
            shiftType: todayShift.shiftType,
            departmentName: todayShift.department.nameAr,
            startTime: todayShift.startTime,
            endTime: todayShift.endTime,
          }
        : null,
      upcomingEvent: null,
      objectivePercentage,
      weeklyAttendanceRate,
      lastEvaluation: lastEvaluation
        ? {
            score: lastEvaluation.totalScore,
            comments: lastEvaluation.comments,
            submittedAt: lastEvaluation.submittedAt,
          }
        : null,
      lastNotification: lastNotification
        ? {
            titleAr: lastNotification.titleAr,
            bodyAr: lastNotification.bodyAr,
            createdAt: lastNotification.createdAt,
          }
        : null,
    };
  }

  // ─── مؤشرات الأداء الشخصي (Personal Performance) ─────────────────────────
  @Get('performance')
  @RequireRoles(
    'trainee',
    'platform_owner',
    'org_manager',
    'academic_supervisor',
    'trainer',
  )
  @ApiOperation({
    summary: 'حساب مؤشرات الأداء الشخصي للمتدرب من داتابيز Neon',
  })
  async getPerformanceMetrics(@CurrentUser() user: IAuthenticatedUser) {
    const profile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
    });
    if (!profile) {
      return {
        commitmentRate: 0,
        attendanceRate: 0,
        callResponseSpeedMinutes: 0,
        averageEvaluation: 0,
      };
    }

    // 1. نسبة الحضور ونسبة الالتزام
    const attendances = await this.prisma.attendance.findMany({
      where: { traineeProfileId: profile.id },
    });
    const totalCount = attendances.length;
    const presentCount = attendances.filter(
      (a) => a.status === 'present',
    ).length;
    const onTimeCount = attendances.filter(
      (a) => a.status === 'present' && !a.isLate,
    ).length;

    const attendanceRate =
      totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;
    const commitmentRate =
      totalCount > 0 ? Math.round((onTimeCount / totalCount) * 100) : 0;

    // 2. سرعة الاستجابة للنداءات
    const callParticipations = await this.prisma.callParticipant.findMany({
      where: { traineeProfileId: profile.id, ackAt: { not: null } },
    });

    let totalDiffMinutes = 0;
    let countResponded = 0;
    for (const p of callParticipations) {
      if (p.ackAt && p.notifiedAt) {
        const diffMs =
          new Date(p.ackAt).getTime() - new Date(p.notifiedAt).getTime();
        totalDiffMinutes += diffMs / (1000 * 60);
        countResponded++;
      }
    }
    const callResponseSpeedMinutes =
      countResponded > 0
        ? parseFloat((totalDiffMinutes / countResponded).toFixed(1))
        : 0;

    // 3. متوسط التقييمات
    const userAcc = await this.prisma.userAccount.findFirst({
      where: { personId: profile.personId },
    });
    let averageEvaluation = 0;
    if (userAcc) {
      const evals = await this.prisma.evaluation.findMany({
        where: { evaluateeId: userAcc.id },
      });
      if (evals.length > 0) {
        const sum = evals.reduce(
          (acc, curr) => acc + Number(curr.totalScore || 0),
          0,
        );
        averageEvaluation = parseFloat((sum / evals.length).toFixed(2));
      }
    }

    return {
      commitmentRate,
      attendanceRate,
      callResponseSpeedMinutes,
      averageEvaluation,
    };
  }

  // ─── التسلسل الزمني الموحد (Timeline) ────────────────────────────────────
  @Get('timeline')
  @RequireRoles(
    'trainee',
    'platform_owner',
    'org_manager',
    'academic_supervisor',
    'trainer',
  )
  @ApiOperation({
    summary: 'عرض التايم لاين الموحد (حضور، نداءات، تقييمات، أهداف، شهادات)',
  })
  async getTimeline(@CurrentUser() user: IAuthenticatedUser) {
    const profile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
    });
    const events: any[] = [];

    if (profile) {
      // 1. الحضور
      const attendances = await this.prisma.attendance.findMany({
        where: { traineeProfileId: profile.id },
        take: 5,
        orderBy: { date: 'desc' },
      });
      for (const a of attendances) {
        events.push({
          id: `att-${a.id}`,
          type: 'attendance',
          titleAr: a.isLate ? 'تسجيل حضور متأخر' : 'تسجيل حضور منتظم',
          subtitleAr: `تاريخ ${a.date.toISOString().split('T')[0]}`,
          timestamp: a.checkIn || a.createdAt,
          status: a.status,
          icon: 'calendar.badge.clock',
        });
      }

      // 2. النداءات
      const callParts = await this.prisma.callParticipant.findMany({
        where: { traineeProfileId: profile.id },
        include: { call: true },
        take: 5,
        orderBy: { createdAt: 'desc' },
      });
      for (const cp of callParts) {
        events.push({
          id: `call-${cp.id}`,
          type: 'call',
          titleAr: cp.call.customTitle || 'استجابة لنداء سريري',
          subtitleAr: `الحالة: ${cp.state}`,
          timestamp: cp.ackAt || cp.notifiedAt,
          status: cp.state,
          icon: 'bell.and.waves.left.and.right.fill',
        });
      }

      // 3. التقييمات
      const userAcc = await this.prisma.userAccount.findFirst({
        where: { personId: profile.personId },
      });
      if (userAcc) {
        const evals = await this.prisma.evaluation.findMany({
          where: { evaluateeId: userAcc.id },
          take: 5,
          orderBy: { submittedAt: 'desc' },
        });
        for (const e of evals) {
          events.push({
            id: `eval-${e.id}`,
            type: 'evaluation',
            titleAr: 'تقييم جديد مكتمل',
            subtitleAr: `الدرجة: ${e.totalScore || 5}/5`,
            timestamp: e.submittedAt,
            status: 'completed',
            icon: 'star.fill',
          });
        }
      }
    }

    events.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return { data: events };
  }

  // ─── قائمة المتدربين الواردين للتجمع الصحي ────────────────────────────────
  @Get('incoming')
  @RequireRoles(
    'cluster_administrator',
    'cluster_manager',
    'training_director',
    'platform_owner',
    'hospital_training_admin',
    'hospital_administrator',
    'org_manager',
  )
  @ApiOperation({ summary: 'قائمة متدربي الامتياز الواردين للتجمع الصحي والمستشفيات' })
  async getIncomingTrainees(@CurrentUser() user: IAuthenticatedUser) {
    const scope = await this.scopeContext.resolve(user);
    const filter = this.scopeContext.orgFilter(scope);

    // If scoped to hospital(s) or cluster, auto-link any unlinked candidate rows that are accepted/allocated
    if (scope.visibleOrgIds !== null) {
      const pendingRows = await this.prisma.trainingRequestTrainee.findMany({
        where: {
          assignedHospitalId: { in: scope.visibleOrgIds },
          status: { in: ['allocated', 'hospital_review', 'hospital_accepted', 'active'] },
          traineeProfileId: null,
        },
      });
      for (const row of pendingRows) {
        try {
          const person = await this.prisma.person.findUnique({
            where: { nationalId: row.nationalId },
            include: { traineeProfile: true },
          });
          if (person?.traineeProfile) {
            await this.prisma.trainingRequestTrainee.update({
              where: { id: row.id },
              data: { traineeProfileId: person.traineeProfile.id, personId: person.id },
            });
          }
        } catch {
          // ignore error
        }
      }
    }

    const whereClause: any =
      scope.visibleOrgIds !== null
        ? {
            OR: [
              filter,
              {
                trainingRequestRow: {
                  assignedHospitalId: { in: scope.visibleOrgIds },
                  status: { notIn: ['rejected', 'merged', 'split'] },
                },
              },
            ],
          }
        : filter;

    const trainees = await this.prisma.traineeProfile.findMany({
      where: whereClause,
      include: {
        person: {
          include: {
            userAccounts: {
              where: { deletedAt: null },
              select: {
                id: true,
                username: true,
                email: true,
                isActive: true,
                isEmailVerified: true,
                activatedAt: true,
                activationToken: true,
                activationTokenExpiresAt: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
        organization: true,
        sponsorOrganization: true,
        program: true,
        academicIntake: true,
        graduationApprovals: true,
        rotations: {
          orderBy: { startDate: 'desc' },
          include: {
            department: true,
            trainerProfile: { include: { person: true } },
          },
        },
        competencies: { include: { procedure: true } },
        caseLogs: { take: 10, orderBy: { createdAt: 'desc' } },
        // TraineeProfile.applicationStatus is stamped once at cluster-approval
        // time and never advances after that — it stays "approved" through
        // allocation, hospital review, and hospital acceptance. The row this
        // profile came from is the only place the real pipeline stage lives,
        // so callers needing the true status (not just "has a profile") must
        // read it from here instead of applicationStatus.
        trainingRequestRow: { select: { status: true, assignedHospitalId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { data: trainees };
  }

  // ─── تعديل توجيه وتوزيع المتدرب (Reallocate Trainee) ─────────────────────
  /**
   * Cross-hospital reassignment.
   *
   * This route used to move a trainee itself: it rewrote
   * `traineeProfile.organizationId`, closed and reopened rotations, and shifted
   * attendance, shifts, case logs and evaluations — all without writing a single
   * allocation row. That made it a second, parallel placement mechanism whose
   * effects the canonical history could not see, and it was reachable by
   * `hospital_administrator`, which contradicted the separation the rest of the
   * system enforces.
   *
   * It is now a thin delegate to TraineeAllocationService, which performs the
   * same record transfer as part of a proper allocation. The behaviour a caller
   * sees is unchanged; what changed is that the move is now recorded.
   *
   * Two guardrails the old implementation lacked: the acting session must hold
   * cluster reassignment authority, and both hospitals must belong to its cluster.
   */
  @Post('reallocate')
  @RequireCapability(CAPABILITIES.ALLOCATION_CLUSTER_REASSIGN)
  @ApiOperation({
    summary:
      'إعادة توزيع المتدرب بين المستشفيات — عبر سجل التخصيص الرسمي (إدارة التدريب بالتجمع)',
  })
  async reallocateTrainee(
    @Body()
    body: {
      traineeProfileId: string;
      targetHospitalId: string;
      departmentId?: string;
      trainerProfileId?: string;
      startDate?: string;
      endDate?: string;
      reason?: string;
      notes?: string;
    },
    @CurrentUser() user: IAuthenticatedUser,
    @Scope() scope: ScopeContext,
  ) {
    // The allocation model is keyed on the training-request row, since that is
    // what carries the request, batch and cluster the placement derives from.
    const row = await this.prisma.trainingRequestTrainee.findFirst({
      where: { traineeProfileId: body.traineeProfileId },
      select: { id: true },
    });

    if (!row) {
      throw new ConflictException(
        'هذا المتدرب غير مرتبط بطلب تدريب — لا يمكن إعادة توزيعه عبر سجل التخصيص. ' +
          'المتدربون الذين أُنشئوا خارج دورة العمل (طلب تدريب ← دفعة أكاديمية) لا مصدر لهم، ' +
          'ويحتاجون ربطاً بدفعة قبل إعادة التوزيع.',
      );
    }

    return this.allocationService.allocateToHospital(
      row.id,
      {
        hospitalId: body.targetHospitalId,
        departmentId: body.departmentId ?? null,
        trainerProfileId: body.trainerProfileId ?? null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
      },
      'cluster_reassign',
      user,
      scope,
      body.reason ?? body.notes,
    );
  }

  /**
   * Bulk import — RETIRED.
   *
   * What it did: created a Person, a UserAccount with a hard-coded shared
   * password, a trainee role and a TraineeProfile placed straight into a hospital
   * — defaulting to whichever organisation had the code 'HOSP-NORTH-TOWER' when
   * the caller named none. No training request, no academic batch, no allocation,
   * no capacity check, no audit trail.
   *
   * It is the origin of the fifteen trainee profiles in production that have no
   * batch and no request behind them: nothing in the data can say which university
   * sent them or who approved their placement.
   *
   * There is no functionality here that the canonical path does not already
   * provide, and provide with provenance:
   *
   *   POST /training-requests/:id/trainees/import   — the university's roster,
   *        validated by the validation engine, held as candidate rows
   *   → cluster review and approval
   *   → POST /academic-intakes/from-request         — the batch, linked to the request
   *   → POST /training-requests/trainees/:rowId/allocations/hospital
   *
   * Kept as an explicit refusal rather than deleted, so an existing caller gets an
   * answer that tells it where to go instead of a 404.
   */
  @Post('bulk-import')
  @ApiOperation({
    summary: '⛔ متوقف — الاستيراد يتم عبر طلب التدريب والدفعة الأكاديمية',
  })
  bulkImportTrainees() {
    throw new GoneException(
      'الاستيراد الجماعي المباشر متوقف — كان ينشئ متدربين داخل مستشفى دون طلب تدريب أو دفعة ' +
        'أكاديمية أو سجل تخصيص، فلا يمكن معرفة مصدرهم لاحقاً. ' +
        'المسار الصحيح: POST /training-requests/:id/trainees/import ثم اعتماد الطلب ' +
        'ثم POST /academic-intakes/from-request ثم التوزيع على المستشفيات.',
    );
  }

  @Get()
  @RequireRoles(
    'platform_owner',
    'org_manager',
    'academic_supervisor',
    'trainer',
  )
  @ApiOperation({ summary: 'قائمة المتدربين — حسب صلاحيات الدور' })
  async findAll(
    @CurrentUser() user: IAuthenticatedUser,
    @Query('trainerId') trainerId?: string,
  ) {
    // مدير المنصة يرى جميع المتدربين في المنصة
    if (user.roles.includes('platform_owner')) {
      const trainees = await this.prisma.traineeProfile.findMany({
        include: { person: true, organization: true, program: true },
      });
      return { data: trainees };
    }

    // المدرب يرى متدربيه فقط عبر الروتيشنات
    const isTrainerOnly =
      user.roles.includes('trainer') &&
      !user.roles.includes('org_manager') &&
      !user.roles.includes('academic_supervisor');

    if (isTrainerOnly) {
      const trainerProfile = await this.prisma.trainerProfile.findFirst({
        where: { person: { userAccounts: { some: { id: user.accountId } } } },
      });
      if (!trainerProfile) return { data: [] };

      const rotations = await this.prisma.rotation.findMany({
        where: {
          trainerProfileId: trainerProfile.id,
          organizationId: user.organizationId,
        },
        include: {
          traineeProfile: { include: { person: true, organization: true } },
        },
        distinct: ['traineeProfileId'],
      });
      return { data: rotations.map((r) => r.traineeProfile) };
    }

    // المشرف الأكاديمي ومدير الجهة — يرون الكل في جهتهم
    const trainees = await this.prisma.traineeProfile.findMany({
      where: { organizationId: user.organizationId },
      include: {
        person: {
          include: {
            userAccounts: {
              where: { deletedAt: null },
              select: {
                id: true,
                username: true,
                email: true,
                isActive: true,
                isEmailVerified: true,
                activatedAt: true,
                activationToken: true,
                activationTokenExpiresAt: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
        organization: true,
        program: true,
      },
    });
    return { data: trainees };
  }

  // ─── تعديل كلمة مرور المتدرب إدارياً ─────────────────────────────────────
  /**
   * Administrative password reset for a trainee account.
   * Resolves the UserAccount strictly via TraineeProfile/Person identity (personId).
   * Updates ONLY passwordHash and records a sanitized AuditLog.
   */
  @Patch(':id/password')
  @RequireRoles(
    'platform_owner',
    'system_admin',
    'cluster_manager',
    'cluster_administrator',
    'training_director',
    'hospital_training_admin',
    'org_manager',
  )
  @ApiOperation({ summary: 'تعديل كلمة مرور المتدرب إدارياً' })
  async changeTraineePassword(
    @Param('id') id: string,
    @Body() dto: AdminChangeTraineePasswordDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    if (!dto?.password || dto.password.trim().length < 8) {
      throw new BadRequestException('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
    }

    const scope = await this.scopeContext.resolve(user);

    // 1. Find trainee profile or person
    let profile = await this.prisma.traineeProfile.findUnique({
      where: { id },
      include: {
        person: true,
        organization: true,
        sponsorOrganization: true,
      },
    });

    let personId: string;
    let nationalId: string | null = null;
    if (profile) {
      personId = profile.personId;
      nationalId = profile.person?.nationalId ?? null;
    } else {
      const person = await this.prisma.person.findFirst({
        where: { OR: [{ id }, { nationalId: id }] },
        include: {
          traineeProfile: {
            include: { organization: true, sponsorOrganization: true, person: true },
          },
        },
      });
      if (!person) {
        throw new NotFoundException('لم يتم العثور على المتدرب');
      }
      personId = person.id;
      nationalId = person.nationalId ?? null;
      profile = person.traineeProfile ?? null;
    }

    // 2. Enforce scope isolation
    if (scope.visibleOrgIds !== null && profile) {
      const orgIds = [profile.organizationId, profile.sponsorOrganizationId].filter(Boolean) as string[];
      const isVisible = orgIds.some((orgId) => scope.visibleOrgIds!.includes(orgId));
      if (!isVisible && !user?.roles?.includes('platform_owner') && !user?.roles?.includes('system_admin')) {
        throw new ForbiddenException('هذا المتدرب خارج نطاق صلاحياتك التنظيمية');
      }
    }

    // 3. Find active UserAccount for this Person
    const account = await this.prisma.userAccount.findFirst({
      where: { personId, deletedAt: null },
    });

    if (!account) {
      throw new NotFoundException('لا يوجد حساب مستخدم مسجل لهذا المتدرب');
    }

    // 4. Hash password with bcrypt (10 rounds)
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // 5. Update passwordHash & updatedById, and clear any pending activation —
    // the admin is setting the password directly, so the account must be usable
    // for login immediately, not gated behind an activation link the trainee
    // never receives.
    await this.prisma.userAccount.update({
      where: { id: account.id },
      data: {
        passwordHash,
        updatedById: user?.accountId,
        activationToken: null,
        activationTokenExpiresAt: null,
        isEmailVerified: true,
        activatedAt: account.activatedAt ?? new Date(),
      },
    });

    // 6. Record AuditLog without password, hash, or tokens
    await this.prisma.auditLog.create({
      data: {
        organizationId: user?.organizationId || profile?.organizationId || null,
        actorId: user?.accountId,
        action: 'trainee_password_reset',
        entityType: 'UserAccount',
        entityId: account.id,
        newValues: {
          traineeProfileId: profile?.id,
          personId,
          nationalId: profile?.person?.nationalId,
          description: 'Administrator changed trainee password',
        },
      },
    });

    return {
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح',
      data: {
        accountId: account.id,
        traineeProfileId: profile?.id,
        updatedAt: new Date(),
      },
    };
  }
}
