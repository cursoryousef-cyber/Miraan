import { ConflictException } from '@nestjs/common';
import { RotationsController } from './rotations.controller';
import { TRAINEE_ROW_STATUS } from '../../common/status-constants';

/**
 * A trainee occupies one rotation at a time.
 *
 * AllocationEngine enforces this as its `timeline_compatibility` constraint, but
 * POST /rotations reaches the same end state without going through the engine —
 * so the rule held on one path and not the other, and trainees exist in the test
 * data placed in two departments across identical dates.
 *
 * The comparison here is the engine's (`start <= existingEnd && end >= existingStart`),
 * so the two paths agree on what a clash is. Adjacent rotations — one starting the
 * day after another ends — are a normal training programme and must stay allowed.
 */
describe('RotationsController overlap gate', () => {
  const HOSPITAL = 'hospital-A';
  const TRAINEE = 'trainee-1';

  function makeController(existingRotation: any | null) {
    const prisma = {
      traineeProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: TRAINEE,
          organizationId: HOSPITAL,
          isLocked: false,
        }),
      },
      trainingRequestTrainee: {
        findFirst: jest.fn().mockResolvedValue({ status: TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED }),
      },
      department: { findUnique: jest.fn().mockResolvedValue({ organizationId: HOSPITAL }) },
      trainerProfile: { findUnique: jest.fn().mockResolvedValue({ organizationId: HOSPITAL }) },
      rotation: {
        findFirst: jest.fn().mockResolvedValue(existingRotation),
        create: jest.fn().mockResolvedValue({ id: 'new-rotation' }),
      },
    } as any;
    return { controller: new RotationsController(prisma, { getDepartmentOccupancy: jest.fn().mockResolvedValue({ capacity: 0, occupied: 0, available: 0, occupancyPercentage: 0 }) } as any), prisma };
  }

  const user = { organizationId: HOSPITAL, roles: ['hospital_training_admin'] } as any;
  const scope = { organizationId: HOSPITAL, visibleOrgIds: [HOSPITAL] } as any;

  const dto = (startDate: string, endDate: string) => ({
    traineeProfileId: TRAINEE,
    departmentId: 'dept-1',
    trainerProfileId: 'trainer-1',
    startDate,
    endDate,
  });

  const existing = (startDate: string, endDate: string) => ({
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    department: { nameAr: 'الباطنة' },
  });

  it('refuses a rotation whose window collides with an existing one', async () => {
    const { controller, prisma } = makeController(existing('2026-08-01', '2026-09-30'));

    await expect(
      controller.createRotation(user, dto('2026-09-01', '2026-10-01'), scope),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.rotation.create).not.toHaveBeenCalled();
  });

  it('names the conflicting rotation in Arabic so the caller can act on it', async () => {
    const { controller } = makeController(existing('2026-08-01', '2026-09-30'));

    await expect(
      controller.createRotation(user, dto('2026-09-01', '2026-10-01'), scope),
    ).rejects.toThrow(/الباطنة.*2026-08-01.*2026-09-30/);
  });

  it('refuses an identical window — the case present in the seeded data', async () => {
    const { controller, prisma } = makeController(existing('2026-08-01', '2026-09-30'));

    await expect(
      controller.createRotation(user, dto('2026-08-01', '2026-09-30'), scope),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.rotation.create).not.toHaveBeenCalled();
  });

  it('allows an adjacent rotation starting after the previous one ends', async () => {
    // The query is what decides this, so a non-clashing search returns null.
    const { controller, prisma } = makeController(null);

    await controller.createRotation(user, dto('2026-10-01', '2026-11-30'), scope);

    expect(prisma.rotation.create).toHaveBeenCalled();
  });

  it('searches with the engine comparison and ignores cancelled rotations', async () => {
    const { controller, prisma } = makeController(null);

    await controller.createRotation(user, dto('2026-10-01', '2026-11-30'), scope);

    expect(prisma.rotation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          traineeProfileId: TRAINEE,
          status: { notIn: ['cancelled', 'completed'] },
          startDate: { lte: new Date('2026-11-30') },
          endDate: { gte: new Date('2026-10-01') },
        }),
      }),
    );
  });

  it('creates the rotation when the trainee has no other placement', async () => {
    const { controller, prisma } = makeController(null);

    await controller.createRotation(user, dto('2026-08-01', '2026-09-30'), scope);

    expect(prisma.rotation.create).toHaveBeenCalled();
  });
});
