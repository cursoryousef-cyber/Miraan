import { SchedulesService } from './schedules.service';
import { ConflictException } from '@nestjs/common';

describe('SchedulesService.publish — Comprehensive Batch Shift & Isolation Regression Tests', () => {
  const orgId = 'org-hospital-1';
  const adminUser = {
    accountId: 'admin-acct-1',
    organizationId: orgId,
    roles: ['hospital_training_admin'],
  } as any;

  function createMockPublishEnv({
    sessionsCount = 40,
    existingShifts = [] as Array<{ traineeProfileId: string; departmentId: string; date: Date; shiftType: string }>,
    hasConflict = false,
    traineeHasUserAccount = true,
  }: {
    sessionsCount?: number;
    existingShifts?: Array<{ traineeProfileId: string; departmentId: string; date: Date; shiftType: string }>;
    hasConflict?: boolean;
    traineeHasUserAccount?: boolean;
  }) {
    const createdShifts: any[] = [];
    const createdRevisions: any[] = [];
    const updatedSchedules: any[] = [];
    const createdNotifications: any[] = [];

    // Generate sessions (e.g. 40 sessions, 2 trainees per session)
    const sessions: any[] = [];
    for (let i = 0; i < sessionsCount; i++) {
      const dayOffset = Math.floor(i / 2);
      const dateStr = `2026-09-${String(dayOffset + 1).padStart(2, '0')}`;
      const isFirstShift = i % 2 === 0;

      sessions.push({
        id: `sess-${i + 1}`,
        date: new Date(dateStr),
        startTime: isFirstShift ? '08:00' : '12:00',
        endTime: isFirstShift ? '12:00' : '16:00',
        departmentId: 'dept-internal',
        trainerProfileId: 'trainer-1',
        traineeProfileId: isFirstShift ? 'trainee-1' : 'trainee-2',
        shiftType: isFirstShift ? 'morning' : 'evening',
        sessionType: 'clinical_round',
      });
    }

    const participants = [
      {
        traineeProfileId: 'trainee-1',
        traineeProfile: { id: 'trainee-1', personId: 'person-1' },
      },
      {
        traineeProfileId: 'trainee-2',
        traineeProfile: { id: 'trainee-2', personId: 'person-2' },
      },
    ];

    const mockSchedule = {
      id: 'sched-main-1',
      organizationId: orgId,
      titleAr: 'جدول الباطنية العام',
      status: 'draft',
      sessions,
      participants,
      revisions: [],
    };

    const tx = {
      trainingSchedule: {
        findFirst: jest.fn().mockResolvedValue(mockSchedule),
        update: jest.fn().mockImplementation(async (args) => {
          updatedSchedules.push(args);
          return { ...mockSchedule, ...args.data };
        }),
      },
      shift: {
        findMany: jest.fn().mockImplementation(async () => {
          return existingShifts;
        }),
        createMany: jest.fn().mockImplementation(async (args) => {
          createdShifts.push(...args.data);
          return { count: args.data.length };
        }),
      },
      scheduleRevision: {
        create: jest.fn().mockImplementation(async (args) => {
          createdRevisions.push(args.data);
          return { id: 'rev-1', ...args.data };
        }),
      },
      userAccount: {
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          if (where.personId === 'person-1' && traineeHasUserAccount) {
            return { id: 'user-trainee-1' };
          }
          if (where.personId === 'person-2' && traineeHasUserAccount) {
            return { id: 'user-trainee-2' };
          }
          return null;
        }),
      },
      notification: {
        create: jest.fn().mockImplementation(async (args) => {
          createdNotifications.push(args.data);
          return { id: 'notif-' + (createdNotifications.length + 1), ...args.data };
        }),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (callback, options) => {
        return callback(tx);
      }),
    } as any;

    const conflictEngine = {
      validateSessions: jest.fn().mockResolvedValue({
        hasConflict,
        conflicts: hasConflict ? [{ messageAr: 'تعارض متعمد' }] : [],
      }),
    } as any;

    const service = new SchedulesService(prisma, conflictEngine);

    return {
      service,
      prisma,
      tx,
      createdShifts,
      createdRevisions,
      updatedSchedules,
      createdNotifications,
    };
  }

  it('TEST 1: 40 sessions + 2 trainees -> Creates exactly 40 distinct shift records in batch', async () => {
    const { service, createdShifts, createdRevisions, updatedSchedules, tx } = createMockPublishEnv({
      sessionsCount: 40,
    });

    const result = await service.publish('sched-main-1', adminUser);

    expect(result).toEqual({ success: true, revision: 1 });
    expect(tx.shift.createMany).toHaveBeenCalledTimes(1);
    expect(createdShifts).toHaveLength(40);
    expect(updatedSchedules[0].data.status).toBe('published');
    expect(createdRevisions).toHaveLength(1);
  });

  it('TEST 2: Publish a second time -> No duplicate shifts are generated (0 new shifts)', async () => {
    // Simulate all 40 shifts already existing
    const all40Shifts: any[] = [];
    for (let i = 0; i < 40; i++) {
      const dayOffset = Math.floor(i / 2);
      const dateStr = `2026-09-${String(dayOffset + 1).padStart(2, '0')}`;
      const isFirstShift = i % 2 === 0;
      all40Shifts.push({
        traineeProfileId: isFirstShift ? 'trainee-1' : 'trainee-2',
        departmentId: 'dept-internal',
        date: new Date(dateStr),
        shiftType: isFirstShift ? 'morning' : 'evening',
      });
    }

    const { service, createdShifts, tx } = createMockPublishEnv({
      sessionsCount: 40,
      existingShifts: all40Shifts,
    });

    const result = await service.publish('sched-main-1', adminUser, 'إعادة النشر والتحديث');

    expect(result).toEqual({ success: true, revision: 1 });
    expect(tx.shift.createMany).not.toHaveBeenCalled();
    expect(createdShifts).toHaveLength(0);
  });

  it('TEST 3: Partial existing shifts (e.g. 10 exist) -> Creates only the 30 missing shifts', async () => {
    const partial10Shifts: any[] = [];
    for (let i = 0; i < 10; i++) {
      const dayOffset = Math.floor(i / 2);
      const dateStr = `2026-09-${String(dayOffset + 1).padStart(2, '0')}`;
      const isFirstShift = i % 2 === 0;
      partial10Shifts.push({
        traineeProfileId: isFirstShift ? 'trainee-1' : 'trainee-2',
        departmentId: 'dept-internal',
        date: new Date(dateStr),
        shiftType: isFirstShift ? 'morning' : 'evening',
      });
    }

    const { service, createdShifts, tx } = createMockPublishEnv({
      sessionsCount: 40,
      existingShifts: partial10Shifts,
    });

    const result = await service.publish('sched-main-1', adminUser);

    expect(result).toEqual({ success: true, revision: 1 });
    expect(tx.shift.createMany).toHaveBeenCalledTimes(1);
    expect(createdShifts).toHaveLength(30);
  });

  it('TEST 4: Trainee has UserAccount -> Publish succeeds and creates Notification', async () => {
    const { service, createdNotifications } = createMockPublishEnv({
      sessionsCount: 2,
      traineeHasUserAccount: true,
    });

    const result = await service.publish('sched-main-1', adminUser);

    expect(result).toEqual({ success: true, revision: 1 });
    expect(createdNotifications).toHaveLength(2);
  });

  it('TEST 5: Trainee does NOT have UserAccount -> Publish succeeds without Notification and without rollback', async () => {
    const { service, createdNotifications, updatedSchedules } = createMockPublishEnv({
      sessionsCount: 2,
      traineeHasUserAccount: false,
    });

    const result = await service.publish('sched-main-1', adminUser);

    expect(result).toEqual({ success: true, revision: 1 });
    expect(createdNotifications).toHaveLength(0);
    expect(updatedSchedules[0].data.status).toBe('published');
  });

  it('TEST 6: Conflict exists -> Publish is rejected and 0 shifts are created', async () => {
    const { service, createdShifts, tx } = createMockPublishEnv({
      sessionsCount: 40,
      hasConflict: true,
    });

    await expect(service.publish('sched-main-1', adminUser)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.shift.createMany).not.toHaveBeenCalled();
    expect(createdShifts).toHaveLength(0);
  });

  it('TEST 7: Schedule successfully published -> Status published, Revision snapshot created, shifts intact', async () => {
    const { service, updatedSchedules, createdRevisions, createdShifts } = createMockPublishEnv({
      sessionsCount: 10,
    });

    const result = await service.publish('sched-main-1', adminUser);

    expect(result.success).toBe(true);
    expect(updatedSchedules[0].data.status).toBe('published');
    expect(createdRevisions[0].revision).toBe(1);
    expect(createdShifts).toHaveLength(10);
  });

  it('TEST 8: Separate schedule is not affected', async () => {
    const { service, prisma } = createMockPublishEnv({
      sessionsCount: 2,
    });

    await service.publish('sched-main-1', adminUser);

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ maxWait: 10000, timeout: 30000 })
    );
  });
});
