import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../../common/interfaces';
import {
  CreateTrainingPlanDto,
  UpdateTrainingPlanDto,
  UpsertPlanRotationDto,
  PublishVersionDto,
} from './dto/training-plan.dto';

/**
 * Training plan templates and their immutable versions.
 *
 * A `TrainingPlan` is stable identity only — name, code, owning program. All
 * training content lives in a `TrainingPlanVersion`, which becomes read-only the
 * moment it is published. Editing published content never overwrites it: the
 * version is cloned into a new draft and the edit lands there, so a trainee who
 * started on version 1 keeps referencing version 1 forever and historical reports
 * stay reproducible.
 */
@Injectable()
export class TrainingPlansService {
  constructor(private prisma: PrismaService) {}

  // ─── Plan headers ───────────────────────────────────────────────────────────

  async listPlans(opts: { programId?: string; includeInactive?: boolean } = {}) {
    const data = await this.prisma.trainingPlan.findMany({
      where: {
        ...(opts.programId ? { programId: opts.programId } : {}),
        ...(opts.includeInactive ? {} : { isActive: true }),
      },
      include: {
        program: { select: { id: true, code: true, nameAr: true, durationMonths: true } },
        versions: {
          select: {
            id: true, versionNumber: true, label: true, status: true,
            effectiveFrom: true, effectiveTo: true, totalWeeks: true, publishedAt: true,
          },
          orderBy: { versionNumber: 'desc' },
        },
      },
      orderBy: { nameAr: 'asc' },
    });
    return { data };
  }

  async getPlan(planId: string) {
    const plan = await this.prisma.trainingPlan.findUnique({
      where: { id: planId },
      include: {
        program: { select: { id: true, code: true, nameAr: true, durationMonths: true } },
        versions: {
          include: { rotations: { orderBy: { sequenceOrder: 'asc' } } },
          orderBy: { versionNumber: 'desc' },
        },
      },
    });
    if (!plan) throw new NotFoundException('الخطة التدريبية غير موجودة');
    return { data: plan };
  }

  /** Creates a plan header together with an empty draft version 1. */
  async createPlan(dto: CreateTrainingPlanDto, user: IAuthenticatedUser) {
    const program = await this.prisma.program.findFirst({
      where: { id: dto.programId, deletedAt: null },
      select: { id: true, nameAr: true },
    });
    if (!program) throw new NotFoundException('البرنامج التدريبي غير موجود في الكتالوج');

    if (dto.code) {
      const clash = await this.prisma.trainingPlan.findFirst({
        where: { programId: dto.programId, code: dto.code },
      });
      if (clash) throw new ConflictException('يوجد قالب خطة بنفس الرمز لهذا البرنامج');
    }

    const plan = await this.prisma.trainingPlan.create({
      data: {
        programId: dto.programId,
        organizationId: dto.organizationId ?? null,
        code: dto.code ?? null,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn ?? null,
        trainingYear: dto.trainingYear ?? null,
        status: 'active',
        createdById: user.accountId,
        versions: {
          create: {
            versionNumber: 1,
            label: dto.versionLabel ?? `الإصدار 1${dto.trainingYear ? ` (${dto.trainingYear})` : ''}`,
            status: 'draft',
            effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
            createdById: user.accountId,
          },
        },
      },
      include: { versions: true },
    });

    await this.audit(user, 'create_training_plan', plan.id, null, {
      programId: dto.programId, nameAr: dto.nameAr, code: dto.code ?? null,
    });
    return { data: plan, success: true, message: 'تم إنشاء قالب الخطة التدريبية مع الإصدار الأول' };
  }

  /** Header metadata only. Training content is edited through versions. */
  async updatePlan(planId: string, dto: UpdateTrainingPlanDto, user: IAuthenticatedUser) {
    const plan = await this.prisma.trainingPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('الخطة التدريبية غير موجودة');

    const updated = await this.prisma.trainingPlan.update({
      where: { id: planId },
      data: {
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.trainingYear !== undefined ? { trainingYear: dto.trainingYear } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedById: user.accountId,
      },
    });
    await this.audit(user, 'update_training_plan', planId,
      { nameAr: plan.nameAr, isActive: plan.isActive },
      { nameAr: updated.nameAr, isActive: updated.isActive });
    return { data: updated, success: true, message: 'تم تحديث بيانات القالب' };
  }

  // ─── Versions ───────────────────────────────────────────────────────────────

  async getVersion(versionId: string) {
    const version = await this.prisma.trainingPlanVersion.findUnique({
      where: { id: versionId },
      include: {
        trainingPlan: { include: { program: { select: { id: true, code: true, nameAr: true } } } },
        rotations: { orderBy: { sequenceOrder: 'asc' } },
      },
    });
    if (!version) throw new NotFoundException('إصدار الخطة غير موجود');
    return { data: version };
  }

  /**
   * The version new trainees should start on: the active one whose effective
   * window covers the start date, falling back to the plan's active version.
   */
  async resolveActiveVersion(planId: string, on?: Date) {
    const active = await this.prisma.trainingPlanVersion.findFirst({
      where: { trainingPlanId: planId, status: 'active' },
      include: { rotations: { orderBy: { sequenceOrder: 'asc' } } },
    });
    if (!active) return null;
    if (on && active.effectiveFrom && on < active.effectiveFrom) return null;
    if (on && active.effectiveTo && on > active.effectiveTo) return null;
    return active;
  }

  /**
   * Opens a new draft by cloning a version's rotations. This is the only way to
   * change published content — the source version is never touched.
   */
  async createDraftVersion(planId: string, sourceVersionId: string | undefined, user: IAuthenticatedUser) {
    const plan = await this.prisma.trainingPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('الخطة التدريبية غير موجودة');

    const existingDraft = await this.prisma.trainingPlanVersion.findFirst({
      where: { trainingPlanId: planId, status: 'draft' },
    });
    if (existingDraft) {
      throw new ConflictException(
        `يوجد إصدار مسودة بالفعل (رقم ${existingDraft.versionNumber}) — أكمل تعديله أو اعتمده قبل إنشاء إصدار جديد`,
      );
    }

    const source = sourceVersionId
      ? await this.prisma.trainingPlanVersion.findUnique({
          where: { id: sourceVersionId },
          include: { rotations: { orderBy: { sequenceOrder: 'asc' } } },
        })
      : await this.prisma.trainingPlanVersion.findFirst({
          where: { trainingPlanId: planId },
          include: { rotations: { orderBy: { sequenceOrder: 'asc' } } },
          orderBy: { versionNumber: 'desc' },
        });
    if (sourceVersionId && (!source || source.trainingPlanId !== planId)) {
      throw new NotFoundException('الإصدار المصدر غير موجود ضمن هذه الخطة');
    }

    return this.cloneIntoDraft(planId, source, user);
  }

  /** Shared by the explicit clone endpoint and the implicit clone on editing. */
  private async cloneIntoDraft(
    planId: string,
    source: ({ rotations: any[] } & Record<string, any>) | null,
    user: IAuthenticatedUser,
  ) {
    const last = await this.prisma.trainingPlanVersion.findFirst({
      where: { trainingPlanId: planId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    const nextNumber = (last?.versionNumber ?? 0) + 1;

    const draft = await this.prisma.trainingPlanVersion.create({
      data: {
        trainingPlanId: planId,
        versionNumber: nextNumber,
        label: `الإصدار ${nextNumber}`,
        status: 'draft',
        clonedFromVersionId: source?.id ?? null,
        notes: source ? `منسوخ من الإصدار ${source.versionNumber}` : null,
        totalWeeks: source?.totalWeeks ?? 0,
        createdById: user.accountId,
        rotations: source
          ? {
              create: source.rotations.map((r: any) => ({
                sequenceOrder: r.sequenceOrder,
                departmentCode: r.departmentCode,
                departmentNameAr: r.departmentNameAr,
                departmentNameEn: r.departmentNameEn,
                specialtyCode: r.specialtyCode,
                durationWeeks: r.durationWeeks,
                isMandatory: r.isMandatory,
                requiredCompetencies: r.requiredCompetencies,
                requiredProcedures: r.requiredProcedures,
                requiredLogbookItems: r.requiredLogbookItems,
                requiredEvaluations: r.requiredEvaluations,
                objectives: r.objectives,
                notes: r.notes,
              })),
            }
          : undefined,
      },
      include: { rotations: { orderBy: { sequenceOrder: 'asc' } } },
    });

    await this.audit(user, 'create_training_plan_version', draft.id, null, {
      trainingPlanId: planId, versionNumber: nextNumber, clonedFrom: source?.versionNumber ?? null,
    });
    return draft;
  }

  /**
   * Publishes a draft and retires the version it replaces. The previous version is
   * archived, not deleted — trainees already on it keep their link, and its
   * rotations stay readable for historical reporting.
   */
  async publishVersion(versionId: string, dto: PublishVersionDto, user: IAuthenticatedUser) {
    const version = await this.prisma.trainingPlanVersion.findUnique({
      where: { id: versionId },
      include: { rotations: true },
    });
    if (!version) throw new NotFoundException('إصدار الخطة غير موجود');
    if (version.status !== 'draft') {
      throw new BadRequestException('لا يمكن اعتماد إصدار غير مسودة — الإصدارات المعتمدة غير قابلة للتعديل');
    }
    if (version.rotations.length === 0) {
      throw new BadRequestException('لا يمكن اعتماد إصدار بلا روتيشنات');
    }

    const totalWeeks = version.rotations.reduce((n, r) => n + r.durationWeeks, 0);
    const previous = await this.prisma.trainingPlanVersion.findFirst({
      where: { trainingPlanId: version.trainingPlanId, status: 'active' },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      // Archive first: a single active version per plan is enforced by a partial
      // unique index, so the retirement must land before the promotion.
      if (previous) {
        await tx.trainingPlanVersion.update({
          where: { id: previous.id },
          data: {
            status: 'archived',
            archivedAt: new Date(),
            supersededByVersionId: version.id,
            effectiveTo: previous.effectiveTo ?? (dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date()),
            updatedById: user.accountId,
          },
        });
      }
      return tx.trainingPlanVersion.update({
        where: { id: version.id },
        data: {
          status: 'active',
          totalWeeks,
          effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : (version.effectiveFrom ?? new Date()),
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
          label: dto.label ?? version.label,
          publishedAt: new Date(),
          publishedById: user.accountId,
          updatedById: user.accountId,
        },
        include: { rotations: { orderBy: { sequenceOrder: 'asc' } } },
      });
    });

    await this.audit(user, 'publish_training_plan_version', version.id,
      { status: 'draft' },
      { status: 'active', totalWeeks, supersededVersionId: previous?.id ?? null });

    return {
      data: result,
      success: true,
      message: previous
        ? `تم اعتماد الإصدار ${version.versionNumber} وأرشفة الإصدار ${previous.versionNumber}`
        : `تم اعتماد الإصدار ${version.versionNumber}`,
    };
  }

  // ─── Rotation templates ─────────────────────────────────────────────────────

  /**
   * Adds or updates a rotation.
   *
   * Editing a published version is not an error — it transparently opens a new
   * draft version cloned from it and applies the edit there, leaving the
   * published rotations untouched. The response reports which version was
   * actually written to.
   */
  async upsertRotation(versionId: string, dto: UpsertPlanRotationDto, user: IAuthenticatedUser) {
    const { version, redirected } = await this.resolveWritableVersion(versionId, user);

    const data = {
      sequenceOrder: dto.sequenceOrder,
      departmentCode: dto.departmentCode.trim().toUpperCase(),
      departmentNameAr: dto.departmentNameAr,
      departmentNameEn: dto.departmentNameEn ?? null,
      specialtyCode: dto.specialtyCode ?? null,
      durationWeeks: dto.durationWeeks,
      isMandatory: dto.isMandatory ?? true,
      requiredCompetencies: dto.requiredCompetencies ?? [],
      requiredProcedures: dto.requiredProcedures ?? [],
      requiredLogbookItems: dto.requiredLogbookItems ?? [],
      requiredEvaluations: dto.requiredEvaluations ?? [],
      objectives: dto.objectives ?? [],
      notes: dto.notes ?? null,
    };

    const rotation = await this.prisma.trainingPlanRotation.upsert({
      where: {
        trainingPlanVersionId_sequenceOrder: {
          trainingPlanVersionId: version.id,
          sequenceOrder: dto.sequenceOrder,
        },
      },
      create: { trainingPlanVersionId: version.id, ...data },
      update: data,
    });
    await this.recalculateTotalWeeks(version.id);

    await this.audit(user, 'upsert_training_plan_rotation', rotation.id, null, {
      trainingPlanVersionId: version.id, sequenceOrder: dto.sequenceOrder, departmentCode: data.departmentCode,
    });

    return {
      data: rotation,
      versionId: version.id,
      versionNumber: version.versionNumber,
      redirected,
      success: true,
      message: redirected
        ? `الإصدار المعتمد غير قابل للتعديل — تم إنشاء الإصدار ${version.versionNumber} وتطبيق التعديل عليه`
        : 'تم حفظ روتيشن القالب',
    };
  }

  async removeRotation(versionId: string, sequenceOrder: number, user: IAuthenticatedUser) {
    const { version, redirected } = await this.resolveWritableVersion(versionId, user);

    const existing = await this.prisma.trainingPlanRotation.findUnique({
      where: {
        trainingPlanVersionId_sequenceOrder: { trainingPlanVersionId: version.id, sequenceOrder },
      },
    });
    if (!existing) throw new NotFoundException('روتيشن القالب غير موجود');

    await this.prisma.trainingPlanRotation.delete({ where: { id: existing.id } });
    await this.recalculateTotalWeeks(version.id);
    await this.audit(user, 'remove_training_plan_rotation', existing.id, existing, null);

    return {
      versionId: version.id,
      versionNumber: version.versionNumber,
      redirected,
      success: true,
      message: redirected
        ? `الإصدار المعتمد غير قابل للتعديل — تم إنشاء الإصدار ${version.versionNumber} وحذف الروتيشن منه`
        : 'تم حذف روتيشن القالب',
    };
  }

  /**
   * Returns a draft the caller may write to. A draft is returned as-is; a
   * published or archived version is cloned into a fresh draft, which is what
   * makes plan history immutable.
   */
  private async resolveWritableVersion(versionId: string, user: IAuthenticatedUser) {
    const version = await this.prisma.trainingPlanVersion.findUnique({
      where: { id: versionId },
      include: { rotations: { orderBy: { sequenceOrder: 'asc' } } },
    });
    if (!version) throw new NotFoundException('إصدار الخطة غير موجود');
    if (version.status === 'draft') return { version, redirected: false };

    const openDraft = await this.prisma.trainingPlanVersion.findFirst({
      where: { trainingPlanId: version.trainingPlanId, status: 'draft' },
      include: { rotations: { orderBy: { sequenceOrder: 'asc' } } },
    });
    if (openDraft) {
      throw new ConflictException(
        `الإصدار ${version.versionNumber} معتمد وغير قابل للتعديل، ويوجد بالفعل إصدار مسودة رقم ${openDraft.versionNumber} — عدّل المسودة القائمة`,
      );
    }

    const draft = await this.cloneIntoDraft(version.trainingPlanId, version, user);
    return { version: draft, redirected: true };
  }

  private async recalculateTotalWeeks(versionId: string) {
    const agg = await this.prisma.trainingPlanRotation.aggregate({
      where: { trainingPlanVersionId: versionId },
      _sum: { durationWeeks: true },
    });
    await this.prisma.trainingPlanVersion.update({
      where: { id: versionId },
      data: { totalWeeks: agg._sum.durationWeeks ?? 0 },
    });
  }

  private async audit(
    user: IAuthenticatedUser,
    action: string,
    entityId: string,
    oldValues: unknown,
    newValues: unknown,
  ) {
    if (!user?.organizationId) return;
    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.accountId,
        action,
        entityType: 'TrainingPlanVersion',
        entityId,
        oldValues: (oldValues ?? undefined) as object | undefined,
        newValues: (newValues ?? undefined) as object | undefined,
      },
    });
  }
}
