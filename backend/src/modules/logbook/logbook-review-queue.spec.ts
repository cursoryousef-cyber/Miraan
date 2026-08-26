import { LogbookController } from './logbook.controller';

/**
 * A trainer's clinical review queue.
 *
 * `GET /logbook/cases` filtered on `trainerProfileId` alone, so a record a
 * trainee submitted without a trainer stamped on it was invisible to every
 * trainer — two of the E2E trainee's records sat at "submitted" where nobody
 * could see, let alone approve, them. The queue is the records of the trainees
 * assigned to the caller, which is the same active-rotation link the rest of the
 * trainer scope uses; it does not widen past the caller's own trainees.
 */
describe('LogbookController trainer review queue', () => {
  function makeController(roles: string[]) {
    const captured: { where?: any } = {};
    const prisma = {
      trainerProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'trainer-A' }) },
      traineeProfile: { findFirst: jest.fn().mockResolvedValue(null) },
      clinicalCaseLog: {
        findMany: jest.fn().mockImplementation((args: any) => {
          captured.where = args.where;
          return Promise.resolve([]);
        }),
      },
    } as any;
    const controller = new LogbookController(prisma, { resolve: jest.fn(), assertOrgInScope: jest.fn() } as any);
    return { controller, captured, user: { accountId: 'acct-A', organizationId: 'hospital-A', roles } };
  }

  // F
  it('includes records stamped with the caller and records of the caller’s trainees', async () => {
    const { controller, captured, user } = makeController(['trainer']);
    await controller.getCases(user as any);
    expect(captured.where.OR).toHaveLength(2);
    expect(captured.where.OR[0]).toEqual({ trainerProfileId: 'trainer-A' });
    expect(captured.where.OR[1].traineeProfile.rotations.some).toEqual({
      trainerProfileId: 'trainer-A',
      organizationId: 'hospital-A',
      status: 'active',
    });
  });

  // G
  it('stays inside the caller’s organisation', async () => {
    const { controller, captured, user } = makeController(['trainer']);
    await controller.getCases(user as any);
    expect(captured.where.organizationId).toBe('hospital-A');
  });

  // H
  it('never returns a hospital-wide queue to a trainer', async () => {
    const { controller, captured, user } = makeController(['trainer']);
    await controller.getCases(user as any);
    // Without a trainer arm the filter would be the organisation alone.
    expect(captured.where.OR).toBeDefined();
  });
});
