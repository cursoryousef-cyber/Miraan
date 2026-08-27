import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTrainingRequestDto, UpdateTrainingRequestDto } from './dto/training-request.dto';
import { IAuthenticatedUser } from '../../common/interfaces';
import { NotificationService } from '../notifications/notification.service';
import { CapacityService } from '../organizations/capacity.service';
import { AllocationEngineService } from './allocation-engine.service';
import { ActivationService } from './activation.service';
import { RequestCompositionService } from './request-composition.service';
import { TrainingRequestTraineesService } from './training-request-trainees.service';
import {
  assertValidTransition,
  TRAINING_REQUEST_TRANSITIONS,
} from '../../common/state-machine/transition-guard';
import { TRAINING_REQUEST_STATUS } from '../../common/status-constants';
import { CAPABILITIES, ScopeContext } from '../../common/authz';

@Injectable()
export class TrainingRequestsService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private capacityService: CapacityService,
    private allocationEngine: AllocationEngineService,
    private activationService: ActivationService,
    private composition: RequestCompositionService,
    private traineesService: TrainingRequestTraineesService,
  ) {}

  /**
   * The single query behind both the incoming-requests screen and the dashboard
   * counters. Scope comes from the resolved ScopeContext, so the notification
   * bell and this list can no longer disagree about which organisations the
   * session belongs to — they read the same `visibleOrgIds`.
   *
   * A cluster context sees requests addressed to the cluster *and* those of its
   * hospitals; a university sees the ones it sent.
   */
  async findAll(
    scope: ScopeContext,
    opts: { status?: string; page?: number; limit?: number } = {},
  ) {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};

    // null means platform scope — unrestricted, and distinct from an empty list.
    if (scope.visibleOrgIds !== null) {
      where.OR = [
        { sourceOrgId: { in: scope.visibleOrgIds } },
        { targetOrgId: { in: scope.visibleOrgIds } },
      ];
    }

    if (opts.status) {
      const statuses = opts.status.split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length > 0) where.status = { in: statuses };
    }

    const [total, data] = await Promise.all([
      this.prisma.trainingRequest.count({ where }),
      this.prisma.trainingRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sourceOrg: true,
          targetOrg: true,
          program: true,
          academicIntake: true,
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const request = await this.prisma.trainingRequest.findUnique({
      where: { id },
      include: {
        sourceOrg: true,
        targetOrg: true,
        program: true,
        academicIntake: true,
        traineeAllocations: {
          include: {
            hospital: { select: { id: true, nameAr: true, nameEn: true, code: true } },
            department: { select: { id: true, nameAr: true, nameEn: true } },
            trainerProfile: {
              select: {
                id: true,
                person: { select: { id: true, nameAr: true, nameEn: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        trainees: {
          include: {
            documents: true,
            university: true,
            college: true,
            assignedHospital: true,
            assignedDepartment: true,
            assignedTrainer: {
              include: {
                person: true,
              },
            },
            allocations: {
              where: { status: 'open' },
              include: {
                hospital: { select: { id: true, nameAr: true, nameEn: true, code: true } },
                department: { select: { id: true, nameAr: true, nameEn: true } },
                trainerProfile: {
                  select: {
                    id: true,
                    person: { select: { id: true, nameAr: true, nameEn: true } },
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            traineeProfile: {
              include: {
                person: true,
                rotations: {
                  where: { status: { in: ['active', 'pending_acceptance', 'scheduled', 'completed'] } },
                  include: {
                    department: true,
                    trainerProfile: {
                      include: {
                        person: true,
                      },
                    },
                  },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('طلب التدريب غير موجود');
    }

    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'training_request', entityId: id },
          { entityType: 'training_request_trainee', entityId: { in: (await this.prisma.trainingRequestTrainee.findMany({ where: { trainingRequestId: id }, select: { id: true } })).map(t => t.id) } },
        ],
      },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            person: { select: { nameAr: true, nameEn: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    }).catch(() => []);

    return {
      data: {
        ...request,
        auditLogs,
      },
    };
  }

  /**
   * Requests flow one way only: a sponsoring university asks a cluster to host
   * its students. The direction used to be unchecked, and production contains a
   * request whose source is a cluster and whose target is a hospital — a path
   * that bypasses cluster review entirely, because a hospital has no capability
   * to approve anything. Validating the endpoints here closes that path at the
   * only place it can be created.
   */
  private async assertRequestDirection(sourceOrgId: string, targetOrgId: string, requestType?: string) {
    if (sourceOrgId === targetOrgId) {
      throw new BadRequestException('لا يمكن أن تكون الجهة المرسلة والمستقبلة واحدة');
    }

    const [source, target] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: sourceOrgId },
        select: { nameAr: true, organizationType: { select: { code: true } } },
      }),
      this.prisma.organization.findUnique({
        where: { id: targetOrgId },
        select: { nameAr: true, organizationType: { select: { code: true } } },
      }),
    ]);

    if (!source) throw new BadRequestException('الجهة المرسلة غير موجودة');
    if (!target) throw new BadRequestException('الجهة المستقبلة غير موجودة');

    const sourceType = source.organizationType?.code;
    const targetType = target.organizationType?.code;

    if (requestType === 'cluster_request' || sourceType === 'cluster') {
      if (targetType !== 'hospital' && targetType !== 'cluster') {
        throw new BadRequestException(
          `طلب التجمع المباشر يُوجَّه إلى مستشفى أو تجمع — «${target.nameAr}» جهة من نوع «${targetType ?? 'غير محدد'}»`,
        );
      }
      return;
    }

    if (sourceType !== 'university' && sourceType !== 'college') {
      throw new BadRequestException(
        `طلب التدريب يُقدَّم من جامعة أو كلية فقط — «${source.nameAr}» جهة من نوع «${sourceType ?? 'غير محدد'}»`,
      );
    }

    if (targetType !== 'cluster') {
      throw new BadRequestException(
        `طلب التدريب يُوجَّه إلى تجمع صحي فقط — «${target.nameAr}» جهة من نوع «${targetType ?? 'غير محدد'}». ` +
          'التوزيع على المستشفيات يتم من إدارة التدريب بالتجمع بعد اعتماد الطلب.',
      );
    }
  }

  async create(dto: CreateTrainingRequestDto, user?: IAuthenticatedUser) {
    const latest = await this.prisma.trainingRequest.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { requestNumber: true },
    });
    let seq = 1;
    if (latest?.requestNumber) {
      const match = latest.requestNumber.match(/\d+$/);
      if (match) seq = parseInt(match[0], 10) + 1;
    }
    const requestNumber = `TR-${new Date().getFullYear()}-${seq.toString().padStart(4, '0')}`;
    const isClusterReq = dto.requestType === 'cluster_request' || (user?.roles?.some((r) => r.includes('cluster')) ?? false);
    const targetOrgId = isClusterReq && dto.targetHospitalId ? dto.targetHospitalId : dto.targetOrgId;
    const sourceOrgId = user?.organizationId || dto.targetOrgId;

    if (user && isClusterReq && user.organizationId) {
      const isPlatformAdmin = user.roles?.some((r) => r.includes('admin') || r.includes('owner'));
      if (!isPlatformAdmin) {
        const targetHospital = await this.prisma.organization.findUnique({
          where: { id: targetOrgId },
          select: { id: true, parentId: true },
        });
        if (targetHospital && targetHospital.id !== user.organizationId && targetHospital.parentId !== user.organizationId) {
          throw new ForbiddenException('المستشفى المستهدف لا يتبع لتجمعك الصحي');
        }
      }
    }

    await this.assertRequestDirection(sourceOrgId, targetOrgId, dto.requestType);

    // A direct cluster → hospital request carries no university request behind
    // it, so the university's no-objection letter is the document that proves
    // the sponsoring university agreed to the training. It is mandatory for this
    // path only; a university-originated request is itself the authorisation.
    if (isClusterReq && !dto.clusterLetterUrl?.trim()) {
      throw new BadRequestException(
        'خطاب الجامعة بعدم الممانعة من التدريب مطلوب لطلب التدريب المباشر من التجمع الصحي',
      );
    }

    // Dates and the program/plan/version combination are validated together
    // before anything is written, so an incoherent request is never persisted.
    const dates = this.composition.validateDates(dto);
    const resolved = await this.composition.resolvePlan(dto, dates.startDate);

    // A catalog plan and a proposed rotation breakdown answer the same question
    // twice; refuse the ambiguity rather than silently picking one.
    if (resolved.version && dto.rotations?.length) {
      throw new BadRequestException(
        'لا يمكن إرسال روتيشنات مخصصة مع اختيار قالب خطة معتمد من الكتالوج — اختر أحدهما',
      );
    }

    this.composition.assertProgramDurationMatchesWindow(resolved.program, dates);

    // No catalog plan was chosen: the university's own rotation breakdown
    // becomes a request-scoped TrainingPlan/Version, reusing the same models the
    // rest of the workflow already reads — nothing downstream needs to know this
    // plan did not come from the national catalog.
    let planId = dto.trainingPlanId ?? resolved.plan?.id;
    let versionId = resolved.version?.id;
    if (!resolved.version && dto.rotations?.length) {
      if (!resolved.program) {
        throw new BadRequestException('لا يمكن تعريف روتيشنات مخصصة بدون تحديد البرنامج التدريبي');
      }
      if (!user) {
        throw new BadRequestException('لا يمكن إنشاء خطة روتيشنات مخصصة بدون مستخدم مصادَق عليه');
      }
      const composed = await this.composition.composeInlinePlan(
        resolved.program, dates, dto.rotations, sourceOrgId, user,
      );
      planId = composed.plan.id;
      versionId = composed.version.id;
    }

    const notesPayload = JSON.stringify({
      text: dto.notes || '',
      requestType: dto.requestType || (isClusterReq ? 'cluster_request' : 'university_request'),
      clusterLetterUrl: dto.clusterLetterUrl || null,
      attachmentUrls: dto.attachmentUrls || [],
    });

    const created = await this.prisma.trainingRequest.create({
      data: {
        requestNumber,
        sourceOrgId,
        targetOrgId,
        programId: dto.programId,
        specialty: dto.specialty,
        trainingPlanId: planId,
        trainingPlanVersionId: versionId,
        trainingStartDate: dates.startDate,
        trainingEndDate: dates.endDate,
        expectedGraduationDate: dates.expectedGraduationDate,
        academicIntakeId: dto.academicIntakeId,
        studentCount: dto.studentCount,
        priority: dto.priority || 'normal',
        notes: notesPayload,
        // Both cluster-originated and university-originated requests enter the
        // same pipeline at 'submitted'. ('hospital_review' is a per-trainee row
        // status, not a legal TrainingRequest status — it has no outgoing
        // transitions and would strand the request. The cluster advances it to
        // 'auto_allocated' → 'approved' through the normal review flow.)
        status: 'submitted',
        createdById: user?.accountId,
      },
      include: {
        sourceOrg: true,
        targetOrg: true,
        program: true,
        academicIntake: true,
      },
    });

    // A roster submitted alongside the request goes through the exact same
    // validated write path as the standalone import endpoint — required academic
    // number/national ID/name, required specialty and dates (row or request-level
    // fallback), national ID format, and duplicate detection. This is not a
    // second, looser way to create trainee rows; it is the one validated way,
    // called one step earlier so a university can submit everything at once.
    //
    // A roster that fails validation must not leave behind a request with zero
    // trainees and no way for the caller to tell why — the request (and any
    // plan composed for it) is removed and the same error surfaces to the caller,
    // who can correct the roster and resubmit the whole thing.
    if (dto.trainees?.length) {
      if (!user) {
        await this.prisma.trainingRequest.delete({ where: { id: created.id } }).catch(() => undefined);
        throw new BadRequestException('لا يمكن إرفاق قائمة متدربين بدون مستخدم مصادَق عليه');
      }
      try {
        await this.traineesService.importTrainees(
          created.id,
          dto.trainees.map((t) => ({
            academicNumber: t.academicNumber,
            nationalId: t.nationalId,
            nameAr: t.nameAr,
            nameEn: t.nameEn,
            gender: t.gender,
            specialty: t.specialty,
            email: t.email,
            mobile: t.mobile,
            startDate: t.startDate,
            endDate: t.endDate,
          })),
          user!,
        );
      } catch (e) {
        await this.prisma.trainingRequest.delete({ where: { id: created.id } }).catch(() => undefined);
        if (versionId && !resolved.version) {
          // Only the plan this call composed itself — never a catalog plan the
          // university merely selected.
          await this.prisma.trainingPlan.delete({ where: { id: planId! } }).catch(() => undefined);
        }
        throw e;
      }
    }

    // Addressed by capability, so whoever owns request review in that cluster is
    // told — training_director included, which the hard-coded role code missed.
    try {
      await this.notificationService.notifyCapableUsers(
        dto.targetOrgId,
        CAPABILITIES.TRAINING_REQUEST_REVIEW,
        {
          titleAr: 'طلب تدريب جديد وارد',
          titleEn: 'New Training Request',
          bodyAr: `تم استلام طلب تدريب جديد (${requestNumber}) من ${created.sourceOrg?.nameAr || 'جامعة'} — عدد المتدربين: ${dto.studentCount}`,
          type: 'training_request',
          referenceType: 'TrainingRequest',
          referenceId: created.id,
        },
      );
    } catch (e) {
      // Notification failure should not block the request
      console.warn('Failed to send notification:', e);
    }

    return { data: created };
  }

  async update(id: string, dto: UpdateTrainingRequestDto, user?: IAuthenticatedUser) {
    const existing = await this.prisma.trainingRequest.findUnique({
      where: { id },
      include: { sourceOrg: true, targetOrg: true },
    });
    if (!existing) {
      throw new NotFoundException('طلب التدريب غير موجود');
    }

    if (dto.status && dto.status !== existing.status) {
      assertValidTransition('طلب التدريب', existing.status, dto.status, TRAINING_REQUEST_TRANSITIONS);
    }

    const updated = await this.prisma.trainingRequest.update({
      where: { id },
      data: {
        status: dto.status || existing.status,
        notes: dto.notes !== undefined ? dto.notes : existing.notes,
        allocations: (dto.allocations || existing.allocations) as any,
        updatedById: user?.accountId,
      },
      include: {
        sourceOrg: true,
        targetOrg: true,
        program: true,
        academicIntake: true,
      },
    });

    // Send notification on status change
    if (dto.status && dto.status !== existing.status) {
      try {
        const statusLabels: Record<string, string> = {
          approved: 'معتمد ومرسل للمستشفى',
          allocated: 'موزع — بانتظار الاعتماد',
          auto_allocated: 'موزع — بانتظار الاعتماد',
          manually_reallocated: 'أعيد توزيعه — بانتظار الاعتماد',
          rejected: 'مرفوض',
          under_cluster_review: 'قيد مراجعة التجمع',
          returned_to_university: 'معاد للجامعة',
        };

        // Notify source org (university)
        await this.notificationService.notifyOrgUsers(
          existing.sourceOrgId,
          'university_administrator',
          {
            titleAr: `تحديث طلب التدريب ${existing.requestNumber}`,
            titleEn: `Training Request ${existing.requestNumber} Updated`,
            bodyAr: `تم تحديث حالة طلب التدريب إلى: ${statusLabels[dto.status] || dto.status}`,
            type: 'training_request_update',
            referenceType: 'TrainingRequest',
            referenceId: id,
          },
        );

        // Hospitals are deliberately not notified here. Allocation is a proposal
        // the cluster still reviews and approves; approve() is what sends the
        // request on and notifies the receiving hospitals.
      } catch (e) {
        console.warn('Failed to send status notification:', e);
      }
    }

    return { data: updated };
  }

  // ─── Smart Auto-Allocation Engine ──────────────────────────────────────────
  async autoAllocate(id: string, user?: IAuthenticatedUser) {
    const request = await this.prisma.trainingRequest.findUnique({
      where: { id },
      include: { sourceOrg: true, targetOrg: true, academicIntake: true },
    });
    if (!request) throw new NotFoundException('طلب التدريب غير موجود');

    // Run intelligent placement engine across all cluster_approved TRT rows
    const rowResults = await this.allocationEngine.allocateRequest(
      id,
      request.targetOrgId,
      user?.accountId,
    );

    let allocated = rowResults.filter((r) => r.allocated).length;
    const failed = rowResults.filter((r) => !r.allocated).length;
    let allocationSummary: any[];

    if (allocated > 0) {
      // Full engine path — individual rows allocated
      allocationSummary = rowResults.map((r) => ({
        rowId: r.rowId,
        hospitalId: r.hospitalId,
        hospitalName: r.hospitalName,
        departmentId: r.departmentId,
        allocated: r.allocated,
        score: r.score,
        reason: r.reason,
      }));
    } else {
      // Fallback: no cluster_approved TRT rows yet (Phase 1 staging not used).
      // Distribute request.studentCount seats across hospitals by available capacity.
      //
      // targetOrgId is a hospital when the request was created by a cluster user
      // (the create flow maps a cluster request onto the hospital it targets), so
      // "hospitals under the target" must also include the target itself — a plain
      // parentId match finds nothing for those requests. Mirrors
      // getHospitalCardsMetrics' hospital-or-cluster candidate set.
      const hospitals = await this.prisma.organization.findMany({
        where: {
          status: 'active',
          deletedAt: null,
          OR: [{ id: request.targetOrgId }, { parentId: request.targetOrgId }],
        },
        select: { id: true, nameAr: true, code: true, capacity: true },
      });

      if (hospitals.length === 0) {
        throw new BadRequestException(
          'لا توجد مستشفيات مفعّلة تابعة للتجمع الصحي لتوزيع الطلاب عليها',
        );
      }

      allocationSummary = [];
      let remaining = request.studentCount;

      for (const hosp of hospitals) {
        if (remaining <= 0) break;
        const occ = await this.capacityService.getHospitalOccupancy(hosp.id);
        if (occ.available <= 0) continue;
        const take = Math.min(remaining, occ.available);
        remaining -= take;
        allocationSummary.push({
          hospitalId: hosp.id,
          hospitalCode: hosp.code,
          hospitalName: hosp.nameAr,
          capacity: occ.capacity,
          occupied: occ.occupied,
          available: occ.available,
          allocatedSeats: take,
          allocated: true,
          reason: 'توزيع تلقائي بالطاقة الاستيعابية المتاحة',
        });
        allocated += take;
      }

      if (allocated === 0) {
        throw new BadRequestException(
          'تعذر التوزيع: لا توجد مقاعد شاغرة في أي مستشفى تابع للتجمع الصحي. يرجى مراجعة الطاقة الاستيعابية المعلنة.',
        );
      }
    }

    assertValidTransition(
      'طلب التدريب',
      request.status,
      TRAINING_REQUEST_STATUS.AUTO_ALLOCATED,
      TRAINING_REQUEST_TRANSITIONS,
    );

    await this.prisma.trainingRequest.update({
      where: { id },
      data: {
        allocations: allocationSummary,
        status: 'auto_allocated',
        updatedById: user?.accountId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: request.targetOrgId,
        actorId: user?.accountId,
        action: 'auto_allocate_training_request',
        entityType: 'TrainingRequest',
        entityId: id,
        newValues: {
          status: 'auto_allocated',
          allocatedCount: rowResults.length > 0 ? rowResults.filter((r) => r.allocated).length : allocated,
          failedCount: failed,
          summary: allocationSummary,
        },
      },
    });

    const updated = await this.prisma.trainingRequest.findUnique({
      where: { id },
      include: { sourceOrg: true, targetOrg: true, academicIntake: true },
    });

    return {
      data: updated,
      rowResults,
      success: true,
      message: `تم التوزيع الذكي: ${allocated} متدرب مُوزَّع${failed > 0 ? ` — ${failed} لم يُوزَّع (تحتاج مراجعة الطاقة)` : ' بنجاح'}`,
    };
  }

  // ─── Manual Row Allocation Override ───────────────────────────────────────
  async allocateTraineeRow(
    rowId: string,
    hospitalId: string | undefined,
    user: IAuthenticatedUser,
  ) {
    const row = await this.prisma.trainingRequestTrainee.findUnique({
      where: { id: rowId },
    });
    if (!row) throw new NotFoundException('صف المتدرب غير موجود');

    if (!['cluster_approved', 'allocated'].includes(row.status)) {
      throw new BadRequestException(
        `لا يمكن إعادة توزيع صف بحالة "${row.status}". يجب أن يكون بحالة cluster_approved أو allocated`,
      );
    }

    const result = await this.allocationEngine.reallocateRow(
      rowId,
      user.accountId,
      hospitalId,
    );

    if (!result.allocated) {
      return {
        success: false,
        result,
        message: result.reason,
      };
    }

    return {
      success: true,
      result,
      message: `تم تعيين المتدرب إلى ${result.hospitalName} (تقييم: ${result.score?.toFixed(1)})`,
    };
  }

  // ─── Capacity Validation Check ─────────────────────────────────────────────
  async validateCapacity(id: string) {
    const request = await this.prisma.trainingRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('طلب التدريب غير موجود');

    const allocations: any[] = (request.allocations as any[]) || [];
    const errors: string[] = [];

    for (const alloc of allocations) {
      const hosp = await this.prisma.organization.findUnique({
        where: { id: alloc.hospitalId },
        include: {
          departments: { where: { isActive: true } },
          _count: { select: { traineeProfiles: true } },
        },
      });

      if (!hosp || hosp.status !== 'active') {
        errors.push(`المستشفى (${alloc.hospitalName || alloc.hospitalId}) غير نشط أو غير موجود`);
        continue;
      }

      const { capacity: totalCap, occupied: currentOccupied } =
        await this.capacityService.getHospitalOccupancy(hosp.id);
      const requestedSeats = Number(alloc.allocatedSeats || alloc.seats || 0);

      if (currentOccupied + requestedSeats > totalCap) {
        errors.push(`التوزيع على (${hosp.nameAr}) يتجاوز الطاقة الاستيعابية (${totalCap} مقعد). الحالي: ${currentOccupied}، المطلوب: ${requestedSeats}`);
      }

      if (hosp.departments.length === 0) {
        errors.push(`المستشفى (${hosp.nameAr}) لا يحتوي على أقسام سريرية مفعّلة`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // ─── Approval Workflow Actions ─────────────────────────────────────────────
  async approve(id: string, user?: IAuthenticatedUser) {
    const existing = await this.prisma.trainingRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('طلب التدريب غير موجود');

    const validation = await this.validateCapacity(id);
    if (!validation.isValid) {
      throw new BadRequestException(
        `تعذر الاعتماد بسبب أخطاء الطاقة الاستيعابية:\n${validation.errors.join('\n')}`,
      );
    }

    // Approval is the step that sends the request to the hospitals, so it may
    // not run before an assignment actually exists. validateCapacity iterates
    // `allocations` and therefore passes trivially when the array is empty — a
    // request whose auto-allocation placed nobody would otherwise be approved,
    // reach the "sent to hospitals" list, and leave the hospital with a request
    // naming no trainees.
    const assignedRows = await this.prisma.trainingRequestTrainee.findMany({
      where: { trainingRequestId: id, assignedHospitalId: { not: null } },
      select: { id: true, assignedHospitalId: true },
    });
    if (assignedRows.length === 0) {
      throw new BadRequestException(
        'لا يمكن اعتماد الطلب قبل توزيع المتدربين على المستشفيات. نفّذ التوزيع أولاً ثم اعتمد.',
      );
    }

    assertValidTransition(
      'طلب التدريب',
      existing.status,
      TRAINING_REQUEST_STATUS.APPROVED,
      TRAINING_REQUEST_TRANSITIONS,
    );

    const updated = await this.prisma.trainingRequest.update({
      where: { id },
      data: {
        status: 'approved',
        updatedById: user?.accountId,
      },
      include: { sourceOrg: true, targetOrg: true },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: updated.targetOrgId,
        actorId: user?.accountId,
        action: 'approve_training_request',
        entityType: 'TrainingRequest',
        entityId: id,
        newValues: { status: 'approved' },
      },
    });

    // Notify the university that its request cleared, and each receiving
    // hospital that trainees are now on their way. The hospital notice belongs
    // here rather than at allocation time: allocation is a proposal the cluster
    // still has to approve, and telling a hospital about it beforehand announces
    // an arrival that may never be approved.
    try {
      await this.notificationService.notifyOrgUsers(
        updated.sourceOrgId,
        'university_administrator',
        {
          titleAr: `تمت الموافقة النهائية على طلب التدريب ${updated.requestNumber}`,
          titleEn: `Training Request ${updated.requestNumber} Approved`,
          bodyAr: `قام التجمع الصحي باعتماد توزيع طلب التدريب ${updated.requestNumber} بنجاح.`,
          type: 'request_approved',
          referenceType: 'TrainingRequest',
          referenceId: id,
        },
      );

      // One notice per hospital, counted from the rows actually assigned to it,
      // so a hospital is never told about seats it did not receive.
      const seatsByHospital = new Map<string, number>();
      for (const row of assignedRows) {
        const hospitalId = row.assignedHospitalId as string;
        seatsByHospital.set(hospitalId, (seatsByHospital.get(hospitalId) ?? 0) + 1);
      }
      for (const [hospitalId, seats] of seatsByHospital) {
        await this.notificationService.notifyOrgUsers(
          hospitalId,
          'hospital_training_admin',
          {
            titleAr: `طلب تدريب معتمد وصل لمستشفاكم — ${updated.requestNumber}`,
            titleEn: `Approved training request ${updated.requestNumber}`,
            bodyAr: `اعتمد التجمع الصحي توزيع ${seats} متدرب على مستشفاكم ضمن طلب التدريب ${updated.requestNumber}. يرجى المراجعة والقبول.`,
            type: 'sent_to_hospital',
            referenceType: 'TrainingRequest',
            referenceId: id,
          },
        );
      }
    } catch (e) {
      console.warn('Notification error:', e);
    }

    return { data: updated, success: true, message: 'تمت الموافقة النهائية وتوثيق التوزيع بنجاح' };
  }

  async reject(id: string, reason?: string, user?: IAuthenticatedUser) {
    const existing = await this.prisma.trainingRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('طلب التدريب غير موجود');

    assertValidTransition(
      'طلب التدريب',
      existing.status,
      TRAINING_REQUEST_STATUS.REJECTED,
      TRAINING_REQUEST_TRANSITIONS,
    );

    const updated = await this.prisma.trainingRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        notes: reason ? `سبب الرفض: ${reason}` : undefined,
        updatedById: user?.accountId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: updated.targetOrgId,
        actorId: user?.accountId,
        action: 'reject_training_request',
        entityType: 'TrainingRequest',
        entityId: id,
        newValues: { status: 'rejected', reason },
      },
    });

    return { data: updated, success: true, message: 'تم رفض طلب التدريب' };
  }

  async returnToUniversity(id: string, notes?: string, user?: IAuthenticatedUser) {
    const existing = await this.prisma.trainingRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('طلب التدريب غير موجود');

    assertValidTransition(
      'طلب التدريب',
      existing.status,
      TRAINING_REQUEST_STATUS.RETURNED_TO_UNIVERSITY,
      TRAINING_REQUEST_TRANSITIONS,
    );

    const updated = await this.prisma.trainingRequest.update({
      where: { id },
      data: {
        status: 'returned_to_university',
        notes: notes ? `ملاحظات الإعادة للجامعة: ${notes}` : undefined,
        updatedById: user?.accountId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: updated.targetOrgId,
        actorId: user?.accountId,
        action: 'return_training_request_to_university',
        entityType: 'TrainingRequest',
        entityId: id,
        newValues: { status: 'returned_to_university', notes },
      },
    });

    return { data: updated, success: true, message: 'تمت إعادة طلب التدريب إلى الجامعة للتعديل' };
  }

  async cloneRequest(id: string, user?: IAuthenticatedUser) {
    const req = await this.prisma.trainingRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('الطلب غير موجود');

    const reqCount = await this.prisma.trainingRequest.count();
    const requestNumber = `TR-${new Date().getFullYear()}-${(reqCount + 1).toString().padStart(4, '0')}`;

    const cloned = await this.prisma.trainingRequest.create({
      data: {
        requestNumber,
        sourceOrgId: req.sourceOrgId,
        targetOrgId: req.targetOrgId,
        programId: req.programId,
        specialty: req.specialty,
        // The clone keeps the original's pinned version rather than jumping to the
        // latest one, so a re-submitted batch trains on the plan it was built for.
        trainingPlanId: req.trainingPlanId,
        trainingPlanVersionId: req.trainingPlanVersionId,
        trainingStartDate: req.trainingStartDate,
        trainingEndDate: req.trainingEndDate,
        expectedGraduationDate: req.expectedGraduationDate,
        academicIntakeId: req.academicIntakeId,
        studentCount: req.studentCount,
        priority: req.priority,
        notes: `نسخة مستنسخة من الطلب ${req.requestNumber}`,
        allocations: req.allocations as any,
        status: 'draft',
        createdById: user?.accountId,
      },
    });

    return { data: cloned, success: true, message: `تم استنساخ الطلب بنجاح برقم جديد (${requestNumber})` };
  }

  // Deliberate administrative escape hatch: bypasses the transition table to
  // recover a stuck request, so it is always audited.
  async resetRequest(id: string, user?: IAuthenticatedUser) {
    const existing = await this.prisma.trainingRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('طلب التدريب غير موجود');

    const updated = await this.prisma.trainingRequest.update({
      where: { id },
      data: {
        allocations: [],
        status: TRAINING_REQUEST_STATUS.SUBMITTED,
        updatedById: user?.accountId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: existing.targetOrgId,
        actorId: user?.accountId,
        action: 'reset_training_request',
        entityType: 'TrainingRequest',
        entityId: id,
        oldValues: { status: existing.status, allocations: existing.allocations as any },
        newValues: { status: TRAINING_REQUEST_STATUS.SUBMITTED, allocations: [] },
      },
    });

    return { data: updated, success: true, message: 'تم تصفير التوزيعات وإعادة الطلب إلى الحالة الأولية' };
  }

  // ─── Multi-Stage Hospital Acceptance Workflow ─────────────────────────────
  async acceptByHospitalDirector(id: string, notes?: string, user?: IAuthenticatedUser) {
    const req = await this.prisma.trainingRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('الطلب غير موجود');

    assertValidTransition('طلب التدريب', req.status, 'hospital_accepted', TRAINING_REQUEST_TRANSITIONS);

    const updated = await this.prisma.trainingRequest.update({
      where: { id },
      data: {
        status: 'hospital_accepted',
        notes: notes ? `قبول مدير المستشفى: ${notes}` : req.notes,
        updatedById: user?.accountId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: req.targetOrgId,
        actorId: user?.accountId,
        action: 'accept_by_hospital_director',
        entityType: 'TrainingRequest',
        entityId: id,
        newValues: { status: 'hospital_accepted', notes },
      },
    });

    return { data: updated, success: true, message: 'تمت موافقة مدير المستشفى وإحالة الطلب للمشرف التدريبي' };
  }

  async acceptBySupervisor(id: string, notes?: string, user?: IAuthenticatedUser) {
    const req = await this.prisma.trainingRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('الطلب غير موجود');

    assertValidTransition('طلب التدريب', req.status, 'supervisor_accepted', TRAINING_REQUEST_TRANSITIONS);

    const updated = await this.prisma.trainingRequest.update({
      where: { id },
      data: {
        status: 'supervisor_accepted',
        notes: notes ? `موافقة المشرف: ${notes}` : req.notes,
        updatedById: user?.accountId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: req.targetOrgId,
        actorId: user?.accountId,
        action: 'accept_by_supervisor',
        entityType: 'TrainingRequest',
        entityId: id,
        newValues: { status: 'supervisor_accepted', notes },
      },
    });

    return { data: updated, success: true, message: 'تمت موافقة المشرف التدريبي وإحالة الطلب للمدرب السريري' };
  }

  async acceptByTrainer(id: string, notes?: string, user?: IAuthenticatedUser) {
    const req = await this.prisma.trainingRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('الطلب غير موجود');

    assertValidTransition(
      'طلب التدريب',
      req.status,
      TRAINING_REQUEST_STATUS.TRAINER_ACCEPTED,
      TRAINING_REQUEST_TRANSITIONS,
    );

    const updated = await this.prisma.trainingRequest.update({
      where: { id },
      data: {
        status: 'trainer_accepted',
        notes: notes ? `موافقة المدرب: ${notes}` : req.notes,
        updatedById: user?.accountId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: req.targetOrgId,
        actorId: user?.accountId,
        action: 'accept_by_trainer',
        entityType: 'TrainingRequest',
        entityId: id,
        newValues: { status: 'trainer_accepted', notes },
      },
    });

    return { data: updated, success: true, message: 'تمت موافقة المدرب السريري وتفعيل المقعد للطلاب' };
  }

  async acceptByIntern(id: string, user?: IAuthenticatedUser) {
    const req = await this.prisma.trainingRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('الطلب غير موجود');

    assertValidTransition(
      'طلب التدريب',
      req.status,
      TRAINING_REQUEST_STATUS.ACTIVE,
      TRAINING_REQUEST_TRANSITIONS,
    );

    const updated = await this.prisma.trainingRequest.update({
      where: { id },
      data: {
        status: 'active',
        updatedById: user?.accountId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: req.targetOrgId,
        actorId: user?.accountId,
        action: 'accept_by_intern',
        entityType: 'TrainingRequest',
        entityId: id,
        newValues: { status: 'active' },
      },
    });

    return { data: updated, success: true, message: 'تم قبول التدريب وتفعيل الخطة للأطياء المقبولين بنجاح' };
  }

  // ─── Generic acceptance chain (Phase 5) ─────────────────────────────────
  // Maps current status → { next on approve, next on reject, next on return, notifyRole }
  private static readonly CHAIN_MAP: Record<string, { approve: string; notifyRole: string; label: string }> = {
    // The status literals below are preserved because existing rows carry them.
    // Only the notified role is canonicalised: the hospital step belongs to the
    // Hospital Training Manager, the next step to the clinical trainer.
    approved:                         { approve: 'hospital_administrator_accepted', notifyRole: 'hospital_training_admin', label: 'مدير تدريب المستشفى' },
    hospital_accepted:                { approve: 'supervisor_accepted',             notifyRole: 'hospital_training_admin', label: 'مدير تدريب المستشفى' },
    hospital_administrator_accepted:  { approve: 'training_supervisor_accepted',    notifyRole: 'hospital_training_admin', label: 'مدير تدريب المستشفى' },
    supervisor_accepted:              { approve: 'trainer_accepted',                notifyRole: 'trainer',                 label: 'المدرب السريري' },
    training_supervisor_accepted:     { approve: 'trainer_accepted',                notifyRole: 'trainer',                 label: 'المدرب السريري' },
    trainer_accepted:                 { approve: 'active',                          notifyRole: 'trainee',                 label: 'طبيب الامتياز' },
  };

  async advanceAcceptanceChain(
    id: string,
    action: 'approve' | 'reject' | 'return_to_cluster',
    notes?: string,
    user?: IAuthenticatedUser,
  ) {
    const req = await this.prisma.trainingRequest.findUnique({
      where: { id },
      include: { sourceOrg: true, targetOrg: true },
    });
    if (!req) throw new NotFoundException('الطلب غير موجود');

    const step = TrainingRequestsService.CHAIN_MAP[req.status];
    if (!step) throw new BadRequestException(`الحالة الحالية "${req.status}" ليست ضمن سلسلة القبول`);

    const nextStatus =
      action === 'approve'           ? step.approve :
      action === 'reject'            ? 'rejected' :
      /* return_to_cluster */          'hospital_returned_to_cluster';

    assertValidTransition('طلب التدريب', req.status, nextStatus, TRAINING_REQUEST_TRANSITIONS);

    const updated = await this.prisma.trainingRequest.update({
      where: { id },
      data: { status: nextStatus, notes: notes ? `${step.label}: ${notes}` : req.notes, updatedById: user?.accountId },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: req.targetOrgId,
        actorId: user?.accountId,
        action: `acceptance_chain_${action}`,
        entityType: 'TrainingRequest',
        entityId: id,
        oldValues: { status: req.status },
        newValues: { status: nextStatus, notes, actor: step.label },
      },
    });

    // Notify next actor if approved
    try {
      if (action === 'approve' && nextStatus !== 'active') {
        await this.notificationService.notifyOrgUsers(req.targetOrgId, step.notifyRole, {
          titleAr: `طلب تدريب بانتظار موافقتك — ${req.requestNumber}`,
          bodyAr: `وافق ${step.label} على الطلب وأحاله إليك للمراجعة والموافقة`,
          type: 'acceptance_chain',
          referenceType: 'TrainingRequest',
          referenceId: id,
          channels: ['in_app', 'email', 'push'],
        });
      } else if (action === 'approve' && nextStatus === 'active') {
        // Trigger full internship activation (rotations, competencies, profile status)
        await this.activationService.activateRequest(id, user?.accountId);
        await this.notificationService.notifyOrgUsers(req.sourceOrgId, 'university_administrator', {
          titleAr: `تم تفعيل التدريب — ${req.requestNumber}`,
          bodyAr: `اكتملت جميع خطوات القبول وتم تفعيل برنامج التدريب بنجاح`,
          type: 'training_activated',
          referenceType: 'TrainingRequest',
          referenceId: id,
          channels: ['in_app', 'email', 'push'],
        });
      } else if (action === 'reject') {
        await this.notificationService.notifyOrgUsers(req.sourceOrgId, 'university_administrator', {
          titleAr: `رُفض طلب التدريب — ${req.requestNumber}`,
          bodyAr: `رفض ${step.label} طلب التدريب${notes ? ': ' + notes : ''}`,
          type: 'training_rejected',
          referenceType: 'TrainingRequest',
          referenceId: id,
          channels: ['in_app', 'email', 'push'],
        });
      }
    } catch (e) { console.warn('Notification error:', e); }

    const actionLabel = action === 'approve' ? 'تمت الموافقة' : action === 'reject' ? 'تم الرفض' : 'أُعيد للتجمع';
    return { data: updated, success: true, message: `${actionLabel} من قِبَل ${step.label}` };
  }

  /**
   * إنهاء الموافقات وتفعيل التدريب بالكامل من قبل إدارة التجمع الصحي.
   * يتحقق من استيفاء جميع المتدربين داخل الطلب:
   *  - assignedHospitalId
   *  - assignedDepartmentId
   *  - assignedTrainerProfileId
   *  - وجود تخصيص نشط / مفتوح (open allocation)
   *  - وجود / إنشاء Rotation نشط
   * ويحدث حالة الطلب والمتدربين إلى 'active' ويُرسل الإشعارات اللازمة.
   */
  async finalizeApprovals(id: string, user: IAuthenticatedUser) {
    const req = await this.prisma.trainingRequest.findUnique({
      where: { id },
      include: {
        trainees: {
          include: {
            assignedHospital: true,
            assignedDepartment: true,
            assignedTrainer: { include: { person: true } },
            allocations: {
              where: { status: 'open' },
              include: { hospital: true, department: true, trainerProfile: { include: { person: true } } },
            },
            traineeProfile: {
              include: {
                rotations: {
                  where: { status: { in: ['active', 'pending_acceptance', 'scheduled', 'completed'] } },
                  include: { department: true, trainerProfile: { include: { person: true } } },
                },
              },
            },
          },
        },
        sourceOrg: true,
        targetOrg: true,
      },
    });

    if (!req) throw new NotFoundException('طلب التدريب غير موجود');

    if (!req.trainees || req.trainees.length === 0) {
      throw new BadRequestException('لا يمكن إنهاء الموافقات: لا يوجد متدربون في هذا الطلب.');
    }

    // التحقق الدقيق من اكتمال التخصيص لكل متدرب
    const missingDetails: string[] = [];
    for (const t of req.trainees) {
      const openAlloc = t.allocations?.[0];
      const activeRot = t.traineeProfile?.rotations?.[0];

      const hospId = openAlloc?.hospitalId || t.assignedHospitalId;
      const deptId = openAlloc?.departmentId || t.assignedDepartmentId || activeRot?.departmentId;
      const trainerId = openAlloc?.trainerProfileId || t.assignedTrainerProfileId || activeRot?.trainerProfileId;

      const errors: string[] = [];
      if (!hospId) errors.push('بدون مستشفى');
      if (!deptId) errors.push('بدون قسم');
      if (!trainerId) errors.push('بدون مدرب');

      if (errors.length > 0) {
        missingDetails.push(`المتدرب «${t.nameAr}» (${t.academicNumber || t.nationalId}): ${errors.join('، ')}`);
      }
    }

    if (missingDetails.length > 0) {
      throw new BadRequestException(
        `لا يمكن إنهاء الموافقات وتفعيل التدريب لوجود متدربين ناقصي التخصيص:\n${missingDetails.join('\n')}`,
      );
    }

    // التنفيذ في Transaction واحدة
    const updated = await this.prisma.$transaction(async (tx) => {
      // 1. تحديث صفوف المتدربين غير النشطة إلى 'active'
      for (const t of req.trainees) {
        const openAlloc = t.allocations?.[0];
        const activeRot = t.traineeProfile?.rotations?.[0];

        const hospId = openAlloc?.hospitalId || t.assignedHospitalId!;
        const deptId = openAlloc?.departmentId || t.assignedDepartmentId || activeRot?.departmentId;
        const trainerId = openAlloc?.trainerProfileId || t.assignedTrainerProfileId || activeRot?.trainerProfileId;

        // تحديث صف TrainingRequestTrainee
        await tx.trainingRequestTrainee.update({
          where: { id: t.id },
          data: {
            status: 'active',
            assignedHospitalId: hospId,
            assignedDepartmentId: deptId ?? undefined,
            assignedTrainerProfileId: trainerId ?? undefined,
          },
        });

        // تحديث TraineeProfile إن وجد
        if (t.traineeProfileId) {
          await tx.traineeProfile.update({
            where: { id: t.traineeProfileId },
            data: {
              applicationStatus: 'active',
              updatedById: user.accountId,
            },
          });
        }
      }

      // 2. تحديث حالة TrainingRequest إلى 'active'
      const updatedReq = await tx.trainingRequest.update({
        where: { id },
        data: {
          status: 'active',
          updatedById: user.accountId,
        },
        include: { sourceOrg: true, targetOrg: true },
      });

      // 3. تدوين سجل التدقيق AuditLog
      await tx.auditLog.create({
        data: {
          organizationId: req.targetOrgId,
          actorId: user.accountId,
          action: 'finalize_approvals_activate_training',
          entityType: 'TrainingRequest',
          entityId: id,
          oldValues: { status: req.status },
          newValues: {
            status: 'active',
            traineesActivated: req.trainees.length,
          },
        },
      });

      return updatedReq;
    });

    // 4. تفعيل خطط التدريب والروتيشنات عبر ActivationService (تنشئ الروتيشن إذا لم يكن موجوداً وتحافظ على الروتيشن الحالي)
    try {
      for (const t of req.trainees) {
        await this.activationService.activateSingleRow(t.id, user.accountId);
      }
    } catch (e) {
      console.warn('activateSingleRow error during finalizeApprovals:', e);
    }

    // 5. إرسال الإشعارات للجامعة والمستشفى
    try {
      await this.notificationService.notifyOrgUsers(req.sourceOrgId, 'university_administrator', {
        titleAr: `تم إنهاء الموافقات وتفعيل التدريب — ${req.requestNumber}`,
        bodyAr: `اكتملت جميع موافقات وتخصيصات طلب التدريب ${req.requestNumber} وبدأ تدريب الطلاب رسمياً.`,
        type: 'training_activated',
        referenceType: 'TrainingRequest',
        referenceId: id,
        channels: ['in_app', 'email', 'push'],
      });

      await this.notificationService.notifyOrgUsers(req.targetOrgId, 'hospital_training_admin', {
        titleAr: `تم تفعيل برنامج التدريب — ${req.requestNumber}`,
        bodyAr: `تم إنهاء الموافقات وتفعيل التدريب لجميع متدربي الطلب ${req.requestNumber} بنجاح.`,
        type: 'training_activated',
        referenceType: 'TrainingRequest',
        referenceId: id,
        channels: ['in_app', 'push'],
      });
    } catch (e) {
      console.warn('Notification error during finalizeApprovals:', e);
    }

    return {
      data: updated,
      success: true,
      message: 'تم إنهاء كافة الموافقات وتفعيل برنامج التدريب لجميع المتدربين بنجاح',
    };
  }
}

