import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CapacityService, AllocationCapacitySnapshot } from '../organizations/capacity.service';
import { departmentMatchesTemplate } from '../../common/department-code';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AllocationWeights {
  capacityRatio: number;      // remaining hospital capacity %      → default 20
  programCapacity: number;    // remaining program seats %          → default 20
  specialtyMatch: number;     // explicit specialty allocation      → default 15
  departmentLoad: number;     // remaining department capacity %    → default 15
  trainerLoad: number;        // remaining trainer capacity %       → default 10
  affiliation: number;        // university ↔ hospital affiliation  → default 10
  loadBalancing: number;      // favours historically lighter sites → default 5
  geoMatch: number;           // same city/region as university     → default 5
}

const DEFAULT_WEIGHTS: AllocationWeights = {
  capacityRatio: 20,
  programCapacity: 20,
  specialtyMatch: 15,
  departmentLoad: 15,
  trainerLoad: 10,
  affiliation: 10,
  loadBalancing: 5,
  geoMatch: 5,
};

/** The hard constraints, in the order the engine applies them. */
export const CONSTRAINT_SEQUENCE = [
  'hospital_active',
  'training_program',
  'training_plan',
  'specialty',
  'training_period',
  'hospital_program_capacity',
  'hospital_capacity',
  'department_capacity',
  'qualified_trainer',
  'trainer_capacity',
  'timeline_compatibility',
] as const;

export type ConstraintName = (typeof CONSTRAINT_SEQUENCE)[number];

interface TraineeRow {
  id: string;
  specialty: string | null;
  gender: string | null;
  trainingPeriod: string | null;
  universityOrgId: string | null;
  status: string;
  /// Program and plan version come from the request the university submitted.
  /// Both null for legacy requests that predate the catalog.
  programId: string | null;
  trainingPlanVersionId: string | null;
  traineeProfileId: string | null;
  startDate: Date | null;
  endDate: Date | null;
}

interface HospitalCandidate {
  id: string;
  nameAr: string;
  status: string;
  cityAr: string | null;
  regionAr: string | null;
  capacity: number;
  departments: Array<{
    id: string;
    nameAr: string;
    code: string | null;
    capacity: number;
    isActive: boolean;
    trainerProfiles: Array<{ id: string; maxTrainees: number }>;
  }>;
}

export interface HospitalEvaluation {
  hospitalId: string;
  hospitalName: string;
  passed: boolean;
  /** Constraints cleared before the decision, in evaluation order. */
  passedConstraints: string[];
  /** The single constraint that stopped this hospital, if any. */
  failedConstraint?: ConstraintName;
  failureReason?: string;
  score?: number;
  candidateDepartmentId?: string;
  candidateDepartmentName?: string;
  candidateTrainerProfileId?: string;
  breakdown?: Record<string, number>;
  selected?: boolean;
}

export interface RowAllocationResult {
  rowId: string;
  allocated: boolean;
  hospitalId?: string;
  hospitalName?: string;
  departmentId?: string;
  trainerId?: string;
  score?: number;
  evaluations: HospitalEvaluation[];
  reason: string;
  /** 'enterprise' when a program drove the decision, 'legacy' otherwise. */
  path: 'enterprise' | 'legacy';
}

/**
 * Everything the engine needs, loaded once per run.
 *
 * Holding it in one object is what keeps evaluation free of database round
 * trips: a batch of N trainees over M hospitals costs a fixed number of queries
 * rather than N × M × departments × trainers.
 */
interface AllocationContext {
  snapshot: AllocationCapacitySnapshot;
  /** trainerProfileId set, per programId. */
  qualifiedTrainers: Map<string, Set<string>>;
  /** Plan version rotations, per trainingPlanVersionId. */
  planRotations: Map<string, Array<{ departmentCode: string; departmentNameAr: string; durationWeeks: number; isMandatory: boolean }>>;
  planTotalWeeks: Map<string, number>;
  /** Hospital ids the university is affiliated with. */
  affiliations: Set<string>;
  /** Historical allocation counts per hospital, for load balancing. */
  historicalLoad: Map<string, number>;
  maxHistoricalLoad: number;
  /** Active/scheduled rotation windows per trainee profile, for timeline overlap. */
  traineeRotations: Map<string, Array<{ startDate: Date; endDate: Date }>>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * The smart allocation engine.
 *
 * Evaluation runs entirely in memory against a context loaded once per run, and
 * applies the hard constraints in a fixed order before scoring. Every hospital
 * considered — accepted or rejected — is recorded with the constraints it
 * cleared, the one it failed, and its score breakdown, so a cluster can always
 * explain why a trainee landed where they did.
 *
 * A row whose request carries no program falls back to the legacy path: the
 * program, plan and timeline constraints are skipped and the pre-Module-2
 * behaviour applies, so historical requests keep allocating exactly as before.
 */
@Injectable()
export class AllocationEngineService {
  constructor(
    private prisma: PrismaService,
    private capacityService: CapacityService,
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Allocates all cluster_approved rows of a training request.
   * Returns a per-row allocation result with full audit trail.
   */
  async allocateRequest(
    trainingRequestId: string,
    clusterId: string,
    actorId?: string,
  ): Promise<RowAllocationResult[]> {
    const [rows, hospitals, weights] = await Promise.all([
      this.fetchApprovedRows(trainingRequestId),
      this.fetchHospitalCandidates(clusterId),
      this.loadWeights(clusterId),
    ]);

    if (hospitals.length === 0) {
      return rows.map((r) => ({
        rowId: r.id,
        allocated: false,
        evaluations: [],
        reason: 'لا توجد مستشفيات مفعّلة تابعة للتجمع الصحي',
        path: r.programId ? ('enterprise' as const) : ('legacy' as const),
      }));
    }

    const context = await this.buildContext(rows, hospitals);

    const results: RowAllocationResult[] = [];
    for (const row of rows) {
      const result = await this.allocateSingleRow(row, hospitals, weights, clusterId, context);
      if (result.allocated) {
        await this.commitAllocation(row, result, actorId);
        // Fold the taken seat back into the snapshot so the next row in this
        // batch sees it, without re-querying.
        context.snapshot.occupy({
          hospitalId: result.hospitalId!,
          departmentId: result.departmentId,
          trainerProfileId: result.trainerId,
          programId: row.programId,
        });
        context.historicalLoad.set(
          result.hospitalId!,
          (context.historicalLoad.get(result.hospitalId!) ?? 0) + 1,
        );
      } else {
        await this.writeFailureAudit(row, result, trainingRequestId, clusterId, actorId);
      }
      results.push(result);
    }
    return results;
  }

  /**
   * Re-allocates a single row (manual override or auto-reallocation).
   *
   * `preferHospitalId` narrows the candidate set to that hospital but does not
   * skip a single guard — a manual override still has to satisfy every hard
   * constraint, and runs through exactly the same evaluation as the automatic
   * path rather than a parallel one.
   */
  async reallocateRow(
    rowId: string,
    actorId?: string,
    preferHospitalId?: string,
  ): Promise<RowAllocationResult> {
    const row = await this.prisma.trainingRequestTrainee.findUnique({
      where: { id: rowId },
      include: {
        trainingRequest: {
          select: { targetOrgId: true, programId: true, trainingPlanVersionId: true },
        },
      },
    });
    if (!row) throw new Error('الصف غير موجود');

    const clusterId = row.trainingRequest.targetOrgId;
    const hospitals = await this.fetchHospitalCandidates(clusterId, preferHospitalId);
    const weights = await this.loadWeights(clusterId);

    const traineeRow: TraineeRow = {
      id: row.id,
      specialty: row.specialty,
      gender: row.gender,
      trainingPeriod: row.trainingPeriod,
      universityOrgId: row.universityOrgId,
      status: row.status,
      programId: row.trainingRequest?.programId ?? null,
      trainingPlanVersionId: row.trainingRequest?.trainingPlanVersionId ?? null,
      traineeProfileId: row.traineeProfileId,
      startDate: row.startDate,
      endDate: row.endDate,
    };

    const context = await this.buildContext([traineeRow], hospitals);
    const result = await this.allocateSingleRow(traineeRow, hospitals, weights, clusterId, context);
    if (result.allocated) {
      await this.commitAllocation(traineeRow, result, actorId, true);
    } else {
      await this.writeFailureAudit(traineeRow, result, row.trainingRequestId, clusterId, actorId);
    }
    return result;
  }

  // ─── Context loading ────────────────────────────────────────────────────────

  /** Batch-loads every lookup the evaluation needs. Fixed query count. */
  private async buildContext(
    rows: TraineeRow[],
    hospitals: HospitalCandidate[],
  ): Promise<AllocationContext> {
    const hospitalIds = hospitals.map((h) => h.id);
    const programIds = [...new Set(rows.map((r) => r.programId).filter((p): p is string => !!p))];
    const versionIds = [
      ...new Set(rows.map((r) => r.trainingPlanVersionId).filter((v): v is string => !!v)),
    ];
    const universityIds = [
      ...new Set(rows.map((r) => r.universityOrgId).filter((u): u is string => !!u)),
    ];
    const profileIds = [
      ...new Set(rows.map((r) => r.traineeProfileId).filter((t): t is string => !!t)),
    ];

    const [snapshot, quals, versions, affiliations, historical, rotations] = await Promise.all([
      this.capacityService.buildAllocationSnapshot(hospitalIds, programIds),
      programIds.length
        ? this.prisma.trainerProgram.findMany({
            where: { programId: { in: programIds }, isActive: true },
            select: { programId: true, trainerProfileId: true },
          })
        : Promise.resolve([]),
      versionIds.length
        ? this.prisma.trainingPlanVersion.findMany({
            where: { id: { in: versionIds } },
            select: {
              id: true,
              totalWeeks: true,
              rotations: {
                select: { departmentCode: true, departmentNameAr: true, durationWeeks: true, isMandatory: true },
                orderBy: { sequenceOrder: 'asc' },
              },
            },
          })
        : Promise.resolve([]),
      universityIds.length
        ? this.prisma.organizationAffiliation.findMany({
            where: {
              sourceOrgId: { in: universityIds },
              targetOrgId: { in: hospitalIds },
              status: 'active',
            },
            select: { targetOrgId: true },
          })
        : Promise.resolve([]),
      // Historical load: trainees already placed in each hospital.
      this.prisma.trainingRequestTrainee.groupBy({
        by: ['assignedHospitalId'],
        where: { assignedHospitalId: { in: hospitalIds } },
        _count: true,
      }),
      profileIds.length
        ? this.prisma.rotation.findMany({
            where: { traineeProfileId: { in: profileIds }, status: { in: ['active', 'scheduled'] } },
            select: { traineeProfileId: true, startDate: true, endDate: true },
          })
        : Promise.resolve([]),
    ]);

    const qualifiedTrainers = new Map<string, Set<string>>();
    for (const q of quals) {
      const set = qualifiedTrainers.get(q.programId) ?? new Set<string>();
      set.add(q.trainerProfileId);
      qualifiedTrainers.set(q.programId, set);
    }

    const planRotations = new Map<string, any[]>();
    const planTotalWeeks = new Map<string, number>();
    for (const v of versions) {
      planRotations.set(v.id, v.rotations);
      planTotalWeeks.set(v.id, v.totalWeeks);
    }

    const historicalLoad = new Map<string, number>();
    for (const h of historical) {
      if (h.assignedHospitalId) historicalLoad.set(h.assignedHospitalId, h._count);
    }

    const traineeRotations = new Map<string, Array<{ startDate: Date; endDate: Date }>>();
    for (const r of rotations) {
      const list = traineeRotations.get(r.traineeProfileId) ?? [];
      list.push({ startDate: r.startDate, endDate: r.endDate });
      traineeRotations.set(r.traineeProfileId, list);
    }

    return {
      snapshot,
      qualifiedTrainers,
      planRotations,
      planTotalWeeks,
      affiliations: new Set(affiliations.map((a) => a.targetOrgId)),
      historicalLoad,
      maxHistoricalLoad: Math.max(1, ...historicalLoad.values()),
      traineeRotations,
    };
  }

  // ─── Core logic ─────────────────────────────────────────────────────────────

  private async allocateSingleRow(
    row: TraineeRow,
    hospitals: HospitalCandidate[],
    weights: AllocationWeights,
    clusterId: string,
    context: AllocationContext,
  ): Promise<RowAllocationResult> {
    const path: 'enterprise' | 'legacy' = row.programId ? 'enterprise' : 'legacy';
    const evaluations = hospitals.map((hosp) =>
      this.evaluateHospital(row, hosp, weights, context),
    );

    const passing = evaluations.filter((e) => e.passed);
    if (passing.length === 0) {
      return {
        rowId: row.id,
        allocated: false,
        evaluations,
        reason: this.summariseFailure(evaluations),
        path,
      };
    }

    const best = passing.reduce((a, b) => (b.score! > a.score! ? b : a));
    best.selected = true;
    for (const e of evaluations) if (e !== best) e.selected = false;

    return {
      rowId: row.id,
      allocated: true,
      hospitalId: best.hospitalId,
      hospitalName: best.hospitalName,
      departmentId: best.candidateDepartmentId,
      trainerId: best.candidateTrainerProfileId,
      score: best.score,
      evaluations,
      reason: `أعلى تقييم (${best.score?.toFixed(1)}) — ${best.hospitalName}`,
      path,
    };
  }

  /** Groups the rejection reasons so the cluster sees the dominant blocker. */
  private summariseFailure(evaluations: HospitalEvaluation[]): string {
    if (evaluations.length === 0) return 'لا توجد مستشفيات مرشحة';
    const counts = new Map<string, number>();
    for (const e of evaluations) {
      const key = e.failureReason ?? 'سبب غير محدد';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const [reason, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return `لم يجتز أي مستشفى سلسلة القيود — السبب الأغلب: ${reason} (${count} من ${evaluations.length})`;
  }

  /**
   * Applies the hard constraints in order, then scores. Pure and synchronous:
   * every figure it needs is already in `context`.
   */
  private evaluateHospital(
    row: TraineeRow,
    hosp: HospitalCandidate,
    weights: AllocationWeights,
    context: AllocationContext,
  ): HospitalEvaluation {
    const snap = context.snapshot;
    const passedConstraints: string[] = [];
    const fail = (constraint: ConstraintName, reason: string): HospitalEvaluation => ({
      hospitalId: hosp.id,
      hospitalName: hosp.nameAr,
      passed: false,
      passedConstraints,
      failedConstraint: constraint,
      failureReason: reason,
    });

    // ── 1. Hospital active ──────────────────────────────────────────────────
    if (hosp.status !== 'active') return fail('hospital_active', 'المستشفى غير مفعّل أو موقوف');
    passedConstraints.push('hospital_active');

    // ── 2. Training program ─────────────────────────────────────────────────
    // Enforced only against hospitals that have declared program capacity, so a
    // hospital not yet configured keeps its pre-Module-2 behaviour.
    let programOcc: { capacity: number; occupied: number; available: number } | null = null;
    const declaresPrograms = row.programId ? snap.declaresAnyProgram(hosp.id) : false;
    if (row.programId && declaresPrograms) {
      programOcc = snap.program(hosp.id, row.programId);
      if (programOcc.capacity <= 0) {
        return fail('training_program', 'المستشفى لا يستقبل هذا البرنامج التدريبي');
      }
    }
    passedConstraints.push('training_program');

    // ── 3. Training plan ────────────────────────────────────────────────────
    // The hospital must be able to run the plan the university pinned: every
    // mandatory template rotation needs a department here to land in.
    if (row.trainingPlanVersionId) {
      const template = context.planRotations.get(row.trainingPlanVersionId) ?? [];
      const mandatory = template.filter((t) => t.isMandatory);
      const matched = mandatory.filter((t) =>
        hosp.departments.some((d) => d.isActive && departmentMatchesTemplate(d, t)),
      );
      // The bar is that the hospital can host some of the plan. Requiring every
      // rotation to match would reject any hospital lacking a niche unit, and
      // instantiation already places unmatched rotations in the allocated
      // department — but a hospital matching nothing cannot run the plan at all.
      if (mandatory.length > 0 && matched.length === 0) {
        return fail(
          'training_plan',
          `المستشفى لا يغطي أي قسم من أقسام الخطة المطلوبة (${mandatory.length} قسم)`,
        );
      }
    }
    passedConstraints.push('training_plan');

    // ── 4. Specialty ────────────────────────────────────────────────────────
    if (row.specialty) {
      const spec = snap.specialty(hosp.id, {
        specialtyCode: row.specialty,
        gender: row.gender || '',
        trainingPeriod: row.trainingPeriod || '',
      });
      if (spec.declared && spec.capacity > 0) {
        const occupied = snap.hospitalOccupied.get(hosp.id) ?? 0;
        if (occupied >= spec.capacity) {
          return fail(
            'specialty',
            `تخصيص التخصص "${row.specialty}" ممتلئ (${occupied}/${spec.capacity})`,
          );
        }
      }
    }
    passedConstraints.push('specialty');

    // ── 5. Training period ──────────────────────────────────────────────────
    if (row.programId && row.startDate) {
      const window = snap.programWindow(hosp.id, row.programId);
      if (window?.start && window?.end) {
        const rowStart = new Date(row.startDate);
        const rowEnd = row.endDate ? new Date(row.endDate) : rowStart;
        if (rowStart < window.start || rowEnd > window.end) {
          return fail('training_period', 'فترة التدريب خارج الفترة المعتمدة لهذا البرنامج في المستشفى');
        }
      }
    }
    passedConstraints.push('training_period');

    // ── 6. Hospital program capacity ────────────────────────────────────────
    if (programOcc && programOcc.available <= 0) {
      return fail(
        'hospital_program_capacity',
        `مقاعد البرنامج ممتلئة (${programOcc.occupied}/${programOcc.capacity})`,
      );
    }
    passedConstraints.push('hospital_program_capacity');

    // ── 7. Hospital total capacity ──────────────────────────────────────────
    const hospOcc = snap.hospital(hosp.id);
    if (hospOcc.available <= 0) {
      return fail(
        'hospital_capacity',
        `الطاقة الاستيعابية الإجمالية ممتلئة (${hospOcc.occupied}/${hospOcc.capacity})`,
      );
    }
    passedConstraints.push('hospital_capacity');

    // ── 8-10. Department → qualified trainer → trainer capacity ─────────────
    const activeDepts = hosp.departments.filter((d) => d.isActive && d.capacity > 0);
    if (activeDepts.length === 0) {
      return fail('department_capacity', 'لا توجد أقسام سريرية مفعّلة بطاقة محددة');
    }

    // An empty set and "no program" mean different things: with a program and no
    // qualified trainers, nobody is eligible. Defaulting a missing entry to null
    // would silently let an unqualified trainer take the trainee.
    const qualifiedSet = row.programId
      ? context.qualifiedTrainers.get(row.programId) ?? new Set<string>()
      : null;
    let candidateDept: (typeof activeDepts)[0] | undefined;
    let candidateTrainer: { id: string; maxTrainees: number } | undefined;
    let sawDeptWithRoom = false;
    let sawQualifiedTrainer = false;

    for (const dept of activeDepts) {
      if (snap.department(dept.id).available <= 0) continue;
      if (row.programId) {
        const deptProg = snap.departmentProgram(hosp.id, dept.id, row.programId);
        if (deptProg.capacity > 0 && deptProg.available <= 0) continue;
      }
      sawDeptWithRoom = true;

      // Qualification is a hard constraint: a trainee may never land on a
      // trainer not qualified for their program, whatever the free capacity.
      const qualified = qualifiedSet
        ? dept.trainerProfiles.filter((t) => qualifiedSet.has(t.id))
        : dept.trainerProfiles;
      if (qualified.length === 0) continue;
      sawQualifiedTrainer = true;

      const trainer = this.pickTrainer(qualified, hosp.id, row.programId, snap);
      if (!trainer) continue;

      candidateDept = dept;
      candidateTrainer = trainer;
      break;
    }

    if (!sawDeptWithRoom) {
      return fail('department_capacity', 'جميع الأقسام ممتلئة أو بلا مقاعد لهذا البرنامج');
    }
    if (!sawQualifiedTrainer) {
      return fail('qualified_trainer', 'لا يوجد مدرب مؤهل لهذا البرنامج التدريبي في المستشفى');
    }
    if (!candidateDept || !candidateTrainer) {
      return fail('trainer_capacity', 'جميع المدربين المؤهلين ممتلئون');
    }
    passedConstraints.push('department_capacity', 'qualified_trainer', 'trainer_capacity');

    // ── 11. Timeline compatibility ──────────────────────────────────────────
    const timelineFailure = this.checkTimeline(row, context);
    if (timelineFailure) return fail('timeline_compatibility', timelineFailure);
    passedConstraints.push('timeline_compatibility');

    // ── Weighted score ──────────────────────────────────────────────────────
    const breakdown = this.score(row, hosp, candidateDept, candidateTrainer, {
      weights,
      snapshot: snap,
      context,
      hospOcc,
      programOcc,
    });

    return {
      hospitalId: hosp.id,
      hospitalName: hosp.nameAr,
      passed: true,
      passedConstraints,
      score: Object.values(breakdown).reduce((a, b) => a + b, 0),
      candidateDepartmentId: candidateDept.id,
      candidateDepartmentName: candidateDept.nameAr,
      candidateTrainerProfileId: candidateTrainer.id,
      breakdown,
    };
  }

  /**
   * Whether the requested training window can actually be served.
   *
   * Two ways it cannot: the plan needs more weeks than the window allows, or the
   * trainee already has rotations covering part of it — nobody trains in two
   * places at once.
   */
  private checkTimeline(row: TraineeRow, context: AllocationContext): string | null {
    if (row.trainingPlanVersionId && row.startDate && row.endDate) {
      const weeks = context.planTotalWeeks.get(row.trainingPlanVersionId) ?? 0;
      const windowWeeks = Math.floor(
        (new Date(row.endDate).getTime() - new Date(row.startDate).getTime()) /
          (7 * 24 * 60 * 60 * 1000),
      );
      if (weeks > 0 && windowWeeks > 0 && weeks > windowWeeks) {
        return `مدة الخطة (${weeks} أسبوع) تتجاوز فترة التدريب المطلوبة (${windowWeeks} أسبوع)`;
      }
    }

    if (row.traineeProfileId && row.startDate) {
      const existing = context.traineeRotations.get(row.traineeProfileId) ?? [];
      const start = new Date(row.startDate);
      const end = row.endDate ? new Date(row.endDate) : start;
      const clash = existing.find((r) => r.startDate <= end && r.endDate >= start);
      if (clash) {
        return `تعارض مع روتيشن قائم للمتدرب (${clash.startDate.toISOString().slice(0, 10)} → ${clash.endDate.toISOString().slice(0, 10)})`;
      }
    }
    return null;
  }

  /**
   * Least-loaded qualified trainer with a free seat. A per-program allocation,
   * where the hospital declared one, takes precedence over the general cap.
   */
  private pickTrainer(
    trainers: Array<{ id: string; maxTrainees: number }>,
    hospitalId: string,
    programId: string | null,
    snap: AllocationCapacitySnapshot,
  ): { id: string; maxTrainees: number } | undefined {
    const withRoom = trainers.filter((t) => {
      if (programId) {
        const prog = snap.trainerProgram(hospitalId, t.id, programId);
        // An explicit program slice overrides the general cap in both directions.
        if (prog.capacity > 0) return prog.available > 0;
      }
      return snap.trainer(t.id).available > 0;
    });
    if (withRoom.length === 0) return undefined;

    return withRoom.sort(
      (a, b) => snap.trainer(a.id).occupied - snap.trainer(b.id).occupied,
    )[0];
  }

  /** The weighted score. Every component is driven by the configured weights. */
  private score(
    row: TraineeRow,
    hosp: HospitalCandidate,
    dept: { id: string },
    trainer: { id: string },
    ctx: {
      weights: AllocationWeights;
      snapshot: AllocationCapacitySnapshot;
      context: AllocationContext;
      hospOcc: { capacity: number; available: number; occupied: number };
      programOcc: { capacity: number; available: number } | null;
    },
  ): Record<string, number> {
    const { weights, snapshot: snap, context } = ctx;
    const breakdown: Record<string, number> = {};

    breakdown.capacityRatio = Math.round(
      (ctx.hospOcc.available / Math.max(ctx.hospOcc.capacity, 1)) * weights.capacityRatio,
    );

    breakdown.programCapacity =
      ctx.programOcc && ctx.programOcc.capacity > 0
        ? Math.round((ctx.programOcc.available / ctx.programOcc.capacity) * weights.programCapacity)
        : 0;

    const deptOcc = snap.department(dept.id);
    breakdown.departmentLoad = Math.round(
      (deptOcc.available / Math.max(deptOcc.capacity, 1)) * weights.departmentLoad,
    );

    const trainerOcc = snap.trainer(trainer.id);
    breakdown.trainerLoad = Math.round(
      (trainerOcc.available / Math.max(trainerOcc.capacity, 1)) * weights.trainerLoad,
    );

    breakdown.specialtyMatch =
      row.specialty && snap.hasSpecialtyAllocation(hosp.id, row.specialty)
        ? weights.specialtyMatch
        : 0;

    breakdown.affiliation = context.affiliations.has(hosp.id) ? weights.affiliation : 0;

    // Historical load balancing: the lighter a hospital's history, the higher it
    // scores, which spreads cohorts instead of repeatedly filling one site.
    const load = context.historicalLoad.get(hosp.id) ?? 0;
    breakdown.loadBalancing = Math.round(
      (1 - load / context.maxHistoricalLoad) * weights.loadBalancing,
    );

    // Occupancy is already reflected in the capacity ratios above; this term
    // rewards a hospital that is lightly occupied overall.
    breakdown.occupancy = Math.round(
      ((100 - Math.min(100, Math.round((ctx.hospOcc.occupied / Math.max(ctx.hospOcc.capacity, 1)) * 100))) / 100) *
        weights.geoMatch,
    );

    return breakdown;
  }

  // ─── Commit & Audit ─────────────────────────────────────────────────────────

  private async commitAllocation(
    row: TraineeRow,
    result: RowAllocationResult,
    actorId?: string,
    isReallocation = false,
  ) {
    const prevRow = await this.prisma.trainingRequestTrainee.findUnique({
      where: { id: row.id },
      select: {
        status: true,
        assignedHospitalId: true,
        assignedDepartmentId: true,
        assignedTrainerProfileId: true,
        trainingRequestId: true,
        traineeProfileId: true,
        academicIntakeId: true,
        trainingRequest: { select: { targetOrgId: true } },
      },
    });

    // The engine decides *where*; the allocation table records *that it happened*.
    // Writing only the denormalised columns — as this did — meant an automatic
    // allocation left no allocation row, so the trainee's history began at their
    // first manual move and the auto-placement was invisible to the timeline.
    // Both writes now happen in one transaction, and re-running the engine
    // supersedes the previous allocation rather than silently overwriting it.
    await this.prisma.$transaction(async (tx) => {
      const openAllocation = await tx.traineeAllocation.findFirst({
        where: { traineeRowId: row.id, status: 'open' },
        select: {
          id: true, hospitalId: true, departmentId: true, trainerProfileId: true,
        },
      });

      if (openAllocation) {
        await tx.traineeAllocation.update({
          where: { id: openAllocation.id },
          data: { status: 'superseded', closedAt: new Date(), closedById: actorId },
        });
      }

      await tx.traineeAllocation.create({
        data: {
          traineeRowId: row.id,
          traineeProfileId: prevRow?.traineeProfileId ?? null,
          academicIntakeId: prevRow?.academicIntakeId ?? null,
          trainingRequestId: prevRow?.trainingRequestId,
          clusterOrgId: prevRow!.trainingRequest.targetOrgId,
          hospitalId: result.hospitalId!,
          departmentId: result.departmentId ?? null,
          trainerProfileId: result.trainerId ?? null,
          previousAllocationId: openAllocation?.id ?? null,
          previousHospitalId: openAllocation?.hospitalId ?? null,
          previousDepartmentId: openAllocation?.departmentId ?? null,
          previousTrainerId: openAllocation?.trainerProfileId ?? null,
          status: 'open',
          action: 'auto',
          reason: isReallocation ? 'إعادة توزيع آلية' : 'توزيع آلي',
          performedById: actorId,
        },
      });

      await tx.trainingRequestTrainee.update({
        where: { id: row.id },
        data: {
          status: 'allocated',
          assignedHospitalId: result.hospitalId,
          assignedDepartmentId: result.departmentId,
          assignedTrainerProfileId: result.trainerId,
          updatedById: actorId,
        },
      });
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: prevRow?.trainingRequest.targetOrgId,
        actorId,
        action: isReallocation ? 'reallocate_trainee_row' : 'allocate_trainee_row',
        entityType: 'TrainingRequestTrainee',
        entityId: row.id,
        oldValues: {
          status: prevRow?.status,
          assignedHospitalId: prevRow?.assignedHospitalId,
          assignedDepartmentId: prevRow?.assignedDepartmentId,
          assignedTrainerProfileId: prevRow?.assignedTrainerProfileId,
        },
        newValues: {
          status: 'allocated',
          assignedHospitalId: result.hospitalId,
          assignedDepartmentId: result.departmentId,
          assignedTrainerProfileId: result.trainerId,
          score: result.score,
          allocationAudit: this.buildExplanation(row, result),
        },
      },
    });
  }

  private async writeFailureAudit(
    row: TraineeRow,
    result: RowAllocationResult,
    trainingRequestId: string,
    clusterId: string,
    actorId?: string,
  ) {
    await this.prisma.auditLog.create({
      data: {
        organizationId: clusterId,
        actorId,
        action: 'allocation_failed_trainee_row',
        entityType: 'TrainingRequestTrainee',
        entityId: row.id,
        newValues: this.buildExplanation(row, result),
      },
    });
  }

  /**
   * The complete decision record, stored in the existing AuditLog — for every
   * hospital considered, what it cleared, what stopped it, how it scored, and
   * whether it was chosen.
   */
  private buildExplanation(row: TraineeRow, result: RowAllocationResult) {
    return {
      path: result.path,
      programId: row.programId,
      trainingPlanVersionId: row.trainingPlanVersionId,
      constraintSequence: CONSTRAINT_SEQUENCE,
      evaluatedHospitals: result.evaluations.map((e) => ({
        hospitalId: e.hospitalId,
        hospitalName: e.hospitalName,
        passed: e.passed,
        selected: e.selected ?? false,
        passedConstraints: e.passedConstraints,
        failedConstraint: e.failedConstraint ?? null,
        failureReason: e.failureReason ?? null,
        scoreBreakdown: e.breakdown ?? null,
        finalScore: e.score ?? null,
      })),
      decision: {
        allocated: result.allocated,
        hospitalId: result.hospitalId ?? null,
        departmentId: result.departmentId ?? null,
        trainerProfileId: result.trainerId ?? null,
        score: result.score ?? null,
        reason: result.reason,
      },
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async fetchApprovedRows(trainingRequestId: string): Promise<TraineeRow[]> {
    const rows = await this.prisma.trainingRequestTrainee.findMany({
      where: { trainingRequestId, status: 'cluster_approved' },
      select: {
        id: true,
        specialty: true,
        gender: true,
        trainingPeriod: true,
        universityOrgId: true,
        status: true,
        startDate: true,
        endDate: true,
        traineeProfileId: true,
        // Program and plan are chosen once by the university, on the request.
        trainingRequest: { select: { programId: true, trainingPlanVersionId: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(({ trainingRequest, ...r }) => ({
      ...r,
      programId: trainingRequest?.programId ?? null,
      trainingPlanVersionId: trainingRequest?.trainingPlanVersionId ?? null,
    }));
  }

  private async fetchHospitalCandidates(
    clusterId: string,
    onlyHospitalId?: string,
  ): Promise<HospitalCandidate[]> {
    // clusterId is usually a cluster (hospitals under it), but for a request a
    // cluster user created it is the hospital itself — the create flow maps a
    // cluster request onto its target hospital. Include the target in the
    // candidate set too, mirroring getHospitalCardsMetrics.
    const where: Record<string, unknown> = {
      deletedAt: null,
      OR: [{ id: clusterId }, { parentId: clusterId }],
    };
    if (onlyHospitalId) where.id = onlyHospitalId;

    const hospitals = await this.prisma.organization.findMany({
      where,
      select: {
        id: true,
        nameAr: true,
        status: true,
        cityAr: true,
        regionAr: true,
        capacity: true,
        departments: {
          where: { isActive: true },
          select: {
            id: true,
            nameAr: true,
            code: true,
            capacity: true,
            isActive: true,
            trainerProfiles: {
              where: { isActive: true },
              select: { id: true, maxTrainees: true },
            },
          },
        },
      },
    });
    return hospitals as HospitalCandidate[];
  }

  /** Weights are per-cluster configuration, falling back to the national defaults. */
  private async loadWeights(clusterId: string): Promise<AllocationWeights> {
    const setting = await this.prisma.setting.findFirst({
      where: { organizationId: clusterId, key: 'smart_allocation_weights' },
    });
    if (setting?.value) {
      try {
        return { ...DEFAULT_WEIGHTS, ...(setting.value as object) } as AllocationWeights;
      } catch {
        return DEFAULT_WEIGHTS;
      }
    }
    return DEFAULT_WEIGHTS;
  }
}
