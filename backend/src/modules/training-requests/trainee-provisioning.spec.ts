import { TraineeAccountProvisioningService } from './trainee-account-provisioning.service';
import { TrainingRequestTraineesService } from './training-request-trainees.service';
import { AuthService } from '../auth/auth.service';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { TRAINEE_ROW_STATUS } from '../../common/status-constants';
import * as bcrypt from 'bcrypt';

describe('Phase 2A — Trainee Account Provisioning & Activation Suite (Tests 1–17)', () => {
  const HOSPITAL_ORG = 'org-hospital-1';
  const CLUSTER_ORG = 'org-cluster-1';
  const TRAINEE_ROLE_ID = 'role-trainee-uuid';
  const OTHER_ROLE_ID = 'role-supervisor-uuid';
  const ROW_ID = 'trt-row-1';
  const NATIONAL_ID = '1098765432';
  const PERSON_ID = 'person-uuid-1';
  const PROFILE_ID = 'profile-uuid-1';
  const ACCOUNT_ID = 'account-uuid-1';

  function createMockPrisma() {
    const store = {
      persons: new Map<string, any>(),
      userAccounts: new Map<string, any>(),
      traineeProfiles: new Map<string, any>(),
      userRoles: [] as any[],
      userOrganizations: [] as any[],
      organizationAssignments: [] as any[],
      auditLogs: [] as any[],
      notifications: [] as any[],
      documents: [] as any[],
      trainingRequestTrainees: new Map<string, any>(),
    };

    // Seed default trainee row
    store.trainingRequestTrainees.set(ROW_ID, {
      id: ROW_ID,
      trainingRequestId: 'tr-1',
      nationalId: NATIONAL_ID,
      nameAr: 'متدرب تجريبي',
      nameEn: 'Test Trainee',
      academicNumber: 'AC-100',
      email: 'trainee@example.com',
      mobile: '0501234567',
      gender: 'male',
      specialty: 'Emergency',
      universityOrgId: 'org-uni-1',
      status: TRAINEE_ROW_STATUS.HOSPITAL_REVIEW,
      validationErrors: [],
      assignedHospitalId: HOSPITAL_ORG,
      traineeProfileId: null,
      personId: null,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-02-28'),
      trainingRequest: {
        id: 'tr-1',
        targetOrgId: CLUSTER_ORG,
        academicIntakeId: null,
        programId: null,
      },
    });

    const prisma = {
      $transaction: jest.fn().mockImplementation(async (fn: any) => {
        if (typeof fn === 'function') return fn(prisma);
        return fn;
      }),
      $executeRaw: jest.fn().mockResolvedValue(1),
      role: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.code === 'trainee') return Promise.resolve({ id: TRAINEE_ROLE_ID, code: 'trainee' });
          if (where.code === 'academic_supervisor') return Promise.resolve({ id: OTHER_ROLE_ID, code: 'academic_supervisor' });
          return Promise.resolve(null);
        }),
      },
      trainingRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tr-1',
          targetOrgId: CLUSTER_ORG,
          academicIntakeId: null,
          programId: null,
        }),
      },
      trainingRequestTrainee: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(store.trainingRequestTrainees.get(where.id) || null);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const existing = store.trainingRequestTrainees.get(where.id) || {};
          const updated = { ...existing, ...data };
          store.trainingRequestTrainees.set(where.id, updated);
          return Promise.resolve(updated);
        }),
      },
      person: {
        upsert: jest.fn().mockImplementation(({ where, create, update }) => {
          let p = Array.from(store.persons.values()).find((item) => item.nationalId === where.nationalId);
          if (!p) {
            p = { id: PERSON_ID, ...create };
            store.persons.set(p.id, p);
          } else {
            p = { ...p, ...update };
            store.persons.set(p.id, p);
          }
          return Promise.resolve(p);
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id) return Promise.resolve(store.persons.get(where.id) || null);
          if (where.nationalId) {
            const found = Array.from(store.persons.values()).find((item) => item.nationalId === where.nationalId);
            return Promise.resolve(found || null);
          }
          return Promise.resolve(null);
        }),
      },
      traineeProfile: {
        upsert: jest.fn().mockImplementation(({ where, create, update }) => {
          let prof = Array.from(store.traineeProfiles.values()).find((item) => item.personId === where.personId);
          if (!prof) {
            prof = { id: PROFILE_ID, ...create };
            store.traineeProfiles.set(prof.id, prof);
          } else {
            prof = { ...prof, ...update };
            store.traineeProfiles.set(prof.id, prof);
          }
          return Promise.resolve(prof);
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(store.traineeProfiles.get(where.id) || null);
        }),
      },
      userAccount: {
        findFirst: jest.fn().mockImplementation(({ where, include }: any = {}) => {
          const accounts = Array.from(store.userAccounts.values());
          let found: any = null;
          if (where?.personId) {
            found = accounts.find((a: any) => a.personId === where.personId && !a.deletedAt);
          } else if (where?.activationToken) {
            found = accounts.find((a: any) => a.activationToken === where.activationToken && !a.deletedAt);
          } else if (where?.OR) {
            found = accounts.find((a: any) =>
              where.OR.some((cond: any) =>
                (cond.email && a.email === cond.email) ||
                (cond.username && a.username === cond.username) ||
                (cond.personId && a.personId === cond.personId)
              ) && !a.deletedAt
            );
          } else if (where?.email) {
            found = accounts.find((a: any) => a.email === where.email && !a.deletedAt);
          }
          if (found && include?.person) {
            return Promise.resolve({
              ...found,
              person: store.persons.get(found.personId) || { nameAr: 'متدرب تجريبي', nameEn: 'Test Trainee' },
            });
          }
          return Promise.resolve(found || null);
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id) return Promise.resolve(store.userAccounts.get(where.id) || null);
          if (where.email) {
            const found = Array.from(store.userAccounts.values()).find((a) => a.email === where.email && !a.deletedAt);
            return Promise.resolve(found || null);
          }
          return Promise.resolve(null);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const id = data.id || ACCOUNT_ID;
          const account = { id, ...data };
          store.userAccounts.set(id, account);
          return Promise.resolve(account);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const existing = store.userAccounts.get(where.id);
          const updated = { ...existing, ...data };
          store.userAccounts.set(where.id, updated);
          return Promise.resolve(updated);
        }),
      },
      userRole: {
        upsert: jest.fn().mockImplementation(({ create }) => {
          const existing = store.userRoles.find(
            (r) => r.userAccountId === create.userAccountId && r.roleId === create.roleId && r.organizationId === create.organizationId
          );
          if (!existing) store.userRoles.push(create);
          return Promise.resolve(create);
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(store.userRoles.filter((r) => r.userAccountId === where.userAccountId));
        }),
      },
      userOrganization: {
        upsert: jest.fn().mockImplementation(({ create }) => {
          const existing = store.userOrganizations.find(
            (uo) => uo.userAccountId === create.userAccountId && uo.organizationId === create.organizationId
          );
          if (!existing) store.userOrganizations.push(create);
          return Promise.resolve(create);
        }),
      },
      organizationAssignment: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(
            store.organizationAssignments.find(
              (oa) => oa.userAccountId === where.userAccountId && oa.organizationId === where.organizationId
            ) || null
          );
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const oa = { id: `oa-${Date.now()}-${Math.random()}`, ...data };
          store.organizationAssignments.push(oa);
          return Promise.resolve(oa);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const index = store.organizationAssignments.findIndex((oa) => oa.id === where.id);
          if (index !== -1) {
            store.organizationAssignments[index] = { ...store.organizationAssignments[index], ...data };
            return Promise.resolve(store.organizationAssignments[index]);
          }
          return Promise.resolve(data);
        }),
      },
      document: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: {
        create: jest.fn().mockImplementation(({ data }) => {
          store.auditLogs.push(data);
          return Promise.resolve({ id: `audit-${Date.now()}`, ...data });
        }),
      },
      notification: {
        create: jest.fn().mockImplementation(({ data }) => {
          store.notifications.push(data);
          return Promise.resolve({ id: `notif-${Date.now()}`, ...data });
        }),
      },
    };

    return { prisma, store };
  }

  const actor = {
    accountId: 'actor-hospital-admin',
    personId: 'actor-person-1',
    organizationId: HOSPITAL_ORG,
    email: 'admin@hospital.local',
    roles: ['hospital_training_admin'],
  } as any;

  // ──────────────────────────────────────────────────────────────────────────
  describe('TraineeAccountProvisioningService Unit & Integration Tests', () => {
    let mockPrisma: any;
    let store: any;
    let notificationService: any;
    let provisioningService: TraineeAccountProvisioningService;
    let traineesService: TrainingRequestTraineesService;
    let authService: AuthService;

    beforeEach(() => {
      const created = createMockPrisma();
      mockPrisma = created.prisma;
      store = created.store;

      notificationService = {
        create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
        notifyOrgUsers: jest.fn().mockResolvedValue({ count: 1 }),
      };

      provisioningService = new TraineeAccountProvisioningService(
        mockPrisma as any,
        notificationService as any,
      );

      traineesService = new TrainingRequestTraineesService(
        mockPrisma as any,
        notificationService as any,
        { validateTrainees: jest.fn().mockResolvedValue([]) } as any,
        { runGuarded: jest.fn().mockImplementation((fn: Function) => fn()) } as any,
        {} as any,
        {} as any,
        provisioningService,
      );

      authService = new AuthService(
        mockPrisma as any,
        { sign: jest.fn().mockReturnValue('mock-jwt-token') } as any,
        { get: jest.fn().mockReturnValue('secret') } as any,
        {
          resolveOrgContext: jest.fn().mockResolvedValue({
            active: {
              organization: { id: HOSPITAL_ORG, nameAr: 'مستشفى الملك فهد', organizationType: { code: 'hospital' } },
            },
            available: [
              {
                organization: { id: HOSPITAL_ORG, code: 'KFH', nameAr: 'مستشفى الملك فهد', organizationType: { code: 'hospital' } },
              },
            ],
          }),
        } as any,
      );
    });

    // TEST 1: Hospital approval + no UserAccount -> exactly one UserAccount
    it('TEST 1: Hospital approval creates exactly one UserAccount when no account exists', async () => {
      const row = store.trainingRequestTrainees.get(ROW_ID);
      const res = await provisioningService.provisionForHospitalApproval(
        row,
        row.trainingRequest,
        HOSPITAL_ORG,
        actor,
        mockPrisma,
      );

      expect(res.accountId).toBeDefined();
      expect(res.isNewAccount).toBe(true);
      expect(res.activationToken).toBeDefined();
      expect(store.userAccounts.size).toBe(1);
      const createdAccount: any = Array.from(store.userAccounts.values())[0];
      expect(createdAccount.personId).toBe(PERSON_ID);
      expect(createdAccount.username).toBe(NATIONAL_ID);
    });

    // TEST 2: Repeated approval -> same UserAccount (Idempotent)
    it('TEST 2: Repeated hospital approval reuses the same UserAccount without creating duplicates', async () => {
      const row = store.trainingRequestTrainees.get(ROW_ID);
      const res1 = await provisioningService.provisionForHospitalApproval(row, row.trainingRequest, HOSPITAL_ORG, actor, mockPrisma);
      const res2 = await provisioningService.provisionForHospitalApproval(row, row.trainingRequest, HOSPITAL_ORG, actor, mockPrisma);

      expect(res1.accountId).toBe(res2.accountId);
      expect(store.userAccounts.size).toBe(1);
      expect(res2.isNewAccount).toBe(false);
    });

    // TEST 3: Existing active UserAccount -> preserve passwordHash and activation state
    it('TEST 3: Existing active UserAccount preserves passwordHash and does not issue a new activation token', async () => {
      const existingHash = await bcrypt.hash('ActiveUserPass123!', 10);
      store.persons.set(PERSON_ID, { id: PERSON_ID, nationalId: NATIONAL_ID, nameAr: 'متدرب سابق' });
      store.userAccounts.set(ACCOUNT_ID, {
        id: ACCOUNT_ID,
        personId: PERSON_ID,
        email: 'active.trainee@hospital.sa',
        username: NATIONAL_ID,
        passwordHash: existingHash,
        isActive: true,
        activatedAt: new Date('2025-01-01'),
        activationToken: null,
        activationTokenExpiresAt: null,
      });

      const row = store.trainingRequestTrainees.get(ROW_ID);
      const res = await provisioningService.provisionForHospitalApproval(row, row.trainingRequest, HOSPITAL_ORG, actor, mockPrisma);

      expect(res.accountId).toBe(ACCOUNT_ID);
      expect(res.activationToken).toBeNull();
      expect(res.isNewToken).toBe(false);
      const account = store.userAccounts.get(ACCOUNT_ID);
      expect(account.passwordHash).toBe(existingHash);
      expect(account.activatedAt).toBeDefined();
    });

    // TEST 4: Existing trainee role -> no duplicate role
    it('TEST 4: Existing trainee role is preserved with no duplicate userRole rows', async () => {
      const row = store.trainingRequestTrainees.get(ROW_ID);
      await provisioningService.provisionForHospitalApproval(row, row.trainingRequest, HOSPITAL_ORG, actor, mockPrisma);
      await provisioningService.provisionForHospitalApproval(row, row.trainingRequest, HOSPITAL_ORG, actor, mockPrisma);

      const hospitalRoles = store.userRoles.filter(
        (ur: any) => ur.userAccountId === ACCOUNT_ID && ur.roleId === TRAINEE_ROLE_ID && ur.organizationId === HOSPITAL_ORG,
      );
      expect(hospitalRoles.length).toBe(1);
    });

    // TEST 5: Existing legitimate role -> preserve all existing roles
    it('TEST 5: Existing legitimate role (e.g. academic_supervisor) is preserved alongside trainee role', async () => {
      store.persons.set(PERSON_ID, { id: PERSON_ID, nationalId: NATIONAL_ID });
      store.userAccounts.set(ACCOUNT_ID, { id: ACCOUNT_ID, personId: PERSON_ID, email: 'trainee@example.com' });
      store.userRoles.push({ userAccountId: ACCOUNT_ID, roleId: OTHER_ROLE_ID, organizationId: 'org-uni-1' });

      const row = store.trainingRequestTrainees.get(ROW_ID);
      await provisioningService.provisionForHospitalApproval(row, row.trainingRequest, HOSPITAL_ORG, actor, mockPrisma);

      const roles = store.userRoles.filter((ur: any) => ur.userAccountId === ACCOUNT_ID);
      expect(roles.some((r: any) => r.roleId === OTHER_ROLE_ID)).toBe(true);
      expect(roles.some((r: any) => r.roleId === TRAINEE_ROLE_ID)).toBe(true);
    });

    // TEST 6: New activation token -> secure + expiry exists
    it('TEST 6: New account generates a secure activation token with a valid future expiration date', async () => {
      const row = store.trainingRequestTrainees.get(ROW_ID);
      const res = await provisioningService.provisionForHospitalApproval(row, row.trainingRequest, HOSPITAL_ORG, actor, mockPrisma);

      expect(res.activationToken).toBeDefined();
      expect(typeof res.activationToken).toBe('string');
      const account = store.userAccounts.get(res.accountId);
      expect(account.activationTokenExpiresAt).toBeDefined();
      expect(account.activationTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    // TEST 7: Activation before expiry -> success
    it('TEST 7: Account activation before token expiry succeeds, sets password, and clears token', async () => {
      const row = store.trainingRequestTrainees.get(ROW_ID);
      const res = await provisioningService.provisionForHospitalApproval(row, row.trainingRequest, HOSPITAL_ORG, actor, mockPrisma);
      const token = res.activationToken!;

      const activateRes = await authService.activateAccount({ token, password: 'NewSecurePassword#2026' });
      expect(activateRes.success).toBe(true);

      const account = store.userAccounts.get(res.accountId);
      expect(account.activationToken).toBeNull();
      expect(account.activationTokenExpiresAt).toBeNull();
      expect(account.activatedAt).toBeDefined();
      expect(await bcrypt.compare('NewSecurePassword#2026', account.passwordHash)).toBe(true);
    });

    // TEST 8: Activation after successful activation -> token unusable
    it('TEST 8: Re-using an activation token after successful activation fails with 400 Bad Request', async () => {
      const row = store.trainingRequestTrainees.get(ROW_ID);
      const res = await provisioningService.provisionForHospitalApproval(row, row.trainingRequest, HOSPITAL_ORG, actor, mockPrisma);
      const token = res.activationToken!;

      await authService.activateAccount({ token, password: 'PasswordOne1!' });

      await expect(authService.activateAccount({ token, password: 'PasswordTwo2!' }))
        .rejects.toThrow(BadRequestException);
    });

    // TEST 9: Expired activation token -> rejected
    it('TEST 9: Attempting to activate with an expired token is rejected with 400 Bad Request', async () => {
      const expiredToken = 'expired-token-uuid';
      store.userAccounts.set(ACCOUNT_ID, {
        id: ACCOUNT_ID,
        personId: PERSON_ID,
        email: 'trainee@example.com',
        activationToken: expiredToken,
        activationTokenExpiresAt: new Date(Date.now() - 3600 * 1000), // Expired 1 hour ago
        activatedAt: null,
      });

      await expect(authService.activateAccount({ token: expiredToken, password: 'Password123!' }))
        .rejects.toThrow('انتهت صلاحية رمز التفعيل. يرجى طلب رمز جديد.');
    });

    // TEST 10: Invalid token -> rejected
    it('TEST 10: Invalid or non-existent activation token is rejected with 400 Bad Request', async () => {
      await expect(authService.activateAccount({ token: 'completely-invalid-token', password: 'Password123!' }))
        .rejects.toThrow('رمز التفعيل غير صحيح أو تم استخدامه مسبقاً');
    });

    // TEST 11: Notification failure -> approval still succeeds
    it('TEST 11: Notification delivery failure does not roll back or throw during hospital approval', async () => {
      notificationService.create.mockRejectedValueOnce(new Error('SMTP Gateway Timeout'));

      const res = await traineesService.hospitalAcceptIntern(ROW_ID, actor, 'قبول رسمي');
      expect(res.success).toBe(true);

      const updatedRow = store.trainingRequestTrainees.get(ROW_ID);
      expect(updatedRow.status).toBe(TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED);
      expect(store.userAccounts.size).toBe(1);
    });

    // TEST 12: TRUE concurrent provisioning: same nationalId, different emails -> ONE Person, ONE TraineeProfile, ONE UserAccount
    it('TEST 12: Concurrent provisioning for same nationalId with different emails results in exactly ONE Person, ONE TraineeProfile, and ONE UserAccount', async () => {
      const row1 = { ...store.trainingRequestTrainees.get(ROW_ID), email: 'email1@test.com' };
      const row2 = { ...store.trainingRequestTrainees.get(ROW_ID), email: 'email2@test.com' };

      const [res1, res2] = await Promise.all([
        provisioningService.provisionForHospitalApproval(row1, row1.trainingRequest, HOSPITAL_ORG, actor, mockPrisma),
        provisioningService.provisionForHospitalApproval(row2, row2.trainingRequest, HOSPITAL_ORG, actor, mockPrisma),
      ]);

      expect(res1.personId).toBe(res2.personId);
      expect(res1.profileId).toBe(res2.profileId);
      expect(res1.accountId).toBe(res2.accountId);
      expect(store.persons.size).toBe(1);
      expect(store.traineeProfiles.size).toBe(1);
      expect(store.userAccounts.size).toBe(1);
    });

    // TEST 13: Login after activation -> JWT + trainee permissions
    it('TEST 13: Login after activation succeeds and generates JWT with trainee role', async () => {
      const row = store.trainingRequestTrainees.get(ROW_ID);
      const provRes = await provisioningService.provisionForHospitalApproval(row, row.trainingRequest, HOSPITAL_ORG, actor, mockPrisma);
      await authService.activateAccount({ token: provRes.activationToken!, password: 'MyActivatedPassword!1' });

      // Mock getRolesAndPermissions
      (authService as any).getRolesAndPermissions = jest.fn().mockResolvedValue({
        roles: ['trainee'],
        permissions: ['view_schedule', 'submit_logbook'],
        capabilities: ['trainee_portal'],
      });

      const loginRes = await authService.login({ email: provRes.accountEmail, password: 'MyActivatedPassword!1' });
      expect(loginRes.tokens).toBeDefined();
      expect(loginRes.user.email).toBe(provRes.accountEmail);
    });

    // TEST 14: Existing TraineeProfile without UserAccount -> create only UserAccount
    it('TEST 14: When TraineeProfile already exists, provisioning attaches and creates only the missing UserAccount', async () => {
      store.persons.set(PERSON_ID, { id: PERSON_ID, nationalId: NATIONAL_ID });
      store.traineeProfiles.set(PROFILE_ID, { id: PROFILE_ID, personId: PERSON_ID, organizationId: HOSPITAL_ORG });

      const row = { ...store.trainingRequestTrainees.get(ROW_ID), traineeProfileId: PROFILE_ID };
      const res = await provisioningService.provisionForHospitalApproval(row, row.trainingRequest, HOSPITAL_ORG, actor, mockPrisma);

      expect(res.profileId).toBe(PROFILE_ID);
      expect(res.isNewAccount).toBe(true);
      expect(store.traineeProfiles.size).toBe(1);
      expect(store.userAccounts.size).toBe(1);
    });

    // TEST 15: Cluster Approval -> MUST NOT create UserAccount
    it('TEST 15: Cluster Approval (approveTrainee) creates Person and TraineeProfile but MUST NOT create UserAccount', async () => {
      const clusterActor = { accountId: 'cluster-admin-1', organizationId: CLUSTER_ORG, roles: ['cluster_administrator'] } as any;
      const clusterRow = { ...store.trainingRequestTrainees.get(ROW_ID), status: TRAINEE_ROW_STATUS.SUBMITTED };
      store.trainingRequestTrainees.set(ROW_ID, clusterRow);

      const res = await traineesService.approveTrainee(ROW_ID, clusterActor);
      expect(res.success).toBe(true);
      expect(res.data.activationTokenIssued).toBe(false);

      // Person & TraineeProfile exist
      expect(store.persons.size).toBe(1);
      expect(store.traineeProfiles.size).toBe(1);

      // UserAccount MUST NOT exist
      expect(store.userAccounts.size).toBe(0);
    });

    // TEST 16: hospitalAcceptIntern -> creates/reuses UserAccount
    it('TEST 16: hospitalAcceptIntern transitions status to hospital_accepted and provisions the UserAccount', async () => {
      const res = await traineesService.hospitalAcceptIntern(ROW_ID, actor, 'تم قبول المتدرب بعد المقابلة');
      expect(res.success).toBe(true);

      const row = store.trainingRequestTrainees.get(ROW_ID);
      expect(row.status).toBe(TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED);
      expect(store.userAccounts.size).toBe(1);
    });

    // TEST 17: Existing UserAccount with another legitimate role -> preserve role + add trainee role
    it('TEST 17: Existing UserAccount with another legitimate role preserves all roles and adds trainee role safely', async () => {
      store.persons.set(PERSON_ID, { id: PERSON_ID, nationalId: NATIONAL_ID });
      store.userAccounts.set(ACCOUNT_ID, {
        id: ACCOUNT_ID,
        personId: PERSON_ID,
        email: 'supervisor.and.trainee@health.sa',
        username: NATIONAL_ID,
        passwordHash: await bcrypt.hash('ExistingPassword123!', 10),
        isActive: true,
        activatedAt: new Date('2024-01-01'),
        activationToken: null,
      });
      store.userRoles.push({
        userAccountId: ACCOUNT_ID,
        roleId: OTHER_ROLE_ID,
        organizationId: 'org-uni-1',
      });

      const row = store.trainingRequestTrainees.get(ROW_ID);
      await traineesService.hospitalAcceptIntern(ROW_ID, actor);

      const accountRoles = store.userRoles.filter((ur: any) => ur.userAccountId === ACCOUNT_ID);
      expect(accountRoles.some((r: any) => r.roleId === OTHER_ROLE_ID)).toBe(true);
      expect(accountRoles.some((r: any) => r.roleId === TRAINEE_ROLE_ID && r.organizationId === HOSPITAL_ORG)).toBe(true);
    });
  });
});
