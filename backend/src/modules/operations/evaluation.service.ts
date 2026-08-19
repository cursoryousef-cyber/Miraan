import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../../common/interfaces';

/** Seconds below which a trainer evaluation is flagged as suspiciously fast. */
const SUSPICIOUS_SECONDS_THRESHOLD = 40;

@Injectable()
export class EvaluationService {
  constructor(private prisma: PrismaService) {}

  // ─── 0. Evaluation form templates ────────────────────────────────────────
  // The template a score is recorded against. Owned by the hospital's training
  // administration: nothing else may shape the criteria its trainers grade on.
  // This is the same EvaluationForm the trainer already reads and the scoring
  // path already writes against — no second evaluation model is introduced.

  /** Every form of the caller's organisation, active or not, with usage count. */
  async listForms(organizationId: string) {
    const forms = await this.prisma.evaluationForm.findMany({
      where: { organizationId },
      orderBy: [{ isActive: 'desc' }, { formType: 'asc' }],
      include: { _count: { select: { evaluations: true } } },
    });
    return { data: forms };
  }

  private assertItems(items: unknown): Prisma.InputJsonValue {
    if (items === undefined || items === null) return [] as unknown as Prisma.InputJsonValue;
    if (!Array.isArray(items)) {
      throw new BadRequestException('عناصر النموذج يجب أن تكون قائمة معايير');
    }
    for (const item of items as Array<Record<string, unknown>>) {
      if (!item || typeof item !== 'object' || !item.code) {
        throw new BadRequestException('كل معيار يجب أن يحمل رمزاً (code)');
      }
    }
    return items as unknown as Prisma.InputJsonValue;
  }

  async createForm(
    dto: { nameAr: string; nameEn?: string; formType: string; items?: unknown },
    user: IAuthenticatedUser,
  ) {
    if (!dto.nameAr?.trim()) throw new BadRequestException('اسم النموذج مطلوب');
    if (!dto.formType?.trim()) throw new BadRequestException('نوع النموذج مطلوب');

    const data = await this.prisma.evaluationForm.create({
      data: {
        organizationId: user.organizationId,
        nameAr: dto.nameAr.trim(),
        nameEn: dto.nameEn?.trim() || null,
        formType: dto.formType.trim(),
        items: this.assertItems(dto.items),
        createdById: user.accountId,
      },
    });
    return { success: true, data, message: 'تم إنشاء نموذج التقييم' };
  }

  /** Loads a form and refuses one belonging to another organisation. */
  private async requireOwnForm(id: string, organizationId: string) {
    const form = await this.prisma.evaluationForm.findUnique({
      where: { id },
      include: { _count: { select: { evaluations: true } } },
    });
    if (!form) throw new BadRequestException('نموذج التقييم غير موجود');
    if (form.organizationId !== organizationId) {
      throw new ForbiddenException('هذا النموذج خارج نطاق صلاحياتك التنظيمية');
    }
    return form;
  }

  /**
   * Edit a form. Criteria are frozen once the form has scored someone —
   * rewriting them would silently change what an already-recorded score meant.
   * Renaming and activation stay available.
   */
  async updateForm(
    id: string,
    dto: { nameAr?: string; nameEn?: string; formType?: string; items?: unknown },
    user: IAuthenticatedUser,
  ) {
    const form = await this.requireOwnForm(id, user.organizationId);
    const used = form._count.evaluations > 0;
    if (used && (dto.items !== undefined || dto.formType !== undefined)) {
      throw new BadRequestException(
        'لا يمكن تعديل معايير أو نوع نموذج استُخدم في تقييمات معتمدة — أنشئ نموذجاً جديداً أو عطّل هذا النموذج',
      );
    }

    const data = await this.prisma.evaluationForm.update({
      where: { id },
      data: {
        nameAr: dto.nameAr?.trim() || undefined,
        nameEn: dto.nameEn?.trim() ?? undefined,
        formType: dto.formType?.trim() || undefined,
        items: dto.items !== undefined ? this.assertItems(dto.items) : undefined,
        updatedById: user.accountId,
      },
    });
    return { success: true, data, message: 'تم حفظ تعديل النموذج' };
  }

  /** Activate/deactivate. A deactivated form stays readable on past evaluations. */
  async setFormActive(id: string, isActive: boolean, user: IAuthenticatedUser) {
    await this.requireOwnForm(id, user.organizationId);
    const data = await this.prisma.evaluationForm.update({
      where: { id },
      data: { isActive, updatedById: user.accountId },
    });
    return {
      success: true,
      data,
      message: isActive ? 'تم تفعيل النموذج' : 'تم تعطيل النموذج',
    };
  }

  /**
   * Delete only while unused. A form that already carries evaluations is
   * archived by deactivation instead, so the scores keep their template.
   */
  async deleteForm(id: string, user: IAuthenticatedUser) {
    const form = await this.requireOwnForm(id, user.organizationId);
    if (form._count.evaluations > 0) {
      throw new BadRequestException(
        'لا يمكن حذف نموذج مستخدم في تقييمات — يمكن تعطيله بدلاً من ذلك',
      );
    }
    await this.prisma.evaluationForm.delete({ where: { id } });
    return { success: true, message: 'تم حذف النموذج' };
  }

  /**
   * Validates a criterion score map against the form that defines the criteria
   * and derives the total from it.
   *
   * Each item on the form carries a `code` and its `max`; a score outside
   * [0, max] is refused rather than silently clamped, because a mark above the
   * maximum is a data-entry error the trainer needs to see. Percentage is the
   * awarded total over the sum of maxima, which is what the low-score gate and
   * the trainee's view both read.
   *
   * Backward compatible: a form with no items, or a payload carrying no criterion
   * keys, falls through to the caller-supplied total exactly as before.
   */
  private async scoreAgainstForm(
    formId: string,
    rawScores: Record<string, unknown> | undefined,
    suppliedTotal: number | undefined,
  ): Promise<{ scores: Record<string, unknown>; totalScore?: number; percentage?: number }> {
    const form = await this.prisma.evaluationForm.findUnique({ where: { id: formId } });
    if (!form) throw new BadRequestException('نموذج التقييم غير موجود');

    const items = Array.isArray(form.items)
      ? (form.items as Array<{ code?: string; nameAr?: string; max?: number }>)
      : [];
    const scores = { ...(rawScores ?? {}) } as Record<string, unknown>;

    const scored = items.filter((it) => it.code && scores[it.code] !== undefined && scores[it.code] !== '');
    if (items.length === 0 || scored.length === 0) {
      return { scores, totalScore: suppliedTotal, percentage: suppliedTotal };
    }

    let awarded = 0;
    let maxTotal = 0;
    for (const item of items) {
      const max = Number(item.max ?? 0);
      maxTotal += max;
      const raw = scores[item.code as string];
      if (raw === undefined || raw === '') {
        throw new BadRequestException(`درجة المعيار «${item.nameAr ?? item.code}» مطلوبة`);
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new BadRequestException(`درجة المعيار «${item.nameAr ?? item.code}» يجب أن تكون رقماً`);
      }
      if (value < 0) {
        throw new BadRequestException(`درجة المعيار «${item.nameAr ?? item.code}» لا يمكن أن تكون سالبة`);
      }
      if (max > 0 && value > max) {
        throw new BadRequestException(
          `درجة المعيار «${item.nameAr ?? item.code}» تتجاوز الحد الأقصى (${max})`,
        );
      }
      scores[item.code as string] = value;
      awarded += value;
    }

    const percentage = maxTotal > 0 ? Math.round((awarded / maxTotal) * 100) : undefined;
    scores._total = awarded;
    scores._maxTotal = maxTotal;
    scores._percentage = percentage;

    return { scores, totalScore: awarded, percentage };
  }

  // ─── 1. Midpoint-meeting status ──────────────────────────────────────────

  async midpointStatus(rotationId: string, organizationId: string) {
    const rotation = await this.prisma.rotation.findUniqueOrThrow({
      where: { id: rotationId },
      select: {
        id: true,
        organizationId: true,
        midpointMeetingDone: true,
        midpointMeetingDate: true,
        midpointMeetingNotes: true,
        startDate: true,
        endDate: true,
        traineeProfile: { select: { person: { select: { nameAr: true } } } },
      },
    });
    if (rotation.organizationId !== organizationId) {
      throw new ForbiddenException('هذا الروتيشن خارج نطاق صلاحياتك التنظيمية');
    }
    return { data: rotation };
  }

  async completeMidpointMeeting(
    rotationId: string,
    notes: string | undefined,
    user: IAuthenticatedUser,
  ) {
    const existing = await this.prisma.rotation.findUniqueOrThrow({ where: { id: rotationId }, select: { organizationId: true } });
    if (existing.organizationId !== user.organizationId) {
      throw new ForbiddenException('هذا الروتيشن خارج نطاق صلاحياتك التنظيمية');
    }
    const rotation = await this.prisma.rotation.update({
      where: { id: rotationId },
      data: {
        midpointMeetingDone: true,
        midpointMeetingDate: new Date(),
        midpointMeetingNotes: notes,
        updatedById: user.accountId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.accountId,
        action: 'evaluation.midpoint_meeting_done',
        entityType: 'Rotation',
        entityId: rotationId,
        newValues: { notes } as Prisma.InputJsonValue,
      },
    });

    return { success: true, data: rotation };
  }

  // ─── 2. Trainer → Trainee evaluation (with all guards) ───────────────────

  async submitTrainerEvaluation(
    dto: {
      rotationId: string;
      evaluateeId: string;
      formId: string;
      evaluationType: string;
      scores: Record<string, unknown>;
      totalScore?: number;
      comments?: string;
      secondsSpent?: number;
    },
    user: IAuthenticatedUser,
  ) {
    // Gate 0: ownership. Every other gate below asked "is this evaluation ready
    // to be written" and none asked "may this caller write it". `rotationId` and
    // `evaluateeId` arrive from the client, so without this a trainer could
    // score any trainee in the system by naming someone else's rotation — the
    // role check on the route only established that the caller is *a* trainer.
    // The rotation is the authority on who owns the pairing: the caller must be
    // its trainer, and the evaluatee must be its trainee.
    if (dto.rotationId) {
      const rotation = await this.prisma.rotation.findUnique({
        where: { id: dto.rotationId },
        select: {
          midpointMeetingDone: true,
          trainerProfileId: true,
          traineeProfileId: true,
        },
      });
      if (!rotation) throw new NotFoundException('الدورة التدريبية غير موجودة');

      // Trainers are bound to their own rotations. Roles that supervise rather
      // than train (academic_supervisor, org_manager, platform_owner) are not
      // rotation-owners and keep the access the route already granted them.
      const isTrainer = user.roles?.includes('trainer');
      if (isTrainer) {
        const callerTrainer = await this.prisma.trainerProfile.findFirst({
          where: { person: { userAccounts: { some: { id: user.accountId } } } },
          select: { id: true },
        });
        if (!callerTrainer || rotation.trainerProfileId !== callerTrainer.id) {
          throw new ForbiddenException(
            'لا يمكنك تقييم متدرب في دورة تدريبية غير مسندة إليك',
          );
        }
      }

      // The evaluatee must be the trainee on this rotation, whoever is calling.
      const evaluateeIsRotationTrainee = await this.prisma.traineeProfile.findFirst({
        where: {
          id: rotation.traineeProfileId,
          person: { userAccounts: { some: { id: dto.evaluateeId } } },
        },
        select: { id: true },
      });
      if (!evaluateeIsRotationTrainee) {
        throw new ForbiddenException('المتدرب المحدد ليس متدرب هذه الدورة التدريبية');
      }

      // Gate 1: final evaluation requires midpoint meeting done
      if (dto.evaluationType === 'final_rotation' && !rotation.midpointMeetingDone) {
        throw new ForbiddenException(
          'لا يمكن إرسال التقييم النهائي قبل إتمام اجتماع منتصف الدورة. يرجى تسجيل الاجتماع أولاً.',
        );
      }
    }

    // Gate 2: mutual lock — final eval requires trainee dept evaluation first
    if (dto.evaluationType === 'final_rotation' && dto.rotationId) {
      const deptEval = await this.prisma.evaluation.findFirst({
        where: {
          rotationId: dto.rotationId,
          evaluateeId: dto.evaluateeId,
          evaluationType: 'department_by_trainee',
        },
      });
      if (!deptEval) {
        throw new ForbiddenException(
          'التقييم المتبادل: لا يُعتمد التقييم النهائي إلا بعد أن يُكمل المتدرب تقييمه للقسم.',
        );
      }
    }

    // A graduated file takes no further assessment: the lock graduation sets is
    // honoured here as well, so a score cannot be attached after completion.
    const evaluateeProfile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: dto.evaluateeId } } } },
      select: { isLocked: true },
    });
    if (evaluateeProfile?.isLocked) {
      throw new ForbiddenException('ملف المتدرب مغلق بعد التخرج — لا يمكن تسجيل تقييم جديد');
    }

    // Criterion scoring. The form's items already declare each criterion and its
    // maximum; scores are validated against them and the total is derived here so
    // the recorded percentage can never disagree with the parts it came from.
    // A payload with no criterion keys keeps the previous single-score behaviour,
    // which is what existing evaluations were written with.
    const { scores, totalScore, percentage } = await this.scoreAgainstForm(dto.formId, dto.scores, dto.totalScore);

    // Gate 3: low-score comment mandatory
    const total = percentage ?? totalScore ?? 0;
    if (total < 60 && !dto.comments?.trim()) {
      throw new BadRequestException(
        'التقييمات المنخفضة (أقل من 60%) تستلزم تعليقاً إلزامياً يوضح السبب.',
      );
    }

    const isSuspicious =
      dto.secondsSpent !== undefined &&
      dto.secondsSpent < SUSPICIOUS_SECONDS_THRESHOLD;

    const evaluation = await this.prisma.evaluation.create({
      data: {
        organizationId: user.organizationId,
        formId: dto.formId,
        rotationId: dto.rotationId,
        evaluatorId: user.accountId,
        evaluateeId: dto.evaluateeId,
        evaluationType: dto.evaluationType,
        scores: scores as Prisma.InputJsonValue,
        totalScore: totalScore,
        comments: dto.comments,
        secondsSpent: dto.secondsSpent,
        isSuspicious,
      },
      include: { form: true, rotation: { include: { department: true } } },
    });

    await this.prisma.notification.create({
      data: {
        organizationId: user.organizationId,
        userId: dto.evaluateeId,
        titleAr: `تقييم جديد: ${evaluation.form.nameAr}`,
        bodyAr: dto.comments || 'لديك تقييم جديد من مدربك',
        type: 'evaluation',
        referenceType: 'Evaluation',
        referenceId: evaluation.id,
        sentVia: 'in_app',
      },
    });

    if (isSuspicious) {
      // Notify supervisors: look up via UserRole → Role.code, then UserOrganization for org scope
      const supervisorRoles = await this.prisma.userRole.findMany({
        where: {
          organizationId: user.organizationId,
          role: { code: { in: ['academic_supervisor', 'hospital_training_admin'] } },
        },
        select: { userAccountId: true },
      });
      const notifiedIds = new Set<string>();
      for (const ur of supervisorRoles) {
        if (notifiedIds.has(ur.userAccountId)) continue;
        notifiedIds.add(ur.userAccountId);
        await this.prisma.notification.create({
          data: {
            organizationId: user.organizationId,
            userId: ur.userAccountId,
            titleAr: '⚠️ تنبيه: تقييم مشبوه',
            bodyAr: `أُرسل تقييم في ${dto.secondsSpent} ثانية — أقل من الحد الأدنى (${SUSPICIOUS_SECONDS_THRESHOLD}ث)`,
            type: 'suspicious_evaluation',
            referenceType: 'Evaluation',
            referenceId: evaluation.id,
            sentVia: 'in_app',
          },
        });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.accountId,
        action: `evaluation.submit.${dto.evaluationType}`,
        entityType: 'Evaluation',
        entityId: evaluation.id,
        newValues: { isSuspicious, totalScore: dto.totalScore } as Prisma.InputJsonValue,
      },
    });

    return { success: true, data: evaluation };
  }

  // ─── 3. Trainee → Department evaluation (anonymous toward dept) ──────────

  async submitDepartmentEvaluation(
    dto: {
      rotationId: string;
      formId: string;
      scores: Record<string, unknown>;
      totalScore?: number;
      comments?: string;
    },
    user: IAuthenticatedUser,
  ) {
    const rotation = await this.prisma.rotation.findUnique({
      where: { id: dto.rotationId },
      select: { departmentId: true, traineeProfileId: true },
    });
    if (!rotation) throw new BadRequestException('الروتيشن غير موجود');

    const existing = await this.prisma.evaluation.findFirst({
      where: {
        rotationId: dto.rotationId,
        evaluatorId: user.accountId,
        evaluationType: 'department_by_trainee',
      },
    });
    if (existing) throw new BadRequestException('لقد قيّمت هذا القسم مسبقاً لهذا الروتيشن.');

    const evaluation = await this.prisma.evaluation.create({
      data: {
        organizationId: user.organizationId,
        formId: dto.formId,
        rotationId: dto.rotationId,
        evaluatorId: user.accountId,
        evaluateeId: user.accountId,
        evaluationType: 'department_by_trainee',
        scores: (dto.scores ?? {}) as Prisma.InputJsonValue,
        totalScore: dto.totalScore,
        comments: dto.comments,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.accountId,
        action: 'evaluation.submit.department_by_trainee',
        entityType: 'Evaluation',
        entityId: evaluation.id,
        newValues: { rotationId: dto.rotationId } as Prisma.InputJsonValue,
      },
    });

    return { success: true, data: evaluation };
  }

  // ─── 4. Mutual-lock status for a rotation ────────────────────────────────

  async mutualLockStatus(rotationId: string, traineeAccountId: string) {
    const [trainerEval, deptEval] = await Promise.all([
      this.prisma.evaluation.findFirst({
        where: { rotationId, evaluateeId: traineeAccountId, evaluationType: 'final_rotation' },
      }),
      this.prisma.evaluation.findFirst({
        where: { rotationId, evaluatorId: traineeAccountId, evaluationType: 'department_by_trainee' },
      }),
    ]);
    return {
      data: {
        trainerEvaluationDone: Boolean(trainerEval),
        departmentEvaluationDone: Boolean(deptEval),
        mutualLockComplete: Boolean(trainerEval) && Boolean(deptEval),
        trainerEvaluationId: trainerEval?.id ?? null,
        departmentEvaluationId: deptEval?.id ?? null,
      },
    };
  }

  // ─── 5. Slow-evaluator report ────────────────────────────────────────────

  async slowEvaluatorReport(organizationId: string) {
    const suspicious = await this.prisma.evaluation.findMany({
      where: { organizationId, isSuspicious: true },
      include: { evaluator: { include: { person: { select: { nameAr: true } } } } },
      orderBy: { submittedAt: 'desc' },
    });

    const byEvaluator = new Map<string, { nameAr: string; count: number; lastAt: Date }>();
    for (const ev of suspicious) {
      const key = ev.evaluatorId;
      const prev = byEvaluator.get(key);
      if (prev) {
        prev.count++;
        if (ev.submittedAt > prev.lastAt) prev.lastAt = ev.submittedAt;
      } else {
        byEvaluator.set(key, {
          nameAr: ev.evaluator.person?.nameAr ?? ev.evaluatorId,
          count: 1,
          lastAt: ev.submittedAt,
        });
      }
    }

    const data = Array.from(byEvaluator.entries()).map(([evaluatorId, info]) => ({
      evaluatorId,
      nameAr: info.nameAr,
      suspiciousCount: info.count,
      lastSuspiciousAt: info.lastAt,
      advisoryNote: `${info.count} تقييم مشبوه — يُنصح بمراجعة تقييمات هذا المدرب`,
    }));

    return { data };
  }

  // ─── 6. Pending evaluations for a trainee ────────────────────────────────

  async myPendingEvaluations(user: IAuthenticatedUser) {
    const profile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
      select: { id: true },
    });

    if (profile) {
      const activeRotations = await this.prisma.rotation.findMany({
        where: { traineeProfileId: profile.id, status: 'active' },
        include: { department: { select: { nameAr: true } } },
      });

      const pendingDepartmentEvals = (
        await Promise.all(
          activeRotations.map(async (rot) => {
            const done = await this.prisma.evaluation.findFirst({
              where: {
                rotationId: rot.id,
                evaluatorId: user.accountId,
                evaluationType: 'department_by_trainee',
              },
            });
            return done ? null : { rotationId: rot.id, departmentNameAr: rot.department.nameAr };
          }),
        )
      ).filter(Boolean);

      const receivedEvals = await this.prisma.evaluation.findMany({
        where: { evaluateeId: user.accountId },
        include: { form: true, rotation: { include: { department: { select: { nameAr: true } } } } },
        orderBy: { submittedAt: 'desc' },
        take: 20,
      });

      return { data: { pendingDepartmentEvals, receivedEvals } };
    }

    // For trainers, return pending trainer evaluations for assigned trainees
    const trainer = await this.prisma.trainerProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
    });

    if (trainer) {
      const activeTrainerRotations = await this.prisma.rotation.findMany({
        where: { trainerProfileId: trainer.id, status: 'active' },
        include: {
          traineeProfile: { include: { person: true } },
          department: { select: { nameAr: true } },
        },
      });

      const pendingTrainerEvals = (
        await Promise.all(
          activeTrainerRotations.map(async (rot) => {
            const done = await this.prisma.evaluation.findFirst({
              where: { rotationId: rot.id, evaluatorId: user.accountId },
            });
            return done
              ? null
              : {
                  rotationId: rot.id,
                  traineeNameAr: rot.traineeProfile.person.nameAr,
                  departmentNameAr: rot.department.nameAr,
                  startDate: rot.startDate,
                  endDate: rot.endDate,
                };
          }),
        )
      ).filter(Boolean);

      return { data: { pendingTrainerEvals, pendingDepartmentEvals: [], receivedEvals: [] } };
    }

    return { data: { pendingDepartmentEvals: [], receivedEvals: [] } };
  }
}
