import { OperationsController } from './operations.controller';

/**
 * Who may *read* an evaluation.
 *
 * GET /operations/evaluations used to filter on organizationId alone. The
 * capability guard in front of it admits `trainee` (SELF_VIEW) and plain
 * `trainer` (EVALUATION_SUBMIT), so the response handed every one of them the
 * whole hospital's scores. These assert the row filter the handler now builds —
 * the boundary a caller bypassing the UI would meet.
 */
describe('GET /operations/evaluations read scope', () => {
  const ORG = 'hospital-1';
  const TRAINER_PROFILE = 'trainer-profile-A';

  function makeController(trainerProfileId: string | null) {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      evaluation: { findMany },
      trainerProfile: {
        findFirst: jest.fn().mockResolvedValue(
          trainerProfileId ? { id: trainerProfileId } : null,
        ),
        create: jest.fn(),
      },
    } as any;
    const controller = new OperationsController(prisma, {} as any, {} as any);
    return { controller, findMany };
  }

  const user = (roles: string[], accountId = 'acct-1') =>
    ({ accountId, personId: 'person-1', organizationId: ORG, roles }) as any;

  it('limits a trainee to evaluations they received or authored', async () => {
    const { controller, findMany } = makeController(null);
    await controller.evaluations(user(['trainee']));

    const where = findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe(ORG);
    expect(where.OR).toEqual([
      { evaluateeId: 'acct-1' },
      { evaluatorId: 'acct-1' },
    ]);
  });

  it('limits a trainer to their own scores and their assigned trainees', async () => {
    const { controller, findMany } = makeController(TRAINER_PROFILE);
    await controller.evaluations(user(['trainer']));

    const where = findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe(ORG);
    expect(where.OR[0]).toEqual({ evaluatorId: 'acct-1' });
    // The trainee side is the same active-rotation link every other
    // trainer-facing endpoint scopes by.
    expect(
      where.OR[1].evaluatee.person.traineeProfile.rotations.some,
    ).toEqual({
      trainerProfileId: TRAINER_PROFILE,
      organizationId: ORG,
      status: 'active',
    });
  });

  it('falls back to authored-only when no trainer profile resolves', async () => {
    const { controller, findMany } = makeController(null);
    await controller.evaluations(user(['trainer']));

    // Must never widen to the organisation when the trainer link is missing.
    expect(findMany.mock.calls[0][0].where.evaluatorId).toBe('acct-1');
  });

  it('leaves supervisory roles hospital-wide', async () => {
    for (const role of [
      'hospital_training_admin',
      'academic_supervisor',
      'org_manager',
      'platform_owner',
    ]) {
      const { controller, findMany } = makeController(null);
      await controller.evaluations(user([role]));
      const where = findMany.mock.calls[0][0].where;
      expect(where).toEqual({ organizationId: ORG });
    }
  });

  it('does not widen for a trainer who also supervises', async () => {
    // A trainer who additionally holds hospital training administration keeps
    // the wider read that role already grants — the roles are additive, and
    // this asserts the precedence is deliberate rather than accidental.
    const { controller, findMany } = makeController(TRAINER_PROFILE);
    await controller.evaluations(user(['trainer', 'hospital_training_admin']));
    expect(findMany.mock.calls[0][0].where).toEqual({ organizationId: ORG });
  });
});
