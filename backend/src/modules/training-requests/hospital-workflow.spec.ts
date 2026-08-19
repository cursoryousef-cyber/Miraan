import { CAPABILITIES, capabilitiesForRoles } from '../../common/authz/capabilities';
import { TRAINEE_ROW_STATUS } from '../../common/status-constants';
import {
  TRAINING_REQUEST_TRAINEE_TRANSITIONS,
  assertValidTransition,
} from '../../common/state-machine/transition-guard';

/**
 * The hospital stage of the training workflow: who may reach it, and the order
 * the stages must run in. Both are enforced server-side — the authorization by
 * capability rather than by an enumerated role list, the ordering by the
 * transition table plus the assignment guard in TraineeAllocationService.
 */
describe('hospital training workflow', () => {
  describe('authorization — GET /training-requests/hospital-review', () => {
    // The endpoint is gated on TRAINING_REQUEST_VIEW, so "may this role reach
    // it" is exactly "does this role hold that capability".
    const canReachHospitalReview = (role: string) =>
      capabilitiesForRoles([role]).includes(CAPABILITIES.TRAINING_REQUEST_VIEW);

    it('allows hospital_training_admin', () => {
      expect(canReachHospitalReview('hospital_training_admin')).toBe(true);
    });

    it('allows the cluster roles that route requests to hospitals', () => {
      expect(canReachHospitalReview('cluster_manager')).toBe(true);
      expect(canReachHospitalReview('training_director')).toBe(true);
    });

    it.each(['trainer', 'trainee', 'academic_supervisor', 'hospital_administrator'])(
      'forbids %s',
      (role) => {
        expect(canReachHospitalReview(role)).toBe(false);
      },
    );

    it('does not grant hospital_training_admin the cluster review/approve authority', () => {
      const caps = capabilitiesForRoles(['hospital_training_admin']);
      expect(caps).not.toContain(CAPABILITIES.TRAINING_REQUEST_REVIEW);
      expect(caps).not.toContain(CAPABILITIES.TRAINING_REQUEST_APPROVE);
    });
  });

  describe('state machine — cluster review → hospital review → decision', () => {
    const canMove = (from: string, to: string) => {
      try {
        assertValidTransition('صف المتدرب', from, to, TRAINING_REQUEST_TRAINEE_TRANSITIONS);
        return true;
      } catch {
        return false;
      }
    };

    it('routes an allocated trainee into hospital review', () => {
      expect(canMove(TRAINEE_ROW_STATUS.ALLOCATED, TRAINEE_ROW_STATUS.HOSPITAL_REVIEW)).toBe(true);
    });

    it('accepts from hospital review', () => {
      expect(
        canMove(TRAINEE_ROW_STATUS.HOSPITAL_REVIEW, TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED),
      ).toBe(true);
    });

    it('rejects from hospital review', () => {
      expect(canMove(TRAINEE_ROW_STATUS.HOSPITAL_REVIEW, TRAINEE_ROW_STATUS.REJECTED)).toBe(true);
    });

    it('cannot start training straight from hospital review — acceptance comes first', () => {
      expect(canMove(TRAINEE_ROW_STATUS.HOSPITAL_REVIEW, TRAINEE_ROW_STATUS.ACTIVE)).toBe(false);
    });

    it('starts training only from hospital_accepted', () => {
      expect(canMove(TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED, TRAINEE_ROW_STATUS.ACTIVE)).toBe(true);
    });

    it('cannot skip the cluster stage and land in hospital review', () => {
      expect(canMove(TRAINEE_ROW_STATUS.SUBMITTED, TRAINEE_ROW_STATUS.HOSPITAL_REVIEW)).toBe(false);
    });
  });
});

/**
 * Rejection must carry a reason. The rule lives on the DTO, so it is checked
 * the way the pipe checks it rather than by re-reading the decorators.
 */
describe('hospital rejection requires a reason', () => {
  const validate = async (payload: unknown) => {
    const { plainToInstance } = await import('class-transformer');
    const { validate: v } = await import('class-validator');
    const { HospitalRejectDto } = await import('./dto/training-request-trainee.dto');
    return v(plainToInstance(HospitalRejectDto, payload));
  };

  it('rejects an empty reason', async () => {
    const errors = await validate({ reason: '' });
    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  it('rejects a missing reason', async () => {
    const errors = await validate({ notes: 'بدون سبب' });
    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  it('accepts a stated reason', async () => {
    const errors = await validate({ reason: 'الطاقة الاستيعابية للقسم مكتملة' });
    expect(errors).toHaveLength(0);
  });
});

describe('hospital review visibility — hospital_accepted status inclusion regression test', () => {
  it('includes hospital_accepted status in the hospital-review query list', async () => {
    const { TrainingRequestTraineesService } = await import('./training-request-trainees.service');
    const mockPrisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      trainingRequestTrainee: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          const statuses: string[] = where.status.in;
          expect(statuses).toContain(TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED);
          return Promise.resolve([
            {
              id: 'row-1',
              status: TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED,
              assignedDepartmentId: 'dept-1',
              assignedTrainerProfileId: 'trainer-1',
              assignedDepartment: { id: 'dept-1', nameAr: 'قسم الباطنة العامة', capacity: 10 },
              assignedTrainer: { id: 'trainer-1', person: { nameAr: 'د. خالد السريحي' } },
            },
          ]);
        }),
      },
    } as any;

    const service = new TrainingRequestTraineesService(
      mockPrisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.findForHospitalReview('hosp-1');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].status).toBe(TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED);
    expect(result.data[0].assignedDepartment?.nameAr).toBe('قسم الباطنة العامة');
    expect(result.data[0].assignedTrainer?.person?.nameAr).toBe('د. خالد السريحي');
  });
});
