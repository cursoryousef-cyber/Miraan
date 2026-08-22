import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeContext } from '../../common/authz';

/**
 * The trainee timeline — the operational state of a trainee.
 *
 * Everything here is derived at read time from records that already exist:
 * the pinned plan version supplies the requirements, and rotations, case logs,
 * evaluations, objective progress and attendance supply the achievement. There
 * is deliberately no progress table of its own — a stored copy would be a second
 * source of truth that drifts from the records it summarises.
 *
 * Every dashboard reads through this service so hospital, university and cluster
 * views can never disagree about a trainee's progress.
 */

/** One step on a trainee's journey, in the order it happened. */
export interface JourneyEvent {
  stage: string;
  labelAr: string;
  at: Date;
  [key: string]: unknown;
}

/** Case log states that count as real, signed-off evidence. */
const APPROVED_LOG_STATUSES = [
  'trainer_approved',
  'academic_approved',
  'completed',
];
/** Attendance states that count as the trainee having shown up. */
const PRESENT_STATUSES = ['present', 'late'];
/** Rotation states that consume a seat and contribute to progress. */
const TERMINAL_ROTATION_STATUSES = ['completed', 'skipped', 'cancelled'];

export interface RequirementProgress {
  required: number;
  completed: number;
  percentage: number;
  outstanding: Array<{
    code: string;
    titleAr: string;
    required: number;
    completed: number;
  }>;
}

export interface RotationProgress {
  rotationId: string;
  sequenceOrder: number | null;
  status: string;
  departmentId: string;
  departmentNameAr: string;
  trainerProfileId: string;
  trainerNameAr: string | null;
  startDate: Date;
  endDate: Date;
  durationDays: number;
  elapsedDays: number;
  remainingDays: number;
  progressPercentage: number;
  fromPlan: boolean;
  competencies: RequirementProgress;
  procedures: RequirementProgress;
  logbook: RequirementProgress;
  evaluations: RequirementProgress;
  attendance: {
    expectedDays: number;
    presentDays: number;
    missingDays: number;
    rate: number;
  };
}

@Injectable()
export class TimelineService {
  constructor(private prisma: PrismaService) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** The full timeline for one trainee. */
  /**
   * The trainee's journey: request → review → approval → batch → allocation →
   * department → trainer → reassignments → training → completion.
   *
   * Assembled from the records that already carry these facts — TrainingRequest,
   * AcademicIntake, TraineeAllocation, Rotation and AuditLog — rather than from a
   * parallel event table. A duplicated timeline store would be one more thing that
   * can disagree with the data it describes.
   *
   * Scope is enforced: a hospital sees the journey of a trainee it holds, and the
   * allocation entries that involve other hospitals are reduced to the fact that a
   * transfer occurred, without that hospital's internal detail.
   */
  async getTraineeJourney(traineeRowId: string, scope: ScopeContext) {
    const row = await this.prisma.trainingRequestTrainee.findUnique({
      where: { id: traineeRowId },
      include: {
        trainingRequest: {
          include: {
            sourceOrg: { select: { id: true, nameAr: true } },
            targetOrg: { select: { id: true, nameAr: true } },
          },
        },
        academicIntake: {
          include: {
            approvedBy: { select: { person: { select: { nameAr: true } } } },
          },
        },
        allocations: {
          orderBy: { performedAt: 'asc' },
          include: {
            hospital: { select: { id: true, nameAr: true } },
            department: { select: { id: true, nameAr: true } },
            trainerProfile: {
              include: { person: { select: { nameAr: true } } },
            },
            performedBy: { select: { person: { select: { nameAr: true } } } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('صف المتدرب غير موجود');

    const owners = [
      row.trainingRequest?.sourceOrgId,
      row.trainingRequest?.targetOrgId,
      row.assignedHospitalId,
    ].filter((o): o is string => !!o);

    if (
      scope.visibleOrgIds !== null &&
      !owners.some((o) => scope.visibleOrgIds!.includes(o))
    ) {
      throw new ForbiddenException('هذا المتدرب خارج نطاق صلاحياتك التنظيمية');
    }

    const audits = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'TrainingRequestTrainee', entityId: traineeRowId },
          { entityType: 'TrainingRequest', entityId: row.trainingRequestId },
          ...(row.academicIntakeId
            ? [{ entityType: 'AcademicIntake', entityId: row.academicIntakeId }]
            : []),
          {
            entityType: 'TraineeAllocation',
            entityId: { in: row.allocations.map((a) => a.id) },
          },
        ],
      },
      include: { actor: { select: { person: { select: { nameAr: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    const auditByEntity = new Map(
      audits.map((a) => [`${a.entityType}:${a.entityId}`, a]),
    );

    const events: JourneyEvent[] = [];
    const push = (
      stage: string,
      labelAr: string,
      at: Date | null,
      extra: Record<string, unknown> = {},
    ) => {
      if (!at) return;
      events.push({ stage, labelAr, at, ...extra });
    };

    const req = row.trainingRequest;
    if (req) {
      push('request_created', 'إنشاء طلب التدريب', req.createdAt, {
        requestNumber: req.requestNumber,
        organizationAr: req.sourceOrg?.nameAr,
        organizationId: req.sourceOrgId,
      });
      push('request_received', 'استلام التجمع للطلب', req.createdAt, {
        organizationAr: req.targetOrg?.nameAr,
        organizationId: req.targetOrgId,
      });

      const decision = auditByEntity.get(`TrainingRequest:${req.id}`);
      if (
        ['approved', 'auto_allocated', 'active', 'graduated'].includes(
          req.status,
        )
      ) {
        push(
          'request_approved',
          'اعتماد الطلب',
          decision?.createdAt ?? req.updatedAt,
          {
            actorAr: decision?.actor?.person?.nameAr,
            status: req.status,
          },
        );
      } else if (req.status === 'rejected') {
        push(
          'request_rejected',
          'رفض الطلب',
          decision?.createdAt ?? req.updatedAt,
          {
            actorAr: decision?.actor?.person?.nameAr,
          },
        );
      }
    }

    const batch = row.academicIntake;
    if (batch) {
      push(
        'batch_created',
        'إنشاء الدفعة الأكاديمية',
        batch.approvedAt ?? batch.createdAt,
        {
          batchCode: batch.code,
          actorAr: batch.approvedBy?.person?.nameAr,
          organizationId: batch.organizationId,
        },
      );
      push(
        'trainee_added',
        'إضافة المتدرب للدفعة',
        batch.approvedAt ?? batch.createdAt,
        {
          traineeAr: row.nameAr,
        },
      );
    }

    // Allocation entries carry the from → to of every move.
    const inScope = (orgId: string) =>
      scope.visibleOrgIds === null || scope.visibleOrgIds.includes(orgId);

    for (const a of row.allocations) {
      const visible = inScope(a.hospitalId);
      const stageByAction: Record<string, [string, string]> = {
        auto: ['hospital_allocated', 'التوزيع الآلي على المستشفى'],
        manual: ['hospital_allocated', 'التوزيع على المستشفى'],
        cluster_reassign: ['hospital_reassigned', 'نقل بين المستشفيات'],
        hospital_assign: ['department_assigned', 'الإسناد داخل المستشفى'],
        hospital_reassign: [
          'department_reassigned',
          'إعادة توزيع داخل المستشفى',
        ],
      };
      const [stage, labelAr] = stageByAction[a.action] ?? [
        'allocation',
        'تخصيص',
      ];

      push(stage, labelAr, a.performedAt, {
        allocationId: a.id,
        action: a.action,
        status: a.status,
        // Another hospital's internal arrangement is not this viewer's business;
        // the fact of the transfer is.
        fromHospitalAr: visible ? undefined : 'مستشفى آخر',
        hospitalAr: visible ? a.hospital?.nameAr : 'مستشفى آخر',
        departmentAr: visible ? a.department?.nameAr : undefined,
        trainerAr: visible ? a.trainerProfile?.person?.nameAr : undefined,
        actorAr: a.performedBy?.person?.nameAr,
        reason: a.reason,
        previousAllocationId: a.previousAllocationId,
      });
    }

    const rotations = await this.prisma.rotation.findMany({
      where: { traineeProfileId: row.traineeProfileId ?? '' },
      include: {
        department: { select: { nameAr: true, organizationId: true } },
      },
      orderBy: { startDate: 'asc' },
    });
    for (const r of rotations) {
      const visible = inScope(r.organizationId);
      push('training_started', 'بدء التدريب', r.startDate, {
        departmentAr: visible ? r.department?.nameAr : 'قسم في مستشفى آخر',
        status: r.status,
      });
      if (r.status === 'completed') {
        push('training_completed', 'إتمام الروتيشن', r.endDate, {
          departmentAr: visible ? r.department?.nameAr : undefined,
        });
      }
    }

    if (row.traineeProfileId) {
      const profile = await this.prisma.traineeProfile.findUnique({
        where: { id: row.traineeProfileId },
        select: { graduatedAt: true },
      });
      push('graduated', 'التخرج', profile?.graduatedAt ?? null);
    }

    events.sort((a, b) => a.at.getTime() - b.at.getTime());

    return {
      data: {
        trainee: { rowId: row.id, nameAr: row.nameAr, status: row.status },
        request: req
          ? { id: req.id, requestNumber: req.requestNumber, status: req.status }
          : null,
        batch: batch ? { id: batch.id, code: batch.code } : null,
        currentAllocation:
          row.allocations.find((a) => a.status === 'open') ?? null,
        events,
      },
    };
  }

  async getTraineeTimeline(traineeProfileId: string) {
    const profile = await this.prisma.traineeProfile.findUnique({
      where: { id: traineeProfileId },
      include: {
        person: { select: { nameAr: true, nameEn: true } },
        organization: { select: { id: true, nameAr: true } },
        program: {
          select: { id: true, code: true, nameAr: true, durationMonths: true },
        },
        trainingPlan: { select: { id: true, code: true, nameAr: true } },
        trainingPlanVersion: {
          include: { rotations: { orderBy: { sequenceOrder: 'asc' } } },
        },
        graduationApprovals: true,
      },
    });
    if (!profile) throw new NotFoundException('المتدرب غير موجود');

    const rotations = await this.prisma.rotation.findMany({
      where: { traineeProfileId },
      include: {
        department: { select: { id: true, nameAr: true, code: true } },
        trainerProfile: { include: { person: { select: { nameAr: true } } } },
        trainingPlanRotation: true,
      },
      orderBy: [{ sequenceOrder: 'asc' }, { startDate: 'asc' }],
    });

    const evidence = await this.loadEvidence(
      traineeProfileId,
      profile.personId,
    );
    const now = new Date();

    const rotationProgress = rotations.map((r) =>
      this.buildRotationProgress(r, evidence, now),
    );

    // ── Header ────────────────────────────────────────────────────────────────
    const startDate = rotations.length ? rotations[0].startDate : null;
    const endDate = rotations.length
      ? rotations.reduce(
          (max, r) => (r.endDate > max ? r.endDate : max),
          rotations[0].endDate,
        )
      : null;

    // ── Current position ──────────────────────────────────────────────────────
    const currentIndex = this.findCurrentIndex(rotations, now);
    const current = currentIndex >= 0 ? rotations[currentIndex] : null;
    const currentProgress =
      currentIndex >= 0 ? rotationProgress[currentIndex] : null;

    const completedRotations = rotations.filter(
      (r) => r.status === 'completed',
    ).length;
    const skippedRotations = rotations.filter(
      (r) => r.status === 'skipped',
    ).length;
    const cancelledRotations = rotations.filter(
      (r) => r.status === 'cancelled',
    ).length;
    const remainingRotations = rotations.filter(
      (r) => !TERMINAL_ROTATION_STATUSES.includes(r.status),
    ).length;

    // Weighted by rotation length so a 12-week block counts for more than a
    // 4-week one, with partial credit for the rotation in flight.
    const completionPercentage = this.weightedCompletion(
      rotations,
      rotationProgress,
    );

    const planned = profile.trainingPlanVersion?.rotations ?? [];
    const readiness = await this.computeReadiness(
      profile,
      rotations,
      rotationProgress,
      evidence,
      now,
    );

    return {
      data: {
        trainee: {
          id: profile.id,
          traineeNumber: profile.traineeNumber,
          nameAr: profile.person.nameAr,
          nameEn: profile.person.nameEn,
          applicationStatus: profile.applicationStatus,
          organizationId: profile.organizationId,
          organizationNameAr: profile.organization.nameAr,
        },
        program: profile.program,
        trainingPlan: profile.trainingPlan,
        trainingPlanVersion: profile.trainingPlanVersion
          ? {
              id: profile.trainingPlanVersion.id,
              versionNumber: profile.trainingPlanVersion.versionNumber,
              label: profile.trainingPlanVersion.label,
              status: profile.trainingPlanVersion.status,
              totalWeeks: profile.trainingPlanVersion.totalWeeks,
              plannedRotations: planned.length,
            }
          : null,
        trainingStartDate: startDate,
        trainingEndDate: endDate,
        expectedGraduationDate: profile.expectedGraduationDate,
        graduatedAt: profile.graduatedAt,

        current: current
          ? {
              rotationId: current.id,
              sequenceOrder: current.sequenceOrder,
              status: current.status,
              departmentId: current.departmentId,
              departmentNameAr: current.department.nameAr,
              trainerProfileId: current.trainerProfileId,
              trainerNameAr: current.trainerProfile?.person?.nameAr ?? null,
              startDate: current.startDate,
              endDate: current.endDate,
              remainingDays: currentProgress!.remainingDays,
              progressPercentage: currentProgress!.progressPercentage,
            }
          : null,

        rotationSummary: {
          total: rotations.length,
          planned: planned.length,
          completed: completedRotations,
          remaining: remainingRotations,
          skipped: skippedRotations,
          cancelled: cancelledRotations,
        },
        completionPercentage,
        graduationProgress: readiness.overallCompletion,
        rotations: rotationProgress,
        readiness,
      },
    };
  }

  /** Graduation readiness on its own, for callers that do not need the full timeline. */
  async getGraduationReadiness(traineeProfileId: string) {
    const timeline = await this.getTraineeTimeline(traineeProfileId);
    return { data: timeline.data.readiness };
  }

  /**
   * Timeline summaries for a set of trainees — the single source every dashboard
   * reads, so hospital, university and cluster views cannot disagree.
   *
   * `scope` selects which side of the relationship filters: a hospital sees the
   * trainees it hosts, a university the ones it sponsors, a cluster everyone in
   * its hospitals.
   */
  async getDashboardTimelines(params: {
    scope: 'hospital' | 'university' | 'cluster';
    organizationId: string;
    programId?: string;
    limit?: number;
  }) {
    const where = await this.buildScopeFilter(params);
    const profiles = await this.prisma.traineeProfile.findMany({
      where,
      select: { id: true },
      take: params.limit ?? 200,
      orderBy: { createdAt: 'desc' },
    });

    // Built in bounded batches rather than one at a time: each timeline is a
    // handful of independent reads, and running a whole cohort sequentially made
    // the hospital workspace wait seconds on round-trip latency alone. The cap
    // keeps a large cohort from opening an unbounded number of connections.
    const CONCURRENCY = 10;
    const timelines: Array<
      Awaited<ReturnType<TimelineService['getTraineeTimeline']>>['data']
    > = [];
    for (let i = 0; i < profiles.length; i += CONCURRENCY) {
      const batch = await Promise.all(
        profiles
          .slice(i, i + CONCURRENCY)
          .map((p) => this.getTraineeTimeline(p.id)),
      );
      timelines.push(...batch.map((t) => t.data));
    }

    // Aggregate from the same numbers the per-trainee view shows, so a dashboard
    // total is always the sum of its rows.
    const total = timelines.length;
    const avg = (pick: (t: any) => number) =>
      total
        ? Math.round(timelines.reduce((s, t) => s + pick(t), 0) / total)
        : 0;

    return {
      data: {
        scope: params.scope,
        organizationId: params.organizationId,
        traineeCount: total,
        averageCompletion: avg((t) => t.completionPercentage),
        averageGraduationProgress: avg((t) => t.graduationProgress),
        readyForGraduation: timelines.filter(
          (t) => t.readiness.readyForGraduation,
        ).length,
        atRisk: timelines.filter(
          (t) => t.readiness.expectedGraduationStatus === 'at_risk',
        ).length,
        offTrack: timelines.filter(
          (t) => t.readiness.expectedGraduationStatus === 'off_track',
        ).length,
        onTrack: timelines.filter(
          (t) => t.readiness.expectedGraduationStatus === 'on_track',
        ).length,
        graduated: timelines.filter(
          (t) => t.readiness.expectedGraduationStatus === 'graduated',
        ).length,
        rotationsActive: timelines.filter((t) => t.current?.status === 'active')
          .length,
        trainees: timelines,
      },
    };
  }

  private async buildScopeFilter(params: {
    scope: string;
    organizationId: string;
    programId?: string;
  }) {
    const base = params.programId ? { programId: params.programId } : {};
    switch (params.scope) {
      case 'university':
        // The university sponsors the trainee; the hospital hosts them.
        return {
          ...base,
          deletedAt: null,
          sponsorOrganizationId: params.organizationId,
        };
      case 'cluster': {
        const hospitals = await this.prisma.organization.findMany({
          where: { parentId: params.organizationId },
          select: { id: true },
        });
        return {
          ...base,
          deletedAt: null,
          organizationId: {
            in: [params.organizationId, ...hospitals.map((h) => h.id)],
          },
        };
      }
      default:
        return {
          ...base,
          deletedAt: null,
          // organizationId falls back to the parent TrainingRequest's
          // targetOrgId at cluster-approval time (see
          // training-request-trainees.service.ts), which for a cluster_request
          // is already the target hospital — so a trainee can match the
          // `organizationId` branch below before ever being allocated to this
          // hospital. Excluding `cluster_approved` here keeps the hospital's
          // trainee count to those actually placed (allocated onward), not
          // merely earmarked. Profiles with no linked row (legacy/manual data)
          // have no trainingRequestRow to match, so NOT correctly keeps them.
          NOT: { trainingRequestRow: { status: 'cluster_approved' } },
          OR: [
            { organizationId: params.organizationId },
            {
              trainingRequestRow: {
                assignedHospitalId: params.organizationId,
                status: { notIn: ['rejected', 'merged', 'split'] },
              },
            },
          ],
        };
    }
  }

  // ─── Evidence loading ───────────────────────────────────────────────────────

  /**
   * All achievement records for the trainee in one pass, grouped by rotation.
   * Loading per rotation would issue a query storm on a 7-rotation plan.
   */
  private async loadEvidence(traineeProfileId: string, personId: string) {
    const [
      caseLogs,
      evaluations,
      objectiveProgress,
      attendance,
      competencies,
      incidents,
    ] = await Promise.all([
      this.prisma.clinicalCaseLog.findMany({
        where: { traineeProfileId },
        select: { id: true, rotationId: true, procedureId: true, status: true },
      }),
      this.prisma.evaluation.findMany({
        where: { evaluatee: { personId } },
        select: {
          id: true,
          rotationId: true,
          totalScore: true,
          form: { select: { formType: true } },
        },
      }),
      this.prisma.objectiveProgress.findMany({
        where: { traineeProfileId },
        select: {
          id: true,
          rotationId: true,
          status: true,
          objective: {
            select: { titleAr: true, titleEn: true, isMandatory: true },
          },
        },
      }),
      this.prisma.attendance.findMany({
        where: { traineeProfileId },
        select: { date: true, status: true },
      }),
      this.prisma.competencyProgress.findMany({
        where: { traineeProfileId },
        include: { procedure: { select: { code: true, titleAr: true } } },
      }),
      // Incidents carry no trainee link, only the account that reported them.
      this.prisma.incident.count({
        where: { reportedBy: { personId }, status: { not: 'resolved' } },
      }),
    ]);

    const group = <T extends { rotationId: string | null }>(rows: T[]) => {
      const map = new Map<string, T[]>();
      for (const r of rows) {
        if (!r.rotationId) continue;
        const list = map.get(r.rotationId) ?? [];
        list.push(r);
        map.set(r.rotationId, list);
      }
      return map;
    };

    return {
      caseLogsByRotation: group(caseLogs),
      evaluationsByRotation: group(evaluations),
      objectivesByRotation: group(objectiveProgress),
      attendanceByDate: new Map(
        attendance.map((a) => [a.date.toISOString().slice(0, 10), a.status]),
      ),
      competencies,
      procedureById: new Map(
        competencies.map((c) => [c.procedureId, c.procedure]),
      ),
      openIncidents: incidents,
    };
  }

  // ─── Per-rotation progress ──────────────────────────────────────────────────

  private buildRotationProgress(
    rotation: any,
    evidence: any,
    now: Date,
  ): RotationProgress {
    const tpl = rotation.trainingPlanRotation;
    const logs = evidence.caseLogsByRotation.get(rotation.id) ?? [];
    const evals = evidence.evaluationsByRotation.get(rotation.id) ?? [];
    const objectives = evidence.objectivesByRotation.get(rotation.id) ?? [];
    const approvedLogs = logs.filter((l: any) =>
      APPROVED_LOG_STATUSES.includes(l.status),
    );

    const competencies = this.competencyProgress(tpl, objectives);
    const procedures = this.procedureProgress(tpl, approvedLogs, evidence);
    const logbook = this.logbookProgress(tpl, approvedLogs);
    const evaluationsProgress = this.evaluationProgress(tpl, evals);
    const attendance = this.attendanceProgress(rotation, evidence, now);

    const durationDays = this.dayDiff(rotation.startDate, rotation.endDate) + 1;
    const elapsedDays = Math.max(
      0,
      Math.min(durationDays, this.dayDiff(rotation.startDate, now) + 1),
    );
    const remainingDays = Math.max(0, durationDays - elapsedDays);

    return {
      rotationId: rotation.id,
      sequenceOrder: rotation.sequenceOrder,
      status: rotation.status,
      departmentId: rotation.departmentId,
      departmentNameAr: rotation.department.nameAr,
      trainerProfileId: rotation.trainerProfileId,
      trainerNameAr: rotation.trainerProfile?.person?.nameAr ?? null,
      startDate: rotation.startDate,
      endDate: rotation.endDate,
      durationDays,
      elapsedDays,
      remainingDays,
      progressPercentage: this.rotationPercentage(
        rotation,
        [competencies, procedures, logbook, evaluationsProgress],
        durationDays,
        elapsedDays,
      ),
      fromPlan: Boolean(tpl),
      competencies,
      procedures,
      logbook,
      evaluations: evaluationsProgress,
      attendance,
    };
  }

  /**
   * Competencies are tracked through the existing ObjectiveProgress records
   * rather than a new table. A template competency counts as met when a matching
   * departmental objective is marked complete for this rotation.
   */
  private competencyProgress(tpl: any, objectives: any[]): RequirementProgress {
    const required = this.asArray(tpl?.requiredCompetencies);
    if (required.length === 0) return this.emptyRequirement(objectives);

    const completedTitles = objectives
      .filter((o) => o.status === 'completed')
      .map((o) =>
        `${o.objective?.titleAr ?? ''} ${o.objective?.titleEn ?? ''}`.toLowerCase(),
      );

    const outstanding: RequirementProgress['outstanding'] = [];
    let completed = 0;
    for (const c of required) {
      const code = String(c?.code ?? '').toLowerCase();
      const title = String(c?.titleAr ?? '').toLowerCase();
      const met = completedTitles.some(
        (t) => (code && t.includes(code)) || (title && t.includes(title)),
      );
      if (met) completed++;
      else
        outstanding.push({
          code: c?.code ?? '',
          titleAr: c?.titleAr ?? '',
          required: 1,
          completed: 0,
        });
    }
    return {
      required: required.length,
      completed,
      percentage: this.pct(completed, required.length),
      outstanding,
    };
  }

  /** Procedures are counted from signed-off case logs on this rotation. */
  private procedureProgress(
    tpl: any,
    approvedLogs: any[],
    evidence: any,
  ): RequirementProgress {
    const required = this.asArray(tpl?.requiredProcedures);
    if (required.length === 0) return this.emptyRequirement([]);

    const countsByCode = new Map<string, number>();
    for (const log of approvedLogs) {
      const proc = log.procedureId
        ? evidence.procedureById.get(log.procedureId)
        : null;
      if (!proc?.code) continue;
      countsByCode.set(proc.code, (countsByCode.get(proc.code) ?? 0) + 1);
    }

    let requiredTotal = 0;
    let completedTotal = 0;
    const outstanding: RequirementProgress['outstanding'] = [];
    for (const item of required) {
      const min = Number(item?.minCount ?? 1);
      const done = Math.min(min, countsByCode.get(item?.code) ?? 0);
      requiredTotal += min;
      completedTotal += done;
      if (done < min) {
        outstanding.push({
          code: item?.code ?? '',
          titleAr: item?.titleAr ?? '',
          required: min,
          completed: done,
        });
      }
    }
    return {
      required: requiredTotal,
      completed: completedTotal,
      percentage: this.pct(completedTotal, requiredTotal),
      outstanding,
    };
  }

  private logbookProgress(tpl: any, approvedLogs: any[]): RequirementProgress {
    const required = this.asArray(tpl?.requiredLogbookItems);
    if (required.length === 0) return this.emptyRequirement(approvedLogs);

    let requiredTotal = 0;
    const outstanding: RequirementProgress['outstanding'] = [];
    for (const item of required) {
      const min = Number(item?.minCount ?? 1);
      requiredTotal += min;
      const done = Math.min(min, approvedLogs.length);
      if (done < min) {
        outstanding.push({
          code: item?.code ?? '',
          titleAr: item?.titleAr ?? '',
          required: min,
          completed: done,
        });
      }
    }
    const completedTotal = Math.min(requiredTotal, approvedLogs.length);
    return {
      required: requiredTotal,
      completed: completedTotal,
      percentage: this.pct(completedTotal, requiredTotal),
      outstanding,
    };
  }

  /** An evaluation requirement is met when a submitted evaluation uses that form type. */
  private evaluationProgress(tpl: any, evals: any[]): RequirementProgress {
    const required = this.asArray(tpl?.requiredEvaluations);
    if (required.length === 0) return this.emptyRequirement(evals);

    const submittedTypes = new Set(
      evals.map((e) => e.form?.formType).filter(Boolean),
    );
    const outstanding: RequirementProgress['outstanding'] = [];
    let completed = 0;
    for (const item of required) {
      if (submittedTypes.has(item?.formType)) completed++;
      else
        outstanding.push({
          code: item?.formType ?? '',
          titleAr: item?.titleAr ?? '',
          required: 1,
          completed: 0,
        });
    }
    return {
      required: required.length,
      completed,
      percentage: this.pct(completed, required.length),
      outstanding,
    };
  }

  /**
   * Attendance measured against the weekdays of the rotation that have already
   * passed — a rotation that has not started yet cannot be short on attendance.
   */
  private attendanceProgress(rotation: any, evidence: any, now: Date) {
    const start = new Date(rotation.startDate);
    const end = new Date(rotation.endDate);
    const upto = now < end ? now : end;

    let expectedDays = 0;
    let presentDays = 0;
    for (let d = new Date(start); d <= upto; d.setDate(d.getDate() + 1)) {
      const day = d.getDay();
      if (day === 5 || day === 6) continue; // Friday & Saturday weekend
      expectedDays++;
      const status = evidence.attendanceByDate.get(
        d.toISOString().slice(0, 10),
      );
      if (status && PRESENT_STATUSES.includes(status)) presentDays++;
    }
    return {
      expectedDays,
      presentDays,
      missingDays: Math.max(0, expectedDays - presentDays),
      rate: this.pct(presentDays, expectedDays),
    };
  }

  /**
   * A rotation's percentage is how much of its requirements are met. Rotations
   * created outside a plan carry no requirements, so they fall back to elapsed
   * time — otherwise every legacy rotation would read as 0%.
   */
  private rotationPercentage(
    rotation: any,
    families: RequirementProgress[],
    durationDays: number,
    elapsedDays: number,
  ): number {
    if (rotation.status === 'completed') return 100;
    if (rotation.status === 'cancelled' || rotation.status === 'skipped')
      return 0;
    if (rotation.status === 'scheduled') return 0;

    const tracked = families.filter((f) => f.required > 0);
    if (tracked.length === 0) return this.pct(elapsedDays, durationDays);

    const total = tracked.reduce((s, f) => s + f.percentage, 0);
    return Math.round(total / tracked.length);
  }

  /** Overall completion, weighted by each rotation's length. */
  private weightedCompletion(
    rotations: any[],
    progress: RotationProgress[],
  ): number {
    if (rotations.length === 0) return 0;
    let weighted = 0;
    let totalWeight = 0;
    rotations.forEach((r, i) => {
      const weight = progress[i].durationDays || 1;
      totalWeight += weight;
      weighted += weight * progress[i].progressPercentage;
    });
    return totalWeight ? Math.round(weighted / totalWeight) : 0;
  }

  // ─── Graduation readiness ───────────────────────────────────────────────────

  /**
   * Readiness is measured against the trainee's own pinned plan version, not a
   * global rule, so a trainee is always judged by the plan they actually started.
   */
  private async computeReadiness(
    profile: any,
    rotations: any[],
    progress: RotationProgress[],
    evidence: any,
    now: Date,
  ) {
    const sum = (pick: (p: RotationProgress) => RequirementProgress) => ({
      required: progress.reduce((s, p) => s + pick(p).required, 0),
      completed: progress.reduce((s, p) => s + pick(p).completed, 0),
    });

    const competencies = sum((p) => p.competencies);
    const procedures = sum((p) => p.procedures);
    const logbook = sum((p) => p.logbook);
    const evaluations = sum((p) => p.evaluations);

    const missingAttendance = progress.reduce(
      (s, p) => s + p.attendance.missingDays,
      0,
    );
    const expectedAttendance = progress.reduce(
      (s, p) => s + p.attendance.expectedDays,
      0,
    );

    // Trainee-level competency targets seeded at activation, which span rotations.
    const outstandingCompetencyTargets = evidence.competencies.filter(
      (c: any) => c.completedCount < c.requiredCount,
    );

    const plannedRotations =
      profile.trainingPlanVersion?.rotations?.length ?? rotations.length;
    const completedRotations = rotations.filter(
      (r) => r.status === 'completed',
    ).length;

    const families = [
      {
        key: 'rotations',
        required: plannedRotations,
        completed: completedRotations,
      },
      { key: 'competencies', ...competencies },
      { key: 'procedures', ...procedures },
      { key: 'logbook', ...logbook },
      { key: 'evaluations', ...evaluations },
    ].filter((f) => f.required > 0);

    const overallCompletion = families.length
      ? Math.round(
          families.reduce((s, f) => s + this.pct(f.completed, f.required), 0) /
            families.length,
        )
      : 0;

    const remainingRequirements: string[] = [];
    if (completedRotations < plannedRotations) {
      remainingRequirements.push(
        `${plannedRotations - completedRotations} روتيشن لم يكتمل`,
      );
    }
    if (competencies.completed < competencies.required) {
      remainingRequirements.push(
        `${competencies.required - competencies.completed} كفاءة لم تكتمل`,
      );
    }
    if (procedures.completed < procedures.required) {
      remainingRequirements.push(
        `${procedures.required - procedures.completed} إجراء مطلوب لم يكتمل`,
      );
    }
    if (logbook.completed < logbook.required) {
      remainingRequirements.push(
        `${logbook.required - logbook.completed} بند سجل تدريبي ناقص`,
      );
    }
    if (evaluations.completed < evaluations.required) {
      remainingRequirements.push(
        `${evaluations.required - evaluations.completed} تقييم لم يُسلَّم`,
      );
    }
    if (outstandingCompetencyTargets.length > 0) {
      remainingRequirements.push(
        `${outstandingCompetencyTargets.length} هدف كفاءة على مستوى المتدرب`,
      );
    }
    if (evidence.openIncidents > 0) {
      remainingRequirements.push(`${evidence.openIncidents} بلاغ مفتوح`);
    }
    if (
      profile.applicationStatus !== 'active' &&
      profile.applicationStatus !== 'graduated'
    ) {
      remainingRequirements.push(
        `حالة التدريب غير نشطة (${profile.applicationStatus})`,
      );
    }

    const expectedGraduationStatus = this.graduationStatus(
      profile,
      overallCompletion,
      remainingRequirements.length,
      now,
    );

    return {
      overallCompletion,
      readyForGraduation:
        remainingRequirements.length === 0 &&
        overallCompletion >= 100 &&
        rotations.length > 0,
      expectedGraduationStatus,
      expectedGraduationDate: profile.expectedGraduationDate,
      remainingRequirements,
      remaining: {
        rotations: Math.max(0, plannedRotations - completedRotations),
        competencies: Math.max(
          0,
          competencies.required - competencies.completed,
        ),
        procedures: Math.max(0, procedures.required - procedures.completed),
        evaluations: Math.max(0, evaluations.required - evaluations.completed),
        logbook: Math.max(0, logbook.required - logbook.completed),
      },
      totals: { competencies, procedures, logbook, evaluations },
      attendance: {
        expectedDays: expectedAttendance,
        missingDays: missingAttendance,
        rate: this.pct(
          expectedAttendance - missingAttendance,
          expectedAttendance,
        ),
      },
      openIncidents: evidence.openIncidents,
      approvals: {
        submitted: profile.graduationApprovals.map((a: any) => a.approverRole),
        count: profile.graduationApprovals.length,
      },
    };
  }

  /**
   * Whether the trainee is tracking toward their expected graduation date:
   * progress is compared against how much of the training window has elapsed.
   */
  private graduationStatus(
    profile: any,
    overallCompletion: number,
    outstandingCount: number,
    now: Date,
  ):
    | 'graduated'
    | 'ready'
    | 'on_track'
    | 'at_risk'
    | 'off_track'
    | 'not_started' {
    if (profile.applicationStatus === 'graduated' || profile.graduatedAt)
      return 'graduated';
    if (outstandingCount === 0 && overallCompletion >= 100) return 'ready';

    const expected = profile.expectedGraduationDate;
    if (!expected) return overallCompletion > 0 ? 'on_track' : 'not_started';
    if (now > new Date(expected)) return 'off_track';

    // No start date to measure elapsed time against yet.
    if (!profile.createdAt) return 'on_track';
    const totalDays = this.dayDiff(profile.createdAt, new Date(expected));
    const elapsedDays = this.dayDiff(profile.createdAt, now);
    if (totalDays <= 0) return 'on_track';

    const expectedProgress = this.pct(elapsedDays, totalDays);
    // A 15-point shortfall is the tolerance before a trainee is flagged.
    if (overallCompletion + 15 < expectedProgress) return 'at_risk';
    return 'on_track';
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Picks the active rotation, else the one covering today, else the next scheduled. */
  private findCurrentIndex(rotations: any[], now: Date): number {
    const active = rotations.findIndex((r) => r.status === 'active');
    if (active >= 0) return active;
    const covering = rotations.findIndex(
      (r) =>
        r.startDate <= now &&
        r.endDate >= now &&
        !TERMINAL_ROTATION_STATUSES.includes(r.status),
    );
    if (covering >= 0) return covering;
    return rotations.findIndex(
      (r) => r.status === 'scheduled' && r.startDate > now,
    );
  }

  private asArray(value: unknown): any[] {
    return Array.isArray(value) ? value : [];
  }

  /** A family with nothing required reports what exists, at 100%. */
  private emptyRequirement(achieved: unknown[]): RequirementProgress {
    return {
      required: 0,
      completed: achieved.length,
      percentage: 100,
      outstanding: [],
    };
  }

  private pct(done: number, total: number): number {
    if (total <= 0) return 100;
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }

  private dayDiff(from: Date | string, to: Date | string): number {
    const a = new Date(from).setHours(0, 0, 0, 0);
    const b = new Date(to).setHours(0, 0, 0, 0);
    return Math.floor((b - a) / (24 * 60 * 60 * 1000));
  }
}
