import { OperationsController } from './operations.controller';

/**
 * The trainer dashboard's counts.
 *
 * The tiles are the trainer's own scope and nothing wider: their trainees, their
 * records, their sessions, their seats. Two of the counts were not: the pending
 * logbook figure filtered on `trainerProfileId` alone and so read zero while the
 * trainee's records waited, and the open-call figure counted every call running
 * in the hospital for a role scoped to itself.
 */
describe('OperationsController trainer dashboard scope', () => {
  function makeController() {
    const calls: Record<string, any> = {};
    const prisma = {
      trainerProfile: {
        findFirst: jest.fn().mockResolvedValue({ id: 'trainer-A', maxTrainees: 3, person: {}, department: null }),
      },
      traineeProfile: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{ id: 'trainee-A', programId: 'prog-1' }]),
      },
      attendance: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      clinicalCaseLog: {
        count: jest.fn().mockImplementation((args: any) => { calls.logbook = args.where; return Promise.resolve(2); }),
      },
      rotation: { count: jest.fn().mockResolvedValue(1) },
      trainerCall: {
        count: jest.fn().mockImplementation((args: any) => { calls.calls = args.where; return Promise.resolve(0); }),
      },
      task: { count: jest.fn().mockResolvedValue(0) },
      notification: { count: jest.fn().mockResolvedValue(0) },
      competencyProgress: { count: jest.fn().mockResolvedValue(3) },
      evaluation: {
        count: jest.fn().mockImplementation((args: any) => { calls.evaluations = args.where; return Promise.resolve(4); }),
      },
      scheduleSession: {
        count: jest.fn().mockImplementation((args: any) => { calls.sessions = args.where; return Promise.resolve(1); }),
      },
    } as any;
    const evaluationService = { myPendingEvaluations: jest.fn().mockResolvedValue({ data: [] }) } as any;
    const controller = new OperationsController(prisma, {} as any, evaluationService);
    const user = { accountId: 'acct-A', personId: 'p-A', organizationId: 'hospital-A', roles: ['trainer'] };
    return { controller, user, calls };
  }

  // I
  it('counts pending records across the caller’s own trainees, not only stamped ones', async () => {
    const { controller, user, calls } = makeController();
    await controller.trainerDashboard(user as any);
    expect(calls.logbook.OR).toHaveLength(2);
    expect(calls.logbook.status).toEqual({ in: ['submitted', 'modification_requested'] });
  });

  // J
  it('counts only the caller’s own open calls', async () => {
    const { controller, user, calls } = makeController();
    await controller.trainerDashboard(user as any);
    expect(calls.calls.trainerProfileId).toBe('trainer-A');
  });

  it('counts only the evaluations the caller authored', async () => {
    const { controller, user, calls } = makeController();
    await controller.trainerDashboard(user as any);
    expect(calls.evaluations.evaluatorId).toBe('acct-A');
  });

  it('counts only the caller’s own sessions, from today onwards', async () => {
    const { controller, user, calls } = makeController();
    await controller.trainerDashboard(user as any);
    expect(calls.sessions.trainerProfileId).toBe('trainer-A');
    expect(calls.sessions.status).toEqual({ not: 'cancelled' });
  });

  it('derives seats from the caller’s own capacity', async () => {
    const { controller, user } = makeController();
    const res: any = await controller.trainerDashboard(user as any);
    expect(res.data.seatCapacity).toBe(3);
    expect(res.data.availableSeats).toBe(2);
  });

  it('reports the distinct programmes of the caller’s trainees', async () => {
    const { controller, user } = makeController();
    const res: any = await controller.trainerDashboard(user as any);
    expect(res.data.trainingPrograms).toBe(1);
  });
});
