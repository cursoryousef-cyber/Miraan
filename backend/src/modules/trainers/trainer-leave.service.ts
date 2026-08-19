import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { TrainerReassignmentService } from './trainer-reassignment.service';

export interface CreateTrainerLeaveDto {
  trainerProfileId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason?: string;
  replacementTrainerId?: string;
}

const VALID_LEAVE_TYPES = [
  'annual_leave', 'emergency_leave', 'sick_leave', 'maternity_leave',
  'training_course', 'conference', 'temporary_assignment',
  'transfer', 'retirement', 'resignation',
];

@Injectable()
export class TrainerLeaveService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private reassignmentService: TrainerReassignmentService,
  ) {}

  /**
   * Create a trainer leave record. If the hospital has auto_reassign_on_leave
   * enabled and a replacement trainer is specified, automatically triggers
   * the full reassignment workflow.
   */
  async createLeave(dto: CreateTrainerLeaveDto, actorId: string, organizationId: string) {
    if (!VALID_LEAVE_TYPES.includes(dto.leaveType)) {
      throw new BadRequestException(`نوع إجازة غير صالح: ${dto.leaveType}`);
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) {
      throw new BadRequestException('تاريخ نهاية الإجازة يجب أن يكون بعد تاريخ البداية');
    }

    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id: dto.trainerProfileId },
      include: { person: true, organization: true },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');

    // Check for overlapping leaves
    const overlap = await this.prisma.trainerLeave.findFirst({
      where: {
        trainerProfileId: dto.trainerProfileId,
        status: { in: ['pending', 'approved', 'active'] },
        OR: [
          { startDate: { lte: endDate }, endDate: { gte: startDate } },
        ],
      },
    });
    if (overlap) {
      throw new BadRequestException('توجد إجازة متداخلة مع الفترة المحددة');
    }

    // Validate replacement trainer if specified
    if (dto.replacementTrainerId) {
      const replacement = await this.prisma.trainerProfile.findUnique({
        where: { id: dto.replacementTrainerId },
      });
      if (!replacement) throw new NotFoundException('المدرب البديل غير موجود');
      if (!replacement.isActive) throw new BadRequestException('المدرب البديل غير نشط');
      if (replacement.organizationId !== trainer.organizationId) {
        throw new BadRequestException('المدرب البديل يجب أن يكون في نفس المستشفى');
      }
    }

    const leave = await this.prisma.trainerLeave.create({
      data: {
        trainerProfileId: dto.trainerProfileId,
        organizationId,
        leaveType: dto.leaveType,
        startDate,
        endDate,
        reason: dto.reason || null,
        replacementTrainerId: dto.replacementTrainerId || null,
        createdById: actorId,
      },
      include: {
        trainerProfile: { include: { person: true } },
        replacementTrainer: { include: { person: true } },
      },
    });

    // Check auto-reassign hospital policy
    const autoReassignSetting = await this.prisma.setting.findFirst({
      where: { organizationId, key: 'auto_reassign_on_leave' },
    });
    const autoReassign = autoReassignSetting?.value === true || (autoReassignSetting?.value as any)?.enabled === true;

    if (autoReassign && dto.replacementTrainerId) {
      try {
        await this.reassignmentService.reassignEntireTrainer(
          {
            fromTrainerId: dto.trainerProfileId,
            toTrainerId: dto.replacementTrainerId,
            reason: dto.leaveType,
            notes: `إعادة إسناد تلقائية بسبب إجازة: ${dto.reason || dto.leaveType}`,
            trainerLeaveId: leave.id,
          },
          actorId,
          organizationId,
        );

        await this.prisma.trainerLeave.update({
          where: { id: leave.id },
          data: { autoReassigned: true, status: 'approved', approvedById: actorId, approvedAt: new Date() },
        });
      } catch (err) {
        console.warn('فشل الإسناد التلقائي:', err);
      }
    }

    // Notify the hospital training management about the leave
    try {
      await this.notificationService.notifyOrgUsers(organizationId, 'hospital_training_admin', {
        titleAr: 'طلب إجازة مدرب جديد',
        bodyAr: `المدرب ${trainer.person.nameAr} يطلب إجازة (${dto.leaveType}) من ${dto.startDate} إلى ${dto.endDate}`,
        type: 'trainer_leave_request',
        referenceType: 'TrainerLeave',
        referenceId: leave.id,
      });
    } catch {}

    return {
      success: true,
      message: `تم تسجيل الإجازة للمدرب ${trainer.person.nameAr}${autoReassign && dto.replacementTrainerId ? ' مع إعادة إسناد تلقائية' : ''}`,
      data: leave,
    };
  }

  /**
   * Approve a pending leave request.
   */
  async approveLeave(leaveId: string, actorId: string, organizationId: string) {
    const leave = await this.prisma.trainerLeave.findUnique({
      where: { id: leaveId },
      include: { trainerProfile: { include: { person: true } } },
    });
    if (!leave) throw new NotFoundException('الإجازة غير موجودة');
    if (leave.organizationId !== organizationId) throw new ForbiddenException('هذه الإجازة خارج نطاق صلاحياتك التنظيمية');
    if (leave.status !== 'pending') throw new BadRequestException('لا يمكن الموافقة إلا على الإجازات المعلقة');

    const updated = await this.prisma.trainerLeave.update({
      where: { id: leaveId },
      data: {
        status: 'approved',
        approvedById: actorId,
        approvedAt: new Date(),
      },
      include: {
        trainerProfile: { include: { person: true } },
        replacementTrainer: { include: { person: true } },
      },
    });

    // If replacement trainer is set and no auto-reassignment happened, trigger now
    if (updated.replacementTrainerId && !updated.autoReassigned) {
      try {
        await this.reassignmentService.reassignEntireTrainer(
          {
            fromTrainerId: updated.trainerProfileId,
            toTrainerId: updated.replacementTrainerId,
            reason: updated.leaveType,
            notes: `إعادة إسناد بعد الموافقة على الإجازة: ${updated.reason || updated.leaveType}`,
            trainerLeaveId: leaveId,
          },
          actorId,
          organizationId,
        );

        await this.prisma.trainerLeave.update({
          where: { id: leaveId },
          data: { autoReassigned: true },
        });
      } catch (err) {
        console.warn('فشل الإسناد بعد الموافقة:', err);
      }
    }

    // Notify trainer of approval
    try {
      const trainerAccounts = await this.prisma.userAccount.findMany({
        where: { personId: leave.trainerProfile.personId },
      });
      for (const acc of trainerAccounts) {
        await this.notificationService.create({
          organizationId,
          userId: acc.id,
          titleAr: 'تمت الموافقة على إجازتك',
          bodyAr: `تمت الموافقة على إجازتك من ${leave.startDate.toISOString().split('T')[0]} إلى ${leave.endDate.toISOString().split('T')[0]}`,
          type: 'trainer_leave_approved',
          referenceType: 'TrainerLeave',
          referenceId: leaveId,
        });
      }
    } catch {}

    return {
      success: true,
      message: `تمت الموافقة على إجازة ${leave.trainerProfile.person.nameAr}`,
      data: updated,
    };
  }

  /**
   * Cancel a leave.
   */
  async cancelLeave(leaveId: string, actorId: string, organizationId: string) {
    const leave = await this.prisma.trainerLeave.findUnique({
      where: { id: leaveId },
      include: { trainerProfile: { include: { person: true } } },
    });
    if (!leave) throw new NotFoundException('الإجازة غير موجودة');
    if (leave.organizationId !== organizationId) throw new ForbiddenException('هذه الإجازة خارج نطاق صلاحياتك التنظيمية');
    if (leave.status === 'completed' || leave.status === 'cancelled') {
      throw new BadRequestException('لا يمكن إلغاء هذه الإجازة');
    }

    const updated = await this.prisma.trainerLeave.update({
      where: { id: leaveId },
      data: { status: 'cancelled' },
      include: { trainerProfile: { include: { person: true } } },
    });

    return {
      success: true,
      message: `تم إلغاء إجازة ${leave.trainerProfile.person.nameAr}`,
      data: updated,
    };
  }

  /**
   * Get all leaves for a hospital.
   */
  async getLeaves(organizationId: string, status?: string) {
    const where: any = { organizationId };
    if (status) where.status = status;

    const leaves = await this.prisma.trainerLeave.findMany({
      where,
      orderBy: { startDate: 'desc' },
      include: {
        trainerProfile: { include: { person: true, department: true } },
        replacementTrainer: { include: { person: true } },
      },
    });

    return { data: leaves };
  }

  /**
   * Get upcoming leaves for a hospital (starting within N days).
   */
  async getUpcomingLeaves(organizationId: string, days = 30) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const leaves = await this.prisma.trainerLeave.findMany({
      where: {
        organizationId,
        status: { in: ['pending', 'approved'] },
        startDate: { lte: futureDate, gte: new Date() },
      },
      orderBy: { startDate: 'asc' },
      include: {
        trainerProfile: {
          include: {
            person: true,
            department: true,
            _count: { select: { rotations: { where: { status: 'active' } } } },
          },
        },
        replacementTrainer: { include: { person: true } },
      },
    });

    return { data: leaves };
  }
}
