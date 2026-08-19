// ============================================================================
// Trainee allocation — the canonical write path for "where is this trainee".
//
// Allocation used to be three columns on the trainee row, overwritten in place.
// That representation cannot answer the questions the business actually asks:
// where was this trainee before, who moved them, when, and why. A reassignment
// left no trace of what it replaced, so "the previous allocation was closed and a
// new one opened" was unprovable — the row simply held different values than it
// had a moment earlier.
//
// Here every placement is a row. Moving a trainee closes the open row (status
// superseded, closedAt set, the outgoing hospital/department/trainer copied onto
// the incoming row) and opens the next, chained by previousAllocationId. History
// is append-only; nothing is ever overwritten.
//
// Two boundaries are enforced on every write:
//   - cluster moves (between hospitals)  → ALLOCATION_CLUSTER_*, cluster context
//   - hospital moves (between depts)     → ALLOCATION_HOSPITAL_*, active hospital
// A hospital session cannot change hospitalId; a cluster session cannot reach
// into a hospital's departments. Neither can borrow the other's capability.
//
// The trainee row's denormalised assigned* columns are kept in step so existing
// screens and queries keep working, but they are now a projection of this table
// rather than the record itself.
// ============================================================================

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../../common/interfaces';
import {
  CAPABILITIES,
  ScopeContext,
  ScopeContextService,
} from '../../common/authz';
import { CapacityService } from '../organizations/capacity.service';
import { TRAINEE_ROW_STATUS, TRAINEE_PROFILE_STATUS } from '../../common/status-constants';
import {
  assertValidTransition,
  TRAINING_REQUEST_TRAINEE_TRANSITIONS,
} from '../../common/state-machine/transition-guard';
import { ActivationService } from './activation.service';

export type AllocationAction =
  | 'auto'
  | 'manual'
  | 'cluster_reassign'
  | 'hospital_reassign'
  | 'hospital_assign';

export interface AllocationTarget {
  hospitalId: string;
  departmentId?: string | null;
  trainerProfileId?: string | null;
  supervisorAccountId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
}

@Injectable()
export class TraineeAllocationService {
  constructor(
    private prisma: PrismaService,
    private scopeContext: ScopeContextService,
    private capacityService: CapacityService,
    private activationService: ActivationService,
  ) {}

  /** The single open allocation for a trainee row, if any. */
  async findOpen(traineeRowId: string) {
    return this.prisma.traineeAllocation.findFirst({
      where: { traineeRowId, status: 'open' },
      include: {
        hospital: { select: { id: true, nameAr: true } },
        department: { select: { id: true, nameAr: true } },
        trainerProfile: {
          select: { id: true, person: { select: { nameAr: true } } },
        },
      },
    });
  }

  /** Full chain, oldest first — the allocation half of the trainee timeline. */
  async findHistory(traineeRowId: string, scope: ScopeContext) {
    const row = await this.prisma.trainingRequestTrainee.findUnique({
      where: { id: traineeRowId },
      select: {
        assignedHospitalId: true,
        trainingRequest: { select: { targetOrgId: true } },
      },
    });
    if (!row) throw new NotFoundException('صف المتدرب غير موجود');

    // Either owning organisation may read the history.
    if (scope.visibleOrgIds !== null) {
      const owners = [
        row.assignedHospitalId,
        row.trainingRequest?.targetOrgId,
      ].filter((o): o is string => !!o);
      if (!owners.some((o) => scope.visibleOrgIds!.includes(o))) {
        throw new ForbiddenException('هذا السجل خارج نطاق صلاحياتك التنظيمية');
      }
    }

    return this.prisma.traineeAllocation.findMany({
      where: { traineeRowId },
      orderBy: { performedAt: 'asc' },
      include: {
        hospital: { select: { id: true, nameAr: true } },
        department: { select: { id: true, nameAr: true } },
        trainerProfile: {
          select: { id: true, person: { select: { nameAr: true } } },
        },
        performedBy: {
          select: {
            id: true,
            email: true,
            person: { select: { nameAr: true } },
          },
        },
      },
    });
  }

  /**
   * Places a trainee into a hospital, or moves them to a different one. Cluster
   * authority: this is the decision about *which hospital*, which no hospital may
   * make about itself or its neighbours.
   */
  async allocateToHospital(
    traineeRowId: string,
    target: AllocationTarget,
    action: Extract<AllocationAction, 'auto' | 'manual' | 'cluster_reassign'>,
    user: IAuthenticatedUser,
    scope: ScopeContext,
    reason?: string,
  ) {
    const existing = await this.findOpen(traineeRowId);
    const isMove = !!existing;

    this.scopeContext.assertCapability(
      scope,
      isMove
        ? CAPABILITIES.ALLOCATION_CLUSTER_REASSIGN
        : action === 'auto'
          ? CAPABILITIES.ALLOCATION_CLUSTER_AUTO
          : CAPABILITIES.ALLOCATION_CLUSTER_MANUAL,
    );

    const context = await this.loadRowContext(traineeRowId);

    // The declared transition is submitted → cluster_approved → allocated, but
    // nothing enforced the middle step here: allocating a still-`submitted` row
    // succeeded and opened an allocation without moving the row's status. That
    // left the row wedged — approved later, carrying an open allocation, and
    // unable to reach `allocated` because re-allocating the same hospital is
    // correctly refused as "no change to record". A trainee the cluster has not
    // yet approved is not ready to be placed, so the placement is refused here.
    //
    // Moves are exempt: `allocated` and the states a placed trainee legitimately
    // passes through are re-allocatable, which is what cluster_reassign is for.
    // The status is read from the row itself, never from the request.
    const PLACEABLE_STATUSES: string[] = [
      TRAINEE_ROW_STATUS.CLUSTER_APPROVED,
      TRAINEE_ROW_STATUS.ALLOCATED,
      TRAINEE_ROW_STATUS.HOSPITAL_REVIEW,
      TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED,
      TRAINEE_ROW_STATUS.HOSPITAL_RETURNED_TO_CLUSTER,
      TRAINEE_ROW_STATUS.ACTIVE,
    ];
    if (!PLACEABLE_STATUSES.includes(context.rowStatus)) {
      throw new ConflictException(
        `لا يمكن توزيع المتدرب على مستشفى قبل اعتماد التجمع — الحالة الحالية «${context.rowStatus}»`,
      );
    }

    const hospital = await this.assertHospitalUnderCluster(
      target.hospitalId,
      context.clusterOrgId,
    );

    // Both ends of a move must be inside the acting cluster; otherwise a cluster
    // could pull a trainee out of a hospital that is not its own.
    if (existing) {
      await this.assertHospitalUnderCluster(
        existing.hospitalId,
        context.clusterOrgId,
      );
      if (existing.hospitalId === target.hospitalId && !target.departmentId) {
        throw new ConflictException(
          `المتدرب مُسند بالفعل إلى «${hospital.nameAr}» — لا يوجد تغيير لتسجيله`,
        );
      }
    }

    await this.assertHospitalHasRoom(target.hospitalId, existing?.hospitalId);

    return this.writeAllocation(
      traineeRowId,
      target,
      action,
      user,
      scope,
      existing,
      reason,
      context,
    );
  }

  /**
   * Assigns or moves a trainee within one hospital — department, trainer,
   * supervisor, dates. Hospital training administration's authority, confined to
   * the active hospital.
   */
  async assignWithinHospital(
    traineeRowId: string,
    target: Omit<AllocationTarget, 'hospitalId'>,
    user: IAuthenticatedUser,
    scope: ScopeContext,
    reason?: string,
  ) {
    const existing = await this.findOpen(traineeRowId);
    const context = await this.loadRowContext(traineeRowId);
    const hospitalId = existing?.hospitalId || context.assignedHospitalId;

    if (!hospitalId) {
      throw new ConflictException(
        'لا يوجد تخصيص مفتوح لهذا المتدرب — التوزيع على المستشفى يتم من إدارة التدريب بالتجمع أولاً',
      );
    }

    // Business rule: a hospital assigns a department and a trainer only after it
    // has accepted the trainee. Hiding the button in the UI is not the control —
    // this endpoint is reachable directly, so the rule is enforced here. Rows
    // already in training keep working (reassignment inside the hospital is a
    // legitimate ongoing operation); everything before acceptance is refused.
    const ASSIGNABLE_STATUSES: string[] = [
      TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED,
      TRAINEE_ROW_STATUS.ACTIVE,
    ];
    if (!ASSIGNABLE_STATUSES.includes(context.rowStatus)) {
      throw new ConflictException(
        `لا يمكن إسناد القسم أو المدرب قبل قبول المستشفى للمتدرب — الحالة الحالية «${context.rowStatus}»`,
      );
    }

    const isMove =
      !!existing?.departmentId && existing.departmentId !== target.departmentId;
    this.scopeContext.assertCapability(
      scope,
      isMove
        ? CAPABILITIES.ALLOCATION_HOSPITAL_REASSIGN
        : CAPABILITIES.ALLOCATION_HOSPITAL_ASSIGN,
    );

    // The boundary that keeps a hospital inside itself. hospitalId is taken from
    // the open allocation or assigned hospital and never from the caller.
    this.scopeContext.assertActiveHospital(scope, hospitalId);

    if (target.departmentId) {
      await this.assertDepartmentUsable(
        target.departmentId,
        hospitalId,
        existing?.departmentId ?? null,
      );
      this.scopeContext.assertDepartmentInScope(scope, target.departmentId);
    }
    if (target.trainerProfileId) {
      await this.assertTrainerUsable(
        target.trainerProfileId,
        hospitalId,
        existing?.trainerProfileId ?? null,
      );
    }

    return this.writeAllocation(
      traineeRowId,
      { ...target, hospitalId },
      isMove ? 'hospital_reassign' : 'hospital_assign',
      user,
      scope,
      existing,
      reason,
      context,
    );
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  /**
   * Closes the open allocation and opens its successor in one transaction. The
   * partial unique index on (trainee_row_id) WHERE status='open' means a racing
   * caller cannot leave a trainee with two open allocations even if this code were
   * wrong — the second insert fails.
   */
  private async writeAllocation(
    traineeRowId: string,
    target: AllocationTarget,
    action: AllocationAction,
    user: IAuthenticatedUser,
    scope: ScopeContext,
    existing: {
      id: string;
      hospitalId: string;
      departmentId: string | null;
      trainerProfileId: string | null;
    } | null,
    reason: string | undefined,
    context: {
      clusterOrgId: string;
      academicIntakeId: string | null;
      trainingRequestId: string;
      traineeProfileId: string | null;
      rowStatus?: string;
    },
  ) {
    let txResult: {
      data: Prisma.TraineeAllocationGetPayload<Record<string, never>>;
      closedAllocationId: string | null;
      success: true;
      message: string;
    };
    try {
      txResult = await this.prisma.$transaction(async (tx) => {
        // Lock the hospital row for UPDATE to serialize concurrent allocation requests
        await tx.$executeRaw`SELECT id FROM organizations WHERE id = ${target.hospitalId}::uuid FOR UPDATE`;

        if (target.departmentId) {
          await tx.$executeRaw`SELECT id FROM departments WHERE id = ${target.departmentId}::uuid FOR UPDATE`;
        }

        // Transaction-level capacity validation
        if (!existing || existing.hospitalId !== target.hospitalId) {
          const occupancy = await this.capacityService.getHospitalOccupancy(target.hospitalId, tx);
          if (occupancy.capacity === 0) {
            throw new ConflictException(
              'المستشفى لم يُعلن أي سعة تدريبية — على إدارة التدريب بالمستشفى إضافة الأقسام وسعتها أولاً',
            );
          }
          if (occupancy.available <= 0) {
            throw new ConflictException(
              `المستشفى ممتلئ (${occupancy.occupied}/${occupancy.capacity} مقعد) — لا يمكن إسناد متدرب إضافي`,
            );
          }
        }

        if (target.departmentId && (!existing || existing.departmentId !== target.departmentId)) {
          const deptOcc = await this.capacityService.getDepartmentOccupancy(target.departmentId, tx);
          if (deptOcc.available <= 0) {
            const dept = await tx.department.findUnique({
              where: { id: target.departmentId },
              select: { nameAr: true },
            });
            throw new ConflictException(
              `القسم «${dept?.nameAr ?? ''}» ممتلئ (${deptOcc.occupied}/${deptOcc.capacity} مقعد)`,
            );
          }
        }

        if (existing) {
          await tx.traineeAllocation.update({
            where: { id: existing.id },
            data: {
              status: 'superseded',
              closedAt: new Date(),
              closedById: user.accountId,
            },
          });
        }

        let resolvedTraineeProfileId = context.traineeProfileId;
        const row = await tx.trainingRequestTrainee.findUnique({ where: { id: traineeRowId } });

        if (!resolvedTraineeProfileId && row) {
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
              phone: row.mobile,
              email: accountEmail,
              createdById: user.accountId,
            },
            update: {
              nameAr: row.nameAr,
              nameEn: row.nameEn,
              gender: row.gender,
              phone: row.mobile,
              ...(cleanEmail ? { email: cleanEmail } : {}),
            },
          });

          const req = await tx.trainingRequest.findUnique({
            where: { id: context.trainingRequestId },
            select: { programId: true },
          });

          const profile = await tx.traineeProfile.upsert({
            where: { personId: person.id },
            create: {
              personId: person.id,
              organizationId: target.hospitalId,
              sponsorOrganizationId: row.universityOrgId,
              traineeNumber: row.academicNumber,
              level: 'intern',
              specialtyEn: row.specialty,
              programId: req?.programId,
              academicIntakeId: context.academicIntakeId,
              applicationStatus: TRAINEE_PROFILE_STATUS.APPROVED,
              accessStartDate: row.startDate,
              accessEndDate: row.endDate,
              createdById: user.accountId,
            },
            update: {
              organizationId: target.hospitalId,
              sponsorOrganizationId: row.universityOrgId || undefined,
              programId: req?.programId || undefined,
              academicIntakeId: context.academicIntakeId || undefined,
              applicationStatus: TRAINEE_PROFILE_STATUS.APPROVED,
            },
          });

          resolvedTraineeProfileId = profile.id;
          context.traineeProfileId = profile.id;

          await tx.trainingRequestTrainee.update({
            where: { id: traineeRowId },
            data: {
              personId: person.id,
              traineeProfileId: profile.id,
            },
          });
        }

        const created = await tx.traineeAllocation.create({
          data: {
            traineeRowId,
            traineeProfileId: resolvedTraineeProfileId,
            academicIntakeId: context.academicIntakeId,
            trainingRequestId: context.trainingRequestId,
            clusterOrgId: context.clusterOrgId,
            hospitalId: target.hospitalId,
            departmentId: target.departmentId ?? null,
            trainerProfileId: target.trainerProfileId ?? null,
            supervisorAccountId: target.supervisorAccountId ?? null,
            previousAllocationId: existing?.id ?? null,
            previousHospitalId: existing?.hospitalId ?? null,
            previousDepartmentId: existing?.departmentId ?? null,
            previousTrainerId: existing?.trainerProfileId ?? null,
            status: 'open',
            action,
            reason,
            startDate: target.startDate ?? null,
            endDate: target.endDate ?? null,
            performedById: user.accountId,
          },
        });

        // Denormalised projection, so existing readers stay correct.
        const rowStatusAfterAllocation =
          context.rowStatus === TRAINEE_ROW_STATUS.CLUSTER_APPROVED ||
          context.rowStatus === TRAINEE_ROW_STATUS.SUBMITTED ||
          context.rowStatus === TRAINEE_ROW_STATUS.DRAFT
            ? TRAINEE_ROW_STATUS.ALLOCATED
            : undefined;

        await tx.trainingRequestTrainee.update({
          where: { id: traineeRowId },
          data: {
            assignedHospitalId: target.hospitalId,
            assignedDepartmentId: target.departmentId ?? null,
            assignedTrainerProfileId: target.trainerProfileId ?? null,
            assignedSupervisorAccountId: target.supervisorAccountId ?? null,
            ...(rowStatusAfterAllocation ? { status: rowStatusAfterAllocation } : {}),
            updatedById: user.accountId,
          },
        });

        // A move between hospitals has to carry the trainee's operational record
        // with it, or their rotation, attendance and case logs stay behind at the
        // hospital they left. This ran in the legacy /trainees/reallocate endpoint,
        // which performed the transfer *without* writing an allocation row — the
        // second path this service exists to eliminate. It now runs here, inside
        // the same transaction as the allocation, so the placement and the records
        // can never disagree.
        const hospitalChanged =
          !!existing && existing.hospitalId !== target.hospitalId;
        if (hospitalChanged || (!existing && context.traineeProfileId)) {
          await this.transferOperationalRecords(tx, {
            traineeProfileId: context.traineeProfileId,
            fromHospitalId: existing?.hospitalId ?? null,
            toHospitalId: target.hospitalId,
            departmentId: target.departmentId ?? null,
            trainerProfileId: target.trainerProfileId ?? null,
            startDate: target.startDate ?? null,
            endDate: target.endDate ?? null,
            reason,
          });
        }

        await tx.auditLog.create({
          data: {
            organizationId: target.hospitalId,
            actorId: user.accountId,
            action: `allocation.${action}`,
            entityType: 'TraineeAllocation',
            entityId: created.id,
            oldValues: existing
              ? {
                  allocationId: existing.id,
                  hospitalId: existing.hospitalId,
                  departmentId: existing.departmentId,
                  trainerProfileId: existing.trainerProfileId,
                  status: 'superseded',
                }
              : undefined,
            newValues: {
              allocationId: created.id,
              hospitalId: created.hospitalId,
              departmentId: created.departmentId,
              trainerProfileId: created.trainerProfileId,
              status: 'open',
              action,
              reason: reason ?? null,
              contextType: scope.contextType,
              actingOrganizationId: scope.organizationId,
            },
          },
        });

        return {
          data: created,
          closedAllocationId: existing?.id ?? null,
          success: true,
          message: existing
            ? 'تم إغلاق التخصيص السابق وفتح تخصيص جديد'
            : 'تم فتح تخصيص جديد للمتدرب',
        };
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'يوجد تخصيص مفتوح آخر لهذا المتدرب — أعد المحاولة، فقد تم تعديل التخصيص بالتوازي',
        );
      }
      throw e;
    }

    // Post-commit: a placement that now names a hospital, a department and a
    // trainer is a trainee ready to actually start — activate them so their
    // trainer and their own dashboard can see it. Run outside the allocation
    // transaction (activation does its own writes, including plan
    // instantiation) and never let a hiccup here undo an allocation that
    // already succeeded; the row remains allocated and idempotent activation
    // can be retried by any later allocation call that still satisfies the
    // condition below.
    //
    // This is deliberately independent of the legacy acceptance-chain trigger
    // (TrainingRequest.status → 'active'), which requires a
    // hospital_administrator accept step that role no longer has the
    // capability to perform — see ActivationService.activateSingleRow for the
    // full explanation. Gating trainee visibility on a chain step that can no
    // longer be reached is the reason the trainer dashboard read zero.
    const { data: openAllocation } = txResult;
    if (
      openAllocation.traineeProfileId &&
      openAllocation.hospitalId &&
      openAllocation.departmentId &&
      openAllocation.trainerProfileId
    ) {
      try {
        await this.activationService.activateSingleRow(traineeRowId, user.accountId);
        // The trainer must accept the assignment before it counts as theirs —
        // downgrade the Rotation(s) activation just opened for this trainer from
        // 'active' to a pending state. Every scope check elsewhere (trainer
        // dashboard, assigned-interns, task/logbook/competency scope) already
        // filters on Rotation.status, so this alone keeps the trainee invisible
        // to the trainer until they act — no other code needed to change.
        await this.prisma.rotation.updateMany({
          where: {
            traineeProfileId: openAllocation.traineeProfileId,
            trainerProfileId: openAllocation.trainerProfileId,
            status: 'active',
          },
          data: { status: 'pending_acceptance' },
        });
        const trainerAccount = await this.prisma.trainerProfile.findUnique({
          where: { id: openAllocation.trainerProfileId },
          select: { person: { select: { userAccounts: { select: { id: true }, take: 1 } } } },
        });
        const trainerAccountId = trainerAccount?.person.userAccounts[0]?.id;
        if (trainerAccountId) {
          // Find the rotation that was just created for this assignment — it is
          // the rotation the trainer needs to accept/reject, so the notification
          // must point at it, not at the allocation row.
          const pendingRotation = await this.prisma.rotation.findFirst({
            where: {
              traineeProfileId: openAllocation.traineeProfileId,
              trainerProfileId: openAllocation.trainerProfileId,
              status: 'pending_acceptance',
            },
            select: { id: true },
          });
          if (!pendingRotation) {
            // No Rotation exists for this assignment. Do NOT fall back to the
            // allocation id — a Notification whose referenceType says 'Rotation'
            // must reference a real Rotation or it is a dangling wrong link. Log
            // and skip instead of creating a notification the trainer cannot act on.
            console.warn(
              `[trainee-allocation] Skipped trainer-assignment notification: no pending_acceptance Rotation for trainee ${openAllocation.traineeProfileId} / trainer ${openAllocation.trainerProfileId} (allocation ${openAllocation.id} created without a rotation)`,
            );
          } else {
            await this.prisma.notification.create({
              data: {
                organizationId: openAllocation.hospitalId,
                userId: trainerAccountId,
                titleAr: 'طلب إسناد متدرب جديد',
                bodyAr: 'لديك متدرب مسند بانتظار قبولك — راجع طلبات إسناد المتدربين',
                type: 'trainee_assignment_request',
                referenceType: 'Rotation',
                referenceId: pendingRotation.id,
                sentVia: 'in_app',
              },
            });
          }
        }
      } catch (e) {
        console.warn('Post-allocation activation failed (allocation itself succeeded):', e);
      }
    }

    return txResult;
  }

  /**
   * Moves a trainee's operational record to the hospital they have been allocated
   * to: the active rotation is closed as transferred, a new one opened, and the
   * records that are scoped by organisation follow.
   *
   * Runs inside the caller's transaction so a partial transfer cannot survive —
   * the previous implementation was a standalone endpoint, which meant a failure
   * midway left the trainee's profile at one hospital and their rotation at
   * another with no allocation row to reconcile against.
   */
  private async transferOperationalRecords(
    tx: Prisma.TransactionClient,
    params: {
      traineeProfileId: string | null;
      fromHospitalId: string | null;
      toHospitalId: string;
      departmentId: string | null;
      trainerProfileId: string | null;
      startDate: Date | null;
      endDate: Date | null;
      reason?: string;
    },
  ) {
    const { traineeProfileId, toHospitalId } = params;
    // Nothing to move until the candidate row has been promoted to a real profile.
    if (!traineeProfileId) return;

    const profile = await tx.traineeProfile.findUnique({
      where: { id: traineeProfileId },
      select: { id: true, organizationId: true, personId: true },
    });
    if (!profile) return;
    if (profile.organizationId === toHospitalId) return;

    const hospital = await tx.organization.findUnique({
      where: { id: toHospitalId },
      select: { nameAr: true },
    });

    await tx.traineeProfile.update({
      where: { id: traineeProfileId },
      data: { organizationId: toHospitalId },
    });

    // The account's role/membership must follow the profile to the hospital
    // it is actually allocated to. Left at the previous organisation (the
    // cluster, on first allocation — promoteToTrainee grants the trainee role
    // at request.targetOrgId, the cluster, since the hospital isn't known
    // until this call), the trainee's active session would resolve scope
    // against the cluster instead of their own hospital.
    const previousOrgId = profile.organizationId;
    const traineeRole = await tx.role.findFirst({ where: { code: 'trainee' } });
    const accounts = await tx.userAccount.findMany({
      where: { personId: profile.personId },
      select: { id: true },
    });
    for (const account of accounts) {
      if (traineeRole) {
        await tx.userRole.deleteMany({
          where: { userAccountId: account.id, roleId: traineeRole.id, organizationId: previousOrgId },
        });
        await tx.userRole.upsert({
          where: { userAccountId_roleId_organizationId: { userAccountId: account.id, roleId: traineeRole.id, organizationId: toHospitalId } },
          create: { userAccountId: account.id, roleId: traineeRole.id, organizationId: toHospitalId },
          update: {},
        });
      }
      await tx.userOrganization.updateMany({
        where: { userAccountId: account.id, organizationId: previousOrgId },
        data: { isActive: false, isPrimary: false },
      });
      await tx.userOrganization.upsert({
        where: { userAccountId_organizationId: { userAccountId: account.id, organizationId: toHospitalId } },
        create: { userAccountId: account.id, organizationId: toHospitalId, isPrimary: true, isActive: true },
        update: { isPrimary: true, isActive: true },
      });
    }

    const activeRotations = await tx.rotation.findMany({
      where: { traineeProfileId, status: 'active' },
      select: { id: true, departmentId: true, trainerProfileId: true },
    });

    for (const rotation of activeRotations) {
      await tx.rotation.update({
        where: { id: rotation.id },
        data: {
          status: 'transferred',
          completionNotes:
            `تم نقل المتدرب إلى ${hospital?.nameAr ?? 'مستشفى آخر'}` +
            `${params.reason ? ` — السبب: ${params.reason}` : ''}`,
        },
      });
    }

    // A new rotation is opened only when the receiving hospital's training
    // administration has already named a department and trainer. Inventing a
    // default — as the legacy endpoint did by grabbing the first department and
    // any active trainer it could find — placed trainees with people who had never
    // agreed to supervise them. Where the assignment is not yet made, the trainee
    // arrives allocated and awaits the hospital's own decision.
    if (params.departmentId && params.trainerProfileId) {
      await tx.rotation.create({
        data: {
          organizationId: toHospitalId,
          traineeProfileId,
          departmentId: params.departmentId,
          trainerProfileId: params.trainerProfileId,
          startDate: params.startDate ?? new Date(),
          endDate:
            params.endDate ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          status: 'active',
        },
      });
    }

    // Organisation-scoped operational records follow the trainee.
    await tx.attendance.updateMany({
      where: { traineeProfileId },
      data: { organizationId: toHospitalId },
    });
    await tx.shift.updateMany({
      where: { traineeProfileId },
      data: { organizationId: toHospitalId },
    });
    await tx.clinicalCaseLog.updateMany({
      where: { traineeProfileId, status: { not: 'completed' } },
      data: { organizationId: toHospitalId },
    });
  }

  private async loadRowContext(traineeRowId: string) {
    const row = await this.prisma.trainingRequestTrainee.findUnique({
      where: { id: traineeRowId },
      select: {
        academicIntakeId: true,
        traineeProfileId: true,
        trainingRequestId: true,
        assignedHospitalId: true,
        status: true,
        trainingRequest: {
          select: {
            targetOrgId: true,
            sourceOrgId: true,
            status: true,
            targetOrg: { select: { organizationType: { select: { code: true } } } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('صف المتدرب غير موجود');
    if (!row.trainingRequest)
      throw new BadRequestException('صف المتدرب غير مرتبط بطلب تدريب');

    // Which organisation is the owning cluster depends on the path. Path A
    // (university → cluster) addresses the cluster, so the target is it. Path B
    // (cluster → hospital) addresses a hospital directly, and the cluster is the
    // source. Reading the target unconditionally made every Path B allocation
    // compare a hospital against itself and fail.
    const requestClusterOrgId =
      row.trainingRequest.targetOrg?.organizationType?.code === 'cluster'
        ? row.trainingRequest.targetOrgId
        : row.trainingRequest.sourceOrgId;

    return {
      clusterOrgId: requestClusterOrgId,
      academicIntakeId: row.academicIntakeId,
      trainingRequestId: row.trainingRequestId,
      traineeProfileId: row.traineeProfileId,
      assignedHospitalId: row.assignedHospitalId,
      rowStatus: row.status,
    };
  }

  private async assertHospitalUnderCluster(
    hospitalId: string,
    clusterOrgId: string,
  ) {
    const hospital = await this.prisma.organization.findFirst({
      where: { id: hospitalId, deletedAt: null },
      select: {
        id: true,
        nameAr: true,
        parentId: true,
        organizationType: { select: { code: true } },
      },
    });
    if (!hospital) throw new NotFoundException('المستشفى غير موجود');
    if (hospital.organizationType?.code !== 'hospital') {
      throw new BadRequestException(
        `«${hospital.nameAr}» ليست مستشفى — لا يمكن إسناد متدرب إليها`,
      );
    }
    if (hospital.parentId !== clusterOrgId) {
      throw new ForbiddenException(
        `«${hospital.nameAr}» لا يتبع التجمع صاحب الطلب — لا يمكن التوزيع خارج مستشفيات التجمع`,
      );
    }
    return hospital;
  }

  /**
   * Hospital capacity is the sum of its active departments' capacity. A move that
   * stays in the same hospital does not consume a new seat, so the outgoing
   * hospital is passed in and skipped.
   */
  private async assertHospitalHasRoom(
    hospitalId: string,
    previousHospitalId?: string | null,
  ) {
    if (hospitalId === previousHospitalId) return;

    const occupancy =
      await this.capacityService.getHospitalOccupancy(hospitalId);
    if (occupancy.capacity === 0) {
      throw new ConflictException(
        'المستشفى لم يُعلن أي سعة تدريبية — على إدارة التدريب بالمستشفى إضافة الأقسام وسعتها أولاً',
      );
    }
    if (occupancy.available <= 0) {
      throw new ConflictException(
        `المستشفى ممتلئ (${occupancy.occupied}/${occupancy.capacity} مقعد) — لا يمكن إسناد متدرب إضافي`,
      );
    }
  }

  private async assertDepartmentUsable(
    departmentId: string,
    hospitalId: string,
    previousDepartmentId?: string | null,
  ) {
    const dept = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { organizationId: true, isActive: true, nameAr: true },
    });
    if (!dept) throw new NotFoundException('القسم غير موجود');
    if (dept.organizationId !== hospitalId) {
      throw new ForbiddenException(
        `القسم «${dept.nameAr}» لا يتبع هذا المستشفى — نقل المتدرب بين المستشفيات من صلاحية إدارة التدريب بالتجمع`,
      );
    }
    if (!dept.isActive) {
      throw new BadRequestException(`القسم «${dept.nameAr}» غير مفعّل للتدريب`);
    }

    if (departmentId === previousDepartmentId) return;
    const occ = await this.capacityService.getDepartmentOccupancy(departmentId);
    if (occ.available <= 0) {
      throw new ConflictException(
        `القسم «${dept.nameAr}» ممتلئ (${occ.occupied}/${occ.capacity} مقعد)`,
      );
    }
  }

  private async assertTrainerUsable(
    trainerProfileId: string,
    hospitalId: string,
    previousTrainerId?: string | null,
  ) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id: trainerProfileId },
      select: {
        organizationId: true,
        isActive: true,
        person: { select: { nameAr: true } },
      },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');
    if (trainer.organizationId !== hospitalId) {
      throw new ForbiddenException('المدرب المحدد لا يتبع هذا المستشفى');
    }
    if (!trainer.isActive) {
      throw new BadRequestException(
        `المدرب «${trainer.person?.nameAr ?? ''}» غير مفعّل — لا يمكن إسناد متدربين إليه`,
      );
    }

    const today = new Date();
    const activeLeave = await this.prisma.trainerLeave.findFirst({
      where: {
        trainerProfileId,
        status: { in: ['approved', 'active'] },
        startDate: { lte: today },
        endDate: { gte: today },
      },
    });
    if (activeLeave) {
      throw new BadRequestException(
        `المدرب «${trainer.person?.nameAr ?? ''}» في إجازة حالياً — لا يمكن إسناد متدربين جدد إليه`,
      );
    }

    if (trainerProfileId === previousTrainerId) return;
    const occ =
      await this.capacityService.getTrainerOccupancy(trainerProfileId);
    if (occ.available <= 0) {
      throw new ConflictException(
        `المدرب وصل لأقصى عدد متدربين (${occ.occupied}/${occ.capacity})`,
      );
    }
  }
}
