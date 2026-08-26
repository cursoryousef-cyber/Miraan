import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LogbookController } from './logbook.controller';

/**
 * Competency portfolio, read and write.
 *
 * The trainer app never showed a portfolio: the only caller was the trainee
 * screen, which omits `traineeId`, and without it the endpoint resolves the
 * *caller's own* trainee profile — a trainer has none, so the answer was always
 * an empty list. The trainer client now passes `traineeId`, which is the path
 * that runs `assertTrainerScope`, so these pin both halves: the portfolio a
 * trainer is entitled to, and the refusal for a trainee who is not theirs.
 */
describe('LogbookController competency portfolio', () => {
  const TRAINEE_A = 'trainee-profile-A';

  const rows = [
    { id: 'cp-1', traineeProfileId: TRAINEE_A, requiredCount: 10, completedCount: 1, status: 'in_progress' },
    { id: 'cp-2', traineeProfileId: TRAINEE_A, requiredCount: 5, completedCount: 1, status: 'in_progress' },
    { id: 'cp-3', traineeProfileId: TRAINEE_A, requiredCount: 15, completedCount: 2, status: 'in_progress' },
  ];

  function makeController(opts: { assigned: boolean; ownTraineeProfileId?: string }) {
    const prisma = {
      trainerProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'trainer-A' }) },
      traineeAllocation: {
        findFirst: jest.fn().mockResolvedValue(opts.assigned ? { id: 'alloc-1' } : null),
      },
      rotation: { findFirst: jest.fn().mockResolvedValue(null) },
      traineeProfile: {
        findFirst: jest.fn().mockResolvedValue(
          opts.ownTraineeProfileId ? { id: opts.ownTraineeProfileId } : null,
        ),
        findUnique: jest.fn().mockResolvedValue({ organizationId: 'hospital-A', isLocked: false }),
      },
      competencyProgress: {
        findMany: jest.fn().mockResolvedValue(rows),
        findUnique: jest.fn().mockResolvedValue(rows[0]),
        update: jest.fn().mockImplementation(({ data }: any) => ({ ...rows[0], ...data })),
      },
    } as any;

    const scopeContext = {
      resolve: jest.fn().mockResolvedValue({ visibleOrgIds: null }),
      assertOrgInScope: jest.fn(),
    } as any;

    return new LogbookController(prisma, scopeContext);
  }

  const trainer = { accountId: 'acct-A', roles: ['trainer'], organizationId: 'hospital-A', personId: 'p-A' };

  // 11
  it('returns the assigned trainee portfolio with totals summed from the rows', async () => {
    const c = makeController({ assigned: true });
    const res: any = await c.getCompetencies(trainer as any, TRAINEE_A);
    expect(res.totalRequired).toBe(30);
    expect(res.totalCompleted).toBe(4);
    expect(res.overallPercentage).toBe(13);
    expect(res.data).toHaveLength(3);
  });

  // 12
  it("refuses the portfolio of a trainee who is not assigned to the caller", async () => {
    const c = makeController({ assigned: false });
    await expect(c.getCompetencies(trainer as any, 'trainee-of-trainer-B')).rejects.toThrow(
      ForbiddenException,
    );
  });

  // 13
  it('returns an empty portfolio, not an error, when a trainer omits traineeId', async () => {
    // A trainer has no trainee profile of their own, so the self-resolution finds
    // nothing. This is why the trainer screen must send an explicit traineeId.
    const c = makeController({ assigned: true });
    const res: any = await c.getCompetencies(trainer as any, undefined);
    expect(res.data).toEqual([]);
    expect(res.overallPercentage).toBe(0);
  });

  // 14
  it('omitting traineeId never runs the trainer scope gate — it reads the caller only', async () => {
    const c = makeController({ assigned: false });
    const res: any = await c.getCompetencies(trainer as any, undefined);
    expect(res.data).toEqual([]);
  });

  // 15
  it('a percentage is never reported above 100 even if completed exceeds required', async () => {
    const c = makeController({ assigned: true });
    (c as any).prisma.competencyProgress.findMany.mockResolvedValue([
      { id: 'cp-x', traineeProfileId: TRAINEE_A, requiredCount: 2, completedCount: 9, status: 'completed' },
    ]);
    const res: any = await c.getCompetencies(trainer as any, TRAINEE_A);
    expect(res.overallPercentage).toBe(100);
  });

  describe('manual correction', () => {
    // 16
    it('updates a competency for an assigned trainee', async () => {
      const c = makeController({ assigned: true });
      const res: any = await c.updateCompetency('cp-1', trainer as any, { completedCount: 3 });
      expect(res.success).toBe(true);
      expect(res.data.completedCount).toBe(3);
    });

    // 17
    it("refuses to update a competency belonging to another trainer's trainee", async () => {
      const c = makeController({ assigned: false });
      await expect(
        c.updateCompetency('cp-1', trainer as any, { completedCount: 3 }),
      ).rejects.toThrow(ForbiddenException);
    });

    // 18
    it('refuses a negative count', async () => {
      const c = makeController({ assigned: true });
      await expect(
        c.updateCompetency('cp-1', trainer as any, { completedCount: -1 }),
      ).rejects.toThrow(/أرقاماً موجبة/);
    });

    // 19
    it('marks a competency completed once the target is reached', async () => {
      const c = makeController({ assigned: true });
      const res: any = await c.updateCompetency('cp-1', trainer as any, { completedCount: 10 });
      expect(res.data.status).toBe('completed');
    });

    // 20
    it('reports a missing competency record rather than creating one', async () => {
      const c = makeController({ assigned: true });
      (c as any).prisma.competencyProgress.findUnique.mockResolvedValue(null);
      await expect(
        c.updateCompetency('nope', trainer as any, { completedCount: 1 }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
