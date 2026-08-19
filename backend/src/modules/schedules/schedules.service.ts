import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ConflictEngineService, ProposedSession } from './conflict-engine.service';
import { IAuthenticatedUser } from '../../common/interfaces';

export interface CreateScheduleDto {
  titleAr: string;
  titleEn?: string;
  departmentId?: string;
  traineeProfileIds: string[];
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  notes?: string;
  sessions?: Array<{
    date: string;
    startTime: string;
    endTime: string;
    departmentId: string;
    trainerProfileId?: string;
    traineeProfileId?: string;
    sessionType?: string;
    shiftType?: string;
    location?: string;
    capacity?: number;
    notes?: string;
  }>;
}

export interface UpdateScheduleDto {
  titleAr?: string;
  titleEn?: string;
  departmentId?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  status?: string;
  sessions?: Array<{
    id?: string;
    date: string;
    startTime: string;
    endTime: string;
    departmentId: string;
    trainerProfileId?: string;
    traineeProfileId?: string;
    sessionType?: string;
    shiftType?: string;
    location?: string;
    capacity?: number;
    notes?: string;
  }>;
}

@Injectable()
export class SchedulesService {
  constructor(
    private prisma: PrismaService,
    private conflictEngine: ConflictEngineService,
  ) {}

  /**
   * Find schedules scoped to the user's hospital organization.
   * Trainers only see schedules for their assigned trainees or schedules they created.
   * Trainees only see schedules where they are participants.
   */
  async findAll(user: IAuthenticatedUser, query?: { status?: string; traineeId?: string; departmentId?: string }) {
    const orgId = user.organizationId;
    const isTrainee = user.roles.includes('trainee');
    const isTrainer = user.roles.includes('trainer') && !user.roles.some((r) => ['hospital_training_admin', 'org_manager', 'platform_owner'].includes(r));

    let whereClause: any = { organizationId: orgId };

    if (query?.status) whereClause.status = query.status;
    if (query?.departmentId) whereClause.departmentId = query.departmentId;

    if (isTrainee) {
      const traineeProfile = await this.prisma.traineeProfile.findFirst({
        where: { person: { userAccounts: { some: { id: user.accountId } } } },
      });
      if (!traineeProfile) return { data: [] };
      // A trainee may only ever ask about themselves. The `traineeId` filter
      // applied further down replaces `participants` wholesale, so without this
      // a trainee passing someone else's id had their own scoping overwritten
      // and read that trainee's published schedules. Same rule the attendance
      // endpoint already enforces for the same query parameter.
      if (query?.traineeId && query.traineeId !== traineeProfile.id) {
        throw new ForbiddenException('لا يمكنك الاطلاع على جدول متدرب آخر');
      }
      whereClause.participants = { some: { traineeProfileId: traineeProfile.id } };
      whereClause.status = 'published'; // Trainees only see published schedules
    } else if (isTrainer) {
      const trainer = await this.prisma.trainerProfile.findFirst({
        where: { person: { userAccounts: { some: { id: user.accountId } } } },
      });
      if (!trainer) return { data: [] };
      whereClause.OR = [
        { createdById: user.accountId },
        { sessions: { some: { trainerProfileId: trainer.id } } },
      ];
    }

    if (query?.traineeId) {
      whereClause.participants = { some: { traineeProfileId: query.traineeId } };
    }

    const schedules = await this.prisma.trainingSchedule.findMany({
      where: whereClause,
      include: {
        department: true,
        createdBy: { select: { id: true, person: { select: { nameAr: true, email: true } } } },
        participants: { include: { traineeProfile: { include: { person: true } } } },
        sessions: {
          include: {
            department: true,
            trainerProfile: { include: { person: true } },
            traineeProfile: { include: { person: true } },
          },
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        },
        revisions: { orderBy: { revision: 'desc' }, take: 1 },
      },
      orderBy: { startDate: 'desc' },
    });

    return { data: schedules };
  }

  async findOne(id: string, user: IAuthenticatedUser) {
    const schedule = await this.prisma.trainingSchedule.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        department: true,
        createdBy: { select: { id: true, person: { select: { nameAr: true, email: true } } } },
        participants: { include: { traineeProfile: { include: { person: true } } } },
        sessions: {
          include: {
            department: true,
            trainerProfile: { include: { person: true } },
            traineeProfile: { include: { person: true } },
          },
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        },
        revisions: { orderBy: { revision: 'desc' } },
      },
    });

    if (!schedule) throw new NotFoundException('الجدول التدريبي غير موجود');
    return { data: schedule };
  }

  /**
   * Wizard & Quick Create Schedule
   */
  /**
   * Every trainee, trainer and department a schedule names must belong to the
   * organisation the schedule belongs to.
   *
   * The schedule row itself was always safe — `organizationId` comes from the
   * authenticated session, never from the body, so no caller can write a row
   * into another hospital. Its *contents* were not: participant and session ids
   * were persisted exactly as sent, so a hospital could fill its own schedule
   * with another hospital's trainees, trainers and departments, and the
   * conflict engine would then reason about staff that hospital does not have.
   * Each id is resolved against the database and counted, so an id that does
   * not exist fails the same way one belonging elsewhere does.
   */
  private async assertScheduleResourcesInOrg(
    orgId: string,
    resources: {
      traineeProfileIds?: string[];
      trainerProfileIds?: (string | undefined)[];
      departmentIds?: (string | undefined)[];
    },
  ): Promise<void> {
    const traineeIds = [...new Set((resources.traineeProfileIds ?? []).filter(Boolean))] as string[];
    const trainerIds = [...new Set((resources.trainerProfileIds ?? []).filter(Boolean))] as string[];
    const departmentIds = [...new Set((resources.departmentIds ?? []).filter(Boolean))] as string[];

    if (traineeIds.length > 0) {
      const count = await this.prisma.traineeProfile.count({
        where: { id: { in: traineeIds }, organizationId: orgId },
      });
      if (count !== traineeIds.length) {
        throw new ForbiddenException('أحد المتدربين المحددين لا يتبع مستشفى الجدول');
      }
    }

    if (trainerIds.length > 0) {
      const count = await this.prisma.trainerProfile.count({
        where: { id: { in: trainerIds }, organizationId: orgId },
      });
      if (count !== trainerIds.length) {
        throw new ForbiddenException('أحد المدربين المحددين لا يتبع مستشفى الجدول');
      }
    }

    if (departmentIds.length > 0) {
      const count = await this.prisma.department.count({
        where: { id: { in: departmentIds }, organizationId: orgId },
      });
      if (count !== departmentIds.length) {
        throw new ForbiddenException('أحد الأقسام المحددة لا يتبع مستشفى الجدول');
      }
    }
  }

  async create(user: IAuthenticatedUser, dto: CreateScheduleDto) {
    const orgId = user.organizationId;

    if (!dto.traineeProfileIds || dto.traineeProfileIds.length === 0) {
      throw new BadRequestException('يجب تحديد متدرب واحد على الأقل للجدول');
    }

    await this.assertScheduleResourcesInOrg(orgId, {
      traineeProfileIds: [
        ...dto.traineeProfileIds,
        ...(dto.sessions ?? []).map((s) => s.traineeProfileId),
      ].filter(Boolean) as string[],
      trainerProfileIds: (dto.sessions ?? []).map((s) => s.trainerProfileId),
      departmentIds: [dto.departmentId, ...(dto.sessions ?? []).map((s) => s.departmentId)],
    });

    // Convert proposed sessions to ConflictEngine format
    const proposed: ProposedSession[] = (dto.sessions || []).map((s) => ({
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      departmentId: s.departmentId || dto.departmentId || '',
      trainerProfileId: s.trainerProfileId,
      traineeProfileIds: s.traineeProfileId ? [s.traineeProfileId] : dto.traineeProfileIds,
      sessionType: s.sessionType,
      shiftType: s.shiftType,
    }));

    // Pre-validate conflicts
    const conflictCheck = await this.conflictEngine.validateSessions(orgId, proposed);
    if (conflictCheck.hasConflict) {
      throw new ConflictException({
        message: 'يوجد تعارض في بيانات الجلسات المحددة',
        conflicts: conflictCheck.conflicts,
      });
    }

    // Calculate total hours
    const totalHours = (dto.sessions || []).reduce((acc, s) => {
      const [h1, m1] = s.startTime.split(':').map(Number);
      const [h2, m2] = s.endTime.split(':').map(Number);
      const diff = (h2 * 60 + m2 - (h1 * 60 + m1)) / 60;
      return acc + (diff > 0 ? diff : 0);
    }, 0);

    const schedule = await this.prisma.$transaction(async (tx) => {
      const sched = await tx.trainingSchedule.create({
        data: {
          organizationId: orgId,
          departmentId: dto.departmentId,
          titleAr: dto.titleAr,
          titleEn: dto.titleEn,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          status: 'draft',
          totalHours: Math.round(totalHours),
          notes: dto.notes,
          createdById: user.accountId,
          participants: {
            create: dto.traineeProfileIds.map((tid) => ({ traineeProfileId: tid })),
          },
        },
      });

      if (dto.sessions && dto.sessions.length > 0) {
        await tx.scheduleSession.createMany({
          data: dto.sessions.map((s) => {
            const [h1, m1] = s.startTime.split(':').map(Number);
            const [h2, m2] = s.endTime.split(':').map(Number);
            const durationHours = Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60);

            return {
              scheduleId: sched.id,
              organizationId: orgId,
              departmentId: s.departmentId || dto.departmentId || '',
              trainerProfileId: s.trainerProfileId,
              traineeProfileId: s.traineeProfileId || dto.traineeProfileIds[0],
              date: new Date(s.date),
              startTime: s.startTime,
              endTime: s.endTime,
              durationHours: new Prisma.Decimal(durationHours),
              sessionType: s.sessionType || 'clinical_round',
              shiftType: s.shiftType || 'morning',
              location: s.location,
              capacity: s.capacity || 1,
              notes: s.notes,
            };
          }),
        });
      }

      return sched;
    });

    return this.findOne(schedule.id, user);
  }

  /**
   * Update Schedule / Drag & Drop Session update
   */
  async update(id: string, user: IAuthenticatedUser, dto: UpdateScheduleDto) {
    const existing = await this.prisma.trainingSchedule.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { participants: true },
    });
    if (!existing) throw new NotFoundException('الجدول التدريبي غير موجود');

    // Replacement session ids get the same treatment as on create: the schedule
    // is already known to be this hospital's, so its sessions must stay inside
    // that hospital too. Checked against the schedule's own organisation.
    await this.assertScheduleResourcesInOrg(existing.organizationId, {
      traineeProfileIds: (dto.sessions ?? [])
        .map((s) => s.traineeProfileId)
        .filter(Boolean) as string[],
      trainerProfileIds: (dto.sessions ?? []).map((s) => s.trainerProfileId),
      departmentIds: (dto.sessions ?? []).map((s) => s.departmentId),
    });

    // If updating sessions, check conflicts
    if (dto.sessions && dto.sessions.length > 0) {
      const proposed: ProposedSession[] = dto.sessions.map((s) => {
        let traineeProfileIds: string[] = [];
        if (s.traineeProfileId) {
          traineeProfileIds = [s.traineeProfileId];
        } else if ((s as any).traineeProfileIds && (s as any).traineeProfileIds.length > 0) {
          traineeProfileIds = (s as any).traineeProfileIds;
        }

        return {
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          departmentId: s.departmentId || existing.departmentId || '',
          trainerProfileId: s.trainerProfileId,
          traineeProfileIds,
          sessionType: s.sessionType,
          shiftType: s.shiftType,
        };
      });

      const conflictCheck = await this.conflictEngine.validateSessions(user.organizationId, proposed, undefined, id);
      if (conflictCheck.hasConflict) {
        throw new ConflictException({
          message: 'تعارض في بيانات الجلسات المحدثة',
          conflicts: conflictCheck.conflicts,
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.trainingSchedule.update({
        where: { id },
        data: {
          titleAr: dto.titleAr,
          titleEn: dto.titleEn,
          departmentId: dto.departmentId,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          status: dto.status,
          notes: dto.notes,
          updatedById: user.accountId,
        },
      });

      if (dto.sessions) {
        // Synchronize participants based on actual active session trainees if provided
        const activeTraineeIds = Array.from(
          new Set(
            dto.sessions
              .flatMap((s) => (s.traineeProfileId ? [s.traineeProfileId] : (s as any).traineeProfileIds || []))
              .filter(Boolean),
          ),
        ) as string[];

        if (activeTraineeIds.length > 0) {
          // Upsert participant records for all active session trainees
          for (const tid of activeTraineeIds) {
            const exists = await tx.scheduleParticipant.findFirst({
              where: { scheduleId: id, traineeProfileId: tid },
            });
            if (!exists) {
              await tx.scheduleParticipant.create({
                data: {
                  scheduleId: id,
                  traineeProfileId: tid,
                },
              });
            }
          }
        }

        // When updating a schedule's sessions from Wizard, delete existing non-id sessions
        const sessionIdsToKeep = dto.sessions.map((s) => s.id).filter(Boolean) as string[];
        await tx.scheduleSession.deleteMany({
          where: {
            scheduleId: id,
            ...(sessionIdsToKeep.length > 0 ? { id: { notIn: sessionIdsToKeep } } : {}),
          },
        });

        // Upsert sessions
        for (const s of dto.sessions) {
          const [h1, m1] = s.startTime.split(':').map(Number);
          const [h2, m2] = s.endTime.split(':').map(Number);
          const durationHours = Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60);

          if (s.id) {
            await tx.scheduleSession.update({
              where: { id: s.id },
              data: {
                date: new Date(s.date),
                startTime: s.startTime,
                endTime: s.endTime,
                departmentId: s.departmentId,
                trainerProfileId: s.trainerProfileId,
                traineeProfileId: s.traineeProfileId,
                sessionType: s.sessionType,
                shiftType: s.shiftType,
                location: s.location,
                durationHours: new Prisma.Decimal(durationHours),
                notes: s.notes,
              },
            });
          } else {
            await tx.scheduleSession.create({
              data: {
                scheduleId: id,
                organizationId: user.organizationId,
                departmentId: s.departmentId || existing.departmentId || '',
                trainerProfileId: s.trainerProfileId,
                traineeProfileId: s.traineeProfileId,
                date: new Date(s.date),
                startTime: s.startTime,
                endTime: s.endTime,
                durationHours: new Prisma.Decimal(durationHours),
                sessionType: s.sessionType || 'clinical_round',
                shiftType: s.shiftType || 'morning',
                location: s.location,
                capacity: s.capacity || 1,
                notes: s.notes,
              },
            });
          }
        }
      }
    });

    return this.findOne(id, user);
  }

  /**
   * Check conflicts endpoint (for Frontend live pre-checking)
   */
  async checkConflicts(user: IAuthenticatedUser, body: { sessions: ProposedSession[]; scheduleId?: string }) {
    return this.conflictEngine.validateSessions(user.organizationId, body.sessions, undefined, body.scheduleId);
  }

  /**
   * Publish Schedule: Transitions to published, creates Revision Snapshot, and generates Shifts / Notifications (Idempotently)
   */
  async publish(id: string, user: IAuthenticatedUser, changeReason?: string) {
    const canPublish = user.roles.some((r) => ['hospital_training_admin', 'org_manager', 'platform_owner'].includes(r));
    if (!canPublish) {
      throw new ForbiddenException('صلاحية النشر النهائي للجدول محصورة لإدارة التدريب بالمستشفى');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const schedule = await tx.trainingSchedule.findFirst({
          where: { id, organizationId: user.organizationId },
          include: {
            sessions: { include: { department: true, trainerProfile: true, traineeProfile: true } },
            participants: { include: { traineeProfile: { include: { person: true } } } },
            revisions: { orderBy: { revision: 'desc' }, take: 1 },
          },
        });

        if (!schedule) throw new NotFoundException('الجدول التدريبي غير موجود');

        if (!schedule.sessions || schedule.sessions.length === 0) {
          throw new BadRequestException('لا يمكن نشر جدول تدريبي لا يحتوي على أي جلسات أو مناوبات تدريبية');
        }

        // Re-check conflicts inside current transaction
        const proposed: ProposedSession[] = schedule.sessions.map((s) => ({
          date: new Date(s.date).toISOString().slice(0, 10),
          startTime: s.startTime,
          endTime: s.endTime,
          departmentId: s.departmentId,
          trainerProfileId: s.trainerProfileId,
          traineeProfileIds: s.traineeProfileId
            ? [s.traineeProfileId]
            : schedule.participants.map((p) => p.traineeProfileId),
        }));

        const conflictCheck = await this.conflictEngine.validateSessions(user.organizationId, proposed, tx, id);
        if (conflictCheck.hasConflict) {
          throw new ConflictException({
            message: 'لا يمكن نشر الجدول لوجود تعارضات حافلة في أوقات الجلسات أو السعة',
            conflicts: conflictCheck.conflicts,
          });
        }

        // 1. Idempotently generate Shift records for trainees in sessions via Batch In-Memory Set & createMany
        const desiredShiftsMap = new Map<string, {
          organizationId: string;
          traineeProfileId: string;
          departmentId: string;
          date: Date;
          shiftType: string;
          startTime: string | null;
          endTime: string | null;
          createdById: string;
        }>();

        const candidateTraineeIds = new Set<string>();
        const candidateDates = new Set<string>();

        for (const session of schedule.sessions) {
          const traineeIds = session.traineeProfileId
            ? [session.traineeProfileId]
            : schedule.participants.map((p) => p.traineeProfileId);

          for (const tid of traineeIds) {
            const shiftDate = new Date(session.date);
            const dateIso = shiftDate.toISOString().slice(0, 10);
            candidateTraineeIds.add(tid);
            candidateDates.add(dateIso);

            // Deterministic key: traineeProfileId|departmentId|dateIso|shiftType
            const key = `${tid}|${session.departmentId}|${dateIso}|${session.shiftType}`;
            if (!desiredShiftsMap.has(key)) {
              desiredShiftsMap.set(key, {
                organizationId: user.organizationId,
                traineeProfileId: tid,
                departmentId: session.departmentId,
                date: shiftDate,
                shiftType: session.shiftType,
                startTime: session.startTime || null,
                endTime: session.endTime || null,
                createdById: user.accountId,
              });
            }
          }
        }

        // Single bulk query for existing shifts
        const existingShifts = await tx.shift.findMany({
          where: {
            organizationId: user.organizationId,
            traineeProfileId: { in: Array.from(candidateTraineeIds) },
            date: { in: Array.from(candidateDates).map((d) => new Date(d)) },
          },
          select: {
            traineeProfileId: true,
            departmentId: true,
            date: true,
            shiftType: true,
          },
        });

        const existingShiftKeys = new Set(
          existingShifts.map(
            (s) => `${s.traineeProfileId}|${s.departmentId}|${new Date(s.date).toISOString().slice(0, 10)}|${s.shiftType}`,
          ),
        );

        // Filter missing shifts that need to be created
        const shiftsToCreate = Array.from(desiredShiftsMap.entries())
          .filter(([key]) => !existingShiftKeys.has(key))
          .map(([, shiftData]) => shiftData);

        if (shiftsToCreate.length > 0) {
          await tx.shift.createMany({
            data: shiftsToCreate,
          });
        }

      const nextRevision = (schedule.revisions[0]?.revision || 0) + 1;
      const snapshot = JSON.parse(JSON.stringify(schedule));

        // 2. Create Revision Snapshot
        await tx.scheduleRevision.create({
          data: {
            scheduleId: id,
            revision: nextRevision,
            snapshot: snapshot as Prisma.InputJsonValue,
            oldValues: (schedule.revisions[0]?.snapshot || {}) as Prisma.InputJsonValue,
            newValues: snapshot as Prisma.InputJsonValue,
            changeReason: changeReason || 'نشر وتحديث الجدول التدريبي',
            publishedById: user.accountId,
          },
        });

      // 3. Update Schedule Status to published ONLY after sessions/shifts validation
      await tx.trainingSchedule.update({
        where: { id },
        data: { status: 'published', updatedById: user.accountId },
      });

      // 4. Send notifications to participants (safe & non-blocking if trainee has no userAccount yet)
      for (const part of schedule.participants) {
        const personId = part.traineeProfile?.personId;
        if (personId) {
          try {
            const traineeUser = await tx.userAccount.findFirst({
              where: { personId },
              select: { id: true },
            });
            if (traineeUser) {
              await tx.notification.create({
                data: {
                  organizationId: user.organizationId,
                  userId: traineeUser.id,
                  titleAr: 'تم نشر الجدول التدريبي الخاص بك',
                  bodyAr: `تمت إضافة/تحديث جلساتك التدريبية في جدول: ${schedule.titleAr}`,
                  type: 'schedule_published',
                  referenceType: 'TrainingSchedule',
                  referenceId: id,
                },
              });
            }
          } catch (notifErr) {
            // Notification creation should never roll back the publish transaction
          }
        }
      }

      return { success: true, revision: nextRevision };
      },
      {
        maxWait: 10000,
        timeout: 30000,
      },
    );
  }

  /**
   * Delete session / schedule
   */
  async removeSession(sessionId: string, user: IAuthenticatedUser) {
    const session = await this.prisma.scheduleSession.findFirst({
      where: { id: sessionId, organizationId: user.organizationId },
    });
    if (!session) throw new NotFoundException('الجلسة غير موجودة');

    await this.prisma.scheduleSession.delete({ where: { id: sessionId } });
    return { success: true };
  }

  async remove(id: string, user: IAuthenticatedUser) {
    const schedule = await this.prisma.trainingSchedule.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!schedule) throw new NotFoundException('الجدول غير موجود');

    await this.prisma.trainingSchedule.delete({ where: { id } });
    return { success: true };
  }
}
