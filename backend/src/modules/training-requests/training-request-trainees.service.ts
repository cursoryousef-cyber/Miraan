import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../../common/interfaces';
import { NotificationService } from '../notifications/notification.service';
import { ValidationEngineService } from './validation-engine.service';
import { CapacityService } from '../organizations/capacity.service';
import {
  assertValidTransition,
  TRAINING_REQUEST_TRAINEE_TRANSITIONS,
} from '../../common/state-machine/transition-guard';
import { TRAINEE_ROW_STATUS, TRAINEE_PROFILE_STATUS } from '../../common/status-constants';
import { ScopeContext, ScopeContextService } from '../../common/authz';
import {
  ChangeAssignmentDto,
  HospitalRejectDto,
  HospitalReturnDto,
  MergeTraineesDto,
  PutOnHoldDto,
  RejectTraineeDto,
  RequestDataCorrectionDto,
  RequestMissingDocsDto,
  ReturnTraineeDto,
  SplitTraineeDto,
  TraineeRowDto,
  UpdateTraineeRowDto,
} from './dto/training-request-trainee.dto';

import { TraineeAllocationService } from './trainee-allocation.service';
import { TraineeAccountProvisioningService } from './trainee-account-provisioning.service';

/**
 * إدارة صفوف المتدربين داخل دفعة طلب التدريب (المراحل 1–3).
 * الصف سجل مرشّح فقط — لا يتحول إلى حساب حقيقي إلا عند اعتماد التجمع.
 */
@Injectable()
export class TrainingRequestTraineesService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private validationEngine: ValidationEngineService,
    private capacityService: CapacityService,
    private scopeContext: ScopeContextService,
    private allocationService: TraineeAllocationService,
    private traineeAccountProvisioning: TraineeAccountProvisioningService,
  ) {}

  // ─── القراءة ──────────────────────────────────────────────────────────────
  async findByRequest(trainingRequestId: string) {
    const data = await this.prisma.trainingRequestTrainee.findMany({
      where: { trainingRequestId },
      include: { documents: true, university: true, college: true, assignedHospital: true },
      orderBy: { createdAt: 'asc' },
    });
    return { data };
  }

  /** الصفوف المُعادة للجامعة — تغذّي لوحة تصحيحات الجامعة (المرحلة 3) */
  async findReturnedForUniversity(universityOrgId: string) {
    const data = await this.prisma.trainingRequestTrainee.findMany({
      where: {
        status: TRAINEE_ROW_STATUS.RETURNED_TO_UNIVERSITY,
        OR: [{ universityOrgId }, { trainingRequest: { sourceOrgId: universityOrgId } }],
      },
      include: {
        documents: true,
        trainingRequest: { select: { id: true, requestNumber: true, targetOrgId: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return { data };
  }

  // ─── الاستيراد والإرسال (المرحلة 1) ───────────────────────────────────────
  /**
   * Bulk import from an Excel upload or manual entry.
   *
   * Every row is checked against the request before anything is written. The
   * import is all-or-nothing: a spreadsheet with bad rows is reported back in
   * full so it can be corrected once, rather than leaving a half-loaded batch.
   *
   * Rows inherit the request's specialty and training window when the file omits
   * them, and the request's pinned plan version applies to all of them — the
   * version is held on the request, so there is nothing to copy onto each row.
   */
  async importTrainees(trainingRequestId: string, rows: TraineeRowDto[], user: IAuthenticatedUser) {
    const request = await this.prisma.trainingRequest.findUnique({
      where: { id: trainingRequestId },
      include: {
        program: { select: { id: true, code: true, nameAr: true, nameEn: true } },
        trainingPlanVersion: { select: { id: true, versionNumber: true, totalWeeks: true } },
      },
    });
    if (!request) throw new NotFoundException('طلب التدريب غير موجود');
    if (!rows?.length) throw new BadRequestException('لا توجد صفوف متدربين للاستيراد');

    const rowErrors = await this.validateImportRows(rows, request, trainingRequestId);
    if (rowErrors.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: `تعذّر الاستيراد — ${rowErrors.length} صف يحتوي على أخطاء`,
        importedCount: 0,
        rowErrors,
      });
    }

    const created = await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.trainingRequestTrainee.create({
          data: {
            ...this.mapRow(row),
            // Fall back to the batch-level values the university already set.
            specialty: row.specialty ?? request.specialty ?? undefined,
            startDate: row.startDate ? new Date(row.startDate) : request.trainingStartDate ?? undefined,
            endDate: row.endDate ? new Date(row.endDate) : request.trainingEndDate ?? undefined,
            trainingRequestId,
            universityOrgId: row.universityOrgId || request.sourceOrgId,
            assignedHospitalId: request.status === 'hospital_review' ? request.targetOrgId : ((row as any).assignedHospitalId || undefined),
            status: request.status === 'hospital_review' ? 'hospital_review' : TRAINEE_ROW_STATUS.DRAFT,
            createdById: user?.accountId,
          },
        }),
      ),
    );

    await this.audit(user, request.sourceOrgId, 'import_training_request_trainees', trainingRequestId, null, {
      importedCount: created.length,
      trainingPlanVersionId: request.trainingPlanVersionId,
    });

    return {
      data: created,
      success: true,
      importedCount: created.length,
      rowErrors: [],
      // Echoed back so the caller can confirm which plan the batch will run on.
      appliedPlanVersion: request.trainingPlanVersion
        ? {
            id: request.trainingPlanVersion.id,
            versionNumber: request.trainingPlanVersion.versionNumber,
            totalWeeks: request.trainingPlanVersion.totalWeeks,
          }
        : null,
      message: `تم استيراد ${created.length} متدرب كمسودة`,
    };
  }

  /**
   * Per-row checks for a bulk upload. Reports every problem in the file at once,
   * addressed by spreadsheet row number so the university can fix them together.
   */
  private async validateImportRows(
    rows: TraineeRowDto[],
    request: {
      specialty: string | null;
      trainingStartDate: Date | null;
      trainingEndDate: Date | null;
      program: { id: string; code: string; nameAr: string; nameEn: string | null } | null;
    },
    trainingRequestId?: string,
  ) {
    const specialtyCodes = new Set(
      (
        await this.prisma.lookupTable.findMany({
          where: { category: 'specialty', isActive: true },
          select: { code: true },
        })
      ).map((s) => s.code),
    );

    // Sibling rows already persisted in this same request, from an earlier
    // import call. Checked once up front rather than per row: without it, a
    // second import into the same request could quietly duplicate a trainee the
    // first import already created, since each call only ever saw its own file.
    const existingRows = trainingRequestId
      ? await this.prisma.trainingRequestTrainee.findMany({
          where: {
            trainingRequestId,
            status: { notIn: ['merged', 'split', 'rejected'] },
          },
          select: { nationalId: true, academicNumber: true },
        })
      : [];
    const existingNationalIds = new Set(existingRows.map((r) => r.nationalId));
    const existingAcademicNumbers = new Set(existingRows.map((r) => r.academicNumber));

    const seenNationalIds = new Map<string, number>();
    const seenAcademicNumbers = new Map<string, number>();
    const errors: Array<{ row: number; academicNumber?: string; errors: string[] }> = [];

    rows.forEach((row, index) => {
      // 1-based, plus a header line, so the number matches what the user sees.
      const rowNumber = index + 2;
      const rowIssues: string[] = [];

      if (!row.academicNumber?.trim()) rowIssues.push('الرقم الأكاديمي مطلوب');
      if (!row.nationalId?.trim()) rowIssues.push('رقم الهوية الوطنية مطلوب');
      else if (!/^\d{10}$/.test(row.nationalId.trim())) rowIssues.push('رقم الهوية يجب أن يكون 10 أرقام');
      if (!row.nameAr?.trim()) rowIssues.push('الاسم بالعربية مطلوب');

      if (row.gender && !['male', 'female'].includes(row.gender)) {
        rowIssues.push(`الجنس "${row.gender}" غير صالح — القيم المقبولة male أو female`);
      }

      // Specialty is required per trainee, either on the row itself or as the
      // batch-level default the request already carries — a trainee with neither
      // has no specialty at all, which downstream allocation cannot place.
      const specialty = row.specialty ?? request.specialty;
      if (!specialty) {
        rowIssues.push('التخصص مطلوب — حدده لكل متدرب أو على مستوى الطلب بالكامل');
      } else if (!specialtyCodes.has(specialty)) {
        rowIssues.push(`التخصص "${specialty}" غير موجود في جدول التخصصات`);
      }

      // The spreadsheet's program column must agree with the request's program;
      // a batch runs on one plan version, so mixed programs cannot be honoured.
      if (row.internshipProgram && request.program) {
        if (!this.programMatches(row.internshipProgram, request.program)) {
          rowIssues.push(
            `البرنامج "${row.internshipProgram}" لا يطابق برنامج الطلب (${request.program.nameAr})`,
          );
        }
      }

      // Training dates are required per trainee too, with the same row-or-batch
      // fallback as specialty.
      const start = row.startDate ? new Date(row.startDate) : request.trainingStartDate;
      const end = row.endDate ? new Date(row.endDate) : request.trainingEndDate;
      if (row.startDate && Number.isNaN(new Date(row.startDate).getTime())) {
        rowIssues.push('تاريخ البداية غير صالح');
      }
      if (row.endDate && Number.isNaN(new Date(row.endDate).getTime())) {
        rowIssues.push('تاريخ النهاية غير صالح');
      }
      if (!start) rowIssues.push('تاريخ البداية مطلوب — حدده لكل متدرب أو على مستوى الطلب بالكامل');
      if (!end) rowIssues.push('تاريخ النهاية مطلوب — حدده لكل متدرب أو على مستوى الطلب بالكامل');
      if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end <= start) {
        rowIssues.push('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
      }

      // Duplicates inside the uploaded file itself.
      const nid = row.nationalId?.trim();
      if (nid) {
        const first = seenNationalIds.get(nid);
        if (first) rowIssues.push(`رقم الهوية مكرر داخل الملف (الصف ${first})`);
        else if (existingNationalIds.has(nid)) rowIssues.push('رقم الهوية موجود مسبقاً ضمن هذا الطلب');
        else seenNationalIds.set(nid, rowNumber);
      }
      const acad = row.academicNumber?.trim();
      if (acad) {
        const first = seenAcademicNumbers.get(acad);
        if (first) rowIssues.push(`الرقم الأكاديمي مكرر داخل الملف (الصف ${first})`);
        else if (existingAcademicNumbers.has(acad)) rowIssues.push('الرقم الأكاديمي موجود مسبقاً ضمن هذا الطلب');
        else seenAcademicNumbers.set(acad, rowNumber);
      }

      if (rowIssues.length > 0) {
        errors.push({ row: rowNumber, academicNumber: row.academicNumber, errors: rowIssues });
      }
    });

    return errors;
  }

  /** Spreadsheets carry program names or codes, in either language. */
  private programMatches(
    value: string,
    program: { code: string; nameAr: string; nameEn: string | null },
  ): boolean {
    const normalize = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, '');
    const needle = normalize(value);
    return [program.code, program.nameAr, program.nameEn]
      .filter((v): v is string => Boolean(v))
      .some((v) => {
        const candidate = normalize(v);
        return candidate === needle || candidate.includes(needle) || needle.includes(candidate);
      });
  }

  /** إرسال الدفعة للتجمع الصحي، ثم تشغيل محرك التحقق مباشرة */
  async submitBatch(trainingRequestId: string, user: IAuthenticatedUser) {
    const rows = await this.prisma.trainingRequestTrainee.findMany({
      where: { trainingRequestId, status: TRAINEE_ROW_STATUS.DRAFT },
    });
    if (!rows.length) throw new BadRequestException('لا توجد صفوف بحالة مسودة لإرسالها');

    for (const row of rows) {
      assertValidTransition('صف المتدرب', row.status, TRAINEE_ROW_STATUS.SUBMITTED, TRAINING_REQUEST_TRAINEE_TRANSITIONS);
    }

    await this.prisma.trainingRequestTrainee.updateMany({
      where: { trainingRequestId, status: TRAINEE_ROW_STATUS.DRAFT },
      data: { status: TRAINEE_ROW_STATUS.SUBMITTED, updatedById: user?.accountId },
    });

    // Resolve request type before running validation — Direct Cluster Requests
    // must not be penalised for missing universityOrgId.
    const requestForValidation = await this.prisma.trainingRequest.findUnique({
      where: { id: trainingRequestId },
      select: { notes: true, targetOrgId: true, requestNumber: true },
    });
    const isDirectRequest = this.resolveIsDirectRequest(requestForValidation ?? null);

    const validation = await this.validationEngine.validateTrainees(trainingRequestId, isDirectRequest);

    if (requestForValidation) {
      await this.notificationService.notifyOrgUsers(requestForValidation.targetOrgId, 'cluster_administrator', {
        titleAr: `دفعة متدربين جديدة بانتظار المراجعة (${requestForValidation.requestNumber})`,
        bodyAr: `تم إرسال ${rows.length} متدرب للمراجعة من الجامعة.`,
        type: 'training_request_batch_submitted',
        referenceType: 'TrainingRequest',
        referenceId: trainingRequestId,
        channels: ['in_app', 'email'],
      });
    }

    return {
      success: true,
      submittedCount: rows.length,
      validation,
      message: `تم إرسال ${rows.length} متدرب إلى التجمع الصحي`,
    };
  }

  async runValidation(trainingRequestId: string) {
    // Resolve request type so the validation engine can exempt Direct Cluster
    // Requests from the university check without weakening University Request rules.
    const request = await this.prisma.trainingRequest.findUnique({
      where: { id: trainingRequestId },
      select: { notes: true },
    });
    const isDirectRequest = this.resolveIsDirectRequest(request);

    const results = await this.validationEngine.validateTrainees(trainingRequestId, isDirectRequest);
    const invalidCount = results.filter((r) => r.errors.length > 0).length;
    return {
      data: results,
      summary: { total: results.length, valid: results.length - invalidCount, invalid: invalidCount },
    };
  }

  /**
   * Determines whether a request is a Direct Cluster Request.
   *
   * Detection relies exclusively on requestType stored in the notes JSON
   * (set at creation time in training-requests.service.ts):
   *   requestType === 'cluster_request'  → Direct, universityOrgId may be NULL
   *   requestType === 'university_request' (or absent) → University, must have universityOrgId
   *
   * We deliberately do NOT infer this from sourceOrg.organizationType.code because
   * a request whose source org happens to be a cluster is not automatically a
   * Direct Request — the caller’s intent (requestType) is the authoritative signal.
   */
  private resolveIsDirectRequest(
    request: { notes: unknown } | null,
  ): boolean {
    if (!request?.notes) return false;
    try {
      const parsed =
        typeof request.notes === 'string'
          ? JSON.parse(request.notes)
          : (request.notes as Record<string, unknown>);
      return (parsed as any)?.requestType === 'cluster_request';
    } catch {
      // notes is not valid JSON — treat as University request (safe default)
      return false;
    }
  }

  // ─── التعديل مع سجل الإصدارات (المرحلة 2/3) ───────────────────────────────
  async editTrainee(rowId: string, dto: UpdateTraineeRowDto, user: IAuthenticatedUser) {
    const existing = await this.requireRow(rowId);

    const partialData = this.mapPartialRow(dto);
    const updated = await this.prisma.trainingRequestTrainee.update({
      where: { id: rowId },
      data: {
        ...partialData,
        clusterInternalNotes: dto.clusterInternalNotes ?? existing.clusterInternalNotes,
        officialComments: dto.officialComments ?? existing.officialComments,
        updatedById: user?.accountId,
      },
    });

    await this.audit(
      user,
      existing.universityOrgId,
      'edit_training_request_trainee',
      rowId,
      this.snapshot(existing),
      this.snapshot(updated),
    );

    return { data: updated, success: true, message: 'تم حفظ التعديلات وتوثيقها في سجل الإصدارات' };
  }

  async mergeTrainees(primaryRowId: string, dto: MergeTraineesDto, user: IAuthenticatedUser) {
    const primary = await this.requireRow(primaryRowId);
    if (dto.duplicateRowIds.includes(primaryRowId)) {
      throw new BadRequestException('لا يمكن دمج الصف الأساسي مع نفسه');
    }

    const duplicates = await this.prisma.trainingRequestTrainee.findMany({
      where: { id: { in: dto.duplicateRowIds } },
    });
    if (duplicates.length !== dto.duplicateRowIds.length) {
      throw new NotFoundException('بعض الصفوف المطلوب دمجها غير موجودة');
    }
    for (const dup of duplicates) {
      assertValidTransition('صف المتدرب', dup.status, TRAINEE_ROW_STATUS.MERGED, TRAINING_REQUEST_TRAINEE_TRANSITIONS);
    }

    await this.prisma.$transaction([
      // نقل مستندات الصفوف المكررة إلى الصف الأساسي حتى لا تُفقد
      this.prisma.document.updateMany({
        where: { trainingRequestTraineeId: { in: dto.duplicateRowIds } },
        data: { trainingRequestTraineeId: primaryRowId },
      }),
      this.prisma.trainingRequestTrainee.updateMany({
        where: { id: { in: dto.duplicateRowIds } },
        data: { status: TRAINEE_ROW_STATUS.MERGED, mergedIntoId: primaryRowId, updatedById: user?.accountId },
      }),
    ]);

    await this.audit(user, primary.universityOrgId, 'merge_training_request_trainees', primaryRowId, null, {
      mergedRowIds: dto.duplicateRowIds,
    });

    // إعادة التحقق بعد إزالة التكرار
    await this.validationEngine.validateTrainees(primary.trainingRequestId);

    return { success: true, mergedCount: duplicates.length, message: `تم دمج ${duplicates.length} صف مكرر` };
  }

  async splitTrainee(rowId: string, dto: SplitTraineeDto, user: IAuthenticatedUser) {
    const existing = await this.requireRow(rowId);
    if (!dto.rows?.length || dto.rows.length < 2) {
      throw new BadRequestException('التقسيم يتطلب صفين جديدين على الأقل');
    }
    assertValidTransition('صف المتدرب', existing.status, TRAINEE_ROW_STATUS.SPLIT, TRAINING_REQUEST_TRAINEE_TRANSITIONS);

    const created = await this.prisma.$transaction(async (tx) => {
      const newRows: { id: string }[] = [];
      for (const row of dto.rows) {
        newRows.push(
          await tx.trainingRequestTrainee.create({
            data: {
              ...this.mapRow(row),
              trainingRequestId: existing.trainingRequestId,
              universityOrgId: row.universityOrgId || existing.universityOrgId,
              status: TRAINEE_ROW_STATUS.SUBMITTED,
              splitFromId: rowId,
              createdById: user?.accountId,
            },
          }),
        );
      }
      await tx.trainingRequestTrainee.update({
        where: { id: rowId },
        data: { status: TRAINEE_ROW_STATUS.SPLIT, updatedById: user?.accountId },
      });
      return newRows;
    });

    await this.audit(user, existing.universityOrgId, 'split_training_request_trainee', rowId, this.snapshot(existing), {
      newRowIds: created.map((r) => r.id),
    });

    return { data: created, success: true, message: `تم تقسيم الصف إلى ${created.length} صفوف` };
  }

  // ─── قرارات التجمع (المرحلة 2) ────────────────────────────────────────────
  /** الاعتماد + الترقية إلى Person/UserAccount/TraineeProfile حقيقي */
  async approveTrainee(rowId: string, user: IAuthenticatedUser) {
    const row = await this.requireRow(rowId);

    // Idempotency: if already approved or allocated, return profile if exists
    if (row.traineeProfileId && [
      TRAINEE_ROW_STATUS.CLUSTER_APPROVED,
      TRAINEE_ROW_STATUS.ALLOCATED,
      TRAINEE_ROW_STATUS.HOSPITAL_REVIEW,
      TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED,
      TRAINEE_ROW_STATUS.ACTIVE,
    ].includes(row.status as any)) {
      return {
        data: { rowId, traineeProfileId: row.traineeProfileId, activationTokenIssued: false },
        success: true,
        message: 'المتدرب معتمد مسبقاً ولديه ملف تدريبي',
      };
    }

    assertValidTransition(
      'صف المتدرب',
      row.status,
      TRAINEE_ROW_STATUS.CLUSTER_APPROVED,
      TRAINING_REQUEST_TRAINEE_TRANSITIONS,
    );

    const errors = (row.validationErrors as unknown as { code?: string; severity?: string; messageAr: string }[]) || [];
    const blockingErrors = errors.filter((e) => e.severity !== 'warning' && e.code !== 'missing_document');
    if (blockingErrors.length > 0) {
      throw new BadRequestException(
        `تعذر اعتماد المتدرب بسبب أخطاء تحقق لم تُعالج:\n${blockingErrors.map((e) => `- ${e.messageAr}`).join('\n')}`,
      );
    }

    const request = await this.prisma.trainingRequest.findUnique({
      where: { id: row.trainingRequestId },
      select: { targetOrgId: true, academicIntakeId: true, programId: true },
    });
    if (!request) throw new NotFoundException('طلب التدريب غير موجود');

    const { profile } = await this.capacityService.runGuarded(() =>
      this.promoteToTrainee(row, request, user),
    );

    await this.audit(user, request.targetOrgId, 'approve_training_request_trainee', rowId, this.snapshot(row), {
      status: TRAINEE_ROW_STATUS.CLUSTER_APPROVED,
      traineeProfileId: profile.id,
    });

    return {
      data: { rowId, traineeProfileId: profile.id, activationTokenIssued: false },
      success: true,
      message: 'تم اعتماد المتدرب وإنشاء ملفه التدريبي',
    };
  }

  async rejectTrainee(rowId: string, dto: RejectTraineeDto, user: IAuthenticatedUser) {
    const row = await this.requireRow(rowId);
    assertValidTransition('صف المتدرب', row.status, TRAINEE_ROW_STATUS.REJECTED, TRAINING_REQUEST_TRAINEE_TRANSITIONS);

    const updated = await this.prisma.trainingRequestTrainee.update({
      where: { id: rowId },
      data: { status: TRAINEE_ROW_STATUS.REJECTED, returnReason: dto.reason, updatedById: user?.accountId },
    });

    await this.audit(user, row.universityOrgId, 'reject_training_request_trainee', rowId, this.snapshot(row), {
      status: TRAINEE_ROW_STATUS.REJECTED,
      reason: dto.reason,
    });

    await this.notifyUniversity(row, 'تم رفض متدرب من الدفعة', `${row.nameAr}: ${dto.reason}`);

    return { data: updated, success: true, message: 'تم رفض المتدرب' };
  }

  async returnTraineeToUniversity(rowId: string, dto: ReturnTraineeDto, user: IAuthenticatedUser) {
    const row = await this.requireRow(rowId);
    assertValidTransition(
      'صف المتدرب',
      row.status,
      TRAINEE_ROW_STATUS.RETURNED_TO_UNIVERSITY,
      TRAINING_REQUEST_TRAINEE_TRANSITIONS,
    );

    const updated = await this.prisma.trainingRequestTrainee.update({
      where: { id: rowId },
      data: {
        status: TRAINEE_ROW_STATUS.RETURNED_TO_UNIVERSITY,
        returnReason: dto.reason,
        officialComments: dto.officialComments ?? row.officialComments,
        requiredDocuments: (dto.requiredDocuments || []) as unknown as object[],
        correctionDeadline: dto.correctionDeadline ? new Date(dto.correctionDeadline) : null,
        updatedById: user?.accountId,
      },
    });

    await this.audit(user, row.universityOrgId, 'return_trainee_to_university', rowId, this.snapshot(row), {
      status: TRAINEE_ROW_STATUS.RETURNED_TO_UNIVERSITY,
      reason: dto.reason,
      requiredDocuments: dto.requiredDocuments,
      correctionDeadline: dto.correctionDeadline,
    });

    await this.notifyUniversity(
      row,
      'إعادة متدرب للتصحيح',
      `${row.nameAr}: ${dto.reason}${dto.correctionDeadline ? ` — آخر موعد للتعديل: ${dto.correctionDeadline}` : ''}`,
    );

    return { data: updated, success: true, message: 'تمت إعادة المتدرب إلى الجامعة للتصحيح' };
  }

  // ─── تصحيح الجامعة (المرحلة 3) ────────────────────────────────────────────
  async resubmitTrainee(rowId: string, dto: UpdateTraineeRowDto, user: IAuthenticatedUser) {
    const row = await this.requireRow(rowId);
    assertValidTransition('صف المتدرب', row.status, TRAINEE_ROW_STATUS.SUBMITTED, TRAINING_REQUEST_TRAINEE_TRANSITIONS);

    const partialData = this.mapPartialRow(dto);
    const updated = await this.prisma.trainingRequestTrainee.update({
      where: { id: rowId },
      data: {
        ...partialData,
        status: TRAINEE_ROW_STATUS.SUBMITTED,
        returnReason: null,
        updatedById: user?.accountId,
      },
    });

    await this.audit(user, row.universityOrgId, 'resubmit_training_request_trainee', rowId, this.snapshot(row), this.snapshot(updated));

    await this.validationEngine.validateTrainees(row.trainingRequestId);

    const request = await this.prisma.trainingRequest.findUnique({
      where: { id: row.trainingRequestId },
      select: { targetOrgId: true, requestNumber: true },
    });
    if (request) {
      await this.notificationService.notifyOrgUsers(request.targetOrgId, 'cluster_administrator', {
        titleAr: 'تم تصحيح بيانات متدرب وإعادة إرسالها',
        bodyAr: `${updated.nameAr} — الطلب ${request.requestNumber}`,
        type: 'trainee_resubmitted',
        referenceType: 'TrainingRequestTrainee',
        referenceId: rowId,
        channels: ['in_app'],
      });
    }

    return { data: updated, success: true, message: 'تم إعادة إرسال المتدرب بعد التصحيح' };
  }

  // ─── مساعدات داخلية ───────────────────────────────────────────────────────
  private async promoteToTrainee(
    row: Prisma.TrainingRequestTraineeGetPayload<Record<string, never>>,
    request: { targetOrgId: string; academicIntakeId: string | null; programId: string | null },
    user: IAuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const cleanNationalId = (row.nationalId || '').trim();
      const cleanEmail = row.email ? row.email.trim().toLowerCase() : null;
      const accountEmail = cleanEmail || `${cleanNationalId}@trainee.miran.health`;

      const person = await tx.person.upsert({
        where: { nationalId: cleanNationalId },
        create: {
          nationalId: cleanNationalId,
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          gender: row.gender,
          phone: row.mobile || null,
          email: accountEmail,
          createdById: user?.accountId,
        },
        update: {
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          gender: row.gender,
          phone: row.mobile || undefined,
          ...(cleanEmail ? { email: cleanEmail } : {}),
        },
      });

      const profile = await tx.traineeProfile.upsert({
        where: { personId: person.id },
        create: {
          personId: person.id,
          organizationId: row.assignedHospitalId || request.targetOrgId,
          sponsorOrganizationId: row.universityOrgId,
          traineeNumber: row.academicNumber,
          level: 'intern',
          specialtyEn: row.specialty,
          programId: request.programId,
          academicIntakeId: request.academicIntakeId,
          applicationStatus: TRAINEE_PROFILE_STATUS.APPROVED,
          accessStartDate: row.startDate,
          accessEndDate: row.endDate,
          createdById: user?.accountId,
        },
        update: {
          organizationId: row.assignedHospitalId || request.targetOrgId,
          sponsorOrganizationId: row.universityOrgId || undefined,
          programId: request.programId || undefined,
          academicIntakeId: request.academicIntakeId || undefined,
          applicationStatus: TRAINEE_PROFILE_STATUS.APPROVED,
        },
      });

      // ربط المستندات المرفوعة على الصف بالملف التدريبي الجديد
      await tx.document.updateMany({
        where: { trainingRequestTraineeId: row.id },
        data: { traineeProfileId: profile.id },
      });

      await tx.trainingRequestTrainee.update({
        where: { id: row.id },
        data: {
          status: TRAINEE_ROW_STATUS.CLUSTER_APPROVED,
          personId: person.id,
          traineeProfileId: profile.id,
          updatedById: user?.accountId,
        },
      });

      return { profile, personId: person.id };
    });
  }

  private async requireRow(rowId: string) {
    const row = await this.prisma.trainingRequestTrainee.findUnique({ where: { id: rowId } });
    if (!row) throw new NotFoundException('صف المتدرب غير موجود');
    return row;
  }

  private mapRow(row: TraineeRowDto) {
    return {
      academicNumber: row.academicNumber,
      nationalId: row.nationalId,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      gender: row.gender,
      collegeOrgId: row.collegeOrgId,
      internshipProgram: row.internshipProgram,
      specialty: row.specialty,
      gpa: row.gpa !== undefined ? new Prisma.Decimal(row.gpa) : undefined,
      mobile: row.mobile,
      email: row.email,
      trainingPeriod: row.trainingPeriod,
      startDate: row.startDate ? new Date(row.startDate) : undefined,
      endDate: row.endDate ? new Date(row.endDate) : undefined,
      priority: row.priority || 'normal',
    };
  }

  private mapPartialRow(row: UpdateTraineeRowDto) {
    const data: Record<string, any> = {};
    if (row.academicNumber !== undefined) data.academicNumber = row.academicNumber;
    if (row.nationalId !== undefined) data.nationalId = row.nationalId;
    if (row.nameAr !== undefined) data.nameAr = row.nameAr;
    if (row.nameEn !== undefined) data.nameEn = row.nameEn;
    if (row.gender !== undefined) data.gender = row.gender;
    if (row.collegeOrgId !== undefined) data.collegeOrgId = row.collegeOrgId;
    if (row.internshipProgram !== undefined) data.internshipProgram = row.internshipProgram;
    if (row.specialty !== undefined) data.specialty = row.specialty;
    if (row.gpa !== undefined) data.gpa = new Prisma.Decimal(row.gpa);
    if (row.mobile !== undefined) data.mobile = row.mobile;
    if (row.email !== undefined) data.email = row.email;
    if (row.trainingPeriod !== undefined) data.trainingPeriod = row.trainingPeriod;
    if (row.startDate !== undefined) data.startDate = row.startDate ? new Date(row.startDate) : null;
    if (row.endDate !== undefined) data.endDate = row.endDate ? new Date(row.endDate) : null;
    if (row.priority !== undefined) data.priority = row.priority;
    return data;
  }

  /** لقطة الحقول التي يُتتبع تغيّرها في سجل الإصدارات */
  private snapshot(row: Record<string, unknown>) {
    const fields = [
      'academicNumber', 'nationalId', 'nameAr', 'nameEn', 'gender', 'specialty',
      'internshipProgram', 'gpa', 'mobile', 'email', 'trainingPeriod',
      'startDate', 'endDate', 'priority', 'status',
    ];
    return Object.fromEntries(fields.map((f) => [f, row[f] ?? null]));
  }

  private async audit(
    user: IAuthenticatedUser,
    organizationId: string | null,
    action: string,
    entityId: string,
    oldValues: object | null,
    newValues: object | null,
  ) {
    await this.prisma.auditLog.create({
      data: {
        organizationId: organizationId || undefined,
        actorId: user?.accountId,
        action,
        entityType: 'TrainingRequestTrainee',
        entityId,
        oldValues: oldValues as Prisma.InputJsonValue,
        newValues: newValues as Prisma.InputJsonValue,
      },
    });
  }

  private async notifyUniversity(
    row: { universityOrgId: string | null; trainingRequestId: string; id: string },
    titleAr: string,
    bodyAr: string,
  ) {
    let orgId = row.universityOrgId;
    if (!orgId) {
      const req = await this.prisma.trainingRequest.findUnique({
        where: { id: row.trainingRequestId },
        select: { sourceOrgId: true },
      });
      orgId = req?.sourceOrgId ?? null;
    }
    if (!orgId) return;

    await this.notificationService.notifyOrgUsers(orgId, 'university_administrator', {
      titleAr,
      bodyAr,
      type: 'trainee_review_decision',
      referenceType: 'TrainingRequestTrainee',
      referenceId: row.id,
      channels: ['in_app', 'email'],
    });
  }

  private async notifyHospital(
    hospitalOrgId: string,
    rowId: string,
    titleAr: string,
    bodyAr: string,
  ) {
    await this.notificationService.notifyOrgUsers(hospitalOrgId, 'hospital_training_admin', {
      titleAr,
      bodyAr,
      type: 'trainee_hospital_review',
      referenceType: 'TrainingRequestTrainee',
      referenceId: rowId,
      channels: ['in_app', 'email'],
    });
  }

  private async loadRow(rowId: string) {
    const row = await this.prisma.trainingRequestTrainee.findUnique({
      where: { id: rowId },
      include: {
        trainingRequest: { select: { targetOrgId: true, sourceOrgId: true, requestNumber: true } },
        assignedHospital: { select: { id: true, nameAr: true } },
      },
    });
    if (!row) throw new NotFoundException('صف المتدرب غير موجود');
    return row;
  }

  // ─── Phase 4: Stage 6 — Hospital Review Full Action Set ──────────────────

  /** المستشفى يبدأ مراجعة المتدرب: allocated → hospital_review */
  async startHospitalReview(rowId: string, user: IAuthenticatedUser) {
    const row = await this.loadRow(rowId);
    assertValidTransition(
      'صف المتدرب',
      row.status,
      'hospital_review',
      TRAINING_REQUEST_TRAINEE_TRANSITIONS,
    );
    const old = this.snapshot(row as any);
    await this.prisma.trainingRequestTrainee.update({
      where: { id: rowId },
      data: { status: 'hospital_review', updatedById: user.accountId },
    });
    await this.audit(
      user,
      row.trainingRequest.targetOrgId,
      'hospital_start_review',
      rowId,
      old,
      { status: 'hospital_review' },
    );
    return { success: true, message: 'بدأت مراجعة المستشفى للمتدرب' };
  }

  /**
   * المستشفى يقبل المتدرب: hospital_review → hospital_accepted
   *
   * قرار مستقل بذاته: القبول لا يبدأ التدريب ولا يُسند مدرباً، وإنما يفتح
   * مرحلة الإسناد. يبقى القرار على مستوى صف المتدرب فلا يؤثر قبول مستشفى
   * على متدرب موزَّع على مستشفى آخر ضمن الطلب نفسه.
   */
  async hospitalAcceptIntern(rowId: string, user: IAuthenticatedUser, notes?: string) {
    const row = await this.loadRow(rowId);

    // Idempotency: if already accepted by hospital, return successfully
    if (row.status === TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED) {
      return {
        success: true,
        message: `المتدرب ${row.nameAr} مقبول مسبقاً من قِبل المستشفى`,
      };
    }

    assertValidTransition(
      'صف المتدرب',
      row.status,
      TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED,
      TRAINING_REQUEST_TRAINEE_TRANSITIONS,
    );
    const old = this.snapshot(row as any);

    const request = await this.prisma.trainingRequest.findUnique({
      where: { id: row.trainingRequestId },
      select: { targetOrgId: true, academicIntakeId: true, programId: true },
    });
    if (!request) throw new NotFoundException('طلب التدريب غير موجود');

    const hospitalId = row.assignedHospitalId || user.organizationId || request.targetOrgId;

    // Single source of truth for trainee account provisioning upon hospital acceptance
    const provisionResult = await this.prisma.$transaction(async (tx) => {
      const result = await this.traineeAccountProvisioning.provisionForHospitalApproval(
        { ...row, assignedHospitalId: hospitalId } as any,
        request,
        hospitalId,
        user,
        tx,
      );

      await tx.trainingRequestTrainee.update({
        where: { id: rowId },
        data: {
          status: TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED,
          officialComments: notes ?? undefined,
          traineeProfileId: result.profileId,
          personId: result.personId,
          updatedById: user.accountId,
        },
      });

      return result;
    });

    await this.audit(
      user,
      row.trainingRequest.targetOrgId,
      'hospital_accept_intern',
      rowId,
      old,
      {
        status: TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED,
        hospitalId: row.assignedHospitalId,
        notes,
      },
    );

    await this.notifyUniversity(
      { universityOrgId: row.universityOrgId, trainingRequestId: row.trainingRequestId, id: rowId },
      'قبول متدرب من قِبَل المستشفى',
      `قبلت ${row.assignedHospital?.nameAr || 'المستشفى'} المتدرب ${row.nameAr} — بانتظار إسناد القسم والمدرب`,
    );

    // Safe non-blocking notification delivery AFTER database transaction commit
    await this.traineeAccountProvisioning.sendActivationNotification(
      provisionResult.accountId,
      request.targetOrgId,
      provisionResult.profileId,
      provisionResult.accountEmail,
      provisionResult.isNewToken,
    );

    return {
      success: true,
      message: `تم قبول المتدرب ${row.nameAr} — يمكن الآن إسناد القسم والمدرب`,
    };
  }

  /** المستشفى يرفض المتدرب نهائياً: hospital_review → rejected */
  async hospitalRejectIntern(rowId: string, dto: HospitalRejectDto, user: IAuthenticatedUser) {
    const row = await this.loadRow(rowId);
    assertValidTransition(
      'صف المتدرب',
      row.status,
      'rejected',
      TRAINING_REQUEST_TRAINEE_TRANSITIONS,
    );
    const old = this.snapshot(row as any);
    await this.prisma.trainingRequestTrainee.update({
      where: { id: rowId },
      data: {
        status: 'rejected',
        returnReason: dto.reason,
        officialComments: dto.notes,
        updatedById: user.accountId,
      },
    });
    await this.audit(
      user,
      row.trainingRequest.targetOrgId,
      'hospital_reject_intern',
      rowId,
      old,
      { status: 'rejected', reason: dto.reason },
    );
    // Notify university
    await this.notifyUniversity(
      { universityOrgId: row.universityOrgId, trainingRequestId: row.trainingRequestId, id: rowId },
      'رفض قبول متدرب من قِبَل المستشفى',
      `رفضت ${row.assignedHospital?.nameAr || 'المستشفى'} قبول المتدرب ${row.nameAr} — السبب: ${dto.reason}`,
    );
    return { success: true, message: `تم رفض المتدرب ${row.nameAr} نهائياً من المستشفى` };
  }

  /** المستشفى يعيد المتدرب للتجمع لإعادة التوزيع: on_hold/hospital_review → hospital_returned_to_cluster */
  async hospitalReturnToCluster(rowId: string, dto: HospitalReturnDto, user: IAuthenticatedUser) {
    const row = await this.loadRow(rowId);
    assertValidTransition(
      'صف المتدرب',
      row.status,
      'hospital_returned_to_cluster',
      TRAINING_REQUEST_TRAINEE_TRANSITIONS,
    );
    const old = this.snapshot(row as any);
    await this.prisma.trainingRequestTrainee.update({
      where: { id: rowId },
      data: {
        status: 'hospital_returned_to_cluster',
        returnReason: dto.reason,
        officialComments: dto.notes,
        assignedHospitalId: null,
        assignedDepartmentId: null,
        assignedTrainerProfileId: null,
        assignedSupervisorAccountId: null,
        updatedById: user.accountId,
      },
    });
    await this.audit(
      user,
      row.trainingRequest.targetOrgId,
      'hospital_return_to_cluster',
      rowId,
      old,
      { status: 'hospital_returned_to_cluster', reason: dto.reason },
    );
    // Notify cluster
    await this.notificationService.notifyOrgUsers(
      row.trainingRequest.targetOrgId,
      'cluster_administrator',
      {
        titleAr: 'مستشفى أعاد متدرباً للتجمع لإعادة التوزيع',
        bodyAr: `أعادت ${row.assignedHospital?.nameAr || 'المستشفى'} المتدرب ${row.nameAr} للتجمع — السبب: ${dto.reason}`,
        type: 'trainee_returned_to_cluster',
        referenceType: 'TrainingRequestTrainee',
        referenceId: rowId,
        channels: ['in_app', 'email'],
      },
    );
    return { success: true, message: 'تمت إعادة المتدرب للتجمع لإعادة التوزيع' };
  }

  /** طلب مستندات ناقصة: لا يغير الحالة، يُخطر الجامعة */
  async requestMissingDocuments(rowId: string, dto: RequestMissingDocsDto, user: IAuthenticatedUser) {
    const row = await this.loadRow(rowId);
    if (!['allocated', 'hospital_review', 'on_hold'].includes(row.status)) {
      throw new BadRequestException(
        `لا يمكن طلب مستندات من صف بحالة "${row.status}"`,
      );
    }
    const deadline = dto.deadline ? new Date(dto.deadline) : null;
    await this.prisma.trainingRequestTrainee.update({
      where: { id: rowId },
      data: {
        requiredDocuments: dto.documentTypes as any,
        correctionDeadline: deadline,
        officialComments: dto.notes,
        updatedById: user.accountId,
      },
    });
    await this.audit(
      user,
      row.trainingRequest.targetOrgId,
      'hospital_request_missing_docs',
      rowId,
      null,
      { documentTypes: dto.documentTypes, notes: dto.notes, deadline: dto.deadline },
    );
    await this.notifyUniversity(
      { universityOrgId: row.universityOrgId, trainingRequestId: row.trainingRequestId, id: rowId },
      'طلب مستندات ناقصة من المستشفى',
      `طلبت ${row.assignedHospital?.nameAr || 'المستشفى'} مستندات ناقصة للمتدرب ${row.nameAr}: ${dto.documentTypes.join('، ')}${dto.deadline ? ` — آخر موعد: ${dto.deadline}` : ''}`,
    );
    return { success: true, message: 'تم إرسال طلب المستندات الناقصة للجامعة' };
  }

  /** طلب تصحيح بيانات: يُخطر الجامعة بالحقول المطلوب تصحيحها */
  async requestDataCorrection(rowId: string, dto: RequestDataCorrectionDto, user: IAuthenticatedUser) {
    const row = await this.loadRow(rowId);
    if (!['allocated', 'hospital_review', 'on_hold'].includes(row.status)) {
      throw new BadRequestException(`لا يمكن طلب تصحيح بيانات من صف بحالة "${row.status}"`);
    }
    await this.audit(
      user,
      row.trainingRequest.targetOrgId,
      'hospital_request_data_correction',
      rowId,
      null,
      { fields: dto.fields, notes: dto.notes },
    );
    await this.notifyUniversity(
      { universityOrgId: row.universityOrgId, trainingRequestId: row.trainingRequestId, id: rowId },
      'طلب تصحيح بيانات متدرب',
      `طلبت ${row.assignedHospital?.nameAr || 'المستشفى'} تصحيح بيانات المتدرب ${row.nameAr} — الحقول: ${dto.fields.join('، ')}${dto.notes ? ` — ${dto.notes}` : ''}`,
    );
    return { success: true, message: 'تم إرسال طلب تصحيح البيانات للجامعة' };
  }

  /**
   * تعديل إسناد المتدرب داخل المستشفى (قسم/مدرب/مشرف/تواريخ) عبر المصدر الرسمي الوحيد
   * TraineeAllocationService لضمان اتساق TraineeAllocation و TraineeProfile و Rotation.
   */
  async changeAssignment(
    rowId: string,
    dto: ChangeAssignmentDto,
    user: IAuthenticatedUser,
    scope?: ScopeContext,
  ) {
    const row = await this.loadRow(rowId);
    if (!row.traineeProfileId) {
      const request = await this.prisma.trainingRequest.findUnique({
        where: { id: row.trainingRequestId },
        select: { targetOrgId: true, academicIntakeId: true, programId: true },
      });
      if (request) {
        try {
          const { profile } = await this.capacityService.runGuarded(() =>
            this.promoteToTrainee(
              { ...row, assignedHospitalId: row.assignedHospitalId || user.organizationId } as any,
              request,
              user,
            ),
          );
          await this.prisma.trainingRequestTrainee.update({
            where: { id: rowId },
            data: { traineeProfileId: profile.id },
          });
        } catch {
          // ignore
        }
      }
    }
    const effectiveScope = scope || (await this.scopeContext.resolve(user));
    return this.allocationService.assignWithinHospital(
      rowId,
      {
        departmentId: dto.departmentId,
        trainerProfileId: dto.trainerProfileId,
        supervisorAccountId: dto.supervisorAccountId,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
      user,
      effectiveScope,
      dto.reason,
    );
  }

  /** إيقاف مؤقت: allocated/hospital_review → on_hold */
  async putOnHold(rowId: string, dto: PutOnHoldDto, user: IAuthenticatedUser) {
    const row = await this.loadRow(rowId);
    assertValidTransition('صف المتدرب', row.status, 'on_hold', TRAINING_REQUEST_TRAINEE_TRANSITIONS);
    const old = this.snapshot(row as any);
    await this.prisma.trainingRequestTrainee.update({
      where: { id: rowId },
      data: {
        status: 'on_hold',
        officialComments: dto.notes,
        updatedById: user.accountId,
      },
    });
    await this.audit(
      user,
      row.trainingRequest.targetOrgId,
      'hospital_put_on_hold',
      rowId,
      old,
      { status: 'on_hold', notes: dto.notes },
    );
    return { success: true, message: 'تم إيقاف مراجعة المتدرب مؤقتاً' };
  }

  /** استئناف من الإيقاف: on_hold → hospital_review */
  async resumeFromHold(rowId: string, user: IAuthenticatedUser) {
    const row = await this.loadRow(rowId);
    assertValidTransition('صف المتدرب', row.status, 'hospital_review', TRAINING_REQUEST_TRAINEE_TRANSITIONS);
    const old = this.snapshot(row as any);
    await this.prisma.trainingRequestTrainee.update({
      where: { id: rowId },
      data: { status: 'hospital_review', updatedById: user.accountId },
    });
    await this.audit(
      user,
      row.trainingRequest.targetOrgId,
      'hospital_resume_from_hold',
      rowId,
      old,
      { status: 'hospital_review' },
    );
    return { success: true, message: 'تمت استعادة مراجعة المتدرب' };
  }

  // ─── Status groups used to split the Hospital Inbox response ────────────────

  /**
   * States in which a Hospital user has a valid backend action:
   *   allocated    → hospital_review (startHospitalReview)
   *   hospital_review → accepted / rejected / returned / on_hold
   *   on_hold      → hospital_review (resume) or returned_to_cluster
   *   hospital_returned_to_cluster / accepted / active — historical visibility
   */
  private static readonly HOSPITAL_ACTIONABLE_STATUSES = [
    'allocated',
    'hospital_review',
    'on_hold',
    'hospital_returned_to_cluster',
    'hospital_accepted',
    'accepted',
    'active',
  ] as const;

  /**
   * States awaiting an upstream Cluster action before the hospital can act.
   * These rows are returned as read-only context so the hospital can see incoming
   * requests, but the UI must not offer any state-mutating actions for them.
   *   submitted       → Cluster must call approveTrainee() first
   *   cluster_approved → Cluster must run the allocation engine first
   */
  private static readonly UPSTREAM_PENDING_STATUSES = [
    'submitted',
    'cluster_approved',
  ] as const;

  /**
   * Hospital Inbox query — returns two distinct groups:
   *
   * data                — rows in HOSPITAL_ACTIONABLE_STATUSES that the hospital
   *                       can act on right now.
   * pendingUpstreamRows — rows in UPSTREAM_PENDING_STATUSES that are visible as
   *                       incoming context but require Cluster action before the
   *                       hospital can review them. These must be treated as
   *                       read-only by the caller.
   *
   * Both groups respect the same cross-hospital isolation (assignedHospitalId,
   * sourceOrgId, or targetOrgId must match the resolved hospital org set).
   */
  async findForHospitalReview(hospitalOrgId: string) {
    const childHospitals = await this.prisma.organization.findMany({
      where: { parentId: hospitalOrgId },
      select: { id: true },
    });
    const hospitalOrgIds = Array.from(new Set([hospitalOrgId, ...childHospitals.map((h) => h.id)]));

    const allStatuses = [
      ...TrainingRequestTraineesService.HOSPITAL_ACTIONABLE_STATUSES,
      ...TrainingRequestTraineesService.UPSTREAM_PENDING_STATUSES,
    ];

    const include = {
      documents: true,
      assignedHospital: { select: { id: true, nameAr: true, nameEn: true } },
      assignedDepartment: { select: { id: true, nameAr: true, nameEn: true, capacity: true } },
      assignedTrainer: { select: { id: true, person: { select: { id: true, nameAr: true, nameEn: true } } } },
      trainingRequest: {
        select: {
          id: true,
          requestNumber: true,
          specialty: true,
          trainingStartDate: true,
          trainingEndDate: true,
          createdAt: true,
          studentCount: true,
          status: true,
          notes: true,
          // organizationType is needed to tell Path B (cluster-originated) apart
          // from Path A when classifying a `submitted` row below.
          sourceOrg: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              organizationType: { select: { code: true } },
            },
          },
          targetOrg: { select: { id: true, nameAr: true, nameEn: true } },
        },
      },
    } as const;

    const allRows = await this.prisma.trainingRequestTrainee.findMany({
      where: {
        OR: [
          { assignedHospitalId: { in: hospitalOrgIds } },
          { trainingRequest: { sourceOrgId: { in: hospitalOrgIds } } },
          { trainingRequest: { targetOrgId: { in: hospitalOrgIds } } },
        ],
        status: { in: allStatuses },
      },
      include,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });

    const actionableSet = new Set<string>(TrainingRequestTraineesService.HOSPITAL_ACTIONABLE_STATUSES);

    // Path-conditional classification.
    //
    // On Path A (university → cluster → hospital) a `submitted` row is still
    // awaiting the cluster's approveTrainee(), so it is read-only context.
    //
    // On Path B the cluster IS the originator: it raised the request and attached
    // the university's no-objection letter, so submitting the roster is itself the
    // cluster's action. Requiring a second cluster approval would insert a step the
    // approved workflow does not have, so a `submitted` row on this path reaches
    // the hospital as immediately actionable.
    const isDirectClusterRow = (row: { trainingRequest?: { sourceOrg?: { organizationType?: { code?: string } | null } | null } | null }) =>
      row.trainingRequest?.sourceOrg?.organizationType?.code === 'cluster';

    const isActionable = (row: (typeof allRows)[number]) =>
      actionableSet.has(row.status) || (row.status === 'submitted' && isDirectClusterRow(row));

    // The two groups are mutually exclusive by construction: every row is tested
    // once and lands in exactly one of them, so no row can appear twice.
    const data = allRows.filter((r) => isActionable(r));
    const pendingUpstreamRows = allRows.filter((r) => !isActionable(r));

    return { data, pendingUpstreamRows };
  }
}
