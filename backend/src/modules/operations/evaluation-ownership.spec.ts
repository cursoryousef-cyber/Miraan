import { ForbiddenException } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';

/**
 * Who may write an evaluation. The route only establishes that the caller holds
 * a trainer-ish role; the rotation is what says whose trainee this is, so these
 * drive the service directly — the path a caller bypassing the UI would take.
 */
describe('EvaluationService trainer ownership', () => {
  const ROTATION_ID = 'rotation-1';
  const OWNING_TRAINER = 'trainer-profile-A';
  const OTHER_TRAINER = 'trainer-profile-B';
  const TRAINEE_ACCOUNT = 'trainee-account-1';

  function makeService(opts: {
    callerTrainerProfileId: string | null;
    rotationTrainerProfileId?: string;
    evaluateeMatchesRotation?: boolean;
  }) {
    const prisma = {
      rotation: {
        findUnique: jest.fn().mockResolvedValue({
          midpointMeetingDone: true,
          trainerProfileId: opts.rotationTrainerProfileId ?? OWNING_TRAINER,
          traineeProfileId: 'trainee-profile-1',
        }),
      },
      trainerProfile: {
        findFirst: jest.fn().mockResolvedValue(
          opts.callerTrainerProfileId ? { id: opts.callerTrainerProfileId } : null,
        ),
      },
      traineeProfile: {
        findFirst: jest.fn().mockResolvedValue(
          opts.evaluateeMatchesRotation === false ? null : { id: 'trainee-profile-1' },
        ),
      },
      evaluation: { findFirst: jest.fn(), create: jest.fn() },
      auditLog: { create: jest.fn() },
    } as any;

    return new EvaluationService(prisma);
  }

  const dto = {
    rotationId: ROTATION_ID,
    evaluateeId: TRAINEE_ACCOUNT,
    formId: 'form-1',
    evaluationType: 'final_rotation',
    scores: {},
  };
  const trainerUser = (accountId = 'acct-A') =>
    ({ accountId, organizationId: 'hospital-1', roles: ['trainer'] }) as any;

  it("refuses a trainer evaluating another trainer's rotation", async () => {
    const service = makeService({
      callerTrainerProfileId: OTHER_TRAINER,
      rotationTrainerProfileId: OWNING_TRAINER,
    });
    await expect(service.submitTrainerEvaluation(dto, trainerUser())).rejects.toThrow(
      /غير مسندة إليك/,
    );
  });

  it('refuses a caller with no trainer profile at all', async () => {
    const service = makeService({ callerTrainerProfileId: null });
    await expect(service.submitTrainerEvaluation(dto, trainerUser())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses when the evaluatee is not the trainee on that rotation', async () => {
    const service = makeService({
      callerTrainerProfileId: OWNING_TRAINER,
      evaluateeMatchesRotation: false,
    });
    await expect(service.submitTrainerEvaluation(dto, trainerUser())).rejects.toThrow(
      /ليس متدرب هذه الدورة/,
    );
  });

  it('lets the rotation owner past the ownership gate', async () => {
    const service = makeService({ callerTrainerProfileId: OWNING_TRAINER });
    // Past Gate 0 the call proceeds into the scoring path; whatever it fails on
    // there, it must not be the ownership rule.
    await expect(
      service.submitTrainerEvaluation(dto, trainerUser()),
    ).rejects.not.toThrow(/غير مسندة إليك|ليس متدرب هذه الدورة/);
  });
});
