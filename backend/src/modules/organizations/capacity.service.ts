import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type CapacityScopeType =
  | 'hospital'
  | 'department'
  | 'specialty'
  | 'trainer'
  | 'supervisor'
  | 'program';

export interface CapacityScope {
  type: CapacityScopeType;
  organizationId: string; // hospital org id (the anchor for department/specialty/trainer/supervisor scopes too)
  scopeId?: string; // departmentId | trainerProfileId | supervisorAccountId
  programId?: string;
  specialtyCode?: string;
  gender?: string;
  trainingPeriod?: string;
}

/**
 * Staging rows already committed to a hospital still consume a seat even though
 * the trainee profile does not exist yet. Counting only trainee profiles would
 * let a single allocation batch overfill a program.
 */
const OCCUPYING_ROW_STATUSES = ['allocated', 'hospital_review', 'on_hold', 'active'];

/**
 * An in-memory view of every capacity figure for a set of hospitals, built once
 * per allocation run by `CapacityService.buildAllocationSnapshot`.
 *
 * Occupancy formulas here are deliberately identical to the per-entity getters;
 * this class exists to remove query round-trips, not to introduce a second set
 * of rules. Committed allocations are folded back in with `occupy()` so later
 * trainees in the same batch see the seats their predecessors took.
 */
export class AllocationCapacitySnapshot {
  hospitalCapacity = new Map<string, number>();
  hospitalOccupied = new Map<string, number>();
  deptCapacity = new Map<string, number>();
  deptOccupied = new Map<string, number>();
  trainerCapacity = new Map<string, number>();
  trainerOccupied = new Map<string, number>();
  programOccupied = new Map<string, number>();
  programDeptOccupied = new Map<string, number>();
  programTrainerOccupied = new Map<string, number>();
  allocations: Array<{
    organizationId: string; scopeType: string; scopeId: string; programId: string;
    specialtyCode: string; gender: string; trainingPeriod: string; totalCapacity: number;
    trainingStartDate: Date | null; trainingEndDate: Date | null;
  }> = [];

  bump(map: Map<string, number>, key: string, by: number) {
    map.set(key, (map.get(key) ?? 0) + by);
  }

  private result(capacity: number, occupied: number, fallback: number): OccupancyResult {
    const safeCapacity = capacity > 0 ? capacity : fallback;
    const available = Math.max(0, safeCapacity - occupied);
    return {
      capacity: safeCapacity,
      occupied,
      available,
      occupancyPercentage: safeCapacity > 0 ? Math.min(100, Math.round((occupied / safeCapacity) * 100)) : 0,
    };
  }

  hospital(hospitalId: string): OccupancyResult {
    return this.result(
      this.hospitalCapacity.get(hospitalId) ?? 0,
      this.hospitalOccupied.get(hospitalId) ?? 0,
      DEFAULT_HOSPITAL_CAPACITY_FALLBACK,
    );
  }

  department(departmentId: string): OccupancyResult {
    return this.result(
      this.deptCapacity.get(departmentId) ?? 0,
      this.deptOccupied.get(departmentId) ?? 0,
      DEFAULT_HOSPITAL_CAPACITY_FALLBACK,
    );
  }

  trainer(trainerProfileId: string): OccupancyResult {
    return this.result(
      this.trainerCapacity.get(trainerProfileId) ?? 0,
      this.trainerOccupied.get(trainerProfileId) ?? 0,
      DEFAULT_HOSPITAL_CAPACITY_FALLBACK,
    );
  }

  /** Declared seats only — an undeclared program reads as zero, never as a default. */
  private explicit(capacity: number, occupied: number): OccupancyResult {
    const available = Math.max(0, capacity - occupied);
    return {
      capacity,
      occupied,
      available,
      occupancyPercentage: capacity > 0 ? Math.min(100, Math.round((occupied / capacity) * 100)) : 0,
    };
  }

  private allocationFor(organizationId: string, scopeType: string, scopeId: string, programId: string) {
    return this.allocations.find(
      (a) =>
        a.organizationId === organizationId &&
        a.scopeType === scopeType &&
        a.scopeId === scopeId &&
        a.programId === programId,
    );
  }

  declaresAnyProgram(hospitalId: string): boolean {
    return this.allocations.some(
      (a) => a.organizationId === hospitalId && a.scopeType === 'program' && a.programId !== '',
    );
  }

  program(hospitalId: string, programId: string): OccupancyResult {
    const alloc = this.allocationFor(hospitalId, 'program', '', programId);
    return this.explicit(alloc?.totalCapacity ?? 0, this.programOccupied.get(`${hospitalId}|${programId}`) ?? 0);
  }

  programWindow(hospitalId: string, programId: string) {
    const alloc = this.allocations.find(
      (a) =>
        a.organizationId === hospitalId &&
        a.scopeType === 'program' &&
        a.programId === programId &&
        a.trainingStartDate !== null,
    );
    return alloc ? { start: alloc.trainingStartDate, end: alloc.trainingEndDate } : null;
  }

  departmentProgram(hospitalId: string, departmentId: string, programId: string): OccupancyResult {
    const alloc = this.allocationFor(hospitalId, 'department', departmentId, programId);
    return this.explicit(
      alloc?.totalCapacity ?? 0,
      this.programDeptOccupied.get(`${hospitalId}|${programId}|${departmentId}`) ?? 0,
    );
  }

  trainerProgram(hospitalId: string, trainerProfileId: string, programId: string): OccupancyResult {
    const alloc = this.allocationFor(hospitalId, 'trainer', trainerProfileId, programId);
    return this.explicit(
      alloc?.totalCapacity ?? 0,
      this.programTrainerOccupied.get(`${hospitalId}|${programId}|${trainerProfileId}`) ?? 0,
    );
  }

  /** Specialty allocations carry the '' program sentinel. */
  specialty(
    hospitalId: string,
    filter: { specialtyCode?: string; gender?: string; trainingPeriod?: string },
  ): { capacity: number; declared: boolean } {
    const alloc = this.allocations.find(
      (a) =>
        a.organizationId === hospitalId &&
        a.scopeType === 'specialty' &&
        a.scopeId === '' &&
        a.programId === '' &&
        a.specialtyCode === (filter.specialtyCode || '') &&
        a.gender === (filter.gender || '') &&
        a.trainingPeriod === (filter.trainingPeriod || ''),
    );
    return { capacity: alloc?.totalCapacity ?? 0, declared: Boolean(alloc) };
  }

  hasSpecialtyAllocation(hospitalId: string, specialtyCode: string): boolean {
    return this.allocations.some(
      (a) => a.organizationId === hospitalId && a.scopeType === 'specialty' && a.specialtyCode === specialtyCode,
    );
  }

  /** Folds a committed allocation back in so the next trainee sees the taken seat. */
  occupy(params: {
    hospitalId: string;
    departmentId?: string;
    trainerProfileId?: string;
    programId?: string | null;
  }) {
    this.bump(this.hospitalOccupied, params.hospitalId, 1);
    if (params.departmentId) this.bump(this.deptOccupied, params.departmentId, 1);
    if (params.trainerProfileId) this.bump(this.trainerOccupied, params.trainerProfileId, 1);
    if (params.programId) {
      this.bump(this.programOccupied, `${params.hospitalId}|${params.programId}`, 1);
      if (params.departmentId) {
        this.bump(this.programDeptOccupied, `${params.hospitalId}|${params.programId}|${params.departmentId}`, 1);
      }
      if (params.trainerProfileId) {
        this.bump(this.programTrainerOccupied, `${params.hospitalId}|${params.programId}|${params.trainerProfileId}`, 1);
      }
    }
  }
}

export interface OccupancyResult {
  capacity: number;
  occupied: number;
  available: number;
  occupancyPercentage: number;
}

const DEFAULT_HOSPITAL_CAPACITY_FALLBACK = 50;

/**
 * Single source of truth for capacity/occupancy math. Replaces three
 * previously-independent implementations in
 * OrganizationsService.getHospitalCardsMetrics, TrainingRequestsService.autoAllocate,
 * and TrainingRequestsService.validateCapacity.
 *
 * Mirrors the DB-level triggers in the Phase 2 migration
 * (enforce_trainee_capacity / enforce_rotation_capacity) — this service is
 * the application-layer check used to give early, friendly errors; the
 * triggers are the last line of defense regardless of code path.
 */
@Injectable()
export class CapacityService {
  constructor(private prisma: PrismaService) {}

  async getOccupancy(scope: CapacityScope): Promise<OccupancyResult> {
    switch (scope.type) {
      case 'hospital':
        return this.getHospitalOccupancy(scope.organizationId);
      case 'department':
        return this.getDepartmentOccupancy(scope.scopeId!);
      case 'trainer':
        return this.getTrainerOccupancy(scope.scopeId!);
      case 'specialty':
        return this.getSpecialtyOccupancy(scope.organizationId, {
          specialtyCode: scope.specialtyCode,
          trainingPeriod: scope.trainingPeriod,
        });
      case 'supervisor':
        return this.getSupervisorOccupancy(scope.scopeId!);
      case 'program':
        return this.getProgramOccupancy(scope.organizationId, scope.programId!);
      default:
        return { capacity: 0, occupied: 0, available: 0, occupancyPercentage: 0 };
    }
  }

  // ─── Program-scoped capacity (Phase 2 / Module 2) ────────────────────────────

  /**
   * Seats a hospital has declared for a training program, and how many are taken.
   *
   * A capacity of 0 means the hospital has not declared this program. Callers must
   * distinguish that from "declared but full" — see `declaresAnyProgram`.
   */
  async getProgramOccupancy(organizationId: string, programId: string): Promise<OccupancyResult> {
    const allocation = await this.findAllocation(organizationId, 'program', '', programId);
    const occupied = await this.countProgramOccupancy({ organizationId, programId });
    return this.toExplicitResult(allocation?.totalCapacity ?? 0, occupied);
  }

  /** Seats of a program allotted to one department, and how many are taken. */
  async getDepartmentProgramOccupancy(
    organizationId: string,
    departmentId: string,
    programId: string,
  ): Promise<OccupancyResult> {
    const allocation = await this.findAllocation(organizationId, 'department', departmentId, programId);
    const occupied = await this.countProgramOccupancy({ organizationId, programId, departmentId });
    return this.toExplicitResult(allocation?.totalCapacity ?? 0, occupied);
  }

  /** Seats of a program allotted to one trainer, and how many are taken. */
  async getTrainerProgramOccupancy(
    organizationId: string,
    trainerProfileId: string,
    programId: string,
  ): Promise<OccupancyResult> {
    const allocation = await this.findAllocation(organizationId, 'trainer', trainerProfileId, programId);
    const occupied = await this.countProgramOccupancy({ organizationId, programId, trainerProfileId });
    return this.toExplicitResult(allocation?.totalCapacity ?? 0, occupied);
  }

  /**
   * Whether a hospital has opted into program-based capacity at all.
   *
   * Hospitals that have declared none keep the pre-Module-2 behaviour, so
   * introducing program capacity does not silently block every allocation into
   * hospitals that have not configured it yet.
   */
  async declaresAnyProgram(organizationId: string): Promise<boolean> {
    const count = await this.prisma.capacityAllocation.count({
      where: { organizationId, scopeType: 'program', programId: { not: '' } },
    });
    return count > 0;
  }

  /** Every program a hospital has declared seats for. */
  async listDeclaredPrograms(organizationId: string) {
    return this.prisma.capacityAllocation.findMany({
      where: { organizationId, scopeType: 'program', programId: { not: '' } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async findAllocation(
    organizationId: string,
    scopeType: string,
    scopeId: string,
    programId: string,
  ) {
    return this.prisma.capacityAllocation.findFirst({
      where: { organizationId, scopeType, scopeId, programId },
    });
  }

  /**
   * Occupied seats for a program: promoted trainee profiles plus staging rows
   * already committed to this hospital (and optionally department/trainer).
   *
   * A staging row's program comes from its training request, which is where the
   * university selects it.
   */
  private async countProgramOccupancy(filter: {
    organizationId: string;
    programId: string;
    departmentId?: string;
    trainerProfileId?: string;
  }): Promise<number> {
    const [profiles, rows] = await Promise.all([
      filter.departmentId || filter.trainerProfileId
        ? this.prisma.rotation.count({
            where: {
              organizationId: filter.organizationId,
              programId: filter.programId,
              status: 'active',
              ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
              ...(filter.trainerProfileId ? { trainerProfileId: filter.trainerProfileId } : {}),
            },
          })
        : this.prisma.traineeProfile.count({
            where: {
              organizationId: filter.organizationId,
              programId: filter.programId,
              deletedAt: null,
            },
          }),
      this.prisma.trainingRequestTrainee.count({
        where: {
          assignedHospitalId: filter.organizationId,
          status: { in: OCCUPYING_ROW_STATUSES },
          trainingRequest: { programId: filter.programId },
          ...(filter.departmentId ? { assignedDepartmentId: filter.departmentId } : {}),
          ...(filter.trainerProfileId ? { assignedTrainerProfileId: filter.trainerProfileId } : {}),
        },
      }),
    ]);
    return profiles + rows;
  }

  // ─── Batch snapshot for the allocation engine ───────────────────────────────

  /**
   * Loads every capacity figure the allocation engine needs for a set of
   * hospitals in a fixed number of grouped queries, instead of one query per
   * hospital/department/trainer per trainee.
   *
   * The snapshot mirrors the per-entity getters above exactly — same fallbacks,
   * same occupancy definitions — so batching changes performance, not meaning.
   * It is read fresh at the start of every allocation run, so a capacity edit a
   * hospital makes is picked up on the next allocation with no sync step.
   */
  async buildAllocationSnapshot(hospitalIds: string[], programIds: string[] = []) {
    if (hospitalIds.length === 0) return new AllocationCapacitySnapshot();

    const [orgs, departments, trainers, allocations, deptRotations, trainerRotations, stagingRows, programProfiles, programRotations] =
      await Promise.all([
        this.prisma.organization.findMany({
          where: { id: { in: hospitalIds } },
          select: { id: true, capacity: true, _count: { select: { traineeProfiles: true } } },
        }),
        this.prisma.department.findMany({
          where: { organizationId: { in: hospitalIds }, deletedAt: null },
          select: { id: true, organizationId: true, capacity: true },
        }),
        this.prisma.trainerProfile.findMany({
          where: { organizationId: { in: hospitalIds } },
          select: { id: true, maxTrainees: true },
        }),
        this.prisma.capacityAllocation.findMany({ where: { organizationId: { in: hospitalIds } } }),
        this.prisma.rotation.groupBy({
          by: ['departmentId'],
          where: { organizationId: { in: hospitalIds }, status: 'active' },
          _count: true,
        }),
        this.prisma.rotation.groupBy({
          by: ['trainerProfileId'],
          where: { organizationId: { in: hospitalIds }, status: 'active' },
          _count: true,
        }),
        // Staging rows already committed to a hospital occupy a seat even though
        // no trainee profile exists yet — mirrors countProgramOccupancy.
        programIds.length
          ? this.prisma.trainingRequestTrainee.findMany({
              where: {
                assignedHospitalId: { in: hospitalIds },
                status: { in: OCCUPYING_ROW_STATUSES },
                trainingRequest: { programId: { in: programIds } },
              },
              select: {
                assignedHospitalId: true,
                assignedDepartmentId: true,
                assignedTrainerProfileId: true,
                trainingRequest: { select: { programId: true } },
              },
            })
          : Promise.resolve([]),
        programIds.length
          ? this.prisma.traineeProfile.groupBy({
              by: ['organizationId', 'programId'],
              where: { organizationId: { in: hospitalIds }, programId: { in: programIds }, deletedAt: null },
              _count: true,
            })
          : Promise.resolve([]),
        programIds.length
          ? this.prisma.rotation.groupBy({
              by: ['organizationId', 'programId', 'departmentId', 'trainerProfileId'],
              where: { organizationId: { in: hospitalIds }, programId: { in: programIds }, status: 'active' },
              _count: true,
            })
          : Promise.resolve([]),
      ]);

    const snap = new AllocationCapacitySnapshot();
    for (const o of orgs) {
      snap.hospitalCapacity.set(o.id, o.capacity);
      snap.hospitalOccupied.set(o.id, o._count.traineeProfiles);
    }
    for (const d of departments) snap.deptCapacity.set(d.id, d.capacity);
    for (const t of trainers) snap.trainerCapacity.set(t.id, t.maxTrainees);
    for (const g of deptRotations) snap.deptOccupied.set(g.departmentId, g._count);
    for (const g of trainerRotations) snap.trainerOccupied.set(g.trainerProfileId, g._count);
    snap.allocations = allocations;

    for (const g of programProfiles) {
      if (!g.programId) continue;
      snap.bump(snap.programOccupied, `${g.organizationId}|${g.programId}`, g._count);
    }
    for (const g of programRotations) {
      if (!g.programId) continue;
      snap.bump(snap.programDeptOccupied, `${g.organizationId}|${g.programId}|${g.departmentId}`, g._count);
      snap.bump(snap.programTrainerOccupied, `${g.organizationId}|${g.programId}|${g.trainerProfileId}`, g._count);
    }
    for (const r of stagingRows as any[]) {
      const pid = r.trainingRequest?.programId;
      if (!pid || !r.assignedHospitalId) continue;
      snap.bump(snap.programOccupied, `${r.assignedHospitalId}|${pid}`, 1);
      if (r.assignedDepartmentId) {
        snap.bump(snap.programDeptOccupied, `${r.assignedHospitalId}|${pid}|${r.assignedDepartmentId}`, 1);
      }
      if (r.assignedTrainerProfileId) {
        snap.bump(snap.programTrainerOccupied, `${r.assignedHospitalId}|${pid}|${r.assignedTrainerProfileId}`, 1);
      }
    }
    return snap;
  }

  /**
   * Unlike `toResult`, this never substitutes a fallback capacity: a program with
   * no declared seats must read as zero, not as a default allowance.
   */
  private toExplicitResult(capacity: number, occupied: number): OccupancyResult {
    const available = Math.max(0, capacity - occupied);
    const occupancyPercentage =
      capacity > 0 ? Math.min(100, Math.round((occupied / capacity) * 100)) : 0;
    return { capacity, occupied, available, occupancyPercentage };
  }

  /**
   * @deprecated Use `toExplicitResult`. This substituted a default allowance when
   * no capacity was declared, which meant a hospital that had declared nothing
   * still appeared to have 50 seats — a number no one entered and no screen could
   * account for. Kept only for the specialty/supervisor paths still on it.
   */
  private toResult(capacity: number, occupied: number): OccupancyResult {
    const safeCapacity = capacity > 0 ? capacity : DEFAULT_HOSPITAL_CAPACITY_FALLBACK;
    const available = Math.max(0, safeCapacity - occupied);
    const occupancyPercentage = Math.min(100, Math.round((occupied / safeCapacity) * 100));
    return { capacity: safeCapacity, occupied, available, occupancyPercentage };
  }

  /**
   * Hospital training capacity is the sum of its active departments' declared
   * capacity — the single source of truth, maintained by the hospital training
   * administration.
   *
   * `organizations.capacity` is no longer read. It was a second, independently
   * edited number, and the two disagreed badly in practice: one hospital declared
   * 50 on the organisation row while its eighteen departments summed to 375.
   * Screens reading one and screens reading the other could not be reconciled.
   * The column is retained in the schema (see the deprecation note there) but has
   * no effect on any calculation.
   *
   * Occupancy is the count of OPEN allocations, unioned with active rotations so
   * trainees recorded before the allocation table existed still occupy a seat.
   * Counting by trainee identity means a trainee holding both an allocation and a
   * rotation is one occupant, not two.
   */
  async getHospitalOccupancy(organizationId: string, tx?: Prisma.TransactionClient): Promise<OccupancyResult> {
    const db = tx || this.prisma;
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, capacity: true },
    });
    if (!org) return { capacity: 0, occupied: 0, available: 0, occupancyPercentage: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [departments, allocations, rotations, stagingRows] = await Promise.all([
      db.department.findMany({
        where: { organizationId, isActive: true, deletedAt: null },
        select: { capacity: true },
      }),
      db.traineeAllocation.findMany({
        where: {
          hospitalId: organizationId,
          status: 'open',
          OR: [{ endDate: null }, { endDate: { gte: today } }],
        },
        select: { traineeRowId: true },
      }),
      db.rotation.findMany({
        where: {
          organizationId,
          status: 'active',
          endDate: { gte: today },
        },
        select: { traineeProfileId: true },
      }),
      db.trainingRequestTrainee.findMany({
        where: {
          assignedHospitalId: organizationId,
          status: { in: OCCUPYING_ROW_STATUSES },
          OR: [{ endDate: null }, { endDate: { gte: today } }],
        },
        select: { id: true },
      }),
    ]);

    const deptSum = departments.reduce((total, d) => total + d.capacity, 0);
    const capacity = org.capacity > 0 ? org.capacity : deptSum;
    const occupants = new Set<string>([
      ...allocations.map((a) => `row:${a.traineeRowId}`),
      ...rotations.map((r) => `profile:${r.traineeProfileId}`),
      ...stagingRows.map((s) => `row:${s.id}`),
    ]);

    return this.toExplicitResult(capacity, occupants.size);
  }

  /**
   * Department capacity is declared on the department itself; occupancy is the
   * same union as above, narrowed to active trainees in this department.
   */
  async getDepartmentOccupancy(
    departmentId: string,
    trainingPeriodOrTx?: string | Prisma.TransactionClient,
    transactionClient?: Prisma.TransactionClient,
  ): Promise<OccupancyResult> {
    const trainingPeriod = typeof trainingPeriodOrTx === 'string' ? trainingPeriodOrTx : undefined;
    const tx = typeof trainingPeriodOrTx === 'string' ? transactionClient : (trainingPeriodOrTx || transactionClient);

    const db = tx || this.prisma;
    const dept = await db.department.findUnique({
      where: { id: departmentId },
      select: { organizationId: true, capacity: true, isActive: true },
    });
    if (!dept) return { capacity: 0, occupied: 0, available: 0, occupancyPercentage: 0 };

    let effectiveCapacity = dept.capacity;
    if (trainingPeriod) {
      const periodAlloc = await db.capacityAllocation.findFirst({
        where: {
          organizationId: dept.organizationId,
          scopeType: 'department',
          scopeId: departmentId,
          trainingPeriod,
        },
        select: { totalCapacity: true },
      });
      if (periodAlloc) {
        effectiveCapacity = periodAlloc.totalCapacity;
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [allocations, rotations, stagingRows] = await Promise.all([
      db.traineeAllocation.findMany({
        where: {
          departmentId,
          status: 'open',
          OR: [{ endDate: null }, { endDate: { gte: today } }],
        },
        select: { traineeRowId: true },
      }),
      db.rotation.findMany({
        where: {
          departmentId,
          status: 'active',
          endDate: { gte: today },
        },
        select: { traineeProfileId: true },
      }),
      db.trainingRequestTrainee.findMany({
        where: {
          assignedDepartmentId: departmentId,
          status: { in: OCCUPYING_ROW_STATUSES },
          OR: [{ endDate: null }, { endDate: { gte: today } }],
        },
        select: { id: true },
      }),
    ]);

    const occupants = new Set<string>([
      ...allocations.map((a) => `row:${a.traineeRowId}`),
      ...rotations.map((r) => `profile:${r.traineeProfileId}`),
      ...stagingRows.map((s) => `row:${s.id}`),
    ]);

    // An inactive department offers no training seats regardless of its number.
    return this.toExplicitResult(dept.isActive ? effectiveCapacity : 0, occupants.size);
  }

  async getTrainerOccupancy(trainerProfileId: string, tx?: Prisma.TransactionClient): Promise<OccupancyResult> {
    const db = tx || this.prisma;
    const trainer = await db.trainerProfile.findUnique({
      where: { id: trainerProfileId },
      select: { maxTrainees: true },
    });
    if (!trainer) return { capacity: 0, occupied: 0, available: 0, occupancyPercentage: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [allocations, rotations, stagingRows] = await Promise.all([
      this.prisma.traineeAllocation.findMany({
        where: {
          trainerProfileId,
          status: 'open',
          OR: [{ endDate: null }, { endDate: { gte: today } }],
        },
        select: { traineeRowId: true },
      }),
      this.prisma.rotation.findMany({
        where: {
          trainerProfileId,
          status: 'active',
          endDate: { gte: today },
        },
        select: { traineeProfileId: true },
      }),
      this.prisma.trainingRequestTrainee.findMany({
        where: {
          assignedTrainerProfileId: trainerProfileId,
          status: { in: OCCUPYING_ROW_STATUSES },
          OR: [{ endDate: null }, { endDate: { gte: today } }],
        },
        select: { id: true },
      }),
    ]);
    const occupants = new Set<string>([
      ...allocations.map((a) => `row:${a.traineeRowId}`),
      ...rotations.map((r) => `profile:${r.traineeProfileId}`),
      ...stagingRows.map((s) => `row:${s.id}`),
    ]);
    return this.toExplicitResult(trainer.maxTrainees, occupants.size);
  }

  /**
   * Specialty (optionally further scoped by training period) capacity.
   * Gender rules removed entirely.
   */
  async getSpecialtyOccupancy(
    organizationId: string,
    filter: { specialtyCode?: string; trainingPeriod?: string },
  ): Promise<OccupancyResult> {
    const specialtyCode = filter.specialtyCode || '';
    const trainingPeriod = filter.trainingPeriod || '';

    const allocation = await this.prisma.capacityAllocation.findFirst({
      where: {
        organizationId,
        scopeType: 'specialty',
        scopeId: '',
        programId: '',
        specialtyCode,
        gender: '',
        trainingPeriod,
      },
    });
    if (!allocation) return { capacity: 0, occupied: 0, available: 0, occupancyPercentage: 0 };

    const rows = await this.prisma.traineeProfile.findMany({
      where: { organizationId, deletedAt: null },
      select: { specialtyEn: true, specialtyAr: true, academicIntake: { select: { academicYear: true } } },
    });
    const occupied = rows.filter((r) => {
      const spec = r.specialtyEn || r.specialtyAr || '';
      return (
        (specialtyCode === '' || spec === specialtyCode) &&
        (trainingPeriod === '' || (r.academicIntake?.academicYear || '') === trainingPeriod)
      );
    }).length;

    const safeCapacity = allocation.totalCapacity;
    const available = Math.max(0, safeCapacity - occupied);
    const occupancyPercentage = safeCapacity > 0 ? Math.min(100, Math.round((occupied / safeCapacity) * 100)) : 0;
    return { capacity: safeCapacity, occupied, available, occupancyPercentage };
  }

  async getSupervisorOccupancy(supervisorAccountId: string): Promise<OccupancyResult> {
    const allocation = await this.prisma.capacityAllocation.findFirst({
      where: { scopeType: 'supervisor', scopeId: supervisorAccountId },
      orderBy: { createdAt: 'desc' },
    });
    if (!allocation) return { capacity: 0, occupied: 0, available: 0, occupancyPercentage: 0 };

    const occupied = await this.prisma.rotation.count({
      where: { supervisorAccountId, status: 'active' },
    });
    const safeCapacity = allocation.totalCapacity;
    const available = Math.max(0, safeCapacity - occupied);
    const occupancyPercentage = safeCapacity > 0 ? Math.min(100, Math.round((occupied / safeCapacity) * 100)) : 0;
    return { capacity: safeCapacity, occupied, available, occupancyPercentage };
  }

  /**
   * Translates the DB trigger's raised exception (prefixed CAPACITY_EXCEEDED:)
   * into a clean BadRequestException. Call sites that write to trainee_profiles
   * or rotations should wrap the write with this so callers get a proper 400
   * instead of a raw Postgres/Prisma error leaking through.
   */
  async runGuarded<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (e) {
      const message = (e as Error)?.message || '';
      // Postgres's debug-formatted error struct puts the whole thing on one
      // "line" with no real newline, so bound the capture at the closing
      // quote of the message field (our text never contains a literal ").
      const match = message.match(/CAPACITY_EXCEEDED:\s*([^"\n]+)/);
      if (match) {
        throw new BadRequestException(match[1].trim());
      }
      throw e;
    }
  }
}
