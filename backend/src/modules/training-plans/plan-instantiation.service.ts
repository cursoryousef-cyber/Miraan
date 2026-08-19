import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { canonicalDepartmentCode, departmentMatchesTemplate } from '../../common/department-code';

/**
 * Turns a training plan version into a trainee's personal rotation schedule.
 *
 * Templates are national while departments, trainers and evaluation forms belong
 * to individual hospitals, so every template rotation is resolved against the
 * hospital the trainee was allocated to. Anything that cannot be resolved falls
 * back to the allocation the engine already made rather than failing activation.
 */
@Injectable()
export class PlanInstantiationService {
  private readonly logger = new Logger(PlanInstantiationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Creates the rotation schedule for one trainee.
   *
   * Rotations run back to back from `startDate`, each for its template duration.
   * Returns the rotations created and any template rows that could not be placed.
   */
  async instantiateForTrainee(params: {
    traineeProfileId: string;
    versionId: string;
    hospitalId: string;
    startDate: Date;
    programId?: string | null;
    fallbackDepartmentId?: string | null;
    fallbackTrainerProfileId?: string | null;
    supervisorAccountId?: string | null;
    actorId?: string;
  }) {
    const version = await this.prisma.trainingPlanVersion.findUnique({
      where: { id: params.versionId },
      include: { rotations: { orderBy: { sequenceOrder: 'asc' } } },
    });
    if (!version || version.rotations.length === 0) {
      return { created: [], skipped: [], reason: 'الإصدار بلا روتيشنات' };
    }

    // Instantiating twice would duplicate a trainee's whole schedule.
    const already = await this.prisma.rotation.count({
      where: { traineeProfileId: params.traineeProfileId, trainingPlanRotationId: { not: null } },
    });
    if (already > 0) {
      return { created: [], skipped: [], reason: 'جدول المتدرب مُنشأ مسبقاً من الخطة' };
    }

    const departments = await this.prisma.department.findMany({
      where: { organizationId: params.hospitalId, isActive: true, deletedAt: null },
      include: { trainerProfiles: { where: { isActive: true } } },
    });

    // Current load per trainer. A trainer already at their cap must not be handed
    // another rotation — the database enforces this on activation, so picking one
    // blindly would fail the whole activation.
    const loads = new Map<string, number>();
    const trainerIds = departments.flatMap((d) => d.trainerProfiles.map((t) => t.id));
    if (trainerIds.length > 0) {
      const grouped = await this.prisma.rotation.groupBy({
        by: ['trainerProfileId'],
        where: { trainerProfileId: { in: trainerIds }, status: 'active' },
        _count: true,
      });
      for (const g of grouped) loads.set(g.trainerProfileId, g._count);
    }

    // Trainers may only supervise programs they are qualified for (Module 2), so
    // the qualified set is resolved once and reused for every rotation.
    const qualifiedTrainerIds = params.programId
      ? new Set(
          (
            await this.prisma.trainerProgram.findMany({
              where: { programId: params.programId, isActive: true },
              select: { trainerProfileId: true },
            })
          ).map((q) => q.trainerProfileId),
        )
      : null;

    const created: string[] = [];
    const skipped: Array<{ sequenceOrder: number; departmentCode: string; reason: string }> = [];
    let cursor = new Date(params.startDate);

    for (const tpl of version.rotations) {
      const endDate = new Date(cursor);
      endDate.setDate(endDate.getDate() + tpl.durationWeeks * 7 - 1);

      const dept = this.resolveDepartment(departments, tpl, params.fallbackDepartmentId);
      if (!dept) {
        skipped.push({
          sequenceOrder: tpl.sequenceOrder,
          departmentCode: tpl.departmentCode,
          reason: 'لا يوجد قسم مطابق في المستشفى',
        });
        cursor = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
        continue;
      }

      const trainerId = this.resolveTrainer(dept, qualifiedTrainerIds, loads, params.fallbackTrainerProfileId);
      if (!trainerId) {
        skipped.push({
          sequenceOrder: tpl.sequenceOrder,
          departmentCode: tpl.departmentCode,
          reason: 'لا يوجد مدرب مؤهل بطاقة متاحة في القسم',
        });
        cursor = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
        continue;
      }

      const rotation = await this.prisma.rotation.create({
        data: {
          organizationId: params.hospitalId,
          traineeProfileId: params.traineeProfileId,
          departmentId: dept.id,
          trainerProfileId: trainerId,
          supervisorAccountId: params.supervisorAccountId ?? null,
          programId: params.programId ?? null,
          trainingPlanRotationId: tpl.id,
          sequenceOrder: tpl.sequenceOrder,
          startDate: new Date(cursor),
          endDate,
          // Only the first rotation starts active; the rest wait their turn.
          status: tpl.sequenceOrder === version.rotations[0].sequenceOrder ? 'active' : 'scheduled',
          createdById: params.actorId,
        },
      });
      created.push(rotation.id);
      loads.set(trainerId, (loads.get(trainerId) ?? 0) + 1);

      await this.seedRequirements(tpl, params.traineeProfileId);
      cursor = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
    }

    return { created, skipped, endDate: cursor };
  }

  /** Exact canonical code first, then an Arabic/English name match, then the allocated department. */
  private resolveDepartment(
    departments: Array<{ id: string; code: string | null; nameAr: string; nameEn: string | null; trainerProfiles: any[] }>,
    tpl: { departmentCode: string; departmentNameAr: string },
    fallbackDepartmentId?: string | null,
  ) {
    // Same matcher the allocation engine used to accept this hospital, so a
    // hospital that passed the timeline guard can actually host the rotation.
    const matched = departments.find((d) => departmentMatchesTemplate(d, tpl));
    if (matched) return matched;

    return departments.find((d) => d.id === fallbackDepartmentId) ?? null;
  }

  /**
   * The least-loaded qualified trainer in the department that still has a free
   * seat. Qualification is never traded away for capacity: when the program is
   * known, an unqualified trainer is not a candidate at any load.
   */
  private resolveTrainer(
    dept: { trainerProfiles: Array<{ id: string; maxTrainees: number }> },
    qualifiedTrainerIds: Set<string> | null,
    loads: Map<string, number>,
    fallbackTrainerProfileId?: string | null,
  ): string | null {
    const eligible = qualifiedTrainerIds
      ? dept.trainerProfiles.filter((t) => qualifiedTrainerIds.has(t.id))
      : dept.trainerProfiles;

    const withRoom = eligible
      .filter((t) => (loads.get(t.id) ?? 0) < t.maxTrainees)
      .sort((a, b) => (loads.get(a.id) ?? 0) - (loads.get(b.id) ?? 0));
    if (withRoom.length > 0) return withRoom[0].id;

    // The trainer the allocation engine picked, used when this department has
    // nobody free. Their cap still applies: the database rejects an active
    // rotation over capacity, which would fail the entire activation.
    if (
      fallbackTrainerProfileId &&
      (!qualifiedTrainerIds || qualifiedTrainerIds.has(fallbackTrainerProfileId))
    ) {
      const fallback = dept.trainerProfiles.find((t) => t.id === fallbackTrainerProfileId);
      const cap = fallback?.maxTrainees ?? Number.POSITIVE_INFINITY;
      if ((loads.get(fallbackTrainerProfileId) ?? 0) < cap) return fallbackTrainerProfileId;
    }
    return null;
  }

  /**
   * Seeds the trainee's competency targets from the template's required
   * procedures. The template stores catalog codes, so the live catalog supplies
   * the ids while the required count comes from the version — a later catalog
   * change cannot alter what this trainee was asked to do.
   */
  private async seedRequirements(
    tpl: { requiredProcedures: any },
    traineeProfileId: string,
  ) {
    const required = Array.isArray(tpl.requiredProcedures) ? tpl.requiredProcedures : [];
    if (required.length === 0) return;

    const codes = required.map((r: any) => r?.code).filter(Boolean);
    if (codes.length === 0) return;

    const procedures = await this.prisma.procedureCatalog.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true, minRequired: true },
    });
    const byCode = new Map(procedures.map((p) => [p.code, p]));

    for (const item of required) {
      const proc = byCode.get(item?.code);
      if (!proc) continue;
      await this.prisma.competencyProgress.upsert({
        where: { traineeProfileId_procedureId: { traineeProfileId, procedureId: proc.id } },
        create: {
          traineeProfileId,
          procedureId: proc.id,
          requiredCount: item?.minCount ?? proc.minRequired,
          completedCount: 0,
          status: 'pending',
        },
        // An existing target is left alone: an earlier rotation may already have
        // progress against it, and versions must not rewrite each other.
        update: {},
      });
    }
  }
}
