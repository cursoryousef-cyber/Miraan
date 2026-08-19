import { ForbiddenException } from '@nestjs/common';
import { SchedulesService } from './schedules.service';

/**
 * `GET /schedules?traineeId=…` let a trainee read another trainee's schedule.
 *
 * The trainee branch scopes `whereClause.participants` to the caller's own
 * profile, but the generic `traineeId` filter further down assigns to that same
 * key — overwriting the scoping rather than narrowing it. A trainee passing a
 * colleague's profile id therefore had their own filter replaced and received
 * that colleague's published schedules.
 *
 * The fix refuses a foreign id for a trainee caller, matching the rule the
 * attendance endpoint already applies to the identical parameter.
 */
describe('SchedulesService.findAll — trainee scope', () => {
  const MY_PROFILE = 'trainee-profile-mine';
  const OTHER_PROFILE = 'trainee-profile-other';

  function makeService() {
    const captured: any = {};
    const prisma = {
      traineeProfile: { findFirst: jest.fn().mockResolvedValue({ id: MY_PROFILE }) },
      trainerProfile: { findFirst: jest.fn().mockResolvedValue(null) },
      trainingSchedule: {
        findMany: jest.fn(async (args: any) => {
          captured.where = args.where;
          return [];
        }),
      },
    } as any;
    const service = new SchedulesService(prisma, {} as any);
    return { service, captured };
  }

  const traineeUser = {
    accountId: 'acct-1',
    organizationId: 'hospital-A',
    roles: ['trainee'],
  } as any;

  it('refuses a trainee asking for another trainee’s schedule', async () => {
    const { service } = makeService();

    await expect(
      service.findAll(traineeUser, { traineeId: OTHER_PROFILE }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a trainee to pass their own id', async () => {
    const { service, captured } = makeService();

    await service.findAll(traineeUser, { traineeId: MY_PROFILE });

    expect(captured.where.participants).toEqual({ some: { traineeProfileId: MY_PROFILE } });
  });

  it('scopes an unparameterised trainee request to their own profile and published only', async () => {
    const { service, captured } = makeService();

    await service.findAll(traineeUser, {});

    expect(captured.where.participants).toEqual({ some: { traineeProfileId: MY_PROFILE } });
    expect(captured.where.status).toBe('published');
    expect(captured.where.organizationId).toBe('hospital-A');
  });

  it('leaves the hospital training admin free to filter by any trainee', async () => {
    const { service, captured } = makeService();
    const adminUser = { accountId: 'acct-2', organizationId: 'hospital-A', roles: ['hospital_training_admin'] } as any;

    await service.findAll(adminUser, { traineeId: OTHER_PROFILE });

    expect(captured.where.participants).toEqual({ some: { traineeProfileId: OTHER_PROFILE } });
  });
});
