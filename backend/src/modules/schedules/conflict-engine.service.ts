import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface ProposedSession {
  date: string; // YYYY-MM-DD
  startTime: string; // "08:00"
  endTime: string; // "16:00"
  departmentId: string;
  trainerProfileId?: string | null;
  traineeProfileIds?: string[];
  sessionType?: string;
  shiftType?: string;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflicts: Array<{
    type: 'trainee_overlap' | 'trainer_overlap' | 'capacity_exceeded' | 'shift_conflict' | 'outside_rotation' | 'trainer_leave';
    messageAr: string;
    details: {
      traineeId?: string;
      traineeName?: string;
      trainerId?: string;
      trainerName?: string;
      departmentId?: string;
      departmentName?: string;
      date?: string;
      time?: string;
    };
  }>;
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isTimeOverlapping(s1: string, e1: string, s2: string, e2: string): boolean {
  const start1 = timeToMinutes(s1);
  const end1 = timeToMinutes(e1);
  const start2 = timeToMinutes(s2);
  const end2 = timeToMinutes(e2);
  return Math.max(start1, start2) < Math.min(end1, end2);
}

@Injectable()
export class ConflictEngineService {
  constructor(private prisma: PrismaService) {}

  /**
   * Evaluates conflicts for proposed sessions. Can execute inside an active DB transaction
   * to guarantee zero race conditions on publish/save.
   */
  async validateSessions(
    organizationId: string,
    sessions: ProposedSession[],
    tx?: Prisma.TransactionClient,
    excludeScheduleId?: string,
  ): Promise<ConflictResult> {
    const db = tx || this.prisma;
    const result: ConflictResult = { hasConflict: false, conflicts: [] };

    if (!sessions || sessions.length === 0) return result;

    const dates = Array.from(new Set(sessions.map((s) => s.date))).map((d) => new Date(d));
    const departmentIds = Array.from(new Set(sessions.map((s) => s.departmentId)));
    const trainerIds = Array.from(new Set(sessions.map((s) => s.trainerProfileId).filter(Boolean))) as string[];
    const traineeIds = Array.from(
      new Set(sessions.flatMap((s) => s.traineeProfileIds || []).filter(Boolean)),
    );

    const [
      existingSessions,
      departments,
      trainerLeaves,
      trainers,
      trainees,
      rotations,
    ] = await Promise.all([
      db.scheduleSession.findMany({
        where: {
          organizationId,
          date: { in: dates },
          ...(excludeScheduleId ? { scheduleId: { not: excludeScheduleId } } : {}),
          status: { not: 'cancelled' },
        },
        include: {
          schedule: { include: { participants: true } },
        },
      }),
      db.department.findMany({
        where: { id: { in: departmentIds } },
        select: { id: true, nameAr: true, capacity: true },
      }),
      trainerIds.length
        ? db.trainerLeave.findMany({
            where: {
              trainerProfileId: { in: trainerIds },
              status: { in: ['approved', 'active'] },
            },
          })
        : [],
      trainerIds.length
        ? db.trainerProfile.findMany({
            where: { id: { in: trainerIds } },
            include: { person: true },
          })
        : [],
      traineeIds.length
        ? db.traineeProfile.findMany({
            where: { id: { in: traineeIds } },
            include: { person: true },
          })
        : [],
      traineeIds.length
        ? db.rotation.findMany({
            where: {
              traineeProfileId: { in: traineeIds },
              status: { in: ['scheduled', 'active'] },
            },
          })
        : [],
    ]);

    const deptMap = new Map<string, any>(departments.map((d) => [d.id, d] as [string, any]));
    const trainerMap = new Map<string, any>(trainers.map((t) => [t.id, t] as [string, any]));
    const traineeMap = new Map<string, any>(trainees.map((t) => [t.id, t] as [string, any]));

    for (const pSession of sessions) {
      const sessionDate = pSession.date;
      const pDepartment = deptMap.get(pSession.departmentId);
      const pTrainer = pSession.trainerProfileId ? trainerMap.get(pSession.trainerProfileId) : null;

      // 1. Trainer Leave Check
      if (pSession.trainerProfileId) {
        const leave = (trainerLeaves as any[]).find((l: any) => {
          if (l.trainerProfileId !== pSession.trainerProfileId) return false;
          const sessionD = new Date(sessionDate);
          return sessionD >= new Date(l.startDate) && sessionD <= new Date(l.endDate);
        });

        if (leave) {
          result.hasConflict = true;
          result.conflicts.push({
            type: 'trainer_leave',
            messageAr: `المدرب ${pTrainer?.person?.nameAr || ''} في إجازة بتاريخ ${sessionDate}`,
            details: {
              trainerId: pSession.trainerProfileId,
              trainerName: pTrainer?.person?.nameAr,
              date: sessionDate,
            },
          });
        }
      }

      // 2. Trainee Rotation Date & Department Check
      for (const traineeId of pSession.traineeProfileIds || []) {
        const traineeObj = traineeMap.get(traineeId);
        const traineeRotations = (rotations as any[]).filter((r: any) => r.traineeProfileId === traineeId);
        const sessionD = new Date(sessionDate);

        const hasActiveRotation = traineeRotations.some((r) => {
          const inDateRange = sessionD >= new Date(r.startDate) && sessionD <= new Date(r.endDate);
          const inDept = !pSession.departmentId || !r.departmentId || r.departmentId === pSession.departmentId;
          return inDateRange && inDept;
        });

        if (traineeRotations.length > 0 && !hasActiveRotation) {
          result.hasConflict = true;
          result.conflicts.push({
            type: 'outside_rotation',
            messageAr: `المتدرب ${traineeObj?.person?.nameAr || ''} ليس لديه روتيشن مؤهل في هذا القسم بتاريخ ${sessionDate}`,
            details: {
              traineeId,
              traineeName: traineeObj?.person?.nameAr,
              date: sessionDate,
              departmentId: pSession.departmentId,
            },
          });
        }
      }

        // 3. Trainer Overlap Check (Against existing DB sessions + other proposed sessions in batch)
        if (pSession.trainerProfileId) {
          const pDateStr = new Date(pSession.date).toISOString().slice(0, 10);
          const trainerDbOverlaps = existingSessions.filter((es) => {
            const esDateStr = new Date(es.date).toISOString().slice(0, 10);
            if (esDateStr !== pDateStr) return false;
            if (es.trainerProfileId !== pSession.trainerProfileId) return false;
            return isTimeOverlapping(pSession.startTime, pSession.endTime, es.startTime, es.endTime);
          });

          // Also check other proposed sessions in the same batch for trainer overlap
          const trainerBatchOverlaps = sessions.filter((other, oIdx) => {
            if (other === pSession) return false;
            const oDateStr = new Date(other.date).toISOString().slice(0, 10);
            if (oDateStr !== pDateStr) return false;
            if (other.trainerProfileId !== pSession.trainerProfileId) return false;
            // Only report once per distinct pair
            if (sessions.indexOf(pSession) > oIdx) return false;
            return isTimeOverlapping(pSession.startTime, pSession.endTime, other.startTime, other.endTime);
          });

          if (trainerDbOverlaps.length > 0 || trainerBatchOverlaps.length > 0) {
            result.hasConflict = true;
            result.conflicts.push({
              type: 'trainer_overlap',
              messageAr: `المدرب ${pTrainer?.person?.nameAr || ''} لديه جلسة متداخلة بتاريخ ${pDateStr} بين ${pSession.startTime} - ${pSession.endTime}`,
              details: {
                trainerId: pSession.trainerProfileId,
                trainerName: pTrainer?.person?.nameAr,
                date: pDateStr,
                time: `${pSession.startTime} - ${pSession.endTime}`,
              },
            });
          }
        }

        // 4. Trainee Overlap Check (Against existing DB sessions + other proposed sessions in batch)
        for (const traineeId of pSession.traineeProfileIds || []) {
          const traineeObj = traineeMap.get(traineeId);
          const pDateStr = new Date(pSession.date).toISOString().slice(0, 10);
          const traineeDbOverlaps = existingSessions.filter((es) => {
            const esDateStr = new Date(es.date).toISOString().slice(0, 10);
            if (esDateStr !== pDateStr) return false;
            const isTraineeInSession = es.traineeProfileId
              ? es.traineeProfileId === traineeId
              : es.schedule?.participants?.some((p) => p.traineeProfileId === traineeId);
            if (!isTraineeInSession) return false;
            return isTimeOverlapping(pSession.startTime, pSession.endTime, es.startTime, es.endTime);
          });

          const traineeBatchOverlaps = sessions.filter((other, oIdx) => {
            if (other === pSession) return false;
            const oDateStr = new Date(other.date).toISOString().slice(0, 10);
            if (oDateStr !== pDateStr) return false;
            const hasTrainee = (other.traineeProfileIds || []).includes(traineeId);
            if (!hasTrainee) return false;
            if (sessions.indexOf(pSession) > oIdx) return false;
            return isTimeOverlapping(pSession.startTime, pSession.endTime, other.startTime, other.endTime);
          });

          if (traineeDbOverlaps.length > 0 || traineeBatchOverlaps.length > 0) {
            result.hasConflict = true;
            result.conflicts.push({
              type: 'trainee_overlap',
              messageAr: `المتدرب ${traineeObj?.person?.nameAr || ''} لديه جلسة متداخلة بتاريخ ${pDateStr} (${pSession.startTime} - ${pSession.endTime})`,
              details: {
                traineeId,
                traineeName: traineeObj?.person?.nameAr,
                date: pDateStr,
                time: `${pSession.startTime} - ${pSession.endTime}`,
              },
            });
          }
        }

      // 5. Department Capacity Check
      if (pDepartment) {
        const deptCapacity = pDepartment.capacity || 10;
        const deptExistingSessions = existingSessions.filter((es) => {
          const esDateStr = new Date(es.date).toISOString().slice(0, 10);
          if (esDateStr !== sessionDate) return false;
          if (es.departmentId !== pSession.departmentId) return false;
          return isTimeOverlapping(pSession.startTime, pSession.endTime, es.startTime, es.endTime);
        });

        const activeTraineeCount = deptExistingSessions.reduce((acc, es) => {
          if (es.traineeProfileId) return acc + 1;
          return acc + (es.schedule?.participants?.length || 1);
        }, 0);

        const newTraineeCount = (pSession.traineeProfileIds || []).length || 1;

        if (activeTraineeCount + newTraineeCount > deptCapacity) {
          result.hasConflict = true;
          result.conflicts.push({
            type: 'capacity_exceeded',
            messageAr: `القسم «${pDepartment.nameAr}» يتجاوز السعة التدريبية المطلوبة (${activeTraineeCount + newTraineeCount} من أصل ${deptCapacity}) بتاريخ ${sessionDate}`,
            details: {
              departmentId: pSession.departmentId,
              departmentName: pDepartment.nameAr,
              date: sessionDate,
            },
          });
        }
      }
    }

    return result;
  }
}
