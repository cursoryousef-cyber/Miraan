import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { CurrentUser, RequireRoles } from '../../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import { TimelineService } from '../timeline/timeline.service';
import { EvaluationService } from './evaluation.service';
import {
  CAPABILITIES, CapabilityGuard, RequireCapability,
} from '../../common/authz';

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Names an evaluation participant without exposing their account credentials. */
const EVALUATION_PARTICIPANT_SELECT = {
  select: {
    id: true,
    person: { select: { id: true, nameAr: true, nameEn: true } },
  },
} as const;

@ApiTags('Production Operations')
@ApiBearerAuth('JWT-auth')
@Controller('operations')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
export class OperationsController {
  constructor(
    private prisma: PrismaService,
    private timelineService: TimelineService,
    private evaluationService: EvaluationService,
  ) {}

  @Get('trainer/dashboard')
  @RequireRoles('trainer', 'org_manager', 'platform_owner')
  async trainerDashboard(@CurrentUser() user: IAuthenticatedUser) {
    const trainer = await this.myTrainer(user);
    const traineeWhere = this.trainerTraineeScope(trainer, user);
    const assignedTrainees = await this.prisma.traineeProfile.count({ where: traineeWhere });
    const pendingAttendance = await this.prisma.attendance.count({ where: { organizationId: user.organizationId, status: 'correction_requested' } });
    // Same scope the case list uses: records stamped with this trainer, plus
    // records of the trainees assigned to them. Counting only the first left the
    // dashboard reporting zero pending while the trainee's records sat waiting.
    const trainerCaseScope = trainer
      ? {
          OR: [
            { trainerProfileId: trainer.id },
            {
              traineeProfile: {
                rotations: {
                  some: {
                    trainerProfileId: trainer.id,
                    organizationId: user.organizationId,
                    status: 'active',
                  },
                },
              },
            },
          ],
        }
      : {};
    const pendingLogbook = await this.prisma.clinicalCaseLog.count({
      where: { organizationId: user.organizationId, ...trainerCaseScope, status: { in: ['submitted', 'modification_requested'] } },
    });
    const activeRotations = await this.prisma.rotation.count({
      where: { organizationId: user.organizationId, ...(trainer ? { trainerProfileId: trainer.id } : {}), status: 'active' },
    });
    // A trainer's board is their own calls, not every call running in the
    // hospital — the count was organisation-wide for a role scoped to itself.
    const openCalls = await this.prisma.trainerCall.count({
      where: { organizationId: user.organizationId, status: 'active', ...(trainer ? { trainerProfileId: trainer.id } : {}) },
    });
    const dueTasks = await this.prisma.task.count({ where: { organizationId: user.organizationId, assignedToId: user.accountId, status: { not: 'completed' } } });
    const unreadNotifications = await this.prisma.notification.count({ where: { userId: user.accountId, isRead: false } });

    const assignedTraineeIds = (
      await this.prisma.traineeProfile.findMany({ where: traineeWhere, select: { id: true } })
    ).map((t) => t.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysAttendance = assignedTraineeIds.length
      ? await this.prisma.attendance.findMany({ where: { traineeProfileId: { in: assignedTraineeIds }, date: today } })
      : [];
    const presentToday = todaysAttendance.filter((a) => a.status === 'present').length;
    const notCheckedIn = assignedTraineeIds.length - todaysAttendance.length;
    // Evaluation rows only exist once submitted (submittedAt is non-nullable),
    // so "pending" is derived the same way the existing my-pending endpoint
    // derives it, not by querying Evaluation directly.
    const pendingEvaluationsResult = await this.evaluationService.myPendingEvaluations(user).catch(() => ({ data: [] as unknown[] }));
    const pendingEvaluations = (pendingEvaluationsResult as any)?.data?.length ?? 0;
    const incompleteCompetencies = assignedTraineeIds.length
      ? await this.prisma.competencyProgress.count({ where: { traineeProfileId: { in: assignedTraineeIds }, status: { not: 'completed' } } })
      : 0;

    // ── Counts the trainer dashboard renders as KPI tiles ──────────────────
    // Every one is derived from this trainer's own scope: their trainees, their
    // records, their sessions, their seats. None of them reaches hospital-wide
    // or cluster data, which this role holds no capability for.

    // Assessments this trainer has actually filed.
    const completedEvaluations = await this.prisma.evaluation.count({
      where: { organizationId: user.organizationId, evaluatorId: user.accountId },
    });

    // The distinct programmes the trainer's own trainees are enrolled in.
    const programIds = new Set(
      (
        await this.prisma.traineeProfile.findMany({
          where: traineeWhere,
          select: { programId: true },
        })
      )
        .map((t) => t.programId)
        .filter((id): id is string => Boolean(id)),
    );
    const trainingPrograms = programIds.size;

    // Seats: the trainer's own capacity, from their profile.
    const seatCapacity = trainer?.maxTrainees ?? 0;
    const availableSeats = Math.max(0, seatCapacity - assignedTrainees);

    // Sessions this trainer runs, from today onwards.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const scheduledSessions = trainer
      ? await this.prisma.scheduleSession.count({
          where: {
            organizationId: user.organizationId,
            trainerProfileId: trainer.id,
            date: { gte: startOfToday },
            status: { not: 'cancelled' },
          },
        })
      : 0;

    return {
      data: {
        assignedTrainees, pendingAttendance, pendingLogbook, activeRotations, openCalls, dueTasks, unreadNotifications,
        presentToday, absentOrNotCheckedIn: notCheckedIn, pendingEvaluations, incompleteCompetencies,
        completedEvaluations, trainingPrograms, seatCapacity, availableSeats, scheduledSessions,
      },
    };
  }

  /**
   * Refuses work assigned onto a graduated (locked) trainee file. The lock is
   * set by graduation itself; existing tasks and their history are untouched.
   */
  private async assertTraineeAccountNotLocked(accountId: string): Promise<void> {
    const profile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: accountId } } } },
      select: { isLocked: true },
    });
    if (profile?.isLocked) {
      throw new ForbiddenException('ملف المتدرب مغلق بعد التخرج — لا يمكن إسناد مهام جديدة');
    }
  }

  @Get('trainer/assigned-interns')
  @RequireRoles('trainer', 'org_manager', 'platform_owner')
  async assignedInterns(@CurrentUser() user: IAuthenticatedUser) {
    const trainer = await this.myTrainer(user);
    // A trainee can hold more than one active rotation at a time — the E2E
    // trainee runs الباطنة under this trainer and الأطفال under another. Returning
    // every active rotation let the client bind the evaluation form to whichever
    // came back first, so a trainer opening the form for their own trainee was
    // submitting against another trainer's rotation and was correctly refused by
    // `evaluation.service`: "لا يمكنك تقييم متدرب في دورة تدريبية غير مسندة إليك".
    // A trainer's roster shows the rotation that trainer supervises; supervisory
    // roles reading this endpoint still see all of them.
    const rotationFilter =
      trainer && user.roles.includes('trainer')
        ? { status: 'active', trainerProfileId: trainer.id }
        : { status: 'active' };
    const data = await this.prisma.traineeProfile.findMany({
      where: this.trainerTraineeScope(trainer, user),
      include: {
        // An evaluation is filed against the trainee's *user account*, not the
        // trainee profile, so the client cannot submit one without it. `person`
        // alone omitted userAccounts, which left every trainer's evaluation form
        // permanently un-submittable ("تعذر تحديد حساب المتدرب المرتبط") even
        // though the endpoint behind it accepts the request. Only the id and the
        // active flag are selected — no credentials leave the server.
        person: { include: { userAccounts: { select: { id: true, isActive: true } } } },
        organization: true,
        rotations: { where: rotationFilter, include: { department: true, trainerProfile: { include: { person: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { data };
  }

  /**
   * Assignment requests awaiting this trainer's accept/reject. Scope is
   * derived from the trainer's own JWT → TrainerProfile, never from a client
   * -supplied trainerProfileId, so a trainer only ever sees rotations where
   * they themselves are trainerProfileId.
   */
  @Get('trainer/assignment-requests')
  @RequireRoles('trainer', 'org_manager', 'platform_owner')
  async assignmentRequests(@CurrentUser() user: IAuthenticatedUser) {
    const trainer = await this.myTrainer(user);
    if (!trainer) return { data: [] };
    const data = await this.prisma.rotation.findMany({
      where: { trainerProfileId: trainer.id, status: 'pending_acceptance' },
      include: {
        traineeProfile: { include: { person: true, program: true, sponsorOrganization: true } },
        department: true,
        organization: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { data };
  }

  @Post('trainer/assignment-requests/:rotationId/accept')
  @RequireRoles('trainer', 'org_manager', 'platform_owner')
  async acceptAssignmentRequest(@Param('rotationId') rotationId: string, @CurrentUser() user: IAuthenticatedUser) {
    const trainer = await this.myTrainer(user);
    const rotation = await this.prisma.rotation.findFirst({
      where: { id: rotationId, trainerProfileId: trainer?.id, status: 'pending_acceptance' },
    });
    if (!rotation) throw new BadRequestException('لا يوجد طلب إسناد بانتظار قبولك بهذا المعرف');

    const data = await this.prisma.rotation.update({ where: { id: rotationId }, data: { status: 'active' } });
    await this.audit(user, 'rotation.trainer_accept', 'Rotation', rotationId, data);

    // Notify the hospital training administration (allocation performer)
    const allocation = await this.prisma.traineeAllocation.findFirst({
      where: { traineeProfileId: rotation.traineeProfileId, hospitalId: rotation.organizationId, status: 'open' },
    });
    if (allocation?.performedById) {
      await this.notify(
        rotation.organizationId,
        allocation.performedById,
        'تم قبول إسناد المتدرب من قبل المدرب.',
        'تم قبول إسناد المتدرب من قبل المدرب.',
        'trainee_assignment_accepted',
        'Rotation',
        rotationId,
      );
    }

    // Notify the trainee that their trainer accepted the assignment
    const trainee = await this.prisma.traineeProfile.findUnique({
      where: { id: rotation.traineeProfileId },
      include: { person: { include: { userAccounts: { select: { id: true }, take: 1 } } } },
    });
    const traineeAccountId = trainee?.person?.userAccounts[0]?.id;
    if (traineeAccountId) {
      await this.notify(
        rotation.organizationId,
        traineeAccountId,
        'تم قبول إسنادك للمدرب',
        `تم قبول إسنادك للمدرب — يمكنك الآن بدء التدريب.`,
        'trainee_assignment_accepted',
        'Rotation',
        rotationId,
      );
    }

    return { success: true, data };
  }

  @Post('trainer/assignment-requests/:rotationId/reject')
  @RequireRoles('trainer', 'org_manager', 'platform_owner')
  async rejectAssignmentRequest(
    @Param('rotationId') rotationId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { reason?: string },
  ) {
    if (!dto.reason?.trim()) throw new BadRequestException('سبب الرفض إلزامي');
    const trainer = await this.myTrainer(user);
    const rotation = await this.prisma.rotation.findFirst({
      where: { id: rotationId, trainerProfileId: trainer?.id, status: 'pending_acceptance' },
    });
    if (!rotation) throw new BadRequestException('لا يوجد طلب إسناد بانتظار قبولك بهذا المعرف');

    const data = await this.prisma.rotation.update({
      where: { id: rotationId },
      data: { status: 'rejected', completionNotes: dto.reason },
    });
    await this.audit(user, 'rotation.trainer_reject', 'Rotation', rotationId, data);

    // Send the assignment back to the hospital's training administration by
    // clearing the trainer/department on the still-open allocation
    const allocation = await this.prisma.traineeAllocation.findFirst({
      where: { traineeProfileId: rotation.traineeProfileId, hospitalId: rotation.organizationId, status: 'open' },
    });
    if (allocation) {
      await this.prisma.traineeAllocation.update({
        where: { id: allocation.id },
        data: { trainerProfileId: null, departmentId: null },
      });
      if (allocation.performedById) {
        await this.notify(
          rotation.organizationId,
          allocation.performedById,
          'رفض المدرب طلب الإسناد',
          `تم رفض إسناد متدرب — السبب: ${dto.reason}`,
          'trainee_assignment_rejected',
          'Rotation',
          rotationId,
        );
      }
    }

    // Notify the trainee that their trainer rejected the assignment
    const trainee = await this.prisma.traineeProfile.findUnique({
      where: { id: rotation.traineeProfileId },
      include: { person: { include: { userAccounts: { select: { id: true }, take: 1 } } } },
    });
    const traineeAccountId = trainee?.person?.userAccounts[0]?.id;
    if (traineeAccountId) {
      await this.notify(
        rotation.organizationId,
        traineeAccountId,
        'تم رفض إسنادك للمدرب',
        `تم رفض إسنادك للمدرب — سيتم إعادة تعيينك لمدرب آخر. السبب: ${dto.reason}`,
        'trainee_assignment_rejected',
        'Rotation',
        rotationId,
      );
    }

    return { success: true, data };
  }

  /**
   * Trainee groups — the trainer's own assigned trainees (same scope query as
   * assigned-interns) bucketed by department + active rotation, so a trainer
   * with several cohorts can see and message one at a time. Not a new entity:
   * grouping is computed over Rotation/TraineeAllocation, which already carry
   * department/dates, so there is nothing here to persist.
   */
  @Get('trainer/groups')
  @RequireRoles('trainer', 'org_manager', 'platform_owner')
  async trainerGroups(@CurrentUser() user: IAuthenticatedUser) {
    const trainer = await this.myTrainer(user);
    const trainees = await this.prisma.traineeProfile.findMany({
      where: trainer
        ? { rotations: { some: { trainerProfileId: trainer.id, organizationId: user.organizationId, status: 'active' } } }
        : { organizationId: user.organizationId },
      include: {
        person: true,
        rotations: { where: { status: 'active' }, include: { department: true } },
      },
    });

    const groups = new Map<string, { departmentId: string; departmentNameAr: string; trainees: unknown[] }>();
    for (const t of trainees) {
      const rotation = t.rotations[0];
      if (!rotation) continue;
      const key = rotation.departmentId;
      if (!groups.has(key)) {
        groups.set(key, { departmentId: key, departmentNameAr: rotation.department.nameAr, trainees: [] });
      }
      groups.get(key)!.trainees.push({ id: t.id, nameAr: t.person.nameAr, traineeNumber: t.traineeNumber, startDate: rotation.startDate, endDate: rotation.endDate });
    }

    return { data: Array.from(groups.values()) };
  }

  /**
   * Incoming requests requiring THIS trainer's action — not hospital-wide.
   * Aggregates the same reads the dedicated endpoints already expose
   * (evaluationService.myPendingEvaluations, submitted clinical logs scoped
   * to the trainer) into one worklist; no new workflow or storage.
   */
  @Get('trainer/incoming-requests')
  @RequireRoles('trainer', 'org_manager', 'platform_owner')
  async trainerIncomingRequests(@CurrentUser() user: IAuthenticatedUser) {
    const trainer = await this.myTrainer(user);
    const [pendingEvaluations, pendingLogs] = await Promise.all([
      this.evaluationService.myPendingEvaluations(user).catch(() => ({ data: [] as any[] })),
      trainer
        ? this.prisma.clinicalCaseLog.findMany({
            where: { trainerProfileId: trainer.id, status: { in: ['submitted', 'modification_requested'] } },
            include: { traineeProfile: { include: { person: true } } },
            orderBy: { performedAt: 'desc' },
            take: 20,
          })
        : [],
    ]);

    return {
      data: {
        evaluations: (pendingEvaluations as any)?.data ?? [],
        clinicalLogs: pendingLogs,
      },
    };
  }

  /**
   * Trainee detail drawer for a trainer — full picture of one trainee, scoped
   * to only the trainees currently assigned to the calling trainer. Reuses the
   * same reads as the trainee's own dashboard; the only new thing is the scope
   * check, which is the actual security boundary here (traineeId is a URL
   * param and must not by itself grant access).
   */
  @Get('trainer/trainee/:id')
  @RequireRoles('trainer', 'org_manager', 'platform_owner')
  async trainerTraineeDetail(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) {
    const isPlainTrainer =
      user.roles.includes('trainer') &&
      !user.roles.includes('org_manager') &&
      !user.roles.includes('platform_owner');
    if (isPlainTrainer) {
      const trainer = await this.myTrainer(user);
      const assigned =
        trainer &&
        ((await this.prisma.traineeAllocation.findFirst({
          where: { traineeProfileId: id, trainerProfileId: trainer.id, status: 'open' },
        })) ||
          (await this.prisma.rotation.findFirst({
            where: { traineeProfileId: id, trainerProfileId: trainer.id, status: { in: ['scheduled', 'active'] } },
          })));
      if (!assigned) throw new BadRequestException('هذا المتدرب غير مسند إليك');
    }

    const profile = await this.prisma.traineeProfile.findUnique({
      where: { id },
      include: {
        // The account id is what a task is addressed to; without it the trainer
        // has the trainee's profile but no way to assign them anything.
        person: { include: { userAccounts: { select: { id: true }, take: 1 } } },
        organization: true,
        program: true,
      },
    });
    if (!profile) return { data: null };

    const [attendance, rotation, tasks, clinicalLogs, competencies, evaluations] = await Promise.all([
      this.prisma.attendance.findMany({ where: { traineeProfileId: id }, orderBy: { date: 'desc' }, take: 31 }),
      this.prisma.rotation.findFirst({ where: { traineeProfileId: id, status: 'active' }, include: { department: true, trainerProfile: { include: { person: true } } } }),
      this.prisma.task.findMany({ where: { assignedTo: { personId: profile.personId } }, orderBy: { dueDate: 'asc' }, take: 20 }),
      this.prisma.clinicalCaseLog.findMany({ where: { traineeProfileId: id }, orderBy: { performedAt: 'desc' }, take: 20 }),
      this.prisma.competencyProgress.findMany({ where: { traineeProfileId: id }, include: { procedure: true } }),
      this.prisma.evaluation.findMany({ where: { evaluatee: { personId: profile.personId } }, orderBy: { submittedAt: 'desc' }, take: 10 }),
    ]);

    const present = attendance.filter((a) => a.status === 'present').length;
    return {
      data: {
        profile,
        traineeAccountId: profile.person.userAccounts[0]?.id ?? null,
        rotation,
        attendance,
        attendanceToday: attendance.find((a) => new Date(a.date).toDateString() === new Date().toDateString()) ?? null,
        attendanceRate: attendance.length ? Math.round((present / attendance.length) * 100) : 0,
        tasks,
        clinicalLogs,
        competencies,
        evaluations,
      },
    };
  }

  @Get('trainee/dashboard')
  @RequireRoles('trainee', 'platform_owner', 'org_manager')
  async traineeDashboard(@CurrentUser() user: IAuthenticatedUser) {
    const profile = await this.myTrainee(user);
    if (!profile) return { data: null };
    const [attendance, logbook, approvedLogbook, competencies, evaluations, tasks, notifications, rotation] = await Promise.all([
      this.prisma.attendance.findMany({ where: { traineeProfileId: profile.id }, orderBy: { date: 'desc' }, take: 31 }),
      this.prisma.clinicalCaseLog.count({ where: { traineeProfileId: profile.id } }),
      this.prisma.clinicalCaseLog.count({ where: { traineeProfileId: profile.id, status: { in: ['trainer_approved', 'academic_approved', 'completed'] } } }),
      this.prisma.competencyProgress.findMany({ where: { traineeProfileId: profile.id }, include: { procedure: true } }),
      this.prisma.evaluation.findMany({ where: { evaluatee: { personId: profile.personId } }, orderBy: { submittedAt: 'desc' }, take: 5, include: { form: true } }),
      this.prisma.task.findMany({ where: { assignedTo: { personId: profile.personId }, status: { not: 'completed' } }, orderBy: { dueDate: 'asc' }, take: 10 }),
      this.prisma.notification.findMany({ where: { user: { personId: profile.personId } }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.rotation.findFirst({ where: { traineeProfileId: profile.id, status: 'active' }, include: { department: true, trainerProfile: { include: { person: true } } } }),
    ]);
    const present = attendance.filter((a) => a.status === 'present').length;
    const required = competencies.reduce((sum, c) => sum + c.requiredCount, 0);
    const completed = competencies.reduce((sum, c) => sum + c.completedCount, 0);
    // Progress and readiness come from the timeline rather than being recomputed
    // here, so this dashboard cannot disagree with the hospital or cluster view.
    const { data: timeline } = await this.timelineService.getTraineeTimeline(profile.id);
    return {
      data: {
        profile,
        rotation,
        timeline,
        completionPercentage: timeline.completionPercentage,
        graduationProgress: timeline.graduationProgress,
        readiness: timeline.readiness,
        attendanceRate: attendance.length ? Math.round((present / attendance.length) * 100) : 0,
        logbook: { total: logbook, approved: approvedLogbook, pending: logbook - approvedLogbook },
        competencies: { required, completed, percentage: required ? Math.round((completed / required) * 100) : 0, data: competencies },
        evaluations,
        tasks,
        notifications,
      },
    };
  }

  @Get('attendance')
  @RequireCapability(
    CAPABILITIES.TRAINEE_VIEW_SCOPE, CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
    CAPABILITIES.TRAINEE_VIEW_DEPARTMENT, CAPABILITIES.TRAINEE_VIEW_ASSIGNED,
    CAPABILITIES.SELF_VIEW,
  )
  async attendance(@CurrentUser() user: IAuthenticatedUser, @Query('traineeId') traineeId?: string) {
    if (user.roles.includes('hospital_administrator')) {
      throw new ForbiddenException('مدير المستشفى لا يملك صلاحية على سجلات الحضور');
    }

    if (user.roles.includes('trainee')) {
      const myProfile = await this.myTrainee(user);
      if (!myProfile) return { data: [] };
      if (traineeId && traineeId !== myProfile.id) {
        throw new ForbiddenException('لا يمكنك الاطلاع على سجلات حضور متدرب آخر');
      }
      const data = await this.prisma.attendance.findMany({
        where: { traineeProfileId: myProfile.id },
        include: { traineeProfile: { include: { person: true } }, shift: true, approvedBy: { include: { person: true } } },
        orderBy: { date: 'desc' },
        take: 100,
      });
      return { data };
    }

    if (user.roles.includes('trainer')) {
      const trainer = await this.myTrainer(user);
      if (!trainer) return { data: [] };
      const assignedRotations = await this.prisma.rotation.findMany({
        where: { trainerProfileId: trainer.id, status: 'active' },
        select: { traineeProfileId: true },
      });
      const assignedTraineeIds = assignedRotations.map((r) => r.traineeProfileId);

      if (traineeId && !assignedTraineeIds.includes(traineeId)) {
        throw new ForbiddenException('المتدرب المحدد غير مسند إليك');
      }

      const targetTraineeIds = traineeId ? [traineeId] : assignedTraineeIds;
      if (targetTraineeIds.length === 0) return { data: [] };

      const data = await this.prisma.attendance.findMany({
        where: { traineeProfileId: { in: targetTraineeIds } },
        include: { traineeProfile: { include: { person: true } }, shift: true, approvedBy: { include: { person: true } } },
        orderBy: { date: 'desc' },
        take: 100,
      });
      return { data };
    }

    const scopeFilter: Prisma.AttendanceWhereInput = {
      ...(traineeId ? { traineeProfileId: traineeId } : {}),
      organizationId: user.organizationId,
    };

    const data = await this.prisma.attendance.findMany({
      where: scopeFilter,
      include: { traineeProfile: { include: { person: true } }, shift: true, approvedBy: { include: { person: true } } },
      orderBy: { date: 'desc' },
      take: 100,
    });
    return { data };
  }

  @Get('attendance/today')
  @RequireRoles('trainee')
  async getTodayAttendance(@CurrentUser() user: IAuthenticatedUser) {
    const profile = await this.myTrainee(user);
    if (!profile) return { data: null, activeRotation: null };

    const activeRotation = await this.prisma.rotation.findFirst({
      where: { traineeProfileId: profile.id, status: 'active' },
      include: {
        department: true,
        organization: true,
        trainerProfile: { include: { person: true } },
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await this.prisma.attendance.findFirst({
      where: { traineeProfileId: profile.id, date: today },
      include: { shift: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: record,
      activeRotation,
    };
  }

  @Post('attendance/check-in')
  @RequireRoles('trainee')
  async standardCheckIn(
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { shiftId?: string; notes?: string } = {},
  ) {
    return this.createAttendance(user, {
      method: 'rotation_manual',
      shiftId: dto.shiftId,
      excuseReason: dto.notes,
    });
  }

  @Post('attendance/gps')
  @RequireRoles('trainee')
  async gpsAttendance(@CurrentUser() user: IAuthenticatedUser, @Body() dto: { lat: number; lng: number; shiftId?: string }) {
    // Geofencing: validate trainee is within allowed radius of their assigned hospital
    const profile = await this.prisma.traineeProfile.findFirst({
      where: { personId: user.personId },
      include: { organization: true },
    });
    if (profile?.organization?.geoLat && profile?.organization?.geoLng) {
      const orgLat = Number(profile.organization.geoLat);
      const orgLng = Number(profile.organization.geoLng);
      const radiusSetting = await this.prisma.setting.findFirst({
        where: { organizationId: profile.organizationId, key: 'gps_attendance_radius_meters' },
      });
      const allowedRadius = radiusSetting ? Number((radiusSetting.value as any)) : 500;
      const distance = haversineMeters(dto.lat, dto.lng, orgLat, orgLng);
      if (distance > allowedRadius) {
        throw new BadRequestException(`أنت خارج نطاق تسجيل الحضور. المسافة: ${Math.round(distance)} متر، الحد الأقصى: ${allowedRadius} متر`);
      }
    }
    return this.createAttendance(user, { method: 'gps', geoLat: dto.lat, geoLng: dto.lng, shiftId: dto.shiftId });
  }

  @Post('attendance/qr')
  @RequireRoles('trainee')
  async qrAttendance(@CurrentUser() user: IAuthenticatedUser, @Body() dto: { qrCode: string; shiftId?: string }) {
    // Validate scanned QR matches trainee's issued card QR payload
    const profile = await this.prisma.traineeProfile.findFirst({ where: { personId: user.personId } });
    if (profile?.cardUuid) {
      // Accept either the raw cardUuid or a JSON payload containing it
      const isValid = dto.qrCode === profile.cardUuid ||
        (() => { try { return JSON.parse(dto.qrCode)?.uuid === profile.cardUuid; } catch { return false; } })();
      if (!isValid) {
        throw new BadRequestException('رمز QR غير صحيح أو لا يطابق بطاقتك');
      }
    }
    return this.createAttendance(user, { method: 'qr', shiftId: dto.shiftId });
  }

  @Patch('attendance/:id/check-out')
  @RequireRoles('trainee')
  async checkOut(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) {
    const profile = await this.myTrainee(user);
    if (!profile) throw new BadRequestException('لا يوجد ملف متدرب');
    const existing = await this.prisma.attendance.findFirst({ where: { id } });
    if (!existing) throw new BadRequestException('سجل الحضور غير موجود');
    if (existing.traineeProfileId !== profile.id) {
      throw new ForbiddenException('سجل الحضور غير تابع لك');
    }
    if (!existing.checkIn) throw new BadRequestException('لا يمكن تسجيل الانصراف قبل تسجيل الحضور');
    if (existing.checkOut) throw new BadRequestException('تم تسجيل الانصراف مسبقاً لهذا اليوم');
    const data = await this.prisma.attendance.update({ where: { id }, data: { checkOut: new Date() } });
    return { success: true, data };
  }

  @Patch('attendance/:id/approve')
  @RequireRoles('trainer', 'org_manager', 'platform_owner')
  async approveAttendance(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) {
    await this.assertAttendanceInScope(id, user);
    const data = await this.prisma.attendance.update({ where: { id }, data: { status: 'present', approvedById: user.accountId } });
    await this.audit(user, 'attendance.approve', 'Attendance', id, data);
    return { success: true, data };
  }

  @Patch('attendance/:id/reject')
  @RequireRoles('trainer', 'org_manager', 'platform_owner')
  async rejectAttendance(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser, @Body() dto: { reason?: string }) {
    await this.assertAttendanceInScope(id, user);
    const data = await this.prisma.attendance.update({ where: { id }, data: { status: 'rejected', excuseReason: dto.reason, approvedById: user.accountId } });
    await this.audit(user, 'attendance.reject', 'Attendance', id, data);
    return { success: true, data };
  }

  @Post('attendance/:id/correction-request')
  @RequireRoles('trainee')
  async correctionRequest(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser, @Body() dto: { reason: string }) {
    const profile = await this.myTrainee(user);
    const own = await this.prisma.attendance.findFirst({ where: { id, traineeProfileId: profile?.id } });
    if (!own) throw new BadRequestException('سجل الحضور غير موجود أو ليس ملكك');
    const data = await this.prisma.attendance.update({ where: { id }, data: { status: 'correction_requested', excuseReason: dto.reason } });
    await this.audit(user, 'attendance.correction_request', 'Attendance', id, data);
    return { success: true, data };
  }

  @Get('evaluations')
  @RequireCapability(
    CAPABILITIES.EVALUATION_SUBMIT, CAPABILITIES.TRAINEE_VIEW_SCOPE,
    CAPABILITIES.TRAINEE_VIEW_HOSPITAL, CAPABILITIES.SELF_VIEW,
  )
  async evaluations(@CurrentUser() user: IAuthenticatedUser) {
    const data = await this.prisma.evaluation.findMany({
      where: {
        organizationId: user.organizationId,
        ...(await this.evaluationReadScope(user)),
      },
      // Only the participants' names are displayed. Including the UserAccount whole
      // carried passwordHash, refreshTokenHash, mfaSecret and nationalId for both
      // evaluator and evaluatee into a response any evaluation reader receives.
      include: {
        form: true,
        evaluator: EVALUATION_PARTICIPANT_SELECT,
        evaluatee: EVALUATION_PARTICIPANT_SELECT,
        rotation: { include: { department: true } },
      },
      orderBy: { submittedAt: 'desc' },
      take: 100,
    });
    return { data };
  }

  /**
   * Row filter for the evaluation list, on top of the organisation filter.
   *
   * This list used to be organisation-wide for every caller the capability
   * guard let through, and that set includes `trainee` (SELF_VIEW) and plain
   * `trainer` (EVALUATION_SUBMIT). So a trainee could read every evaluation
   * every trainer in the hospital had written about every other trainee, and a
   * trainer could read the scores of trainees who were never assigned to them.
   * The trainee dashboard tried to narrow it in the browser, which is not a
   * boundary at all — the raw response already carried the other rows.
   *
   * The boundary belongs here:
   *   trainee → evaluations about them, plus the department evaluations they
   *             themselves submitted;
   *   trainer → evaluations they authored, plus evaluations about a trainee
   *             currently assigned to them (the same active-rotation link
   *             `trainerTraineeScope` uses everywhere else);
   *   supervisory roles (hospital training administration, org manager,
   *             academic supervisor, platform owner) → unchanged, hospital-wide.
   */
  private async evaluationReadScope(
    user: IAuthenticatedUser,
  ): Promise<Prisma.EvaluationWhereInput> {
    const isSupervisory = [
      'hospital_training_admin',
      'academic_supervisor',
      'org_manager',
      'platform_owner',
    ].some((role) => user.roles.includes(role));
    if (isSupervisory) return {};

    if (user.roles.includes('trainee')) {
      return {
        OR: [{ evaluateeId: user.accountId }, { evaluatorId: user.accountId }],
      };
    }

    if (user.roles.includes('trainer')) {
      const trainer = await this.myTrainer(user);
      if (!trainer) return { evaluatorId: user.accountId };
      return {
        OR: [
          { evaluatorId: user.accountId },
          {
            evaluatee: {
              person: {
                traineeProfile: {
                  rotations: {
                    some: {
                      trainerProfileId: trainer.id,
                      organizationId: user.organizationId,
                      status: 'active',
                    },
                  },
                },
              },
            },
          },
        ],
      };
    }

    // Any other role the capability guard admits sees only what it authored or
    // received — never a hospital-wide list by default.
    return {
      OR: [{ evaluateeId: user.accountId }, { evaluatorId: user.accountId }],
    };
  }

  @Get('evaluations/forms')
  async evaluationForms(@CurrentUser() user: IAuthenticatedUser) {
    const data = await this.prisma.evaluationForm.findMany({ where: { organizationId: user.organizationId, isActive: true }, orderBy: { formType: 'asc' } });
    return { data };
  }

  // ── Evaluation form templates — hospital training administration only ──────
  // The trainer reads GET evaluations/forms (active only) to grade with; these
  // manage what that list contains. Trainers and trainees hold no write here.
  @Get('evaluations/forms/manage')
  @RequireRoles('hospital_training_admin', 'org_manager', 'platform_owner')
  @ApiOperation({ summary: 'نماذج التقييم بالمستشفى — بما فيها المعطّلة' })
  async listEvaluationForms(@CurrentUser() user: IAuthenticatedUser) {
    return this.evaluationService.listForms(user.organizationId);
  }

  @Post('evaluations/forms')
  @RequireRoles('hospital_training_admin', 'org_manager', 'platform_owner')
  @ApiOperation({ summary: 'إنشاء نموذج تقييم جديد للمستشفى' })
  async createEvaluationForm(@CurrentUser() user: IAuthenticatedUser, @Body() dto: any) {
    return this.evaluationService.createForm(dto, user);
  }

  @Patch('evaluations/forms/:id')
  @RequireRoles('hospital_training_admin', 'org_manager', 'platform_owner')
  @ApiOperation({ summary: 'تعديل نموذج تقييم — المعايير مقفلة بعد أول استخدام' })
  async updateEvaluationForm(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: any,
  ) {
    return this.evaluationService.updateForm(id, dto, user);
  }

  @Patch('evaluations/forms/:id/active')
  @RequireRoles('hospital_training_admin', 'org_manager', 'platform_owner')
  @ApiOperation({ summary: 'تفعيل أو تعطيل نموذج تقييم' })
  async setEvaluationFormActive(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { isActive: boolean },
  ) {
    return this.evaluationService.setFormActive(id, !!dto.isActive, user);
  }

  @Delete('evaluations/forms/:id')
  @RequireRoles('hospital_training_admin', 'org_manager', 'platform_owner')
  @ApiOperation({ summary: 'حذف نموذج تقييم غير مستخدم' })
  async deleteEvaluationForm(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) {
    return this.evaluationService.deleteForm(id, user);
  }

  // ── POST /operations/evaluations  — trainer submits evaluation with all guards ──
  @Post('evaluations')
  @RequireRoles('trainer', 'academic_supervisor', 'org_manager', 'platform_owner')
  @ApiOperation({ summary: 'إرسال تقييم المدرب للمتدرب — مع تطبيق القفل المتبادل وحارس اجتماع منتصف الدورة' })
  async createEvaluation(@CurrentUser() user: IAuthenticatedUser, @Body() dto: any) {
    return this.evaluationService.submitTrainerEvaluation(dto, user);
  }

  // ── POST /operations/evaluations/department  — trainee rates dept (anonymous) ──
  @Post('evaluations/department')
  @RequireRoles('trainee')
  @ApiOperation({ summary: 'تقييم المتدرب للقسم — مجهول الهوية تجاه القسم، ظاهر للشؤون الأكاديمية فقط' })
  async submitDepartmentEvaluation(@CurrentUser() user: IAuthenticatedUser, @Body() dto: any) {
    return this.evaluationService.submitDepartmentEvaluation(dto, user);
  }

  // ── GET /operations/evaluations/midpoint/:rotationId  — midpoint meeting status ──
  @Get('evaluations/midpoint/:rotationId')
  @RequireRoles('trainer', 'org_manager', 'platform_owner', 'trainee')
  @ApiOperation({ summary: 'حالة اجتماع منتصف الدورة للروتيشن' })
  async midpointStatus(@Param('rotationId') rotationId: string, @CurrentUser() user: IAuthenticatedUser) {
    return this.evaluationService.midpointStatus(rotationId, user.organizationId);
  }

  // ── PATCH /operations/evaluations/midpoint/:rotationId/complete  — record meeting ──
  @Patch('evaluations/midpoint/:rotationId/complete')
  @RequireRoles('trainer', 'org_manager', 'platform_owner')
  @ApiOperation({ summary: 'تسجيل اجتماع منتصف الدورة كمكتمل — شرط مسبق للتقييم النهائي' })
  async completeMidpointMeeting(
    @Param('rotationId') rotationId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { notes?: string },
  ) {
    return this.evaluationService.completeMidpointMeeting(rotationId, dto.notes, user);
  }

  // ── GET /operations/evaluations/mutual-lock — mutual lock status ──────────
  @Get('evaluations/mutual-lock')
  @RequireRoles('trainer', 'org_manager', 'platform_owner', 'trainee')
  @ApiOperation({ summary: 'حالة القفل المتبادل للتقييم — كلا الطرفين يجب أن يكمل تقييمه' })
  async mutualLockStatus(
    @Query('rotationId') rotationId: string,
    @Query('traineeAccountId') traineeAccountId: string,
  ) {
    return this.evaluationService.mutualLockStatus(rotationId, traineeAccountId);
  }

  // ── GET /operations/evaluations/slow-evaluators  — academic supervisor report ──
  @Get('evaluations/slow-evaluators')
  @RequireRoles('trainer', 'hospital_training_admin', 'cluster_administrator', 'cluster_manager', 'training_director', 'academic_supervisor', 'org_manager', 'platform_owner')
  @ApiOperation({ summary: 'تقرير كاشف التقييم الآلي — المدربون الذين أرسلوا تقييمات مشبوهة (أقل من 40 ثانية)' })
  async slowEvaluators(@CurrentUser() user: IAuthenticatedUser) {
    return this.evaluationService.slowEvaluatorReport(user.organizationId);
  }

  // ── GET /operations/evaluations/my-pending  — trainee/trainer pending evals ────
  @Get('evaluations/my-pending')
  @RequireRoles('trainee', 'trainer', 'hospital_training_admin', 'cluster_administrator', 'cluster_manager', 'training_director', 'platform_owner', 'org_manager')
  @ApiOperation({ summary: 'التقييمات المعلقة للمتدرب أو المدرب — التقييمات التي تنتظر الإكمال' })
  async myPendingEvaluations(@CurrentUser() user: IAuthenticatedUser) {
    return this.evaluationService.myPendingEvaluations(user);
  }

  @Get('tasks')
  async tasks(@CurrentUser() user: IAuthenticatedUser) {
    const data = await this.prisma.task.findMany({
      where: { organizationId: user.organizationId, assignedToId: user.accountId },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    });
    return { data };
  }

  @Post('tasks')
  @RequireRoles('trainer', 'org_manager', 'platform_owner')
  async createTask(@CurrentUser() user: IAuthenticatedUser, @Body() dto: any) {
    // A plain trainer may only assign tasks to a trainee currently assigned to
    // them — otherwise nothing stopped dto.assignedToId from naming any account
    // on the platform.
    const isPlainTrainer =
      user.roles.includes('trainer') &&
      !user.roles.includes('org_manager') &&
      !user.roles.includes('platform_owner');
    if (isPlainTrainer) {
      const trainer = await this.myTrainer(user);
      const targetProfile = await this.prisma.traineeProfile.findFirst({
        where: { person: { userAccounts: { some: { id: dto.assignedToId } } } },
      });
      const assigned =
        trainer && targetProfile
          ? (await this.prisma.traineeAllocation.findFirst({
              where: { traineeProfileId: targetProfile.id, trainerProfileId: trainer.id, status: 'open' },
            })) ||
            (await this.prisma.rotation.findFirst({
              where: { traineeProfileId: targetProfile.id, trainerProfileId: trainer.id, status: { in: ['scheduled', 'active'] } },
            }))
          : null;
      if (!assigned) {
        throw new BadRequestException('لا يمكن إسناد مهمة لمتدرب غير مسند إليك');
      }
    }

    await this.assertTraineeAccountNotLocked(dto.assignedToId);

    const data = await this.prisma.task.create({
      data: {
        organizationId: user.organizationId,
        assignedToId: dto.assignedToId,
        assignedById: user.accountId,
        titleAr: dto.titleAr,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        priority: dto.priority,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
      },
    });
    await this.notify(user.organizationId, dto.assignedToId, dto.titleAr, dto.description || '', 'task', 'Task', data.id);
    return { success: true, data };
  }

  /**
   * Edit a task the caller assigned. Scoped to the assigner, mirroring the
   * ownership boundary POST /tasks already enforces on creation — a trainer may
   * only ever touch tasks they issued to their own trainee.
   */
  @Patch('tasks/:id')
  @RequireRoles('trainer', 'org_manager', 'platform_owner')
  async updateTask(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { titleAr?: string; description?: string; dueDate?: string; priority?: string; status?: string },
  ) {
    const own = await this.prisma.task.findFirst({ where: { id, assignedById: user.accountId } });
    if (!own) throw new BadRequestException('المهمة غير موجودة أو لم تُسندها أنت');
    const data = await this.prisma.task.update({
      where: { id },
      data: {
        titleAr: dto.titleAr ?? undefined,
        description: dto.description ?? undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        priority: dto.priority ?? undefined,
        status: dto.status ?? undefined,
      },
    });
    await this.audit(user, 'task.update', 'Task', id, data);
    return { success: true, data };
  }

  /** Delete a task the caller assigned — same ownership boundary as the edit. */
  @Delete('tasks/:id')
  @RequireRoles('trainer', 'org_manager', 'platform_owner')
  async deleteTask(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) {
    const own = await this.prisma.task.findFirst({ where: { id, assignedById: user.accountId } });
    if (!own) throw new BadRequestException('المهمة غير موجودة أو لم تُسندها أنت');
    await this.prisma.task.delete({ where: { id } });
    await this.audit(user, 'task.delete', 'Task', id, own);
    return { success: true };
  }

  @Patch('tasks/:id/complete')
  async completeTask(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) {
    // Only the assignee may mark their own task complete — matches the
    // ownership boundary GET /tasks already reads by (assignedToId).
    const own = await this.prisma.task.findFirst({ where: { id, assignedToId: user.accountId } });
    if (!own) throw new BadRequestException('المهمة غير موجودة أو ليست مسندة إليك');
    const data = await this.prisma.task.update({ where: { id }, data: { status: 'completed', completedAt: new Date() } });
    await this.audit(user, 'task.complete', 'Task', id, data);
    return { success: true, data };
  }

  @Get('analytics')
  @RequireCapability(CAPABILITIES.REPORT_VIEW, CAPABILITIES.TRAINEE_VIEW_HOSPITAL)
  async analytics(@CurrentUser() user: IAuthenticatedUser, @Query('scope') scope = 'hospital') {
    const organizationId = user.organizationId;
    const [trainees, trainers, rotations, attendance, cases, evaluations, calls] = await Promise.all([
      this.prisma.traineeProfile.count({ where: { organizationId } }),
      this.prisma.trainerProfile.count({ where: { organizationId } }),
      this.prisma.rotation.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
      this.prisma.attendance.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
      this.prisma.clinicalCaseLog.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
      this.prisma.evaluation.aggregate({ where: { organizationId }, _avg: { totalScore: true }, _count: true }),
      this.prisma.trainerCall.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
    ]);
    return { data: { scope, trainees, trainers, rotations, attendance, logbook: cases, evaluations, calls } };
  }

  @Get('calendar')
  @RequireCapability(
    CAPABILITIES.TRAINEE_VIEW_HOSPITAL, CAPABILITIES.TRAINEE_VIEW_ASSIGNED,
    CAPABILITIES.SELF_VIEW,
  )
  async calendar(@CurrentUser() user: IAuthenticatedUser) {
    const [rotations, shifts, tasks] = await Promise.all([
      this.prisma.rotation.findMany({ where: { organizationId: user.organizationId }, include: { department: true, traineeProfile: { include: { person: true } } }, take: 100 }),
      this.prisma.shift.findMany({ where: { organizationId: user.organizationId }, include: { department: true, traineeProfile: { include: { person: true } } }, take: 100 }),
      this.prisma.task.findMany({ where: { organizationId: user.organizationId, assignedToId: user.accountId }, take: 100 }),
    ]);
    return { data: { rotations, shifts, tasks } };
  }

  @Post('notifications/register-device')
  async registerDevice(@CurrentUser() user: IAuthenticatedUser, @Body() dto: any) {
    const data = await this.prisma.setting.upsert({
      where: { organizationId_key: { organizationId: user.organizationId, key: `push_device:${user.accountId}:${dto.deviceId}` } },
      create: { organizationId: user.organizationId, key: `push_device:${user.accountId}:${dto.deviceId}`, value: dto as Prisma.InputJsonValue, updatedById: user.accountId },
      update: { value: dto as Prisma.InputJsonValue, updatedById: user.accountId },
    });
    return { success: true, data };
  }

  private async createAttendance(user: IAuthenticatedUser, data: any) {
    const profile = await this.myTrainee(user);
    if (!profile) throw new BadRequestException('لا يوجد ملف متدرب للمستخدم الحالي');

    const activeRotation = await this.prisma.rotation.findFirst({
      where: { traineeProfileId: profile.id, status: 'active' },
    });

    if (!activeRotation) {
      throw new BadRequestException('لا يوجد روتيشن نشط متاح لتسجيل الحضور');
    }

    const now = new Date();
    if (now < new Date(activeRotation.startDate) || now > new Date(activeRotation.endDate)) {
      throw new BadRequestException('التاريخ الحالي خارج نطاق فترة الروتيشن النشط');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await this.prisma.attendance.findFirst({ where: { traineeProfileId: profile.id, date: today } });

    if (existing?.checkIn && existing?.checkOut) {
      throw new BadRequestException('تم تسجيل الحضور والانصراف لهذا اليوم بالفعل');
    }

    if (existing?.checkIn && !existing.checkOut) {
      throw new BadRequestException('تم تسجيل حضورك اليوم بالفعل — لا يمكن تسجيل الحضور مرتين');
    }

    // No departmentId: Attendance has no such column (the rotation carries the
    // department). Passing it made every check-in fail with a Prisma "Unknown
    // argument" error surfaced as a 500, so attendance could never be recorded.
    const attendanceData = {
      organizationId: activeRotation.organizationId,
      traineeProfileId: profile.id,
      date: today,
      checkIn: new Date(),
      status: 'present',
      ...data,
    };

    const attendance = existing
      ? await this.prisma.attendance.update({ where: { id: existing.id }, data: { checkIn: new Date(), status: 'present', ...data } })
      : await this.prisma.attendance.create({ data: attendanceData });
    await this.audit(user, `attendance.${data.method}`, 'Attendance', attendance.id, attendance);
    return { success: true, data: attendance };
  }

  private async myTrainee(user: IAuthenticatedUser) {
    let profile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
      include: { person: true, organization: true, program: true },
    });
    if (!profile && user.personId) {
      profile = await this.prisma.traineeProfile.findFirst({
        where: { personId: user.personId },
        include: { person: true, organization: true, program: true },
      });
    }
    return profile;
  }

  private async myTrainer(user: IAuthenticatedUser) {
    let profile = await this.prisma.trainerProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
      include: { person: true, department: true },
    });
    if (!profile && user.personId) {
      profile = await this.prisma.trainerProfile.findFirst({
        where: { personId: user.personId },
        include: { person: true, department: true },
      });
    }
    if (!profile && user.roles.includes('trainer') && user.personId && user.organizationId) {
      profile = await this.prisma.trainerProfile.create({
        data: {
          personId: user.personId,
          organizationId: user.organizationId,
          maxTrainees: 5,
        },
        include: { person: true, department: true },
      });
    }
    return profile;
  }

  /**
   * Trainee filter for a trainer-facing endpoint.
   *
   * A trainer sees ONLY trainees assigned to them via an active rotation. When
   * no trainer profile resolves, the filter matches nothing — it must never
   * widen to the whole organisation, which would expose every trainee in the
   * hospital to any account holding the trainer role.
   */
  private trainerTraineeScope(
    trainer: { id: string } | null,
    user: IAuthenticatedUser,
  ): Prisma.TraineeProfileWhereInput {
    if (trainer) {
      return {
        rotations: {
          some: {
            trainerProfileId: trainer.id,
            organizationId: user.organizationId,
            status: 'active',
          },
        },
      };
    }
    return { id: { in: [] } };
  }

  private async assertAttendanceInScope(id: string, user: IAuthenticatedUser) {
    if (user.roles.includes('hospital_administrator')) {
      throw new ForbiddenException('مدير المستشفى لا يملك صلاحية على سجلات الحضور');
    }

    const record = await this.prisma.attendance.findUnique({
      where: { id },
      include: { traineeProfile: true },
    });
    if (!record) throw new NotFoundException('سجل الحضور غير موجود');

    if (user.roles.includes('trainer')) {
      const trainer = await this.myTrainer(user);
      if (!trainer) throw new ForbiddenException('ملف المدرب غير موجود');
      const activeRotation = await this.prisma.rotation.findFirst({
        where: {
          traineeProfileId: record.traineeProfileId,
          trainerProfileId: trainer.id,
          status: 'active',
        },
      });
      if (!activeRotation) {
        throw new ForbiddenException('لا يمكنك اتخاذ إجراء على سجل حضور لمتدرب غير مسند إليك');
      }
    } else {
      if (record.organizationId !== user.organizationId) {
        throw new ForbiddenException('سجل الحضور خارج نطاق مستشفاك التنظيمي');
      }
    }
    return record;
  }

  private audit(user: IAuthenticatedUser, action: string, entityType: string, entityId: string, data: unknown) {
    return this.prisma.auditLog.create({
      data: { organizationId: user.organizationId, actorId: user.accountId, action, entityType, entityId, newValues: data as Prisma.InputJsonValue },
    });
  }

  private notify(organizationId: string, userId: string, titleAr: string, bodyAr: string, type: string, referenceType: string, referenceId: string) {
    return this.prisma.notification.create({
      data: { organizationId, userId, titleAr, bodyAr, type, referenceType, referenceId, sentVia: 'in_app' },
    });
  }
}
