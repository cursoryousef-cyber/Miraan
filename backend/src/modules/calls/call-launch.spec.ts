import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CallsController } from './calls.controller';

/**
 * POST /calls/launch. The sender is resolved from the session, never from the
 * body, and hospital scope was already enforced on every recipient query. What
 * these cover is the gap inside one hospital: explicitly named recipients must
 * be trainees the launching trainer actually trains.
 */
describe('CallsController launch recipient ownership', () => {
  const HOSPITAL_A = 'hospital-A';
  const TRAINER_A = 'trainer-profile-A';
  const MINE = 'trainee-mine';
  const THEIRS = 'trainee-of-trainer-B';

  function makeController(opts: {
    /** Trainees resolvable inside the caller's hospital. */
    inHospital?: string[];
    /** Trainees linked to the caller by an active rotation. */
    byRotation?: string[];
    /** Trainees linked to the caller by an open allocation. */
    byAllocation?: string[];
    /** false → caller is a supervisor launching on the hospital's behalf. */
    callerIsTrainer?: boolean;
  }) {
    const inHospital = opts.inHospital ?? [MINE, THEIRS];

    const prisma = {
      trainerProfile: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          // Second call form checks "is this the caller's own trainer profile".
          if (where?.person && where?.id) {
            return opts.callerIsTrainer === false ? null : { id: TRAINER_A };
          }
          return { id: TRAINER_A, departmentId: 'dept-A' };
        }),
      },
      traineeProfile: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          const asked: string[] = where.id?.in ?? [];
          return asked.filter((id) => inHospital.includes(id)).map((id) => ({ id }));
        }),
      },
      // Both stand in for the real queries, which filter on the named ids —
      // returning rows outside that set would not model the database.
      rotation: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          const asked: string[] = where.traineeProfileId?.in ?? [];
          return (opts.byRotation ?? [])
            .filter((id) => asked.includes(id))
            .map((id) => ({ traineeProfileId: id }));
        }),
      },
      traineeAllocation: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          const asked: string[] = where.traineeProfileId?.in ?? [];
          return (opts.byAllocation ?? [])
            .filter((id) => asked.includes(id))
            .map((id) => ({ traineeProfileId: id }));
        }),
      },
      trainerCall: {
        // Reached only if validation passed; failing here proves the guard let
        // the launch through rather than stopping it.
        findFirst: jest.fn().mockRejectedValue(new Error('REACHED_CALL_CREATION')),
      },
      department: { findFirst: jest.fn().mockResolvedValue({ id: 'dept-A' }) },
    } as any;

    return new CallsController(prisma);
  }

  const user = { accountId: 'acct-A', organizationId: HOSPITAL_A, roles: ['trainer'] } as any;
  const launch = (c: CallsController, targetTraineeIds: string[], targetType = 'selected_trainees') =>
    c.launchCall(user, { callType: 'urgent', targetType, targetTraineeIds } as any);

  it('lets a trainer call a trainee held by an active rotation', async () => {
    const c = makeController({ byRotation: [MINE] });
    await expect(launch(c, [MINE])).rejects.toThrow('REACHED_CALL_CREATION');
  });

  it('lets a trainer call a trainee held by an open allocation', async () => {
    const c = makeController({ byAllocation: [MINE] });
    await expect(launch(c, [MINE])).rejects.toThrow('REACHED_CALL_CREATION');
  });

  it("refuses another trainer's trainee in the same hospital", async () => {
    const c = makeController({ byRotation: [MINE] });
    await expect(launch(c, [THEIRS])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses the whole launch when one of several recipients is not the caller\'s', async () => {
    const c = makeController({ byRotation: [MINE] });
    await expect(launch(c, [MINE, THEIRS])).rejects.toThrow(/غير مسند إليك/);
  });

  it('refuses a trainee from another hospital', async () => {
    const c = makeController({ inHospital: [MINE], byRotation: [MINE] });
    await expect(launch(c, [MINE, 'trainee-hospital-B'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses an unknown trainee id instead of silently dropping it', async () => {
    const c = makeController({ inHospital: [MINE], byRotation: [MINE] });
    await expect(launch(c, ['does-not-exist'])).rejects.toThrow(/غير موجود أو لا يتبع/);
  });

  it('leaves hospital-wide launches by a supervisor unrestricted by rotation ownership', async () => {
    // A supervisor holds no trainer profile of their own; they are not a
    // rotation owner, so the ownership rule does not apply to them.
    const c = makeController({ callerIsTrainer: false });
    await expect(launch(c, [MINE, THEIRS])).rejects.toThrow('REACHED_CALL_CREATION');
  });

  it('leaves department broadcast untouched — no named ids, no ownership check', async () => {
    const c = makeController({});
    await expect(
      c.launchCall(user, { callType: 'urgent', targetType: 'department' } as any),
    ).rejects.toThrow('REACHED_CALL_CREATION');
  });
});
