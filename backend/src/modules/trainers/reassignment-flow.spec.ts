import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TrainerReassignmentService } from './trainer-reassignment.service';

/**
 * The reassignment flow a hospital screen drives.
 *
 * The assignments screen knows which placement is being moved, so the sheet is
 * handed that rotation rather than asking for one again — the request therefore
 * carries a specific `rotationId`, and everything downstream must key on it. These
 * pin what the service does with that id: which rotation it reads, that it refuses
 * a trainer from another department or hospital, that a full trainer is rejected,
 * and that no other rotation is touched.
 */
describe('reassignment flow — a specific rotation moves, and only that one', () => {
  const HOSPITAL = 'hospital-A';
  const OTHER_HOSPITAL = 'hospital-B';
  const DEPT = 'dept-IM';
  const TARGET_ROTATION = 'rotation-target';
  const OTHER_ROTATION = 'rotation-other';

  function makeService(opts: {
    trainerOrgId?: string;
    trainerDeptId?: string | null;
    trainerActive?: boolean;
    available?: number;
    rotationStatus?: string;
    rotationMissing?: boolean;
    rotationOrgId?: string;
  } = {}) {
    const rotationUpdate = jest.fn().mockResolvedValue({
      id: TARGET_ROTATION,
      department: { nameAr: 'الباطنة' },
      trainerProfile: { person: { nameAr: 'المدرب الجديد' } },
      traineeProfile: { person: { nameAr: 'طالب الرحلة الأول' } },
    });

    const prisma = {
      rotation: {
        findUnique: jest.fn().mockResolvedValue(
          opts.rotationMissing
            ? null
            : {
                id: TARGET_ROTATION,
                organizationId: opts.rotationOrgId ?? HOSPITAL,
                departmentId: DEPT,
                department: { id: DEPT, nameAr: 'الباطنة' },
                status: opts.rotationStatus ?? 'active',
                endDate: new Date('2099-01-01'),
                trainerProfileId: 'trainer-current',
                trainerProfile: { person: { nameAr: 'مدرب الباطنة 1' } },
                traineeProfileId: 'trainee-1',
                traineeProfile: { person: { nameAr: 'طالب الرحلة الأول', userAccounts: [{ id: 'acct-1' }] } },
              },
        ),
        update: rotationUpdate,
      },
      trainerProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'trainer-new',
          isActive: opts.trainerActive ?? true,
          organizationId: opts.trainerOrgId ?? HOSPITAL,
          departmentId: opts.trainerDeptId === undefined ? DEPT : opts.trainerDeptId,
          person: { nameAr: 'مدرب الباطنة 2' },
          department: { nameAr: 'الباطنة' },
        }),
      },
      traineeAllocation: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      trainingRequestTrainee: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      trainerReassignment: { create: jest.fn().mockResolvedValue({ id: 'reassign-1', trainees: [] }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    } as any;

    const capacityService = {
      getTrainerOccupancy: jest.fn().mockResolvedValue({
        capacity: 3,
        occupied: 3 - (opts.available ?? 2),
        available: opts.available ?? 2,
        occupancyPercentage: 0,
      }),
    } as any;

    const notificationService = {
      create: jest.fn().mockResolvedValue({}),
      notifyOrgUsers: jest.fn().mockResolvedValue({}),
    } as any;

    return {
      service: new TrainerReassignmentService(prisma, notificationService, capacityService),
      prisma,
      capacityService,
      rotationUpdate,
    };
  }

  const dto = {
    traineeProfileId: 'trainee-1',
    rotationId: TARGET_ROTATION,
    newTrainerId: 'trainer-new',
    reason: 'administrative_decision',
  };

  describe('the selected rotation is the one acted on', () => {
    it('reads exactly the rotation the caller named', async () => {
      const { service, prisma } = makeService();
      await service.reassignSingle(dto, 'actor-1', HOSPITAL);

      expect(prisma.rotation.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: TARGET_ROTATION } }),
      );
    });

    it('updates that rotation and no other', async () => {
      const { service, rotationUpdate } = makeService();
      await service.reassignSingle(dto, 'actor-1', HOSPITAL);

      expect(rotationUpdate).toHaveBeenCalledTimes(1);
      const call = rotationUpdate.mock.calls[0][0];
      expect(call.where).toEqual({ id: TARGET_ROTATION });
      expect(call.where.id).not.toBe(OTHER_ROTATION);
    });

    it('writes the new trainer onto it', async () => {
      const { service, rotationUpdate } = makeService();
      await service.reassignSingle(dto, 'actor-1', HOSPITAL);

      expect(rotationUpdate.mock.calls[0][0].data).toEqual({ trainerProfileId: 'trainer-new' });
    });

    it('records the move against the same rotation', async () => {
      const { service, prisma } = makeService();
      await service.reassignSingle(dto, 'actor-1', HOSPITAL);

      const created = prisma.trainerReassignment.create.mock.calls[0][0].data;
      expect(created.trainees.create.rotationId).toBe(TARGET_ROTATION);
      expect(created.previousTrainerId).toBe('trainer-current');
      expect(created.newTrainerId).toBe('trainer-new');
    });
  });

  describe('the replacement trainer is validated', () => {
    it('refuses a trainer from another hospital', async () => {
      const { service, rotationUpdate } = makeService({ trainerOrgId: OTHER_HOSPITAL });
      await expect(service.reassignSingle(dto, 'actor-1', HOSPITAL)).rejects.toBeInstanceOf(BadRequestException);
      expect(rotationUpdate).not.toHaveBeenCalled();
    });

    it('refuses a trainer from another department', async () => {
      const { service, rotationUpdate } = makeService({ trainerDeptId: 'dept-PAED' });
      await expect(service.reassignSingle(dto, 'actor-1', HOSPITAL)).rejects.toThrow(/نفس القسم/);
      expect(rotationUpdate).not.toHaveBeenCalled();
    });

    it('refuses an inactive trainer', async () => {
      const { service } = makeService({ trainerActive: false });
      await expect(service.reassignSingle(dto, 'actor-1', HOSPITAL)).rejects.toThrow(/غير نشط/);
    });

    it('refuses a trainer with no free seat', async () => {
      const { service, rotationUpdate } = makeService({ available: 0 });
      await expect(service.reassignSingle(dto, 'actor-1', HOSPITAL)).rejects.toThrow(/لحد الأقصى/);
      expect(rotationUpdate).not.toHaveBeenCalled();
    });
  });

  describe('scope and state are enforced on the rotation itself', () => {
    it('refuses a rotation belonging to another hospital', async () => {
      const { service } = makeService({ rotationOrgId: OTHER_HOSPITAL });
      await expect(service.reassignSingle(dto, 'actor-1', HOSPITAL)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a rotation that is not active', async () => {
      const { service } = makeService({ rotationStatus: 'completed' });
      await expect(service.reassignSingle(dto, 'actor-1', HOSPITAL)).rejects.toThrow(/النشطة/);
    });

    it('refuses a rotation that does not exist', async () => {
      const { service } = makeService({ rotationMissing: true });
      await expect(service.reassignSingle(dto, 'actor-1', HOSPITAL)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses an unrecognised reason before touching anything', async () => {
      const { service, prisma } = makeService();
      await expect(
        service.reassignSingle({ ...dto, reason: 'because' }, 'actor-1', HOSPITAL),
      ).rejects.toThrow(/سبب غير صالح/);
      expect(prisma.rotation.findUnique).not.toHaveBeenCalled();
    });
  });
});
