import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../../common/interfaces';

/**
 * Trainer qualification — which training programs a trainer may supervise.
 *
 * This is the relational replacement for the free-text `specialization` field.
 * The allocation engine treats it as a hard constraint, so removing a
 * qualification a trainer is actively using is refused rather than silently
 * stranding trainees.
 */
@Injectable()
export class TrainerQualificationService {
  constructor(private prisma: PrismaService) {}

  /** Programs a trainer is qualified for, with their per-program load. */
  async listForTrainer(trainerProfileId: string) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id: trainerProfileId },
      select: { id: true, organizationId: true, maxTrainees: true },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');

    const quals = await this.prisma.trainerProgram.findMany({
      where: { trainerProfileId },
      include: { program: { select: { id: true, code: true, nameAr: true, nameEn: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const data = await Promise.all(
      quals.map(async (q) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [rotations, allocations, stagingRows] = await Promise.all([
          this.prisma.rotation.findMany({
            where: { trainerProfileId, programId: q.programId, status: { in: ['active', 'pending_acceptance', 'scheduled'] } },
            select: { id: true, traineeProfileId: true },
          }),
          this.prisma.traineeAllocation.findMany({
            where: { trainerProfileId, status: 'open', OR: [{ endDate: null }, { endDate: { gte: today } }] },
            select: { id: true, traineeRowId: true, traineeProfileId: true },
          }),
          this.prisma.trainingRequestTrainee.findMany({
            where: { assignedTrainerProfileId: trainerProfileId, status: { in: ['allocated', 'hospital_review', 'on_hold', 'accepted', 'active'] }, trainingRequest: { programId: q.programId } },
            select: { id: true, traineeProfileId: true },
          }),
        ]);

        const occupants = new Set<string>([
          ...rotations.map((r) => r.traineeProfileId ? `profile:${r.traineeProfileId}` : `rot:${r.id}`),
          ...allocations.map((a) => a.traineeProfileId ? `profile:${a.traineeProfileId}` : `row:${a.traineeRowId}`),
          ...stagingRows.map((s) => s.traineeProfileId ? `profile:${s.traineeProfileId}` : `row:${s.id}`),
        ]);

        const occupied = occupants.size;
        const capacity = q.maxTrainees ?? trainer.maxTrainees;
        return {
          id: q.id,
          programId: q.programId,
          program: q.program,
          isActive: q.isActive,
          capacity,
          occupied,
          available: Math.max(0, capacity - occupied),
        };
      }),
    );
    return { data };
  }

  /** Trainers in an organization qualified for a program. */
  async listQualifiedTrainers(organizationId: string, programId: string) {
    const data = await this.prisma.trainerProgram.findMany({
      where: {
        programId,
        isActive: true,
        trainerProfile: { organizationId, isActive: true },
      },
      include: {
        trainerProfile: {
          include: {
            person: { select: { nameAr: true, nameEn: true } },
            department: { select: { id: true, nameAr: true } },
          },
        },
      },
    });
    return { data };
  }

  /**
   * Every trainer in a hospital as a workspace card: qualification, capacity,
   * occupancy, current trainees and leave state.
   *
   * Purely an aggregation of records the individual endpoints already expose —
   * it exists so the workspace renders one call instead of four per trainer.
   * Batched throughout: a hospital with 200 trainers still costs a fixed number
   * of queries.
   */
  async listWorkspaceCards(organizationId: string) {
    const trainers = await this.prisma.trainerProfile.findMany({
      where: { organizationId },
      include: {
        person: { select: { nameAr: true, nameEn: true, phone: true, email: true, nationalId: true } },
        department: { select: { id: true, nameAr: true, code: true } },
        qualifiedPrograms: {
          where: { isActive: true },
          include: { program: { select: { id: true, code: true, nameAr: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (trainers.length === 0) return { data: [] };

    const ids = trainers.map((t) => t.id);
    const today = new Date();

    const [rotations, allocations, stagingRows, leaves] = await Promise.all([
      this.prisma.rotation.findMany({
        where: { trainerProfileId: { in: ids }, status: { in: ['active', 'pending_acceptance', 'scheduled'] } },
        select: {
          id: true,
          trainerProfileId: true,
          status: true,
          startDate: true,
          endDate: true,
          traineeProfileId: true,
          department: { select: { nameAr: true } },
          traineeProfile: {
            select: { id: true, traineeNumber: true, person: { select: { nameAr: true } } },
          },
        },
      }),
      this.prisma.traineeAllocation.findMany({
        where: {
          trainerProfileId: { in: ids },
          status: 'open',
          OR: [{ endDate: null }, { endDate: { gte: today } }],
        },
        select: {
          id: true,
          trainerProfileId: true,
          status: true,
          startDate: true,
          endDate: true,
          traineeRowId: true,
          traineeProfileId: true,
          department: { select: { nameAr: true } },
          traineeRow: {
            select: {
              id: true,
              academicNumber: true,
              nameAr: true,
              traineeProfile: {
                select: { id: true, traineeNumber: true, person: { select: { nameAr: true } } },
              },
            },
          },
        },
      }),
      this.prisma.trainingRequestTrainee.findMany({
        where: {
          assignedTrainerProfileId: { in: ids },
          status: { in: ['allocated', 'hospital_review', 'on_hold', 'accepted', 'active'] },
          OR: [{ endDate: null }, { endDate: { gte: today } }],
        },
        select: {
          id: true,
          assignedTrainerProfileId: true,
          status: true,
          startDate: true,
          endDate: true,
          academicNumber: true,
          nameAr: true,
          traineeProfileId: true,
          assignedDepartment: { select: { nameAr: true } },
          person: { select: { nameAr: true } },
          traineeProfile: {
            select: { id: true, traineeNumber: true, person: { select: { nameAr: true } } },
          },
        },
      }),
      // The leave that is in force now, if any.
      this.prisma.trainerLeave.findMany({
        where: {
          trainerProfileId: { in: ids },
          status: { in: ['approved', 'active'] },
          startDate: { lte: today },
          endDate: { gte: today },
        },
        include: {
          replacementTrainer: { include: { person: { select: { nameAr: true } } } },
        },
      }),
    ]);

    const rotationsByTrainer = new Map<string, typeof rotations>();
    for (const r of rotations) {
      if (!r.trainerProfileId) continue;
      const list = rotationsByTrainer.get(r.trainerProfileId) ?? [];
      list.push(r);
      rotationsByTrainer.set(r.trainerProfileId, list);
    }

    const allocationsByTrainer = new Map<string, typeof allocations>();
    for (const a of allocations) {
      if (!a.trainerProfileId) continue;
      const list = allocationsByTrainer.get(a.trainerProfileId) ?? [];
      list.push(a);
      allocationsByTrainer.set(a.trainerProfileId, list);
    }

    const stagingByTrainer = new Map<string, typeof stagingRows>();
    for (const s of stagingRows) {
      if (!s.assignedTrainerProfileId) continue;
      const list = stagingByTrainer.get(s.assignedTrainerProfileId) ?? [];
      list.push(s);
      stagingByTrainer.set(s.assignedTrainerProfileId, list);
    }

    const leaveByTrainer = new Map(leaves.map((l) => [l.trainerProfileId, l]));

    const data = trainers.map((t) => {
      const myRotations = rotationsByTrainer.get(t.id) ?? [];
      const myAllocations = allocationsByTrainer.get(t.id) ?? [];
      const myStaging = stagingByTrainer.get(t.id) ?? [];
      const leave = leaveByTrainer.get(t.id);

      const traineesMap = new Map<string, {
        rotationId: string;
        traineeProfileId: string | null;
        nameAr: string | null;
        traineeNumber: string | null;
        departmentNameAr: string | null;
        startDate: Date | null;
        endDate: Date | null;
      }>();

      for (const r of myRotations) {
        const key = r.traineeProfileId ? `profile:${r.traineeProfileId}` : `rotation:${r.id}`;
        traineesMap.set(key, {
          rotationId: r.id,
          traineeProfileId: r.traineeProfile?.id ?? r.traineeProfileId ?? null,
          nameAr: r.traineeProfile?.person?.nameAr ?? null,
          traineeNumber: r.traineeProfile?.traineeNumber ?? null,
          departmentNameAr: r.department?.nameAr ?? null,
          startDate: r.startDate ?? null,
          endDate: r.endDate ?? null,
        });
      }

      for (const a of myAllocations) {
        const key = a.traineeProfileId ? `profile:${a.traineeProfileId}` : `row:${a.traineeRowId}`;
        if (!traineesMap.has(key)) {
          traineesMap.set(key, {
            rotationId: a.id,
            traineeProfileId: a.traineeRow?.traineeProfile?.id ?? a.traineeProfileId ?? null,
            nameAr: a.traineeRow?.traineeProfile?.person?.nameAr ?? a.traineeRow?.nameAr ?? null,
            traineeNumber: a.traineeRow?.traineeProfile?.traineeNumber ?? a.traineeRow?.academicNumber ?? null,
            departmentNameAr: a.department?.nameAr ?? null,
            startDate: a.startDate ?? null,
            endDate: a.endDate ?? null,
          });
        }
      }

      for (const s of myStaging) {
        const key = s.traineeProfileId ? `profile:${s.traineeProfileId}` : `row:${s.id}`;
        if (!traineesMap.has(key)) {
          traineesMap.set(key, {
            rotationId: s.id,
            traineeProfileId: s.traineeProfile?.id ?? s.traineeProfileId ?? null,
            nameAr: s.traineeProfile?.person?.nameAr ?? s.nameAr ?? s.person?.nameAr ?? null,
            traineeNumber: s.traineeProfile?.traineeNumber ?? s.academicNumber ?? null,
            departmentNameAr: s.assignedDepartment?.nameAr ?? null,
            startDate: s.startDate ?? null,
            endDate: s.endDate ?? null,
          });
        }
      }

      const currentTraineesList = Array.from(traineesMap.values());
      const occupied = currentTraineesList.length;
      const available = Math.max(0, t.maxTrainees - occupied);
      const occupancyPercentage = t.maxTrainees > 0 ? Math.min(100, Math.round((occupied / t.maxTrainees) * 100)) : 0;

      return {
        id: t.id,
        isActive: t.isActive,
        nationalId: t.person.nationalId,
        nameAr: t.person.nameAr,
        nameEn: t.person.nameEn,
        titleAr: t.titleAr,
        phone: t.person.phone,
        email: t.person.email,
        department: t.department,
        qualifiedPrograms: t.qualifiedPrograms.map((q) => ({
          id: q.program.id,
          code: q.program.code,
          nameAr: q.program.nameAr,
          maxTrainees: q.maxTrainees,
        })),
        maxTrainees: t.maxTrainees,
        occupied,
        available,
        occupancyPercentage,
        rotationCount: currentTraineesList.length,
        currentTrainees: currentTraineesList,
        leave: leave
          ? {
              id: leave.id,
              leaveType: leave.leaveType,
              startDate: leave.startDate,
              endDate: leave.endDate,
              status: leave.status,
              autoReassigned: leave.autoReassigned,
              replacementTrainerNameAr: leave.replacementTrainer?.person?.nameAr ?? null,
            }
          : null,
        onLeave: Boolean(leave),
      };
    });

    return { data };
  }

  async updateTrainerProfile(
    trainerProfileId: string,
    dto: { isActive?: boolean; maxTrainees?: number; departmentId?: string; titleAr?: string },
    user: IAuthenticatedUser,
  ) {
    const trainer = await this.requireTrainerInScope(trainerProfileId, user);

    if (dto.maxTrainees !== undefined) {
      const activeOccupancy = await this.prisma.rotation.count({
        where: { trainerProfileId, status: 'active' },
      });
      if (dto.maxTrainees < activeOccupancy) {
        throw new BadRequestException(
          `لا يمكن تخفيض سعة المدرب إلى ${dto.maxTrainees} — لديه حالياً ${activeOccupancy} متدرب نشط`,
        );
      }
    }

    const updated = await this.prisma.trainerProfile.update({
      where: { id: trainerProfileId },
      data: {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.maxTrainees !== undefined ? { maxTrainees: dto.maxTrainees } : {}),
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
        ...(dto.titleAr !== undefined ? { titleAr: dto.titleAr } : {}),
        updatedById: user.accountId,
      },
      include: {
        person: { select: { nameAr: true, nameEn: true, phone: true, email: true, nationalId: true } },
        department: { select: { id: true, nameAr: true, code: true } },
      },
    });

    await this.audit(user, trainer.organizationId, 'update_trainer_profile', trainerProfileId, null, dto);

    return { data: updated, success: true, message: 'تم تحديث بيانات وأهلية المدرب بنجاح' };
  }

  async addQualification(
    trainerProfileId: string,
    dto: { programId: string; maxTrainees?: number },
    user: IAuthenticatedUser,
  ) {
    const trainer = await this.requireTrainerInScope(trainerProfileId, user);

    const program = await this.prisma.program.findFirst({
      where: { id: dto.programId, deletedAt: null, isActive: true },
      select: { id: true, nameAr: true },
    });
    if (!program) throw new NotFoundException('البرنامج التدريبي غير موجود في الكتالوج');

    const existing = await this.prisma.trainerProgram.findUnique({
      where: { trainerProfileId_programId: { trainerProfileId, programId: dto.programId } },
    });

    // Re-activating a previously removed qualification must not fail as a duplicate.
    const record = existing
      ? await this.prisma.trainerProgram.update({
          where: { id: existing.id },
          data: { isActive: true, maxTrainees: dto.maxTrainees ?? existing.maxTrainees, updatedById: user.accountId },
        })
      : await this.prisma.trainerProgram.create({
          data: {
            trainerProfileId,
            programId: dto.programId,
            maxTrainees: dto.maxTrainees,
            createdById: user.accountId,
          },
        });

    await this.audit(user, trainer.organizationId, 'add_trainer_qualification', record.id, null, {
      trainerProfileId,
      programId: dto.programId,
      programName: program.nameAr,
      maxTrainees: dto.maxTrainees ?? null,
    });

    return { data: record, success: true, message: `تم تأهيل المدرب لبرنامج ${program.nameAr}` };
  }

  async updateQualification(
    qualificationId: string,
    dto: { maxTrainees?: number; isActive?: boolean },
    user: IAuthenticatedUser,
  ) {
    const record = await this.prisma.trainerProgram.findUnique({
      where: { id: qualificationId },
      include: { program: { select: { nameAr: true } } },
    });
    if (!record) throw new NotFoundException('التأهيل غير موجود');
    const trainer = await this.requireTrainerInScope(record.trainerProfileId, user);

    // Deactivating, or cutting the cap, must not strand trainees already placed.
    if (dto.isActive === false || dto.maxTrainees !== undefined) {
      const active = await this.prisma.rotation.count({
        where: { trainerProfileId: record.trainerProfileId, programId: record.programId, status: 'active' },
      });
      if (dto.isActive === false && active > 0) {
        throw new BadRequestException(
          `لا يمكن إلغاء التأهيل — لدى المدرب حالياً ${active} روتيشن نشط في هذا البرنامج`,
        );
      }
      if (dto.maxTrainees !== undefined && dto.maxTrainees < active) {
        throw new BadRequestException(
          `لا يمكن ضبط السعة على ${dto.maxTrainees} — لدى المدرب حالياً ${active} روتيشن نشط في هذا البرنامج`,
        );
      }
    }

    const updated = await this.prisma.trainerProgram.update({
      where: { id: qualificationId },
      data: {
        ...(dto.maxTrainees !== undefined ? { maxTrainees: dto.maxTrainees } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedById: user.accountId,
      },
    });

    await this.audit(
      user, trainer.organizationId, 'update_trainer_qualification', qualificationId,
      { maxTrainees: record.maxTrainees, isActive: record.isActive },
      { maxTrainees: updated.maxTrainees, isActive: updated.isActive },
    );

    return { data: updated, success: true, message: 'تم تحديث تأهيل المدرب' };
  }

  async removeQualification(qualificationId: string, user: IAuthenticatedUser) {
    const record = await this.prisma.trainerProgram.findUnique({ where: { id: qualificationId } });
    if (!record) throw new NotFoundException('التأهيل غير موجود');
    const trainer = await this.requireTrainerInScope(record.trainerProfileId, user);

    const active = await this.prisma.rotation.count({
      where: { trainerProfileId: record.trainerProfileId, programId: record.programId, status: 'active' },
    });
    if (active > 0) {
      throw new BadRequestException(
        `لا يمكن حذف التأهيل — لدى المدرب حالياً ${active} روتيشن نشط في هذا البرنامج`,
      );
    }

    await this.prisma.trainerProgram.delete({ where: { id: qualificationId } });
    await this.audit(user, trainer.organizationId, 'remove_trainer_qualification', qualificationId, record, null);

    return { success: true, message: 'تم حذف تأهيل المدرب' };
  }

  private async requireTrainerInScope(trainerProfileId: string, user: IAuthenticatedUser) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id: trainerProfileId },
      select: { id: true, organizationId: true },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');

    const isPlatform = user.roles?.some((r) => ['platform_owner', 'system_admin'].includes(r));
    if (!isPlatform && trainer.organizationId !== user.organizationId) {
      throw new ForbiddenException('لا يمكنك إدارة مدربي جهة أخرى');
    }
    return trainer;
  }

  private async audit(
    user: IAuthenticatedUser,
    organizationId: string,
    action: string,
    entityId: string,
    oldValues: unknown,
    newValues: unknown,
  ) {
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorId: user.accountId,
        action,
        entityType: 'TrainerProgram',
        entityId,
        oldValues: (oldValues ?? undefined) as object | undefined,
        newValues: (newValues ?? undefined) as object | undefined,
      },
    });
  }
}
