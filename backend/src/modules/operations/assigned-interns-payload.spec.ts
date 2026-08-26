import { OperationsController } from './operations.controller';

/**
 * The payload the trainer's roster returns.
 *
 * Two omissions here made the evaluation form un-submittable for every trainer,
 * and neither was visible from the API alone — the endpoint answered 200 both
 * times, and a direct POST with hand-picked ids succeeded.
 *
 *  1. `person` was included without `userAccounts`. An evaluation is filed
 *     against the trainee's *user account*, so the client had no evaluatee id
 *     and the form showed "تعذر تحديد حساب المتدرب المرتبط".
 *  2. Every active rotation was returned. A trainee can hold more than one at a
 *     time — the E2E trainee runs الباطنة under this trainer and الأطفال under
 *     another — so the form bound to whichever came back first and the submit
 *     was refused: "لا يمكنك تقييم متدرب في دورة تدريبية غير مسندة إليك".
 */
describe('OperationsController assigned-interns payload', () => {
  const TRAINER_ID = 'trainer-A';

  function makeController(roles: string[]) {
    const captured: { include?: any } = {};
    const prisma = {
      trainerProfile: {
        findFirst: jest.fn().mockResolvedValue({ id: TRAINER_ID, person: {}, department: null }),
      },
      traineeProfile: {
        findMany: jest.fn().mockImplementation((args: any) => {
          captured.include = args.include;
          return Promise.resolve([]);
        }),
      },
    } as any;
    const controller = new OperationsController(prisma, {} as any, {} as any);
    const user = { accountId: 'acct-A', personId: 'p-A', organizationId: 'hospital-A', roles };
    return { controller, user, captured };
  }

  // 21
  it('includes the trainee user account, which the evaluation is filed against', async () => {
    const { controller, user, captured } = makeController(['trainer']);
    await controller.assignedInterns(user as any);
    expect(captured.include.person.include.userAccounts).toBeDefined();
  });

  // 22
  it('selects only the account id and active flag — no credentials leave the server', async () => {
    const { controller, user, captured } = makeController(['trainer']);
    await controller.assignedInterns(user as any);
    const select = captured.include.person.include.userAccounts.select;
    expect(Object.keys(select).sort()).toEqual(['id', 'isActive']);
  });

  // 23
  it("returns a trainer only the active rotations that trainer supervises", async () => {
    const { controller, user, captured } = makeController(['trainer']);
    await controller.assignedInterns(user as any);
    expect(captured.include.rotations.where).toEqual({
      status: 'active',
      trainerProfileId: TRAINER_ID,
    });
  });

  // 24
  it('leaves supervisory callers every active rotation', async () => {
    const { controller, user, captured } = makeController(['org_manager']);
    await controller.assignedInterns(user as any);
    expect(captured.include.rotations.where).toEqual({ status: 'active' });
  });

  // 25
  it('still includes the department each rotation runs in', async () => {
    const { controller, user, captured } = makeController(['trainer']);
    await controller.assignedInterns(user as any);
    expect(captured.include.rotations.include.department).toBe(true);
  });
});
