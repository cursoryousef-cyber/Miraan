import { TraineesController } from './trainees.controller';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('Trainee Administrative Password Change Suite (14 Tests)', () => {
  const PROFILE_ID = 'profile-1';
  const PERSON_ID = 'person-1';
  const ACCOUNT_ID = 'account-1';
  const NATIONAL_ID = '1098765432';
  const HOSPITAL_ID = 'hosp-1';

  let mockPrisma: any;
  let mockScopeContext: any;
  let controller: TraineesController;

  let store: {
    persons: Map<string, any>;
    traineeProfiles: Map<string, any>;
    userAccounts: Map<string, any>;
    userRoles: any[];
    organizationAssignments: any[];
    auditLogs: any[];
  };

  const adminUser = {
    accountId: 'admin-account-1',
    organizationId: HOSPITAL_ID,
    roles: ['hospital_training_admin'],
    permissions: ['manage_users'],
    capabilities: ['trainee.view.hospital'],
  } as any;

  beforeEach(async () => {
    const initialHash = await bcrypt.hash('OldPassword!123', 10);

    store = {
      persons: new Map<string, any>(),
      traineeProfiles: new Map<string, any>(),
      userAccounts: new Map<string, any>(),
      userRoles: [],
      organizationAssignments: [],
      auditLogs: [],
    };

    store.persons.set(PERSON_ID, {
      id: PERSON_ID,
      nationalId: NATIONAL_ID,
      nameAr: 'متدرب تجريبي',
      nameEn: 'Test Trainee',
      phone: '0501112233',
      email: 'trainee@example.com',
    });

    store.traineeProfiles.set(PROFILE_ID, {
      id: PROFILE_ID,
      personId: PERSON_ID,
      organizationId: HOSPITAL_ID,
      sponsorOrganizationId: 'uni-1',
      traineeNumber: 'AC-100',
      person: store.persons.get(PERSON_ID),
    });

    store.userAccounts.set(ACCOUNT_ID, {
      id: ACCOUNT_ID,
      personId: PERSON_ID,
      username: NATIONAL_ID,
      email: 'trainee@example.com',
      passwordHash: initialHash,
      isActive: true,
      activationToken: 'active-token-uuid-1',
      activationTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      activatedAt: null,
      deletedAt: null,
      createdAt: new Date('2026-08-01'),
      updatedAt: new Date('2026-08-01'),
    });

    store.userRoles.push({
      userAccountId: ACCOUNT_ID,
      roleId: 'role-trainee',
      organizationId: HOSPITAL_ID,
    });

    store.organizationAssignments.push({
      id: 'oa-1',
      userAccountId: ACCOUNT_ID,
      organizationId: HOSPITAL_ID,
      roleId: 'role-trainee',
      isActive: true,
    });

    mockPrisma = {
      traineeProfile: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const p = store.traineeProfiles.get(where.id);
          if (!p) return null;
          return { ...p, person: store.persons.get(p.personId) };
        }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockImplementation(() => null),
      },
      person: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const p of store.persons.values()) {
            if (p.id === where.id || p.nationalId === where.nationalId) {
              return { ...p, traineeProfile: store.traineeProfiles.get(PROFILE_ID) };
            }
          }
          return null;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => store.persons.get(where.id) || null),
      },
      userAccount: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          for (const a of store.userAccounts.values()) {
            if (a.personId === where.personId && !a.deletedAt) return a;
          }
          return null;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const acc = store.userAccounts.get(where.id);
          if (!acc) throw new NotFoundException();
          const updated = { ...acc, ...data, updatedAt: new Date() };
          store.userAccounts.set(where.id, updated);
          return updated;
        }),
      },
      auditLog: {
        create: jest.fn().mockImplementation(({ data }) => {
          store.auditLogs.push(data);
          return { id: 'audit-1', ...data };
        }),
      },
    };

    mockScopeContext = {
      resolve: jest.fn().mockResolvedValue({
        visibleOrgIds: [HOSPITAL_ID],
        contextType: 'hospital',
      }),
    };

    controller = new TraineesController(
      mockPrisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      mockScopeContext,
    );
  });

  // 1. Admin can change trainee password
  it('1. Admin can change trainee password successfully', async () => {
    const res = await controller.changeTraineePassword(
      PROFILE_ID,
      { password: 'NewSecurePassword!2026' },
      adminUser,
    );

    expect(res.success).toBe(true);
    expect(res.message).toBe('تم تغيير كلمة المرور بنجاح');
  });

  // 2. Password is stored as bcrypt hash
  it('2. Password is stored as a valid bcrypt hash and NOT plaintext', async () => {
    const newPlain = 'NewSecurePassword!2026';
    await controller.changeTraineePassword(PROFILE_ID, { password: newPlain }, adminUser);

    const account = store.userAccounts.get(ACCOUNT_ID);
    expect(account.passwordHash).toBeDefined();
    expect(account.passwordHash).not.toBe(newPlain);
    expect(account.passwordHash.startsWith('$2b$') || account.passwordHash.startsWith('$2a$')).toBe(true);
  });

  // 3. Old password no longer works
  it('3. Old password no longer matches the new hash', async () => {
    const oldPlain = 'OldPassword!123';
    await controller.changeTraineePassword(
      PROFILE_ID,
      { password: 'NewSecurePassword!2026' },
      adminUser,
    );

    const account = store.userAccounts.get(ACCOUNT_ID);
    const matchesOld = await bcrypt.compare(oldPlain, account.passwordHash);
    expect(matchesOld).toBe(false);
  });

  // 4. New password works
  it('4. New password matches the updated bcrypt hash', async () => {
    const newPlain = 'NewSecurePassword!2026';
    await controller.changeTraineePassword(PROFILE_ID, { password: newPlain }, adminUser);

    const account = store.userAccounts.get(ACCOUNT_ID);
    const matchesNew = await bcrypt.compare(newPlain, account.passwordHash);
    expect(matchesNew).toBe(true);
  });

  // 5. Unauthorized / out-of-scope user cannot change password
  it('5. User from another hospital scope is rejected with ForbiddenException', async () => {
    mockScopeContext.resolve.mockResolvedValueOnce({
      visibleOrgIds: ['foreign-hospital-99'],
      contextType: 'hospital',
    });

    const unauthorizedAdmin = {
      accountId: 'admin-foreign',
      organizationId: 'foreign-hospital-99',
      roles: ['hospital_training_admin'],
    } as any;

    await expect(
      controller.changeTraineePassword(
        PROFILE_ID,
        { password: 'NewSecurePassword!2026' },
        unauthorizedAdmin,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // 6. Changing password does not create another UserAccount
  it('6. Changing password updates existing account and does NOT create a duplicate account', async () => {
    const countBefore = store.userAccounts.size;
    await controller.changeTraineePassword(
      PROFILE_ID,
      { password: 'NewSecurePassword!2026' },
      adminUser,
    );

    expect(store.userAccounts.size).toBe(countBefore);
  });

  // 7. Changing password does not modify Person
  it('7. Changing password does NOT modify Person record', async () => {
    const personBefore = { ...store.persons.get(PERSON_ID) };
    await controller.changeTraineePassword(
      PROFILE_ID,
      { password: 'NewSecurePassword!2026' },
      adminUser,
    );

    const personAfter = store.persons.get(PERSON_ID);
    expect(personAfter).toEqual(personBefore);
  });

  // 8. Changing password does not duplicate TraineeProfile
  it('8. Changing password does NOT duplicate or alter TraineeProfile', async () => {
    const profileBefore = { ...store.traineeProfiles.get(PROFILE_ID) };
    await controller.changeTraineePassword(
      PROFILE_ID,
      { password: 'NewSecurePassword!2026' },
      adminUser,
    );

    expect(store.traineeProfiles.size).toBe(1);
    expect(store.traineeProfiles.get(PROFILE_ID).personId).toBe(profileBefore.personId);
  });

  // 9. Existing roles remain unchanged
  it('9. Existing UserRoles remain untouched', async () => {
    const rolesBefore = [...store.userRoles];
    await controller.changeTraineePassword(
      PROFILE_ID,
      { password: 'NewSecurePassword!2026' },
      adminUser,
    );

    expect(store.userRoles).toEqual(rolesBefore);
  });

  // 10. Existing OrganizationAssignments remain unchanged
  it('10. Existing OrganizationAssignments remain untouched', async () => {
    const assignmentsBefore = [...store.organizationAssignments];
    await controller.changeTraineePassword(
      PROFILE_ID,
      { password: 'NewSecurePassword!2026' },
      adminUser,
    );

    expect(store.organizationAssignments).toEqual(assignmentsBefore);
  });

  // 11. Admin-set password clears any pending activation token so the account
  // is immediately usable without an activation link (no dangling token that
  // could still be redeemed later).
  it('11. activationToken and activationTokenExpiresAt are cleared for a previously unactivated account', async () => {
    await controller.changeTraineePassword(
      PROFILE_ID,
      { password: 'NewSecurePassword!2026' },
      adminUser,
    );

    const accountAfter = store.userAccounts.get(ACCOUNT_ID);
    expect(accountAfter.activationToken).toBeNull();
    expect(accountAfter.activationTokenExpiresAt).toBeNull();
  });

  // 12. activatedAt is set so the trainee can log in with the new password
  // right away, per the "manager sets password directly" flow.
  it('12. activatedAt is set (was null) so the account can log in immediately', async () => {
    await controller.changeTraineePassword(
      PROFILE_ID,
      { password: 'NewSecurePassword!2026' },
      adminUser,
    );

    const account = store.userAccounts.get(ACCOUNT_ID);
    expect(account.activatedAt).not.toBeNull();
  });

  // 13. Password/hash is never written to AuditLog
  it('13. AuditLog is created without plaintext password or passwordHash', async () => {
    const plain = 'NewSecurePassword!2026';
    await controller.changeTraineePassword(PROFILE_ID, { password: plain }, adminUser);

    expect(store.auditLogs.length).toBe(1);
    const audit = store.auditLogs[0];
    expect(audit.action).toBe('trainee_password_reset');
    expect(audit.entityType).toBe('UserAccount');
    expect(audit.entityId).toBe(ACCOUNT_ID);

    const auditStr = JSON.stringify(audit);
    expect(auditStr).not.toContain(plain);
    expect(auditStr).not.toContain('$2b$');
    expect(auditStr).not.toContain('$2a$');
    expect(audit.newValues.password).toBeUndefined();
    expect(audit.newValues.passwordHash).toBeUndefined();
  });

  // 14. Password/hash is never returned by API
  it('14. API response never returns password or passwordHash', async () => {
    const res = await controller.changeTraineePassword(
      PROFILE_ID,
      { password: 'NewSecurePassword!2026' },
      adminUser,
    );

    const resStr = JSON.stringify(res);
    expect(resStr).not.toContain('NewSecurePassword!2026');
    expect(resStr).not.toContain('$2b$');
    expect((res as any).password).toBeUndefined();
    expect((res as any).passwordHash).toBeUndefined();
  });
});
