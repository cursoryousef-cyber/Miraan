import { ForbiddenException } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';

/**
 * Evaluation flow — criterion scoring and ownership.
 *
 * Covers:
 * 1. Trainer A → Evaluate Trainee A = PASS (owns the rotation)
 * 2. Trainer A → Evaluate Trainee B = DENY (different rotation)
 * 3. Scores and percentage are derived from EvaluationForm.items
 */
describe('Evaluation — criterion scoring + ownership', () => {
  const ROTATION_ID = 'rotation-test-1';
  const TRAINER_PROFILE_A = 'trainer-profile-A';
  const TRAINEE_ACCOUNT_A = 'trainee-acct-A';
  const TRAINEE_ACCOUNT_B = 'trainee-acct-B';
  const FORM_ID = 'form-1';
  const ORG_ID = 'hospital-1';

  // A form with 3 criteria: max=30, max=40, max=30  → total max = 100
  const FORM_ITEMS = [
    { code: 'professionalism', nameAr: 'المهنية', max: 30 },
    { code: 'clinical_knowledge', nameAr: 'المعرفة السريرية', max: 40 },
    { code: 'communication', nameAr: 'التواصل', max: 30 },
  ];

  function makeService(opts: {
    callerTrainerProfileId: string | null;
    rotationTrainerProfileId: string;
    rotationTraineeProfileId: string;
    evaluateeMatchesRotation: boolean;
    midpointMeetingDone: boolean;
    formItems?: unknown[];
    hasDeptEval?: boolean;
    isLocked?: boolean;
  }) {
    const prisma = {
      rotation: {
        findUnique: jest.fn().mockResolvedValue({
          midpointMeetingDone: opts.midpointMeetingDone,
          trainerProfileId: opts.rotationTrainerProfileId,
          traineeProfileId: opts.rotationTraineeProfileId,
        }),
      },
      trainerProfile: {
        findFirst: jest.fn().mockResolvedValue(
          opts.callerTrainerProfileId ? { id: opts.callerTrainerProfileId } : null,
        ),
      },
      traineeProfile: {
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          // If checking evaluatee match — return based on opts
          if (where?.id) {
            return Promise.resolve(
              opts.evaluateeMatchesRotation ? { id: opts.rotationTraineeProfileId } : null,
            );
          }
          // isLocked check (uses person.userAccounts)
          return Promise.resolve({ isLocked: opts.isLocked ?? false });
        }),
      },
      evaluationForm: {
        findUnique: jest.fn().mockResolvedValue({
          id: FORM_ID,
          organizationId: ORG_ID,
          items: opts.formItems ?? FORM_ITEMS,
        }),
      },
      evaluation: {
        // Two different lookups reach this mock: the mutual-lock check for the
        // trainee's department evaluation, and the idempotency check for an
        // assessment this evaluator already filed. Answering both with the same
        // row made every submission look like a repeat.
        findFirst: jest.fn().mockImplementation((args: any) => {
          if (args?.where?.evaluationType === 'department_by_trainee') {
            return Promise.resolve(opts.hasDeptEval ? { id: 'dept-eval-1' } : null);
          }
          return Promise.resolve(null);
        }),
        create: jest.fn().mockImplementation(({ data, include }: any) =>
          Promise.resolve({
            id: 'eval-new-1',
            ...data,
            form: { nameAr: 'نموذج التقييم' },
            rotation: { department: { nameAr: 'جراحة' } },
          }),
        ),
      },
      notification: {
        create: jest.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      userRole: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    return { service: new EvaluationService(prisma), prisma };
  }

  const trainerUserA = {
    accountId: 'acct-trainer-A',
    organizationId: ORG_ID,
    roles: ['trainer'],
  } as any;

  // ─── Test 1: Trainer A → Evaluate Trainee A = PASS ──────────────────────

  it('Trainer A evaluates own Trainee A — PASS with correct criterion scoring', async () => {
    const { service, prisma } = makeService({
      callerTrainerProfileId: TRAINER_PROFILE_A,
      rotationTrainerProfileId: TRAINER_PROFILE_A,
      rotationTraineeProfileId: 'trainee-profile-A',
      evaluateeMatchesRotation: true,
      midpointMeetingDone: true,
      hasDeptEval: true,
    });

    const dto = {
      rotationId: ROTATION_ID,
      evaluateeId: TRAINEE_ACCOUNT_A,
      formId: FORM_ID,
      evaluationType: 'final_rotation',
      scores: {
        professionalism: 25,
        clinical_knowledge: 35,
        communication: 28,
      },
    };

    const result = await service.submitTrainerEvaluation(dto, trainerUserA);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    // Verify the evaluation was created with the form-derived scores
    const createCall = prisma.evaluation.create.mock.calls[0][0];
    const writtenScores = createCall.data.scores;

    // The service should have derived _total, _maxTotal, _percentage
    expect(writtenScores.professionalism).toBe(25);
    expect(writtenScores.clinical_knowledge).toBe(35);
    expect(writtenScores.communication).toBe(28);
    expect(writtenScores._total).toBe(88); // 25+35+28
    expect(writtenScores._maxTotal).toBe(100); // 30+40+30
    expect(writtenScores._percentage).toBe(88); // (88/100)*100

    // totalScore should be the computed total, not a caller-supplied one
    expect(createCall.data.totalScore).toBe(88);
  });

  // ─── Test 2: Trainer A → Evaluate Trainee B = DENY ──────────────────────

  it("Trainer A evaluating Trainee B (different trainer's rotation) — DENY", async () => {
    const { service } = makeService({
      callerTrainerProfileId: TRAINER_PROFILE_A,
      rotationTrainerProfileId: 'trainer-profile-OTHER',  // Different trainer
      rotationTraineeProfileId: 'trainee-profile-B',
      evaluateeMatchesRotation: true,
      midpointMeetingDone: true,
      hasDeptEval: true,
    });

    const dto = {
      rotationId: ROTATION_ID,
      evaluateeId: TRAINEE_ACCOUNT_B,
      formId: FORM_ID,
      evaluationType: 'final_rotation',
      scores: { professionalism: 20, clinical_knowledge: 30, communication: 25 },
    };

    await expect(service.submitTrainerEvaluation(dto, trainerUserA)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.submitTrainerEvaluation(dto, trainerUserA)).rejects.toThrow(
      /غير مسندة إليك/,
    );
  });

  // ─── Test 3: Percentage is derived from form items ──────────────────────

  it('percentage is derived from form items, not caller-supplied totalScore', async () => {
    const { service, prisma } = makeService({
      callerTrainerProfileId: TRAINER_PROFILE_A,
      rotationTrainerProfileId: TRAINER_PROFILE_A,
      rotationTraineeProfileId: 'trainee-profile-A',
      evaluateeMatchesRotation: true,
      midpointMeetingDone: true,
      hasDeptEval: true,
      formItems: [
        { code: 'skills', nameAr: 'المهارات', max: 50 },
        { code: 'attitude', nameAr: 'السلوك', max: 50 },
      ],
    });

    const dto = {
      rotationId: ROTATION_ID,
      evaluateeId: TRAINEE_ACCOUNT_A,
      formId: FORM_ID,
      evaluationType: 'final_rotation',
      scores: { skills: 30, attitude: 40 },
      totalScore: 999, // caller tries to override — should be ignored
    };

    const result = await service.submitTrainerEvaluation(dto, trainerUserA);
    expect(result.success).toBe(true);

    const createCall = prisma.evaluation.create.mock.calls[0][0];
    expect(createCall.data.totalScore).toBe(70); // 30+40, NOT 999
    expect(createCall.data.scores._percentage).toBe(70); // (70/100)*100
  });

  // ─── Test 4: Score exceeding max is rejected ────────────────────────────

  it('refuses a criterion score exceeding its max', async () => {
    const { service } = makeService({
      callerTrainerProfileId: TRAINER_PROFILE_A,
      rotationTrainerProfileId: TRAINER_PROFILE_A,
      rotationTraineeProfileId: 'trainee-profile-A',
      evaluateeMatchesRotation: true,
      midpointMeetingDone: true,
      hasDeptEval: true,
    });

    const dto = {
      rotationId: ROTATION_ID,
      evaluateeId: TRAINEE_ACCOUNT_A,
      formId: FORM_ID,
      evaluationType: 'final_rotation',
      scores: {
        professionalism: 35, // exceeds max=30
        clinical_knowledge: 35,
        communication: 28,
      },
    };

    await expect(service.submitTrainerEvaluation(dto, trainerUserA)).rejects.toThrow(
      /تتجاوز الحد الأقصى/,
    );
  });

  // ─── Test 5: Midpoint meeting gate ──────────────────────────────────────

  it('blocks final evaluation without midpoint meeting', async () => {
    const { service } = makeService({
      callerTrainerProfileId: TRAINER_PROFILE_A,
      rotationTrainerProfileId: TRAINER_PROFILE_A,
      rotationTraineeProfileId: 'trainee-profile-A',
      evaluateeMatchesRotation: true,
      midpointMeetingDone: false,  // NOT done
      hasDeptEval: true,
    });

    const dto = {
      rotationId: ROTATION_ID,
      evaluateeId: TRAINEE_ACCOUNT_A,
      formId: FORM_ID,
      evaluationType: 'final_rotation',
      scores: { professionalism: 25, clinical_knowledge: 30, communication: 20 },
    };

    await expect(service.submitTrainerEvaluation(dto, trainerUserA)).rejects.toThrow(
      /منتصف الدورة/,
    );
  });
});
