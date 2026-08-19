import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { PlanInstantiationService } from '../training-plans/plan-instantiation.service';
import { IAuthenticatedUser } from '../../common/interfaces';

@Injectable()
export class ActivationService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private planInstantiation: PlanInstantiationService,
  ) {}

  /**
   * Called when TrainingRequest.status transitions to 'active'.
   * For every cluster_approved/allocated TrainingRequestTrainee row in this request:
   *   1. Upsert a real TraineeProfile (or find existing one by nationalId/personId)
   *   2. Create a Rotation row covering the training period
   *   3. Seed CompetencyProgress from ProcedureCatalog matching the specialty
   *   4. Set TraineeProfile.applicationStatus → 'active'
   *   5. Write AuditLog
   *   6. Notify trainee, hospital, cluster, university
   */
  async activateRequest(trainingRequestId: string, actorId?: string) {
    const req = await this.prisma.trainingRequest.findUnique({
      where: { id: trainingRequestId },
      include: {
        trainees: {
          where: { status: { in: ['cluster_approved', 'allocated', 'hospital_review'] } },
          include: { assignedHospital: true },
        },
        sourceOrg: true,
        targetOrg: true,
      },
    });
    if (!req) throw new NotFoundException('الطلب غير موجود');

    const rows = req.trainees;
    if (!rows.length) {
      // No staged rows — nothing to activate (request-level activation only)
      return { activated: 0, message: 'لا توجد صفوف متدربين لتفعيلها' };
    }

    const activated: string[] = [];
    const instantiated: Array<{ profileId: string; created: string[]; skipped: unknown[] }> = [];

    for (const row of rows) {
      const profileId = await this.activateOneRow(row, req, trainingRequestId, actorId, instantiated);
      if (profileId) activated.push(profileId);
    }

    // 6. Notifications
    try {
      const label = req.requestNumber;
      await this.notificationService.notifyOrgUsers(req.sourceOrgId, 'university_administrator', {
        titleAr: `تم تفعيل التدريب — ${label}`,
        bodyAr: `اكتمل قبول جميع المتدربين وبدأ برنامج التدريب رسمياً`,
        type: 'internship_activated',
        referenceType: 'TrainingRequest',
        referenceId: trainingRequestId,
        channels: ['in_app', 'email', 'push'],
      });
      await this.notificationService.notifyOrgUsers(req.targetOrgId, 'hospital_training_admin', {
        titleAr: `متدربون جدد بدأوا التدريب — ${label}`,
        bodyAr: `تم تفعيل ${activated.length} متدرب في مستشفاكم`,
        type: 'internship_activated',
        referenceType: 'TrainingRequest',
        referenceId: trainingRequestId,
        channels: ['in_app', 'push'],
      });
    } catch (e) { console.warn('Activation notification error:', e); }

    return {
      activated: activated.length,
      profileIds: activated,
      rotationsCreated: instantiated.reduce((n, i) => n + i.created.length, 0),
      planInstantiation: instantiated,
    };
  }

  /**
   * The per-row body of `activateRequest`, extracted so a single trainee can be
   * activated without touching the rest of the cohort. `activateRequest` still
   * calls this in its loop — the whole-request path is unchanged.
   *
   * Returns the activated profile's id, or null when the row has no promoted
   * profile yet (nothing to activate).
   */
  private async activateOneRow(
    row: {
      id: string;
      traineeProfileId: string | null;
      assignedHospitalId: string | null;
      assignedDepartmentId: string | null;
      assignedTrainerProfileId: string | null;
      assignedSupervisorAccountId: string | null;
      startDate: Date | null;
      endDate: Date | null;
      specialty: string | null;
    },
    req: {
      trainingStartDate: Date | null; trainingEndDate: Date | null; createdAt: Date;
      trainingPlanVersionId: string | null; trainingPlanId: string | null;
      expectedGraduationDate: Date | null; programId: string | null; targetOrgId: string;
    },
    trainingRequestId: string,
    actorId: string | undefined,
    instantiated: Array<{ profileId: string; created: string[]; skipped: unknown[] }>,
  ): Promise<string | null> {
    // Find TraineeProfile linked to this staging row
    const profile = await this.prisma.traineeProfile.findUnique({
      where: { id: row.traineeProfileId ?? undefined },
    }).catch(() => null);

    if (!profile) return null;

    // 1. Activate profile status
    await this.prisma.traineeProfile.update({
      where: { id: profile.id },
      data: { applicationStatus: 'active', updatedById: actorId },
    });

    // 2. Mark TRT row as active
    await this.prisma.trainingRequestTrainee.update({
      where: { id: row.id },
      data: { status: 'active' },
    });

    // 3. Build the trainee's rotation schedule.
    if (row.assignedHospitalId && row.assignedDepartmentId && row.assignedTrainerProfileId) {
      const startDate = row.startDate ?? req.trainingStartDate ?? req.createdAt;
      const endDate = row.endDate ?? req.trainingEndDate
        ?? new Date(startDate.getTime() + 180 * 24 * 60 * 60 * 1000);

      const existing = await this.prisma.rotation.findFirst({
        where: { traineeProfileId: profile.id, organizationId: row.assignedHospitalId },
      });

      if (!existing) {
        // Pin the trainee to the version the request was submitted under, so a
        // plan revised mid-cohort cannot retroactively change their schedule.
        if (req.trainingPlanVersionId) {
          await this.prisma.traineeProfile.update({
            where: { id: profile.id },
            data: {
              trainingPlanId: req.trainingPlanId,
              trainingPlanVersionId: req.trainingPlanVersionId,
              expectedGraduationDate: req.expectedGraduationDate,
            },
          });

          const result = await this.planInstantiation.instantiateForTrainee({
            traineeProfileId: profile.id,
            versionId: req.trainingPlanVersionId,
            hospitalId: row.assignedHospitalId,
            startDate,
            programId: req.programId,
            fallbackDepartmentId: row.assignedDepartmentId,
            fallbackTrainerProfileId: row.assignedTrainerProfileId,
            supervisorAccountId: row.assignedSupervisorAccountId,
            actorId,
          });
          instantiated.push({ profileId: profile.id, ...result });

          if (result.created.length > 0) {
            await this.prisma.auditLog.create({
              data: {
                organizationId: row.assignedHospitalId,
                actorId,
                action: 'training_plan_instantiated',
                entityType: 'TraineeProfile',
                entityId: profile.id,
                newValues: {
                  trainingPlanVersionId: req.trainingPlanVersionId,
                  rotationsCreated: result.created.length,
                  rotationsSkipped: result.skipped,
                },
              },
            });
          }
        }

        // No plan on the request, or the plan produced nothing placeable —
        // fall back to the single rotation this service has always created.
        const madeAny = await this.prisma.rotation.count({
          where: { traineeProfileId: profile.id, organizationId: row.assignedHospitalId },
        });
        if (madeAny === 0) {
          await this.prisma.rotation.create({
            data: {
              organizationId: row.assignedHospitalId,
              traineeProfileId: profile.id,
              departmentId: row.assignedDepartmentId,
              trainerProfileId: row.assignedTrainerProfileId,
              supervisorAccountId: row.assignedSupervisorAccountId ?? null,
              programId: req.programId ?? null,
              startDate,
              endDate,
              status: 'active',
              createdById: actorId,
            },
          });
        }
      } else {
        // If a rotation record already exists at this hospital, sync its department,
        // trainer and supervisor with the new open allocation so the trainer and trainee
        // dashboards stay in perfect alignment.
        if (
          (row.assignedDepartmentId && existing.departmentId !== row.assignedDepartmentId) ||
          (row.assignedTrainerProfileId && existing.trainerProfileId !== row.assignedTrainerProfileId) ||
          (row.assignedSupervisorAccountId && existing.supervisorAccountId !== row.assignedSupervisorAccountId) ||
          // A rejected rotation at the same hospital/department/trainer needs a
          // fresh assignment call to reopen it — otherwise a rejected trainee
          // could never be reassigned to anyone, including the same trainer.
          existing.status === 'rejected'
        ) {
          await this.prisma.rotation.update({
            where: { id: existing.id },
            data: {
              departmentId: row.assignedDepartmentId ?? existing.departmentId,
              trainerProfileId: row.assignedTrainerProfileId ?? existing.trainerProfileId,
              supervisorAccountId: row.assignedSupervisorAccountId ?? existing.supervisorAccountId,
              status: 'active',
              updatedById: actorId,
            },
          });
        }
      }
    }

    // 4. Seed CompetencyProgress from ProcedureCatalog matching specialty
    const specialty = row.specialty ?? profile.specialtyAr;
    if (specialty) {
      const procedures = await this.prisma.procedureCatalog.findMany({
        where: { isActive: true, category: { contains: specialty.split(' ')[0], mode: 'insensitive' } },
        take: 30,
      });

      for (const proc of procedures) {
        await this.prisma.competencyProgress.upsert({
          where: { traineeProfileId_procedureId: { traineeProfileId: profile.id, procedureId: proc.id } },
          create: {
            traineeProfileId: profile.id,
            procedureId: proc.id,
            requiredCount: proc.minRequired,
            completedCount: 0,
            status: 'pending',
          },
          update: {},
        });
      }
    }

    // 5. AuditLog
    await this.prisma.auditLog.create({
      data: {
        organizationId: req.targetOrgId,
        actorId,
        action: 'internship_activated',
        entityType: 'TraineeProfile',
        entityId: profile.id,
        oldValues: { applicationStatus: profile.applicationStatus },
        newValues: { applicationStatus: 'active', trainingRequestId },
      },
    });

    return profile.id;
  }

  /**
   * Activates exactly one trainee row — the missing link between allocation and
   * visibility.
   *
   * The legacy trigger for `activateOneRow` was the acceptance chain reaching
   * `TrainingRequest.status = 'active'`, which required a
   * `hospital_administrator` to accept a step it no longer has any training
   * capability to act on (Phase 2.6 removed every training capability from that
   * role). That made the chain's hospital step unreachable in the current RBAC
   * model, so no request could ever reach 'active', so `activateRequest` never
   * ran, so no Rotation was ever created, so the trainer and trainee dashboards
   * — which read `Rotation`, not `TraineeAllocation` — stayed empty no matter how
   * many trainees were correctly allocated to a hospital and department.
   *
   * This is called once a trainee row has a promoted profile, a hospital, a
   * department and a trainer all set — i.e. right after
   * `TraineeAllocationService.assignWithinHospital` completes a department
   * assignment — so a trainee becomes visible to their trainer at the moment
   * hospital training administration actually places them, independent of the
   * legacy per-request chain. Idempotent: `activateOneRow` only creates a
   * rotation when none exists yet for that trainee at that hospital.
   */
  async activateSingleRow(rowId: string, actorId?: string) {
    const row = await this.prisma.trainingRequestTrainee.findUnique({
      where: { id: rowId },
      include: {
        trainingRequest: {
          select: {
            trainingStartDate: true, trainingEndDate: true, createdAt: true,
            trainingPlanVersionId: true, trainingPlanId: true, expectedGraduationDate: true,
            programId: true, targetOrgId: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException('صف المتدرب غير موجود');
    if (!row.trainingRequest) throw new BadRequestException('صف المتدرب غير مرتبط بطلب تدريب');
    if (!row.traineeProfileId) {
      // Allocation can legitimately happen before promotion (e.g. the cluster
      // places the candidate row before it has been approved into a real
      // account); there is simply nothing to activate yet.
      return { activated: false, reason: 'الصف غير مرتبط بعد بملف متدرب فعلي' };
    }

    const instantiated: Array<{ profileId: string; created: string[]; skipped: unknown[] }> = [];
    const profileId = await this.activateOneRow(row, row.trainingRequest, row.trainingRequestId, actorId, instantiated);

    if (profileId) {
      try {
        const person = await this.prisma.traineeProfile.findUnique({
          where: { id: profileId },
          select: { person: { select: { userAccounts: { select: { id: true } } } } },
        });
        const accountId = person?.person.userAccounts[0]?.id;
        if (accountId) {
          await this.notificationService.create({
            organizationId: row.trainingRequest.targetOrgId,
            userId: accountId,
            titleAr: 'بدأ تدريبك الفعلي',
            bodyAr: 'تم إسنادك لقسم ومدرب وبدأ برنامجك التدريبي.',
            type: 'internship_activated',
            referenceType: 'TraineeProfile',
            referenceId: profileId,
            channels: ['in_app'],
          });
        }
      } catch (e) {
        console.warn('activateSingleRow notification error:', e);
      }
    }

    return {
      activated: !!profileId,
      profileId,
      rotationsCreated: instantiated.reduce((n, i) => n + i.created.length, 0),
    };
  }
}
