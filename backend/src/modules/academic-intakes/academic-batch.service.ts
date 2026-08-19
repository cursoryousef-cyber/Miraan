// ============================================================================
// Academic batch creation — from an approved training request, and only from one.
//
// The batch was reachable as a free-standing entity: POST /academic-intakes with
// `manage_trainees` created one out of nothing, with no link back to any request.
// Production shows the consequence — every training request has
// academicIntakeId = NULL, and fifteen trainee profiles exist with no batch and
// no request behind them. Nothing in the data can answer "which university asked
// for this trainee, and who approved it".
//
// This service is the only sanctioned way to produce a batch. It derives the
// batch from the request rather than accepting the same facts retyped, so the
// university, programme, specialty and period cannot drift from the approval
// they are supposed to represent.
// ============================================================================

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../../common/interfaces';
import { ScopeContext, ScopeContextService } from '../../common/authz';
import {
  TRAINING_REQUEST_STATUS,
  TRAINEE_ROW_STATUS,
} from '../../common/status-constants';

@Injectable()
export class AcademicBatchService {
  constructor(
    private prisma: PrismaService,
    private scopeContext: ScopeContextService,
  ) {}

  /**
   * Creates the academic batch that an approved request entitles, links every
   * trainee row of that request to it, and records who approved and when.
   *
   * Idempotent by way of the unique index on `training_request_id`: a second call
   * for the same request returns the existing batch instead of forking history.
   */
  async createFromApprovedRequest(
    trainingRequestId: string,
    user: IAuthenticatedUser,
    scope: ScopeContext,
    opts: {
      code?: string;
      nameAr?: string;
      academicYear?: string;
      notes?: string;
    } = {},
  ) {
    const request = await this.prisma.trainingRequest.findUnique({
      where: { id: trainingRequestId },
      include: {
        sourceOrg: { select: { id: true, nameAr: true } },
        targetOrg: { select: { id: true, nameAr: true } },
        program: { select: { id: true, nameAr: true, code: true } },
        producedBatch: true,
        trainees: { select: { id: true, status: true } },
      },
    });

    if (!request) throw new NotFoundException('طلب التدريب غير موجود');

    // The batch belongs to the receiving cluster, so that is the scope that must
    // contain the session.
    this.scopeContext.assertOrgInScope(scope, request.targetOrgId);

    if (request.producedBatch) {
      return {
        data: request.producedBatch,
        created: false,
        message: 'الدفعة الأكاديمية لهذا الطلب موجودة مسبقاً',
      };
    }

    // The invariant, stated once and enforced here.
    if (request.status !== TRAINING_REQUEST_STATUS.APPROVED) {
      throw new ConflictException(
        `لا يمكن إنشاء دفعة أكاديمية من طلب بحالة «${request.status}» — ` +
          'الدفعة تُنشأ من طلب معتمد (approved) فقط.',
      );
    }

    const academicYear =
      opts.academicYear ??
      (request.trainingStartDate
        ? String(request.trainingStartDate.getFullYear())
        : String(new Date().getFullYear()));

    // Derived from the request number so the code is stable, unique and traceable
    // back to its source without a lookup.
    const code = (opts.code ?? `BATCH-${request.requestNumber}`).toUpperCase();

    const codeTaken = await this.prisma.academicIntake.findUnique({
      where: { code },
    });
    if (codeTaken) {
      throw new ConflictException(
        `رمز الدفعة الأكاديمية (${code}) مستخدم مسبقاً`,
      );
    }

    const eligibleRowIds = request.trainees
      .filter((t) => t.status === TRAINEE_ROW_STATUS.CLUSTER_APPROVED)
      .map((t) => t.id);

    // One transaction: a batch that exists but whose trainees were not linked
    // would reintroduce exactly the orphaned-trainee state this replaces.
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.academicIntake.create({
        data: {
          organizationId: request.targetOrgId,
          programId: request.programId ?? null,
          trainingRequestId: request.id,
          universityOrgId: request.sourceOrgId,
          code,
          nameAr:
            opts.nameAr ??
            `دفعة ${request.program?.nameAr ?? request.specialty ?? 'تدريب'} — ${request.sourceOrg?.nameAr ?? ''} ${academicYear}`.trim(),
          academicYear,
          startDate: request.trainingStartDate ?? new Date(),
          endDate: request.trainingEndDate ?? new Date(),
          capacity: request.studentCount,
          status: 'active',
          notes: opts.notes,
          approvedById: user.accountId,
          approvedAt: new Date(),
          createdById: user.accountId,
        },
        include: { program: true, university: true, sourceRequest: true },
      });

      if (eligibleRowIds.length > 0) {
        await tx.trainingRequestTrainee.updateMany({
          where: { id: { in: eligibleRowIds } },
          data: { academicIntakeId: batch.id },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: request.targetOrgId,
          actorId: user.accountId,
          action: 'academic_batch.created_from_request',
          entityType: 'AcademicIntake',
          entityId: batch.id,
          oldValues: undefined,
          newValues: {
            trainingRequestId: request.id,
            requestNumber: request.requestNumber,
            universityOrgId: request.sourceOrgId,
            code: batch.code,
            traineeRowsLinked: eligibleRowIds.length,
            contextType: scope.contextType,
          },
        },
      });

      return {
        data: batch,
        created: true,
        traineeRowsLinked: eligibleRowIds.length,
        message: `تم إنشاء الدفعة الأكاديمية من الطلب ${request.requestNumber} وربط ${eligibleRowIds.length} متدرب`,
      };
    });
  }

  /**
   * Batch with its provenance: the source request, the sponsoring university, the
   * approval and the trainees. This is what lets the batch screen answer "where
   * did this come from" without the user leaving it.
   */
  async findWithProvenance(batchId: string, scope: ScopeContext) {
    const batch = await this.prisma.academicIntake.findUnique({
      where: { id: batchId },
      include: {
        program: true,
        university: { select: { id: true, code: true, nameAr: true } },
        organization: { select: { id: true, code: true, nameAr: true } },
        approvedBy: {
          select: {
            id: true,
            email: true,
            person: { select: { nameAr: true } },
          },
        },
        sourceRequest: {
          select: {
            id: true,
            requestNumber: true,
            status: true,
            studentCount: true,
            specialty: true,
            trainingStartDate: true,
            trainingEndDate: true,
            createdAt: true,
            sourceOrg: { select: { id: true, nameAr: true } },
          },
        },
        traineeRows: {
          select: {
            id: true,
            nameAr: true,
            academicNumber: true,
            specialty: true,
            status: true,
            assignedHospitalId: true,
            assignedDepartmentId: true,
          },
        },
      },
    });

    if (!batch) throw new NotFoundException('الدفعة الأكاديمية غير موجودة');
    this.scopeContext.assertOrgInScope(scope, batch.organizationId);

    return {
      data: {
        ...batch,
        // Made explicit rather than left for the caller to infer from a null.
        hasApprovedSource: !!batch.trainingRequestId,
        traineeCount: batch.traineeRows.length,
      },
    };
  }
}
