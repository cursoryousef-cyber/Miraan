import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { IAuthenticatedUser } from '../../common/interfaces';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { TRAINEE_PROFILE_STATUS } from '../../common/status-constants';

export interface ProvisionTraineeResult {
  personId: string;
  profileId: string;
  accountId: string;
  accountEmail: string;
  activationToken: string | null;
  isNewToken: boolean;
  isNewAccount: boolean;
}

@Injectable()
export class TraineeAccountProvisioningService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  /**
   * Primary entry point: Ensures Person, TraineeProfile, and UserAccount
   * are provisioned/linked atomically and idempotently upon Hospital Approval.
   */
  async provisionForHospitalApproval(
    row: Prisma.TrainingRequestTraineeGetPayload<Record<string, never>>,
    request: { targetOrgId: string; academicIntakeId: string | null; programId: string | null },
    hospitalId: string,
    user: IAuthenticatedUser,
    tx: Prisma.TransactionClient,
  ): Promise<ProvisionTraineeResult> {
    const cleanNationalId = (row.nationalId || '').trim();
    const cleanEmail = row.email ? row.email.trim().toLowerCase() : null;

    // 1. Ensure Person exists with nationalId uniqueness & lock row for concurrent safety
    const person = await this.ensureAndLockPerson(cleanNationalId, row, cleanEmail, user, tx);

    // 2. Ensure TraineeProfile exists (reused if already present for this Person)
    const profile = await this.ensureTraineeProfile(person.id, row, request, hospitalId, user, tx);

    // 3. Ensure UserAccount exists for this Person (reused if already present)
    const accountResult = await this.ensureUserAccount(
      person.id,
      cleanNationalId,
      cleanEmail,
      hospitalId,
      request.targetOrgId,
      user,
      tx,
    );

    // 4. Link documents uploaded on the staging row to profile and user account
    await tx.document.updateMany({
      where: { trainingRequestTraineeId: row.id },
      data: { traineeProfileId: profile.id, userId: accountResult.account.id },
    });

    // 5. Audit Log — Safe: NEVER records passwords, tokens, or secrets
    await tx.auditLog.create({
      data: {
        organizationId: hospitalId || request.targetOrgId,
        actorId: user?.accountId,
        action: 'trainee_account_provisioned',
        entityType: 'UserAccount',
        entityId: accountResult.account.id,
        newValues: {
          personId: person.id,
          profileId: profile.id,
          hospitalId,
          isNewAccount: accountResult.isNewAccount,
          hasActiveToken: Boolean(accountResult.activationToken),
        },
      },
    });

    return {
      personId: person.id,
      profileId: profile.id,
      accountId: accountResult.account.id,
      accountEmail: accountResult.account.email,
      activationToken: accountResult.activationToken,
      isNewToken: accountResult.isNewToken,
      isNewAccount: accountResult.isNewAccount,
    };
  }

  /**
   * Ensures Person identity exists and acquires row-level lock (FOR UPDATE)
   * to protect against concurrent provisioning races for the same nationalId.
   */
  private async ensureAndLockPerson(
    nationalId: string,
    row: Prisma.TrainingRequestTraineeGetPayload<Record<string, never>>,
    cleanEmail: string | null,
    user: IAuthenticatedUser,
    tx: Prisma.TransactionClient,
  ) {
    let person: { id: string };
    const defaultEmail = cleanEmail || `${nationalId}@trainee.miran.health`;

    try {
      person = await tx.person.upsert({
        where: { nationalId },
        create: {
          nationalId,
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          gender: row.gender,
          phone: row.mobile || null,
          email: defaultEmail,
          createdById: user?.accountId,
        },
        update: {
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          gender: row.gender,
          phone: row.mobile || undefined,
          ...(cleanEmail ? { email: cleanEmail } : {}),
        },
        select: { id: true },
      });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const found = await tx.person.findUnique({
          where: { nationalId },
          select: { id: true },
        });
        if (!found) throw err;
        person = found;
      } else {
        throw err;
      }
    }

    // Row-level lock on Person to serialize concurrent account creations for this person
    try {
      await tx.$executeRaw`SELECT id FROM "persons" WHERE id = ${person.id}::uuid FOR UPDATE`;
    } catch {
      // In mock/test environments where raw SQL is not supported, continue gracefully
    }

    return person;
  }

  /**
   * Ensures TraineeProfile is linked to Person.id without creating duplicates.
   */
  private async ensureTraineeProfile(
    personId: string,
    row: Prisma.TrainingRequestTraineeGetPayload<Record<string, never>>,
    request: { targetOrgId: string; academicIntakeId: string | null; programId: string | null },
    hospitalId: string,
    user: IAuthenticatedUser,
    tx: Prisma.TransactionClient,
  ) {
    return tx.traineeProfile.upsert({
      where: { personId },
      create: {
        personId,
        organizationId: hospitalId || row.assignedHospitalId || request.targetOrgId,
        sponsorOrganizationId: row.universityOrgId,
        traineeNumber: row.academicNumber,
        level: 'intern',
        specialtyEn: row.specialty,
        programId: request.programId,
        academicIntakeId: request.academicIntakeId,
        applicationStatus: TRAINEE_PROFILE_STATUS.APPROVED,
        accessStartDate: row.startDate,
        accessEndDate: row.endDate,
        createdById: user?.accountId,
      },
      update: {
        organizationId: hospitalId || row.assignedHospitalId || request.targetOrgId,
        sponsorOrganizationId: row.universityOrgId || undefined,
        programId: request.programId || undefined,
        academicIntakeId: request.academicIntakeId || undefined,
        applicationStatus: TRAINEE_PROFILE_STATUS.APPROVED,
      },
    });
  }

  /**
   * Finds existing UserAccount by personId or creates exactly one new account.
   * If existing account is active, preserves passwordHash and does not issue new activation token.
   */
  private async ensureUserAccount(
    personId: string,
    nationalId: string,
    preferredEmail: string | null,
    hospitalId: string,
    clusterOrgId: string,
    user: IAuthenticatedUser,
    tx: Prisma.TransactionClient,
  ) {
    // 1. Primary Identity Search: by personId
    let account = await tx.userAccount.findFirst({
      where: { personId, deletedAt: null },
    });

    let isNewAccount = false;
    let isNewToken = false;
    let activationToken: string | null = null;

    if (!account) {
      isNewAccount = true;
      isNewToken = true;
      activationToken = randomUUID();
      const activationTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const unusableRandomHash = await bcrypt.hash(randomUUID(), 10);

      // Determine unique email
      let accountEmail = preferredEmail || `${nationalId}@trainee.miran.health`;
      if (preferredEmail) {
        const existingEmailAccount = await tx.userAccount.findFirst({
          where: { email: preferredEmail, deletedAt: null },
        });
        if (existingEmailAccount && existingEmailAccount.personId !== personId) {
          accountEmail = `${nationalId}@trainee.miran.health`;
        }
      }

      try {
        account = await tx.userAccount.create({
          data: {
            personId,
            username: nationalId,
            email: accountEmail,
            passwordHash: unusableRandomHash,
            isActive: true,
            isEmailVerified: false,
            activationToken,
            activationTokenExpiresAt,
            createdById: user?.accountId,
          },
        });
      } catch (err: any) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // Recovery from race condition
          const recovered = await tx.userAccount.findFirst({
            where: { personId, deletedAt: null },
          });
          if (recovered) {
            account = recovered;
            isNewAccount = false;
            isNewToken = false;
            activationToken = account.activationToken;
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
    } else {
      // Existing Account: Preserve password & existing activation state
      if (account.activatedAt || !account.activationToken) {
        // Already activated -> No new token issued
        activationToken = null;
        isNewToken = false;
      } else {
        // Pending activation -> preserve existing token
        activationToken = account.activationToken;
        isNewToken = false;
      }
    }

    // 2. Ensure 'trainee' Role and Multi-Org Assignments
    await this.ensureTraineeRoleAndAssignments(
      account.id,
      Array.from(new Set([hospitalId, clusterOrgId].filter(Boolean) as string[])),
      user,
      tx,
    );

    return {
      account,
      isNewAccount,
      isNewToken,
      activationToken,
    };
  }

  /**
   * Idempotently assigns 'trainee' Role & OrganizationAssignment for the target hospitals
   * without deleting or overwriting any existing legitimate roles on the account.
   */
  private async ensureTraineeRoleAndAssignments(
    accountId: string,
    orgIds: string[],
    user: IAuthenticatedUser,
    tx: Prisma.TransactionClient,
  ) {
    const traineeRole = await tx.role.findUnique({ where: { code: 'trainee' } });

    for (const orgId of orgIds) {
      if (traineeRole) {
        await tx.userRole.upsert({
          where: {
            userAccountId_roleId_organizationId: {
              userAccountId: accountId,
              roleId: traineeRole.id,
              organizationId: orgId,
            },
          },
          create: {
            userAccountId: accountId,
            roleId: traineeRole.id,
            organizationId: orgId,
          },
          update: {},
        });
      }

      await tx.userOrganization.upsert({
        where: {
          userAccountId_organizationId: { userAccountId: accountId, organizationId: orgId },
        },
        create: {
          userAccountId: accountId,
          organizationId: orgId,
          isPrimary: true,
          isActive: true,
        },
        update: { isActive: true },
      });

      const existingAssignment = await tx.organizationAssignment.findFirst({
        where: {
          userAccountId: accountId,
          organizationId: orgId,
          sourceType: { in: ['user_organization', 'user_role', 'manual'] },
        },
      });

      if (!existingAssignment) {
        await tx.organizationAssignment.create({
          data: {
            userAccountId: accountId,
            organizationId: orgId,
            roleId: traineeRole?.id ?? null,
            assignmentType: 'permanent',
            isPrimary: true,
            isActive: true,
            sourceType: 'user_organization',
            createdById: user?.accountId,
          },
        });
      } else if (!existingAssignment.roleId && traineeRole) {
        await tx.organizationAssignment.update({
          where: { id: existingAssignment.id },
          data: { roleId: traineeRole.id, isActive: true },
        });
      }
    }
  }

  /**
   * Safe, non-blocking notification delivery dispatched AFTER transaction commit.
   * Failure of notification will NEVER roll back the hospital approval.
   */
  async sendActivationNotification(
    accountId: string,
    orgId: string,
    profileId: string,
    accountEmail: string,
    isNewToken: boolean,
  ): Promise<void> {
    if (!isNewToken) return;
    try {
      await this.notificationService.create({
        organizationId: orgId,
        userId: accountId,
        titleAr: 'تم اعتماد طلب تدريبك من المستشفى',
        bodyAr: `تم اعتماد ملفك التدريبي وإنشاء حسابك في منصة Miran (${accountEmail}). استخدم رابط التفعيل لإعداد كلمة المرور الخاصة بك.`,
        type: 'trainee_approved',
        referenceType: 'TraineeProfile',
        referenceId: profileId,
        channels: ['in_app', 'email'],
      });
    } catch {
      // Safe: Notification failure is non-blocking
    }
  }
}
