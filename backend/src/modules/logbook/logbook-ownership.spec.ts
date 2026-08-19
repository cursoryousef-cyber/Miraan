import { ForbiddenException } from '@nestjs/common';
import { LogbookController } from './logbook.controller';

/**
 * Logbook and competency ownership. `assertTrainerScope` is the single gate the
 * clinical write paths share, and it derives the trainer→trainee link from the
 * allocation/rotation tables rather than from anything the client sends. These
 * drive it through the controller so a caller bypassing the UI is what is
 * actually under test.
 */
describe('LogbookController ownership', () => {
  const TRAINEE_A = 'trainee-profile-A';
  const TRAINER_A = 'trainer-profile-A';

  function makeController(opts: {
    trainerProfileId?: string | null;
    hasAllocation?: boolean;
    hasRotation?: boolean;
    ownTraineeProfileId?: string;
    traineeOrgId?: string;
    visibleOrgIds?: string[] | null;
  }) {
    const prisma = {
      trainerProfile: {
        findFirst: jest.fn().mockResolvedValue(
          opts.trainerProfileId === null ? null : { id: opts.trainerProfileId ?? TRAINER_A },
        ),
      },
      traineeAllocation: {
        findFirst: jest.fn().mockResolvedValue(opts.hasAllocation ? { id: 'alloc-1' } : null),
      },
      rotation: {
        findFirst: jest.fn().mockResolvedValue(opts.hasRotation ? { id: 'rot-1' } : null),
      },
      traineeProfile: {
        findFirst: jest.fn().mockResolvedValue(
          opts.ownTraineeProfileId ? { id: opts.ownTraineeProfileId } : null,
        ),
        findUnique: jest.fn().mockResolvedValue({
          organizationId: opts.traineeOrgId ?? 'hospital-A',
          isLocked: false,
        }),
      },
    } as any;

    const scopeContext = {
      resolve: jest.fn().mockResolvedValue({ visibleOrgIds: opts.visibleOrgIds ?? null }),
      // Real semantics: null means unrestricted, otherwise membership is required.
      assertOrgInScope: jest.fn((ctx: any, orgId: string) => {
        if (ctx.visibleOrgIds === null) return;
        if (!ctx.visibleOrgIds.includes(orgId)) {
          throw new ForbiddenException('هذا السجل خارج نطاق صلاحياتك التنظيمية');
        }
      }),
    } as any;

    return new LogbookController(prisma, scopeContext);
  }

  // assertTrainerScope is private by TS visibility only; it is the unit the
  // clinical write paths delegate to, so it is what these exercise.
  const assertScope = (c: LogbookController, user: any, traineeId: string) =>
    (c as any).assertTrainerScope(user, traineeId);

  const trainer = { accountId: 'acct-A', roles: ['trainer'], organizationId: 'hospital-A' };

  describe('trainer', () => {
    it('reaches a trainee held by an open allocation', async () => {
      const c = makeController({ hasAllocation: true });
      await expect(assertScope(c, trainer, TRAINEE_A)).resolves.toBeUndefined();
    });

    it('reaches a trainee held by an active rotation', async () => {
      const c = makeController({ hasAllocation: false, hasRotation: true });
      await expect(assertScope(c, trainer, TRAINEE_A)).resolves.toBeUndefined();
    });

    it("is refused another trainer's trainee — no allocation and no rotation", async () => {
      const c = makeController({ hasAllocation: false, hasRotation: false });
      await expect(assertScope(c, trainer, 'trainee-of-trainer-B')).rejects.toThrow(
        /متدرب غير مسند إليك/,
      );
    });

    it('is refused when the account has no trainer profile', async () => {
      const c = makeController({ trainerProfileId: null });
      await expect(assertScope(c, trainer, TRAINEE_A)).rejects.toThrow(/لا يوجد ملف مدرب/);
    });
  });

  describe('trainee', () => {
    const trainee = { accountId: 'acct-T', roles: ['trainee'], organizationId: 'hospital-A' };

    it('reaches its own profile', async () => {
      const c = makeController({ ownTraineeProfileId: TRAINEE_A });
      await expect(assertScope(c, trainee, TRAINEE_A)).resolves.toBeUndefined();
    });

    it("is refused another trainee's profile", async () => {
      const c = makeController({ ownTraineeProfileId: TRAINEE_A });
      await expect(assertScope(c, trainee, 'trainee-profile-B')).rejects.toThrow(
        /بيانات متدرب آخر/,
      );
    });
  });

  describe('hospital scope for supervisory roles', () => {
    const supervisor = {
      accountId: 'acct-S',
      roles: ['hospital_training_admin'],
      organizationId: 'hospital-A',
    };

    it('reaches a trainee inside its own hospital', async () => {
      const c = makeController({ traineeOrgId: 'hospital-A', visibleOrgIds: ['hospital-A'] });
      await expect(assertScope(c, supervisor, TRAINEE_A)).resolves.toBeUndefined();
    });

    it("is refused a trainee in another hospital", async () => {
      const c = makeController({ traineeOrgId: 'hospital-B', visibleOrgIds: ['hospital-A'] });
      await expect(assertScope(c, supervisor, TRAINEE_A)).rejects.toThrow(/خارج نطاق/);
    });
  });

  describe('sign-off role does not depend on role ordering', () => {
    const signerRole = (roles: string[]) =>
      (makeController({}) as any).signerRoleFor({ accountId: 'a', roles });

    it('records the same role whichever order the roles arrive in', () => {
      expect(signerRole(['trainer', 'academic_supervisor'])).toBe('academic_supervisor');
      expect(signerRole(['academic_supervisor', 'trainer'])).toBe('academic_supervisor');
    });

    it('records a plain trainer as trainer', () => {
      expect(signerRole(['trainer'])).toBe('trainer');
    });
  });
});
