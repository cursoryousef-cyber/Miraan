import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { CapacityService } from '../organizations/capacity.service';

export interface ReassignSingleDto {
  traineeProfileId: string;
  rotationId: string;
  newTrainerId: string;
  reason: string;
  notes?: string;
  trainerLeaveId?: string;
}

export interface ReassignBulkDto {
  traineeProfileIds: string[];
  newTrainerId: string;
  reason: string;
  notes?: string;
  trainerLeaveId?: string;
}

export interface ReassignEntireTrainerDto {
  fromTrainerId: string;
  toTrainerId: string;
  reason: string;
  notes?: string;
  trainerLeaveId?: string;
}

export interface ReassignEntireDepartmentDto {
  departmentId: string;
  fromTrainerId?: string;
  toTrainerId: string;
  reason: string;
  notes?: string;
}

const VALID_REASONS = [
  'annual_leave', 'emergency_leave', 'sick_leave', 'maternity_leave',
  'training_course', 'conference', 'temporary_assignment', 'transfer',
  'retirement', 'resignation', 'capacity_overflow', 'department_closure',
  'administrative_decision',
];

/** Arabic wording for each accepted reassignment reason. */
const REASON_LABELS_AR: Record<string, string> = {
  annual_leave: 'إجازة سنوية',
  emergency_leave: 'إجازة اضطرارية',
  sick_leave: 'إجازة مرضية',
  maternity_leave: 'إجازة أمومة',
  training_course: 'دورة تدريبية',
  conference: 'مؤتمر',
  temporary_assignment: 'تكليف مؤقت',
  transfer: 'نقل',
  retirement: 'تقاعد',
  resignation: 'استقالة',
  capacity_overflow: 'تجاوز الطاقة الاستيعابية',
  department_closure: 'إغلاق القسم',
  administrative_decision: 'قرار إداري',
};

/**
 * The " — السبب: …" tail of a notification, or nothing when no reason was given.
 *
 * These bodies interpolated the reason directly. Not every caller supplies one —
 * the bulk and leave-driven paths may omit it — and an absent reason is
 * `undefined`, which a template literal renders as the text "undefined", so
 * trainers and trainees received Arabic notifications reading "السبب: undefined".
 * The reason is also a stored enum, so the raw code is translated rather than
 * printed: an Arabic sentence should not end in `administrative_decision`.
 */
export function reasonSuffix(reason?: string | null): string {
  const trimmed = reason?.trim();
  if (!trimmed) return '';
  return ` — السبب: ${REASON_LABELS_AR[trimmed] ?? trimmed}`;
}

@Injectable()
export class TrainerReassignmentService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private capacityService: CapacityService,
  ) {}

  /**
   * Validates that a reassignment is safe to execute.
   * Returns the validated rotation and newTrainer records.
   */
  private async validateReassignment(
    rotationId: string,
    newTrainerId: string,
    organizationId: string,
  ) {
    const rotation = await this.prisma.rotation.findUnique({
      where: { id: rotationId },
      include: {
        department: true,
        trainerProfile: { include: { person: true } },
        traineeProfile: { include: { person: { include: { userAccounts: true } } } },
      },
    });

    if (!rotation) throw new NotFoundException('الروتيشن غير موجود');
    if (rotation.organizationId !== organizationId) {
      throw new ForbiddenException('هذا الروتيشن خارج نطاق صلاحياتك التنظيمية');
    }
    if (rotation.status !== 'active') throw new BadRequestException('لا يمكن إعادة إسناد إلا للروتيشنات النشطة');
    if (new Date(rotation.endDate) <= new Date()) throw new BadRequestException('الروتيشن منتهي الصلاحية');

    const newTrainer = await this.prisma.trainerProfile.findUnique({
      where: { id: newTrainerId },
      include: { person: true, department: true },
    });

    if (!newTrainer) throw new NotFoundException('المدرب الجديد غير موجود');
    if (!newTrainer.isActive) throw new BadRequestException('المدرب الجديد غير نشط');
    if (newTrainer.organizationId !== rotation.organizationId) {
      throw new BadRequestException('المدرب الجديد يجب أن يكون في نفس المستشفى');
    }
    if (newTrainer.departmentId && rotation.departmentId && newTrainer.departmentId !== rotation.departmentId) {
      throw new BadRequestException('المدرب الجديد يجب أن يكون في نفس القسم');
    }
    if (newTrainerId === rotation.trainerProfileId) {
      throw new BadRequestException('المدرب الجديد هو نفس المدرب الحالي');
    }

    // Check trainer capacity
    const trainerOccupancy = await this.capacityService.getTrainerOccupancy(newTrainerId);
    if (trainerOccupancy.available <= 0) {
      throw new BadRequestException(
        `المدرب ${newTrainer.person.nameAr} وصل للحد الأقصى من المتدربين (${trainerOccupancy.capacity}/${trainerOccupancy.capacity})`,
      );
    }

    return { rotation, newTrainer };
  }

  /**
   * Reassign a single trainee's active rotation to a new trainer.
   * The rotation continues with updated trainerProfileId — no new rotation is created.
   */
  async reassignSingle(dto: ReassignSingleDto, actorId: string, organizationId: string) {
    if (!VALID_REASONS.includes(dto.reason)) {
      throw new BadRequestException(`سبب غير صالح: ${dto.reason}`);
    }

    const { rotation, newTrainer } = await this.validateReassignment(
      dto.rotationId,
      dto.newTrainerId,
      organizationId,
    );

    const previousTrainerId = rotation.trainerProfileId;
    const previousTrainerName = rotation.trainerProfile.person.nameAr;
    const traineeName = rotation.traineeProfile.person.nameAr;
    const departmentId = rotation.departmentId;

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Update the rotation's trainer — rotation stays active
      const updatedRotation = await tx.rotation.update({
        where: { id: dto.rotationId },
        data: { trainerProfileId: dto.newTrainerId },
        include: {
          department: true,
          trainerProfile: { include: { person: true } },
          traineeProfile: { include: { person: true } },
        },
      });

      if (rotation.traineeProfileId) {
        await tx.traineeAllocation.updateMany({
          where: { traineeProfileId: rotation.traineeProfileId, status: 'open' },
          data: { trainerProfileId: dto.newTrainerId },
        });
        await tx.trainingRequestTrainee.updateMany({
          where: { traineeProfileId: rotation.traineeProfileId },
          data: { assignedTrainerProfileId: dto.newTrainerId },
        });
      }

      // 2. Create immutable reassignment record
      const reassignment = await tx.trainerReassignment.create({
        data: {
          organizationId,
          reassignmentType: 'single',
          reason: dto.reason,
          previousTrainerId,
          newTrainerId: dto.newTrainerId,
          departmentId,
          trainerLeaveId: dto.trainerLeaveId || null,
          effectiveDate: new Date(),
          previousAssignmentEnd: new Date(),
          notes: dto.notes || null,
          approvedById: actorId,
          createdById: actorId,
          trainees: {
            create: {
              traineeProfileId: rotation.traineeProfileId,
              rotationId: dto.rotationId,
              previousTrainerId,
              newTrainerId: dto.newTrainerId,
            },
          },
        },
        include: { trainees: true },
      });

      // 3. Create audit log
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: 'trainer_reassignment',
          entityType: 'Rotation',
          entityId: dto.rotationId,
          oldValues: {
            trainerProfileId: previousTrainerId,
            trainerName: previousTrainerName,
          },
          newValues: {
            trainerProfileId: dto.newTrainerId,
            trainerName: newTrainer.person.nameAr,
            reason: dto.reason,
            notes: dto.notes || '',
            reassignmentId: reassignment.id,
          },
        },
      });

      return { updatedRotation, reassignment };
    });

    // 4. Send notifications (outside transaction — never block)
    await this.sendReassignmentNotifications({
      organizationId,
      previousTrainerId,
      previousTrainerName,
      newTrainerId: dto.newTrainerId,
      newTrainerName: newTrainer.person.nameAr,
      traineeName,
      traineeUserId: rotation.traineeProfile.person.userAccounts[0]?.id,
      departmentName: rotation.department.nameAr,
      reason: dto.reason,
    });

    return {
      success: true,
      message: `تم نقل إشراف المتدرب (${traineeName}) من ${previousTrainerName} إلى ${newTrainer.person.nameAr} بنجاح.`,
      data: result,
    };
  }

  /**
   * Reassign multiple selected trainees to a new trainer.
   */
  async reassignMultiple(dto: ReassignBulkDto, actorId: string, organizationId: string) {
    if (!VALID_REASONS.includes(dto.reason)) {
      throw new BadRequestException(`سبب غير صالح: ${dto.reason}`);
    }

    // Find active rotations for the selected trainees
    const rotations = await this.prisma.rotation.findMany({
      where: {
        traineeProfileId: { in: dto.traineeProfileIds },
        status: 'active',
        organizationId,
      },
      include: {
        department: true,
        trainerProfile: { include: { person: true } },
        traineeProfile: { include: { person: { include: { userAccounts: true } } } },
      },
    });

    if (rotations.length === 0) {
      throw new NotFoundException('لا توجد روتيشنات نشطة للمتدربين المحددين');
    }

    // Validate capacity for all at once
    const newTrainer = await this.prisma.trainerProfile.findUnique({
      where: { id: dto.newTrainerId },
      include: { person: true },
    });
    if (!newTrainer) throw new NotFoundException('المدرب الجديد غير موجود');

    const trainerOccupancy = await this.capacityService.getTrainerOccupancy(dto.newTrainerId);
    // Only count rotations being moved that aren't already assigned to this trainer
    const netNew = rotations.filter(r => r.trainerProfileId !== dto.newTrainerId).length;
    if (trainerOccupancy.available < netNew) {
      throw new BadRequestException(
        `السعة غير كافية: المدرب ${newTrainer.person.nameAr} لديه ${trainerOccupancy.available} مقاعد متاحة لكنك تحاول نقل ${netNew} متدربين`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const reassignmentTrainees: any[] = [];

      for (const rotation of rotations) {
        if (rotation.trainerProfileId === dto.newTrainerId) continue;

        await tx.rotation.update({
          where: { id: rotation.id },
          data: { trainerProfileId: dto.newTrainerId },
        });

        if (rotation.traineeProfileId) {
          await tx.traineeAllocation.updateMany({
            where: { traineeProfileId: rotation.traineeProfileId, status: 'open' },
            data: { trainerProfileId: dto.newTrainerId },
          });
          await tx.trainingRequestTrainee.updateMany({
            where: { traineeProfileId: rotation.traineeProfileId },
            data: { assignedTrainerProfileId: dto.newTrainerId },
          });
        }

        reassignmentTrainees.push({
          traineeProfileId: rotation.traineeProfileId,
          rotationId: rotation.id,
          previousTrainerId: rotation.trainerProfileId,
          newTrainerId: dto.newTrainerId,
        });
      }

      const departmentId = rotations[0].departmentId;

      const reassignment = await tx.trainerReassignment.create({
        data: {
          organizationId,
          reassignmentType: 'multiple',
          reason: dto.reason,
          previousTrainerId: rotations[0].trainerProfileId,
          newTrainerId: dto.newTrainerId,
          departmentId,
          trainerLeaveId: dto.trainerLeaveId || null,
          effectiveDate: new Date(),
          notes: dto.notes || null,
          approvedById: actorId,
          createdById: actorId,
          trainees: { create: reassignmentTrainees },
        },
        include: { trainees: true },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: 'trainer_reassignment_bulk',
          entityType: 'TrainerReassignment',
          entityId: reassignment.id,
          oldValues: { traineeCount: reassignmentTrainees.length, reason: dto.reason },
          newValues: { newTrainerId: dto.newTrainerId, newTrainerName: newTrainer.person.nameAr },
        },
      });

      return reassignment;
    });

    // Send notifications for each affected trainee
    for (const rotation of rotations) {
      if (rotation.trainerProfileId === dto.newTrainerId) continue;
      try {
        await this.sendReassignmentNotifications({
          organizationId,
          previousTrainerId: rotation.trainerProfileId,
          previousTrainerName: rotation.trainerProfile.person.nameAr,
          newTrainerId: dto.newTrainerId,
          newTrainerName: newTrainer.person.nameAr,
          traineeName: rotation.traineeProfile.person.nameAr,
          traineeUserId: rotation.traineeProfile.person.userAccounts[0]?.id,
          departmentName: rotation.department.nameAr,
          reason: dto.reason,
        });
      } catch {}
    }

    return {
      success: true,
      message: `تم نقل ${rotations.length} متدرب إلى ${newTrainer.person.nameAr} بنجاح.`,
      data: result,
    };
  }

  /**
   * Reassign ALL active rotations from one trainer to another.
   */
  async reassignEntireTrainer(dto: ReassignEntireTrainerDto, actorId: string, organizationId: string) {
    const rotations = await this.prisma.rotation.findMany({
      where: {
        trainerProfileId: dto.fromTrainerId,
        status: 'active',
        organizationId,
      },
      select: { traineeProfileId: true },
    });

    if (rotations.length === 0) {
      throw new NotFoundException('لا يوجد متدربون مسندون لهذا المدرب حالياً');
    }

    return this.reassignMultiple(
      {
        traineeProfileIds: rotations.map(r => r.traineeProfileId),
        newTrainerId: dto.toTrainerId,
        reason: dto.reason,
        notes: dto.notes,
        trainerLeaveId: dto.trainerLeaveId,
      },
      actorId,
      organizationId,
    );
  }

  /**
   * Reassign all active rotations in a department to a new trainer.
   */
  async reassignEntireDepartment(dto: ReassignEntireDepartmentDto, actorId: string, organizationId: string) {
    const where: any = {
      departmentId: dto.departmentId,
      status: 'active',
      organizationId,
    };
    if (dto.fromTrainerId) where.trainerProfileId = dto.fromTrainerId;

    const rotations = await this.prisma.rotation.findMany({
      where,
      select: { traineeProfileId: true },
    });

    if (rotations.length === 0) {
      throw new NotFoundException('لا توجد روتيشنات نشطة في هذا القسم');
    }

    return this.reassignMultiple(
      {
        traineeProfileIds: rotations.map(r => r.traineeProfileId),
        newTrainerId: dto.toTrainerId,
        reason: dto.reason,
        notes: dto.notes,
      },
      actorId,
      organizationId,
    );
  }

  /**
   * Returns qualified replacement trainers ranked by available capacity.
   */
  async suggestReplacements(trainerProfileId: string) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id: trainerProfileId },
      include: { department: true },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');

    const candidates = await this.prisma.trainerProfile.findMany({
      where: {
        organizationId: trainer.organizationId,
        departmentId: trainer.departmentId,
        isActive: true,
        id: { not: trainerProfileId },
      },
      include: {
        person: true,
        department: true,
        _count: { select: { rotations: { where: { status: 'active' } } } },
      },
    });

    const ranked = candidates
      .map(c => ({
        id: c.id,
        nameAr: c.person.nameAr,
        nameEn: c.person.nameEn,
        departmentName: c.department?.nameAr || '',
        maxTrainees: c.maxTrainees,
        activeTrainees: c._count.rotations,
        available: Math.max(0, c.maxTrainees - c._count.rotations),
        specialization: c.specialization,
      }))
      .filter(c => c.available > 0)
      .sort((a, b) => b.available - a.available);

    return { data: ranked };
  }

  /**
   * Query reassignment history with filters.
   */
  async getReassignmentHistory(filters: {
    organizationId?: string;
    trainerProfileId?: string;
    departmentId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.trainerProfileId) {
      where.OR = [
        { previousTrainerId: filters.trainerProfileId },
        { newTrainerId: filters.trainerProfileId },
      ];
    }
    if (filters.departmentId) where.departmentId = filters.departmentId;

    const [total, data] = await Promise.all([
      this.prisma.trainerReassignment.count({ where }),
      this.prisma.trainerReassignment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          previousTrainer: { include: { person: true } },
          newTrainer: { include: { person: true } },
          department: true,
          trainerLeave: true,
          trainees: {
            include: {
              traineeProfile: { include: { person: true } },
            },
          },
        },
      }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Sends notifications to all 6 stakeholder groups.
   */
  private async sendReassignmentNotifications(params: {
    organizationId: string;
    previousTrainerId: string;
    previousTrainerName: string;
    newTrainerId: string;
    newTrainerName: string;
    traineeName: string;
    traineeUserId?: string;
    departmentName: string;
    reason: string;
  }) {
    try {
      // 1. Notify new trainer
      const newTrainerPerson = await this.prisma.trainerProfile.findUnique({
        where: { id: params.newTrainerId },
        include: { person: { include: { userAccounts: true } } },
      });
      if (newTrainerPerson?.person.userAccounts[0]?.id) {
        await this.notificationService.create({
          organizationId: params.organizationId,
          userId: newTrainerPerson.person.userAccounts[0].id,
          titleAr: 'تم إسناد متدرب جديد إليك',
          bodyAr: `تم إسناد المتدرب ${params.traineeName} إليك في قسم ${params.departmentName}${reasonSuffix(params.reason)}`,
          type: 'trainer_reassignment',
          referenceType: 'TrainerProfile',
          referenceId: params.newTrainerId,
        });
      }

      // 2. Notify previous trainer
      const prevTrainerPerson = await this.prisma.trainerProfile.findUnique({
        where: { id: params.previousTrainerId },
        include: { person: { include: { userAccounts: true } } },
      });
      if (prevTrainerPerson?.person.userAccounts[0]?.id) {
        await this.notificationService.create({
          organizationId: params.organizationId,
          userId: prevTrainerPerson.person.userAccounts[0].id,
          titleAr: 'تم نقل متدرب من إشرافك',
          bodyAr: `تم نقل المتدرب ${params.traineeName} من إشرافك إلى ${params.newTrainerName}${reasonSuffix(params.reason)}`,
          type: 'trainer_reassignment',
          referenceType: 'TrainerProfile',
          referenceId: params.previousTrainerId,
        });
      }

      // 3. Notify trainee
      if (params.traineeUserId) {
        await this.notificationService.create({
          organizationId: params.organizationId,
          userId: params.traineeUserId,
          titleAr: 'تم تحديث المدرب المشرف على تدريبك',
          bodyAr: `المدرب الجديد: ${params.newTrainerName} — القسم: ${params.departmentName}`,
          type: 'trainer_reassignment',
          referenceType: 'TrainerProfile',
          referenceId: params.newTrainerId,
        });
      }

      // 4. Notify the hospital training management
      await this.notificationService.notifyOrgUsers(
        params.organizationId,
        'hospital_training_admin',
        {
          titleAr: 'تم تنفيذ إعادة إسناد مدرب',
          bodyAr: `تم نقل ${params.traineeName} من ${params.previousTrainerName} إلى ${params.newTrainerName}${reasonSuffix(params.reason)}`,
          type: 'trainer_reassignment',
          referenceType: 'TrainerReassignment',
        },
      );
    } catch (err) {
      // Notifications must never block or rollback the reassignment
      console.warn('فشل إرسال بعض إشعارات إعادة الإسناد:', err);
    }
  }
}
