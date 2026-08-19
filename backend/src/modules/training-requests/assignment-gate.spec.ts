import { ConflictException } from '@nestjs/common';
import { TraineeAllocationService } from './trainee-allocation.service';
import { TRAINEE_ROW_STATUS } from '../../common/status-constants';

/**
 * "No trainer assignment before the hospital has accepted" is a business rule,
 * not a UI affordance. These exercise the rule where it is enforced — the
 * service — by calling it directly, the way a caller hitting the endpoint with
 * curl would reach it regardless of what the frontend renders.
 */
describe('TraineeAllocationService assignment gate', () => {
  const HOSPITAL_ID = 'hospital-1';

  function makeService(rowStatus: string) {
    const prisma = {
      traineeAllocation: {
        // An open allocation already places the trainee at the hospital; the
        // hospital stage is the decision about that placement.
        findFirst: jest.fn().mockResolvedValue({
          id: 'alloc-1',
          hospitalId: HOSPITAL_ID,
          departmentId: null,
          trainerProfileId: null,
        }),
      },
      trainingRequestTrainee: {
        findUnique: jest.fn().mockResolvedValue({
          academicIntakeId: null,
          traineeProfileId: 'profile-1',
          trainingRequestId: 'req-1',
          assignedHospitalId: HOSPITAL_ID,
          status: rowStatus,
          trainingRequest: {
            targetOrgId: 'cluster-1',
            sourceOrgId: 'university-1',
            status: 'approved',
            targetOrg: { organizationType: { code: 'cluster' } },
          },
        }),
      },
    } as any;

    const scopeContext = {
      assertCapability: jest.fn(),
      assertActiveHospital: jest.fn(),
      assertDepartmentInScope: jest.fn(),
      resolve: jest.fn(),
    } as any;

    return new TraineeAllocationService(prisma, scopeContext, {} as any, {} as any);
  }

  const user = { accountId: 'acct-1', roles: ['hospital_training_admin'] } as any;
  const scope = { visibleOrgIds: [HOSPITAL_ID], hospitalId: HOSPITAL_ID } as any;
  const target = { departmentId: 'dept-1', trainerProfileId: 'trainer-1' } as any;

  it.each([
    TRAINEE_ROW_STATUS.ALLOCATED,
    TRAINEE_ROW_STATUS.HOSPITAL_REVIEW,
    TRAINEE_ROW_STATUS.ON_HOLD,
    // A rejected trainee is not assignable either — rejection ends the row's
    // hospital stage, it does not leave it in a placeable state.
    TRAINEE_ROW_STATUS.REJECTED,
    TRAINEE_ROW_STATUS.HOSPITAL_RETURNED_TO_CLUSTER,
  ])('refuses assignment while the row is still %s', async (status) => {
    const service = makeService(status);
    await expect(
      service.assignWithinHospital('row-1', target, user, scope),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('names the blocking status in the error so the caller knows what is missing', async () => {
    const service = makeService(TRAINEE_ROW_STATUS.HOSPITAL_REVIEW);
    await expect(
      service.assignWithinHospital('row-1', target, user, scope),
    ).rejects.toThrow(/hospital_review/);
  });

  it('passes the gate once the hospital has accepted', async () => {
    const service = makeService(TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED);
    // The gate is cleared, so failure past this point comes from the later
    // department/trainer checks — never from the acceptance rule itself.
    await expect(
      service.assignWithinHospital('row-1', target, user, scope),
    ).rejects.not.toThrow(/قبل قبول المستشفى/);
  });

  /**
   * The hospital boundary. `assertActiveHospital` is what stops a supervisor
   * reaching into another hospital, and assignWithinHospital hands it the
   * hospital taken from the trainee's own allocation — never from the caller —
   * so a Hospital A session cannot place a Hospital B trainee no matter what it
   * sends.
   */
  it("refuses when the trainee's hospital is not the caller's active hospital", async () => {
    const prisma = {
      traineeAllocation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'alloc-1',
          hospitalId: 'hospital-B',
          departmentId: null,
          trainerProfileId: null,
        }),
      },
      trainingRequestTrainee: {
        findUnique: jest.fn().mockResolvedValue({
          academicIntakeId: null,
          traineeProfileId: 'profile-1',
          trainingRequestId: 'req-1',
          assignedHospitalId: 'hospital-B',
          status: TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED,
          trainingRequest: {
            targetOrgId: 'cluster-1',
            sourceOrgId: 'university-1',
            status: 'approved',
            targetOrg: { organizationType: { code: 'cluster' } },
          },
        }),
      },
    } as any;

    const scopeContext = {
      assertCapability: jest.fn(),
      // Real behaviour: throws when the target hospital is not the active one.
      assertActiveHospital: jest.fn((_ctx: any, hospitalId: string) => {
        if (hospitalId !== HOSPITAL_ID) {
          throw new Error('لا يمكنك تنفيذ هذا الإجراء على مستشفى غير مستشفاك');
        }
      }),
      assertDepartmentInScope: jest.fn(),
      resolve: jest.fn(),
    } as any;

    const service = new TraineeAllocationService(prisma, scopeContext, {} as any, {} as any);
    await expect(
      service.assignWithinHospital('row-1', target, user, scope),
    ).rejects.toThrow(/مستشفى غير مستشفاك/);
    // The hospital came from the trainee's allocation, not from the caller.
    expect(scopeContext.assertActiveHospital).toHaveBeenCalledWith(scope, 'hospital-B');
  });
});
