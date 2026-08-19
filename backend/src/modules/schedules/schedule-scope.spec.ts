import { ForbiddenException } from '@nestjs/common';
import { SchedulesService } from './schedules.service';

/**
 * A schedule's contents must stay inside the schedule's own hospital. The row
 * itself was never at risk — `organizationId` comes from the session — but the
 * ids naming its participants and sessions arrive from the client, so they are
 * what these exercise.
 */
describe('SchedulesService resource scoping', () => {
  const HOSPITAL_A = 'hospital-A';

  /**
   * `count` stands in for the database: an id is "in this hospital" only if the
   * fixture lists it, so a foreign or non-existent id lowers the count and the
   * assertion fails — the same way it does against a real table.
   */
  function makeService(present: {
    trainees?: string[];
    trainers?: string[];
    departments?: string[];
  }) {
    const countIn = (known: string[] = []) =>
      jest.fn().mockImplementation(({ where }) => {
        const asked: string[] = where.id.in;
        if (where.organizationId !== HOSPITAL_A) return 0;
        return asked.filter((id) => known.includes(id)).length;
      });

    const prisma = {
      traineeProfile: { count: countIn(present.trainees) },
      trainerProfile: { count: countIn(present.trainers) },
      department: { count: countIn(present.departments) },
    } as any;

    return new SchedulesService(prisma, {} as any);
  }

  const assertResources = (s: SchedulesService, resources: any, org = HOSPITAL_A) =>
    (s as any).assertScheduleResourcesInOrg(org, resources);

  it('accepts trainees, trainers and departments that all belong to the hospital', async () => {
    const service = makeService({
      trainees: ['trainee-A'],
      trainers: ['trainer-A'],
      departments: ['dept-A'],
    });
    await expect(
      assertResources(service, {
        traineeProfileIds: ['trainee-A'],
        trainerProfileIds: ['trainer-A'],
        departmentIds: ['dept-A'],
      }),
    ).resolves.toBeUndefined();
  });

  it("refuses a trainee from another hospital", async () => {
    const service = makeService({ trainees: ['trainee-A'] });
    await expect(
      assertResources(service, { traineeProfileIds: ['trainee-A', 'trainee-of-hospital-B'] }),
    ).rejects.toThrow(/المتدربين المحددين لا يتبع/);
  });

  it('refuses a trainer from another hospital', async () => {
    const service = makeService({ trainers: ['trainer-A'] });
    await expect(
      assertResources(service, { trainerProfileIds: ['trainer-of-hospital-B'] }),
    ).rejects.toThrow(/المدربين المحددين لا يتبع/);
  });

  it('refuses a department from another hospital', async () => {
    const service = makeService({ departments: ['dept-A'] });
    await expect(
      assertResources(service, { departmentIds: ['dept-of-hospital-B'] }),
    ).rejects.toThrow(/الأقسام المحددة لا يتبع/);
  });

  it('refuses ids that do not exist at all', async () => {
    const service = makeService({ trainees: [] });
    await expect(
      assertResources(service, { traineeProfileIds: ['ghost'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ignores undefined entries rather than counting them', async () => {
    const service = makeService({ departments: ['dept-A'] });
    await expect(
      assertResources(service, { departmentIds: [undefined, 'dept-A', undefined] }),
    ).resolves.toBeUndefined();
  });

  it('passes trivially when nothing is named', async () => {
    const service = makeService({});
    await expect(assertResources(service, {})).resolves.toBeUndefined();
  });

  it('excludes self schedule sessions when checking conflicts during update', async () => {
    const conflictEngine = {
      validateSessions: jest.fn().mockResolvedValue({ hasConflict: false, conflicts: [] }),
    };
    const prisma = {
      trainingSchedule: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sched-1',
          organizationId: HOSPITAL_A,
          departmentId: 'dept-A',
          participants: [{ traineeProfileId: 'trainee-A' }],
        }),
        update: jest.fn().mockResolvedValue({ id: 'sched-1' }),
      },
      scheduleSession: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'sess-new' }),
      },
      scheduleParticipant: {
        findFirst: jest.fn().mockResolvedValue({ id: 'part-1' }),
        create: jest.fn().mockResolvedValue({ id: 'part-new' }),
      },
      traineeProfile: { count: jest.fn().mockResolvedValue(1) },
      trainerProfile: { count: jest.fn().mockResolvedValue(1) },
      department: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
    } as any;

    const service = new SchedulesService(prisma, conflictEngine as any);
    service.findOne = jest.fn().mockResolvedValue({ id: 'sched-1', titleAr: 'جدول معدل' });

    const user = { accountId: 'acc-1', organizationId: HOSPITAL_A, roles: ['hospital_training_admin'] } as any;
    const dto = {
      titleAr: 'جدول معدل',
      sessions: [
        {
          date: '2026-09-08',
          startTime: '10:00',
          endTime: '12:00',
          departmentId: 'dept-A',
          trainerProfileId: 'trainer-A',
          traineeProfileId: 'trainee-A',
        },
      ],
    };

    await service.update('sched-1', user, dto);

    // Verify validateSessions was called with excludeScheduleId = 'sched-1'
    expect(conflictEngine.validateSessions).toHaveBeenCalledWith(
      HOSPITAL_A,
      expect.any(Array),
      undefined,
      'sched-1',
    );
  });

  it('preserves exact single trainee identity and does not blanket-assign other schedule participants', async () => {
    const conflictEngine = {
      validateSessions: jest.fn().mockResolvedValue({ hasConflict: false, conflicts: [] }),
    };
    const prisma = {
      trainingSchedule: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sched-multi',
          organizationId: HOSPITAL_A,
          departmentId: 'dept-A',
          participants: [
            { traineeProfileId: 'trainee-A' },
            { traineeProfileId: 'trainee-B' },
            { traineeProfileId: 'trainee-C' },
          ],
        }),
        update: jest.fn().mockResolvedValue({ id: 'sched-multi' }),
      },
      scheduleSession: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'sess-new' }),
      },
      scheduleParticipant: {
        findFirst: jest.fn().mockResolvedValue({ id: 'part-1' }),
        create: jest.fn().mockResolvedValue({ id: 'part-new' }),
      },
      traineeProfile: { count: jest.fn().mockResolvedValue(1) },
      trainerProfile: { count: jest.fn().mockResolvedValue(1) },
      department: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
    } as any;

    const service = new SchedulesService(prisma, conflictEngine as any);
    service.findOne = jest.fn().mockResolvedValue({ id: 'sched-multi', titleAr: 'جدول متعدد' });

    const user = { accountId: 'acc-1', organizationId: HOSPITAL_A, roles: ['hospital_training_admin'] } as any;
    const dto = {
      titleAr: 'جدول متعدد',
      sessions: [
        {
          date: '2026-09-08',
          startTime: '10:00',
          endTime: '12:00',
          departmentId: 'dept-A',
          trainerProfileId: 'trainer-A',
          traineeProfileId: 'trainee-A', // Only trainee-A is in this session
        },
      ],
    };

    await service.update('sched-multi', user, dto);

    // Verify ProposedSession contains ONLY trainee-A, not trainee-B or trainee-C
    expect(conflictEngine.validateSessions).toHaveBeenCalledWith(
      HOSPITAL_A,
      [
        expect.objectContaining({
          traineeProfileIds: ['trainee-A'],
          trainerProfileId: 'trainer-A',
        }),
      ],
      undefined,
      'sched-multi',
    );
  });
});
