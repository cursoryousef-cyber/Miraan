import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TraineeAllocationService } from './trainee-allocation.service';
import { TRAINEE_ROW_STATUS } from '../../common/status-constants';

/**
 * Cluster-side placement. The declared chain is
 * submitted → cluster_approved → allocated, but the middle step was not
 * enforced: allocating a still-`submitted` row succeeded and opened an
 * allocation without moving the status, wedging the row so it could never
 * reach `allocated`. Reproduced over HTTP during E2E before this gate existed.
 */
describe('TraineeAllocationService cluster placement gate', () => {
  const CLUSTER_A = 'cluster-A';
  const HOSPITAL_A = 'hospital-A';

  function makeService(opts: {
    rowStatus?: string;
    hospitalParent?: string;
    hasOpenAllocation?: boolean;
  } = {}) {
    const prisma = {
      traineeAllocation: {
        findFirst: jest.fn().mockResolvedValue(
          opts.hasOpenAllocation ? { id: 'alloc-1', hospitalId: HOSPITAL_A, departmentId: null } : null,
        ),
      },
      trainingRequestTrainee: {
        findUnique: jest.fn().mockResolvedValue({
          academicIntakeId: null,
          traineeProfileId: 'profile-1',
          trainingRequestId: 'req-1',
          assignedHospitalId: null,
          status: opts.rowStatus ?? TRAINEE_ROW_STATUS.CLUSTER_APPROVED,
          trainingRequest: {
            targetOrgId: CLUSTER_A,
            sourceOrgId: 'university-1',
            status: 'submitted',
            targetOrg: { organizationType: { code: 'cluster' } },
          },
        }),
      },
      // The hospital must sit under the acting cluster; a hospital whose parent
      // is a different cluster is what the cross-cluster case exercises.
      organization: {
        findFirst: jest.fn().mockImplementation(({ where }) =>
          where.id === HOSPITAL_A
            ? {
                id: HOSPITAL_A, nameAr: 'مستشفى أ',
                parentId: opts.hospitalParent ?? CLUSTER_A,
                organizationType: { code: 'hospital' },
              }
            : null,
        ),
      },
    } as any;

    const scopeContext = { assertCapability: jest.fn() } as any;
    return new TraineeAllocationService(prisma, scopeContext, {} as any, {} as any);
  }

  const user = { accountId: 'acct-cm', roles: ['cluster_manager'] } as any;
  const scope = { visibleOrgIds: [CLUSTER_A, HOSPITAL_A], roles: ['cluster_manager'] } as any;
  const place = (s: TraineeAllocationService, hospitalId = HOSPITAL_A) =>
    s.allocateToHospital('row-1', { hospitalId } as any, 'manual', user, scope);

  it.each([
    TRAINEE_ROW_STATUS.SUBMITTED,
    TRAINEE_ROW_STATUS.DRAFT,
    TRAINEE_ROW_STATUS.REJECTED,
    TRAINEE_ROW_STATUS.RETURNED_TO_UNIVERSITY,
  ])('refuses placement while the row is %s', async (status) => {
    await expect(place(makeService({ rowStatus: status }))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('names the blocking status so the caller knows what is missing', async () => {
    await expect(
      place(makeService({ rowStatus: TRAINEE_ROW_STATUS.SUBMITTED })),
    ).rejects.toThrow(/قبل اعتماد التجمع/);
  });

  it('allows placement once the cluster has approved', async () => {
    // Past the gate the call proceeds into capacity/room checks; whatever it
    // fails on there, it must not be the stage rule.
    await expect(
      place(makeService({ rowStatus: TRAINEE_ROW_STATUS.CLUSTER_APPROVED })),
    ).rejects.not.toThrow(/قبل اعتماد التجمع/);
  });

  it('still allows a re-placement of an already allocated row', async () => {
    await expect(
      place(makeService({ rowStatus: TRAINEE_ROW_STATUS.ALLOCATED, hasOpenAllocation: true })),
    ).rejects.not.toThrow(/قبل اعتماد التجمع/);
  });

  it('allows re-placement of a row the hospital sent back', async () => {
    await expect(
      place(makeService({ rowStatus: TRAINEE_ROW_STATUS.HOSPITAL_RETURNED_TO_CLUSTER })),
    ).rejects.not.toThrow(/قبل اعتماد التجمع/);
  });

  describe('boundaries the gate must not weaken', () => {
    it('refuses a hospital belonging to another cluster', async () => {
      await expect(
        place(makeService({ hospitalParent: 'cluster-B' })),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a hospital that does not exist', async () => {
      await expect(place(makeService({}), 'hospital-elsewhere')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
