import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../../common/interfaces';
import { RotationInputDto } from './dto/training-request.dto';

const WEEKS_PER_MONTH = 4.345;
/** Tolerance allowed for rotation totals vs program window — 4 weeks (1 month) for 48-52 week variations. */
const DURATION_TOLERANCE_WEEKS = 4;

/**
 * Composing a university training request: which plan versions are on offer for
 * a program, whether a chosen combination is coherent, and what the batch will
 * look like once submitted.
 *
 * This service only reads and validates. Persisting the request stays with
 * TrainingRequestsService, and the trainee rows stay with
 * TrainingRequestTraineesService — the pipeline itself is unchanged.
 */
@Injectable()
export class RequestCompositionService {
  constructor(private prisma: PrismaService) {}

  /**
   * Plans available for a program, with the version the university should get by
   * default. The suggestion is always the active version, since drafts cannot be
   * submitted against and archived ones belong to cohorts already running.
   */
  async getPlanOptions(programId: string) {
    const program = await this.prisma.program.findFirst({
      where: { id: programId, deletedAt: null },
      select: { id: true, code: true, nameAr: true, durationMonths: true },
    });
    if (!program) throw new NotFoundException('البرنامج التدريبي غير موجود في الكتالوج');

    const plans = await this.prisma.trainingPlan.findMany({
      where: { programId, isActive: true },
      include: {
        versions: {
          where: { status: { in: ['active', 'archived'] } },
          include: { rotations: { orderBy: { sequenceOrder: 'asc' } } },
          orderBy: { versionNumber: 'desc' },
        },
      },
      orderBy: { nameAr: 'asc' },
    });

    const data = plans.map((plan) => {
      const active = plan.versions.find((v) => v.status === 'active') ?? null;
      return {
        id: plan.id,
        code: plan.code,
        nameAr: plan.nameAr,
        nameEn: plan.nameEn,
        // What the UI should preselect.
        suggestedVersion: active ? this.versionSummary(active) : null,
        // Archived versions stay selectable so a university can keep a running
        // cohort on the plan it started under.
        selectableVersions: plan.versions.map((v) => this.versionSummary(v)),
      };
    });

    return { data: { program, plans: data } };
  }

  /**
   * Validates a request before it is created and returns the summary the
   * university confirms: program, plan version, rotation count, total weeks,
   * expected graduation and student count.
   *
   * Throws on an invalid combination so an unusable request is never persisted.
   */
  async previewRequest(input: {
    programId?: string;
    specialty?: string;
    trainingPlanId?: string;
    trainingPlanVersionId?: string;
    trainingStartDate?: string;
    trainingEndDate?: string;
    expectedGraduationDate?: string;
    studentCount?: number;
    rotations?: RotationInputDto[];
  }) {
    const dates = this.validateDates(input);
    const resolved = await this.resolvePlan(input, dates.startDate);
    await this.validateSpecialty(input.specialty);

    // A catalog plan already carries its own rotations; a request cannot also
    // propose a competing set for the same program window.
    if (resolved.version && input.rotations?.length) {
      throw new BadRequestException(
        'لا يمكن إرسال روتيشنات مخصصة مع اختيار قالب خطة معتمد من الكتالوج — اختر أحدهما',
      );
    }

    this.assertProgramDurationMatchesWindow(resolved.program, dates);

    // No catalog version chosen: the proposed rotation breakdown stands in for
    // one, and must itself add up to the training window.
    const inlineRotations = !resolved.version && input.rotations?.length
      ? this.validateRotationRows(input.rotations, dates)
      : null;

    return {
      data: {
        program: resolved.program,
        trainingPlan: resolved.plan,
        trainingPlanVersion: resolved.version ? this.versionSummary(resolved.version) : null,
        specialty: input.specialty ?? null,
        rotationCount: resolved.version?.rotations.length ?? inlineRotations?.rows.length ?? 0,
        totalWeeks: resolved.version?.totalWeeks ?? inlineRotations?.totalWeeks ?? 0,
        // Present when the university is proposing its own breakdown rather than
        // picking one off the shelf, so the form can render it the same way it
        // would render a catalog plan's rotations.
        rotations: inlineRotations?.rows ?? resolved.version?.rotations.map((r) => ({
          sequenceOrder: r.sequenceOrder,
          departmentNameAr: r.departmentNameAr,
          departmentCode: r.departmentCode,
          durationWeeks: r.durationWeeks,
          isMandatory: r.isMandatory,
        })) ?? null,
        trainingStartDate: dates.startDate,
        trainingEndDate: dates.endDate,
        expectedGraduationDate: dates.expectedGraduationDate,
        studentCount: input.studentCount ?? 0,
        warnings: this.buildWarnings(resolved.version, dates),
      },
      valid: true,
    };
  }

  /** The same summary for a request that already exists. */
  async getRequestSummary(trainingRequestId: string) {
    const request = await this.prisma.trainingRequest.findUnique({
      where: { id: trainingRequestId },
      include: {
        sourceOrg: { select: { id: true, nameAr: true } },
        targetOrg: { select: { id: true, nameAr: true } },
        program: { select: { id: true, code: true, nameAr: true, durationMonths: true } },
        trainingPlan: { select: { id: true, code: true, nameAr: true } },
        trainingPlanVersion: { include: { rotations: { orderBy: { sequenceOrder: 'asc' } } } },
        _count: { select: { trainees: true } },
      },
    });
    if (!request) throw new NotFoundException('طلب التدريب غير موجود');

    const version = request.trainingPlanVersion;
    const byStatus = await this.prisma.trainingRequestTrainee.groupBy({
      by: ['status'],
      where: { trainingRequestId },
      _count: true,
    });

    return {
      data: {
        requestNumber: request.requestNumber,
        status: request.status,
        university: request.sourceOrg,
        cluster: request.targetOrg,
        program: request.program,
        specialty: request.specialty,
        trainingPlan: request.trainingPlan,
        trainingPlanVersion: version ? this.versionSummary(version) : null,
        rotationCount: version?.rotations.length ?? 0,
        totalWeeks: version?.totalWeeks ?? 0,
        rotations: version?.rotations.map((r) => ({
          sequenceOrder: r.sequenceOrder,
          departmentCode: r.departmentCode,
          departmentNameAr: r.departmentNameAr,
          durationWeeks: r.durationWeeks,
        })) ?? [],
        trainingStartDate: request.trainingStartDate,
        trainingEndDate: request.trainingEndDate,
        expectedGraduationDate: request.expectedGraduationDate,
        studentCount: request.studentCount,
        traineeRowCount: request._count.trainees,
        rowsByStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
        // A legacy request carries no plan and stays perfectly valid.
        isLegacyRequest: !request.trainingPlanId,
      },
    };
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  /**
   * Date rules for a request: a training window that runs forwards, and a
   * graduation date that cannot precede the end of training.
   */
  validateDates(input: {
    trainingStartDate?: string | Date | null;
    trainingEndDate?: string | Date | null;
    expectedGraduationDate?: string | Date | null;
  }) {
    const startDate = this.toDate(input.trainingStartDate, 'تاريخ بداية التدريب');
    const endDate = this.toDate(input.trainingEndDate, 'تاريخ نهاية التدريب');
    const expectedGraduationDate = this.toDate(
      input.expectedGraduationDate,
      'تاريخ التخرج المتوقع',
    );

    if (startDate && endDate && endDate <= startDate) {
      throw new BadRequestException('تاريخ نهاية التدريب يجب أن يكون بعد تاريخ البداية');
    }
    if (endDate && expectedGraduationDate && expectedGraduationDate < endDate) {
      throw new BadRequestException(
        'تاريخ التخرج المتوقع يجب أن يكون في تاريخ نهاية التدريب أو بعده',
      );
    }
    if (!endDate && expectedGraduationDate && startDate && expectedGraduationDate < startDate) {
      throw new BadRequestException('تاريخ التخرج المتوقع يسبق تاريخ بداية التدريب');
    }

    return { startDate, endDate, expectedGraduationDate };
  }

  /**
   * Resolves and cross-checks program, plan and version.
   *
   * Returns nulls when no plan was chosen — a request without a plan stays
   * valid, which is what keeps the two legacy requests working.
   */
  async resolvePlan(
    input: { programId?: string; trainingPlanId?: string; trainingPlanVersionId?: string },
    startDate?: Date | null,
  ) {
    let program: { id: string; code: string; nameAr: string; durationMonths: number } | null = null;
    if (input.programId) {
      program = await this.prisma.program.findFirst({
        where: { id: input.programId, deletedAt: null },
        select: { id: true, code: true, nameAr: true, durationMonths: true },
      });
      if (!program) throw new NotFoundException('البرنامج التدريبي غير موجود في الكتالوج');
    }

    if (!input.trainingPlanId) {
      if (input.trainingPlanVersionId) {
        throw new BadRequestException('تم تحديد إصدار خطة بدون تحديد القالب');
      }
      return { program, plan: null, version: null };
    }

    const plan = await this.prisma.trainingPlan.findUnique({
      where: { id: input.trainingPlanId },
      select: { id: true, code: true, nameAr: true, programId: true, isActive: true },
    });
    if (!plan) throw new NotFoundException('قالب الخطة التدريبية غير موجود');
    if (!plan.isActive) throw new BadRequestException('قالب الخطة التدريبية غير مفعّل');
    if (program && plan.programId !== program.id) {
      throw new BadRequestException('قالب الخطة لا يتبع البرنامج التدريبي المختار');
    }

    const version = input.trainingPlanVersionId
      ? await this.requireSelectableVersion(input.trainingPlanVersionId, plan.id)
      : await this.requireActiveVersion(plan.id, startDate);

    return { program, plan, version };
  }

  private async requireSelectableVersion(versionId: string, planId: string) {
    const version = await this.prisma.trainingPlanVersion.findUnique({
      where: { id: versionId },
      include: { rotations: { orderBy: { sequenceOrder: 'asc' } } },
    });
    if (!version || version.trainingPlanId !== planId) {
      throw new NotFoundException('إصدار الخطة غير موجود ضمن هذا القالب');
    }
    if (version.status === 'draft') {
      throw new BadRequestException(
        `لا يمكن التقديم على إصدار مسودة (رقم ${version.versionNumber}) — يجب اعتماده أولاً`,
      );
    }
    return version;
  }

  private async requireActiveVersion(planId: string, startDate?: Date | null) {
    const version = await this.prisma.trainingPlanVersion.findFirst({
      where: { trainingPlanId: planId, status: 'active' },
      include: { rotations: { orderBy: { sequenceOrder: 'asc' } } },
    });
    if (!version) throw new BadRequestException('لا يوجد إصدار معتمد لهذا القالب');
    if (startDate) {
      if (version.effectiveFrom && startDate < version.effectiveFrom) {
        throw new BadRequestException('تاريخ بداية التدريب يسبق بداية سريان الإصدار المعتمد');
      }
      if (version.effectiveTo && startDate > version.effectiveTo) {
        throw new BadRequestException('تاريخ بداية التدريب بعد نهاية سريان الإصدار المعتمد');
      }
    }
    return version;
  }

  /**
   * The program's catalog duration must actually match the window the request
   * proposes — a request asking for 3 months of an internship declared as 12 is
   * asking for something the program does not describe.
   *
   * Skipped when either side is missing: a legacy request with no program, or a
   * program whose duration was never catalogued, stays valid rather than being
   * retroactively blocked by a field nobody filled in.
   */
  assertProgramDurationMatchesWindow(
    program: { durationMonths: number; nameAr: string } | null,
    dates: { startDate: Date | null; endDate: Date | null },
  ): void {
    if (!program?.durationMonths || !dates.startDate || !dates.endDate) return;

    const windowWeeks = this.weeksBetween(dates.startDate, dates.endDate);
    const programWeeks = Math.round(program.durationMonths * WEEKS_PER_MONTH);

    if (Math.abs(windowWeeks - programWeeks) > DURATION_TOLERANCE_WEEKS) {
      throw new BadRequestException(
        `مدة برنامج «${program.nameAr}» (${program.durationMonths} شهر ≈ ${programWeeks} أسبوع) ` +
          `لا تطابق الفترة المحددة (${windowWeeks} أسبوع) — عدّل تاريخي البداية والنهاية ليطابقا مدة البرنامج`,
      );
    }
  }

  /**
   * Validates a proposed rotation breakdown and totals it. Used both to preview
   * an inline plan before submission and, identically, right before persisting
   * one — the same rule applies at both stages so a request that passed preview
   * cannot fail composition for a reason the university was never shown.
   */
  validateRotationRows(
    rotations: RotationInputDto[],
    dates: { startDate: Date | null; endDate: Date | null },
  ): {
    rows: Array<{
      sequenceOrder: number; departmentNameAr: string; departmentCode: string;
      durationWeeks: number; isMandatory: boolean;
    }>;
    totalWeeks: number;
  } {
    if (!rotations.length) {
      throw new BadRequestException('يجب تحديد روتيشن واحد على الأقل ضمن خطة الطلب');
    }

    const seenCodes = new Set<string>();
    const rows = rotations.map((r, index) => {
      const nameAr = r.departmentNameAr?.trim();
      if (!nameAr) {
        throw new BadRequestException(`الروتيشن رقم ${index + 1}: اسم القسم مطلوب`);
      }
      if (!Number.isInteger(r.durationWeeks) || r.durationWeeks < 1) {
        throw new BadRequestException(`الروتيشن «${nameAr}»: مدة الروتيشن يجب أن تكون رقماً صحيحاً أكبر من صفر`);
      }

      const code = (r.departmentCode?.trim() || this.slugify(nameAr)).toUpperCase();
      if (seenCodes.has(code)) {
        throw new BadRequestException(`رمز القسم «${code}» مكرر داخل خطة الروتيشنات`);
      }
      seenCodes.add(code);

      return {
        sequenceOrder: index + 1,
        departmentNameAr: nameAr,
        departmentCode: code,
        durationWeeks: r.durationWeeks,
        isMandatory: r.isMandatory ?? true,
      };
    });

    const totalWeeks = rows.reduce((sum, r) => sum + r.durationWeeks, 0);

    if (dates.startDate && dates.endDate) {
      const windowWeeks = this.weeksBetween(dates.startDate, dates.endDate);
      if (Math.abs(totalWeeks - windowWeeks) > DURATION_TOLERANCE_WEEKS) {
        throw new BadRequestException(
          `مجموع مدد الروتيشنات (${totalWeeks} أسبوع) لا يطابق فترة التدريب المحددة (${windowWeeks} أسبوع)`,
        );
      }
    }

    return { rows, totalWeeks };
  }

  /**
   * Creates the training plan and version a request's own rotation proposal
   * becomes, when the university is not choosing one off the national catalog.
   *
   * This is a request-scoped plan — `organizationId` is the sending university,
   * not null (null means the national catalog). It is published immediately
   * (status `active`) rather than going through the draft→publish workflow that
   * `TrainingPlansService` uses for shared curriculum: nobody else can select it,
   * it has one version, and it must be immutable from the moment it exists.
   *
   * Deliberately does not reuse TrainingPlansService.createPlan/publishVersion —
   * those are guarded for national-curriculum authoring (platform/cluster only).
   * Authority to write this plan comes from the caller already holding
   * `training_request.create` for their own request, not from borrowing the
   * curriculum-authoring capability.
   */
  async composeInlinePlan(
    program: { id: string; nameAr: string },
    dates: { startDate: Date | null; endDate: Date | null },
    rotations: RotationInputDto[],
    sourceOrgId: string,
    user: IAuthenticatedUser,
  ) {
    const { rows, totalWeeks } = this.validateRotationRows(rotations, dates);

    const code = `REQ-${program.id.slice(0, 8)}-${Date.now().toString(36).toUpperCase()}`;

    const plan = await this.prisma.trainingPlan.create({
      data: {
        programId: program.id,
        organizationId: sourceOrgId,
        code,
        nameAr: `خطة طلب — ${program.nameAr}`,
        status: 'active',
        isActive: true,
        createdById: user.accountId,
        versions: {
          create: {
            versionNumber: 1,
            label: 'الإصدار 1 (خاص بالطلب)',
            status: 'active',
            effectiveFrom: dates.startDate,
            effectiveTo: dates.endDate,
            totalWeeks,
            publishedAt: new Date(),
            publishedById: user.accountId,
            createdById: user.accountId,
            rotations: {
              create: rows.map((r) => ({
                sequenceOrder: r.sequenceOrder,
                departmentCode: r.departmentCode,
                departmentNameAr: r.departmentNameAr,
                durationWeeks: r.durationWeeks,
                isMandatory: r.isMandatory,
              })),
            },
          },
        },
      },
      include: { versions: { include: { rotations: true } } },
    });

    return { plan, version: plan.versions[0] };
  }

  private weeksBetween(start: Date, end: Date): number {
    return Math.round((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
  }

  private slugify(nameAr: string): string {
    // Arabic survives as-is; anything that cannot form a stable code is dropped,
    // and department-matching at allocation time falls back to the Arabic name
    // regardless (see common/department-code.ts).
    const ascii = nameAr.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
    return ascii || `RT${Math.random().toString(36).slice(2, 7)}`;
  }

  /** Specialty must come from the lookup table when supplied. */
  private async validateSpecialty(specialty?: string) {
    if (!specialty) return;
    const found = await this.prisma.lookupTable.findFirst({
      where: { category: 'specialty', code: specialty, isActive: true },
      select: { id: true },
    });
    if (!found) throw new BadRequestException(`التخصص "${specialty}" غير موجود في جدول التخصصات`);
  }

  private buildWarnings(
    version: { totalWeeks: number } | null,
    dates: { startDate: Date | null; endDate: Date | null },
  ): string[] {
    const warnings: string[] = [];
    if (!version || !dates.startDate || !dates.endDate) return warnings;

    const windowWeeks = Math.round(
      (dates.endDate.getTime() - dates.startDate.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    if (version.totalWeeks > windowWeeks) {
      warnings.push(
        `مدة الخطة (${version.totalWeeks} أسبوع) تتجاوز فترة التدريب المحددة (${windowWeeks} أسبوع)`,
      );
    }
    return warnings;
  }

  private versionSummary(version: any) {
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      label: version.label,
      status: version.status,
      effectiveFrom: version.effectiveFrom,
      effectiveTo: version.effectiveTo,
      totalWeeks: version.totalWeeks,
      rotationCount: version.rotations?.length ?? 0,
    };
  }

  private toDate(value: string | Date | null | undefined, label: string): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} غير صالح`);
    return date;
  }
}
