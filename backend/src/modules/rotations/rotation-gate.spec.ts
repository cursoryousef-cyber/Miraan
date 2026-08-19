import { ConflictException, ForbiddenException } from '@nestjs/common';
import { RotationsController } from './rotations.controller';
import { TRAINEE_ROW_STATUS } from '../../common/status-constants';

/**
 * POST /rotations reaches the same end state as the allocation path — a trainee
 * placed with a department and a trainer — so it must satisfy the same
 * invariants. These call the controller directly, which is the path a caller
 * hitting the endpoint with curl takes.
 */
describe('RotationsController creation gate', () => {
  const HOSPITAL_A = 'hospital-A';
  const HOSPITAL_B = 'hospital-B';

  function makeController(opts: {
    rowStatus?: string | null;
    traineeOrgId?: string;
    departmentOrgId?: string;
    trainerOrgId?: string;
    traineeLocked?: boolean;
  }) {
    const prisma = {
      traineeProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'trainee-1',
          organizationId: opts.traineeOrgId ?? HOSPITAL_A,
          isLocked: opts.traineeLocked ?? false,
        }),
      },
      trainingRequestTrainee: {
        findFirst: jest.fn().mockResolvedValue(
          opts.rowStatus === null
            ? null
            : { status: opts.rowStatus ?? TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED },
        ),
      },
      department: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: opts.departmentOrgId ?? HOSPITAL_A,
        }),
      },
      trainerProfile: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: opts.trainerOrgId ?? HOSPITAL_A,
        }),
      },
    } as any;
    return new RotationsController(prisma);
  }

  const dto = {
    traineeProfileId: 'trainee-1',
    departmentId: 'dept-1',
    trainerProfileId: 'trainer-1',
    startDate: '2026-01-01',
    endDate: '2026-04-01',
  };
  const user = { accountId: 'acct-1', organizationId: HOSPITAL_A, roles: ['hospital_training_admin'] } as any;
  const scopeA = { visibleOrgIds: [HOSPITAL_A] } as any;

  const assertGate = (c: RotationsController, d = dto, s: any = scopeA) =>
    (c as any).assertRotationTargetsUsable(d, user, s);

  describe('acceptance gate', () => {
    it.each([
      TRAINEE_ROW_STATUS.ALLOCATED,
      TRAINEE_ROW_STATUS.HOSPITAL_REVIEW,
      TRAINEE_ROW_STATUS.ON_HOLD,
      TRAINEE_ROW_STATUS.REJECTED,
    ])('refuses a rotation while the trainee is %s', async (status) => {
      await expect(assertGate(makeController({ rowStatus: status }))).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('allows a rotation once the hospital has accepted', async () => {
      await expect(
        assertGate(makeController({ rowStatus: TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED })),
      ).resolves.toBeUndefined();
    });

    it('allows a later rotation for a trainee already in training', async () => {
      await expect(
        assertGate(makeController({ rowStatus: TRAINEE_ROW_STATUS.ACTIVE })),
      ).resolves.toBeUndefined();
    });
  });

  describe('hospital boundary', () => {
    it("refuses a trainee outside the caller's scope", async () => {
      await expect(
        assertGate(makeController({ traineeOrgId: HOSPITAL_B })),
      ).rejects.toThrow(/خارج نطاق/);
    });

    it("refuses a department belonging to another hospital", async () => {
      await expect(
        assertGate(makeController({ departmentOrgId: HOSPITAL_B })),
      ).rejects.toThrow(/القسم المحدد لا يتبع/);
    });

    it('refuses a trainer belonging to another hospital', async () => {
      await expect(
        assertGate(makeController({ trainerOrgId: HOSPITAL_B })),
      ).rejects.toThrow(/المدرب المحدد لا يتبع/);
    });
  });

  describe('other invariants', () => {
    it('refuses a graduated (locked) trainee', async () => {
      await expect(
        assertGate(makeController({ traineeLocked: true })),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an end date before the start date', async () => {
      await expect(
        assertGate(makeController({}), { ...dto, startDate: '2026-04-01', endDate: '2026-01-01' }),
      ).rejects.toThrow(/يسبق تاريخ النهاية/);
    });

    it('refuses unparseable dates', async () => {
      await expect(
        assertGate(makeController({}), { ...dto, startDate: 'not-a-date' }),
      ).rejects.toThrow(/غير صالحة/);
    });
  });
});

/**
 * PATCH /rotations/:id. ScopeGuard establishes that the caller may touch this
 * rotation; these cover what it does not — the replacement ids in the body,
 * which are checked against the rotation's own hospital.
 */
describe('RotationsController edit gate', () => {
  const HOSPITAL_A = 'hospital-A';
  const HOSPITAL_B = 'hospital-B';

  function makeController(opts: { departmentOrgId?: string; trainerOrgId?: string } = {}) {
    const prisma = {
      rotation: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: HOSPITAL_A,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-04-01'),
        }),
      },
      department: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: opts.departmentOrgId ?? HOSPITAL_A,
        }),
      },
      trainerProfile: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: opts.trainerOrgId ?? HOSPITAL_A,
        }),
      },
    } as any;
    return new RotationsController(prisma);
  }

  const assertEdit = (c: RotationsController, dto: any) =>
    (c as any).assertRotationEditTargetsUsable('rotation-1', dto);

  it("refuses moving a rotation onto another hospital's trainer", async () => {
    await expect(
      assertEdit(makeController({ trainerOrgId: HOSPITAL_B }), { trainerProfileId: 'trainer-B' }),
    ).rejects.toThrow(/مدرب من مستشفى آخر/);
  });

  it("refuses moving a rotation into another hospital's department", async () => {
    await expect(
      assertEdit(makeController({ departmentOrgId: HOSPITAL_B }), { departmentId: 'dept-B' }),
    ).rejects.toThrow(/قسم في مستشفى آخر/);
  });

  it('allows a same-hospital trainer and department swap', async () => {
    await expect(
      assertEdit(makeController(), { trainerProfileId: 'trainer-A2', departmentId: 'dept-A2' }),
    ).resolves.toBeUndefined();
  });

  it('keeps dates coherent when only one end is moved', async () => {
    // Existing window is 2026-01-01 → 2026-04-01; pulling the start past the
    // stored end must fail even though endDate was not sent.
    await expect(
      assertEdit(makeController(), { startDate: '2026-06-01' }),
    ).rejects.toThrow(/يسبق تاريخ النهاية/);
  });

  it('accepts a valid date move', async () => {
    await expect(
      assertEdit(makeController(), { startDate: '2026-02-01' }),
    ).resolves.toBeUndefined();
  });
});
