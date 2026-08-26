import { EvaluationService } from './evaluation.service';

/**
 * One assessment per author, per rotation, per type.
 *
 * `submitTrainerEvaluation` created unconditionally — it never looked for an
 * existing record — so every tap of "إرسال التقييم" wrote another row and one
 * assessment accumulated duplicates on the trainee's record. The screen made it
 * easy to hit: it tracked submission in a flag that died with the view, so
 * reopening offered the same blank form again.
 *
 * The key is the one the table's own index already named — rotation, evaluatee,
 * type — widened by the evaluator, because a rotation is legitimately assessed
 * by more than one person. Distinct types stay distinct.
 */
describe('EvaluationService submission idempotency', () => {
  const ROTATION = 'rotation-A';
  const EVALUATEE = 'account-trainee';
  const TRAINER = 'account-trainer';
  const FORM = 'form-1';

  function makeService(existing: any | null) {
    const created: any[] = [];
    const lookups: any[] = [];
    const prisma = {
      rotation: {
        findUnique: jest.fn().mockResolvedValue({
          midpointMeetingDone: true, trainerProfileId: 'trainer-A', traineeProfileId: 'trainee-A',
        }),
      },
      trainerProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'trainer-A' }) },
      traineeProfile: {
        findFirst: jest.fn().mockResolvedValue({ id: 'trainee-A', isLocked: false }),
      },
      evaluationForm: {
        findUnique: jest.fn().mockResolvedValue({
          id: FORM,
          items: [{ code: 'clinical_reasoning', titleAr: 'الاستدلال', max: 5 }],
        }),
      },
      evaluation: {
        findFirst: jest.fn().mockImplementation((args: any) => {
          lookups.push(args.where);
          return Promise.resolve(existing);
        }),
        create: jest.fn().mockImplementation((args: any) => {
          created.push(args.data);
          return Promise.resolve({ id: 'new-evaluation', form: { nameAr: 'استمارة' }, ...args.data });
        }),
      },
      notification: { create: jest.fn().mockResolvedValue({}) },
      userRole: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as any;
    return { service: new EvaluationService(prisma), prisma, created, lookups };
  }

  const user = { accountId: TRAINER, organizationId: 'hospital-A', roles: ['trainer'] } as any;
  const dto = {
    rotationId: ROTATION, evaluateeId: EVALUATEE, formId: FORM,
    evaluationType: 'end_rotation', scores: { clinical_reasoning: 4 }, totalScore: 4,
    comments: 'ملاحظة كافية',
  };

  // A
  it('writes the evaluation when none exists', async () => {
    const { service, created } = makeService(null);
    const res: any = await service.submitTrainerEvaluation(dto, user);
    expect(created).toHaveLength(1);
    expect(res.alreadySubmitted).toBe(false);
  });

  // B
  it('writes nothing on a second submission and returns the record that stands', async () => {
    const standing = { id: 'existing-evaluation', evaluationType: 'end_rotation' };
    const { service, created } = makeService(standing);
    const res: any = await service.submitTrainerEvaluation(dto, user);
    expect(created).toHaveLength(0);
    expect(res.alreadySubmitted).toBe(true);
    expect(res.data.id).toBe('existing-evaluation');
  });

  // C
  it('keys the lookup on rotation, evaluatee, evaluator and type', async () => {
    const { service, lookups } = makeService(null);
    await service.submitTrainerEvaluation(dto, user);
    expect(lookups[0]).toEqual({
      rotationId: ROTATION,
      evaluateeId: EVALUATEE,
      evaluatorId: TRAINER,
      evaluationType: 'end_rotation',
    });
  });

  // D
  it('does not treat a different evaluation type as the same assessment', async () => {
    const { service, lookups } = makeService(null);
    await service.submitTrainerEvaluation({ ...dto, evaluationType: 'mid_rotation' }, user);
    expect(lookups[0].evaluationType).toBe('mid_rotation');
  });

  // E
  it('does not treat another evaluator as the same assessment', async () => {
    const { service, lookups } = makeService(null);
    await service.submitTrainerEvaluation(dto, { ...user, accountId: 'account-supervisor' });
    expect(lookups[0].evaluatorId).toBe('account-supervisor');
  });
});
