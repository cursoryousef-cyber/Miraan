import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { TrainersController } from './trainers.controller';

/**
 * POST /trainers — the hospital training administration staffing its own
 * departments.
 *
 * The two inputs that must never come from the client are the role and the
 * hospital: a body carrying `roleCode: 'cluster_manager'` or another hospital's
 * id must change nothing. These drive the controller directly, which is the
 * path a caller bypassing the UI would take.
 */
describe('TrainersController.createTrainer', () => {
  const HOSPITAL = 'hospital-A';
  const OTHER_HOSPITAL = 'hospital-B';
  const DEPT = 'dept-in-A';

  function makeController(opts: {
    departmentOrg?: string | null;
    personWithTrainerProfile?: { organizationId: string } | null;
  } = {}) {
    const accountCreate = jest.fn().mockResolvedValue({
      account: { id: 'acct-new' },
      activationToken: 'tok-1',
      activationLink: 'https://app/activate?token=tok-1',
    });
    const prisma = {
      department: {
        findFirst: jest.fn().mockImplementation(({ where }) =>
          opts.departmentOrg && where.organizationId === opts.departmentOrg
            ? { id: where.id }
            : null,
        ),
      },
      person: {
        findUnique: jest.fn().mockResolvedValue(
          opts.personWithTrainerProfile
            ? { id: 'person-1', trainerProfile: opts.personWithTrainerProfile }
            : null,
        ),
      },
      userAccount: { findUnique: jest.fn().mockResolvedValue({ personId: 'person-new' }) },
      trainerProfile: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'tp-1', ...data })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as any;

    const controller = new TrainersController(
      prisma, {} as any, {} as any, {} as any, { create: accountCreate } as any,
    );
    return { controller, prisma, accountCreate };
  }

  const supervisor = {
    accountId: 'acct-sup',
    organizationId: HOSPITAL,
    roles: ['hospital_training_admin'],
  } as any;

  const body = { nameAr: 'د. تجريبي', email: 'New.Trainer@Miran.Health' };

  it('pins the role to trainer and ignores a higher role in the body', async () => {
    const { controller, accountCreate } = makeController();
    await controller.createTrainer(supervisor, {
      ...body,
      ...({ roleCode: 'cluster_manager' } as any),
    });
    expect(accountCreate.mock.calls[0][0].roleCode).toBe('trainer');
  });

  it('pins the hospital to the caller and ignores one in the body', async () => {
    const { controller, accountCreate } = makeController();
    await controller.createTrainer(supervisor, {
      ...body,
      ...({ hospitalId: OTHER_HOSPITAL } as any),
    });
    expect(accountCreate.mock.calls[0][0].hospitalId).toBe(HOSPITAL);
  });

  it("refuses a department belonging to another hospital", async () => {
    const { controller, accountCreate } = makeController({ departmentOrg: OTHER_HOSPITAL });
    await expect(
      controller.createTrainer(supervisor, { ...body, departmentId: DEPT }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(accountCreate).not.toHaveBeenCalled();
  });

  it("accepts a department of the caller's own hospital", async () => {
    const { controller, prisma } = makeController({ departmentOrg: HOSPITAL });
    await controller.createTrainer(supervisor, { ...body, departmentId: DEPT });
    expect(prisma.trainerProfile.create.mock.calls[0][0].data.departmentId).toBe(DEPT);
  });

  it('refuses a person who already holds a trainer profile here', async () => {
    const { controller } = makeController({
      personWithTrainerProfile: { organizationId: HOSPITAL },
    });
    await expect(
      controller.createTrainer(supervisor, { ...body, nationalId: '1234567890' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a person who is a trainer at another hospital', async () => {
    const { controller } = makeController({
      personWithTrainerProfile: { organizationId: OTHER_HOSPITAL },
    });
    await expect(
      controller.createTrainer(supervisor, { ...body, nationalId: '1234567890' }),
    ).rejects.toThrow(/جهة أخرى/);
  });

  it('never sets a password — the trainer sets their own via activation', async () => {
    const { controller, accountCreate } = makeController();
    const res = await controller.createTrainer(supervisor, body);
    expect(accountCreate.mock.calls[0][0].password).toBeUndefined();
    expect(res.data.activationLink).toContain('activate?token=');
  });

  it('files the profile under the caller hospital and audits the creation', async () => {
    const { controller, prisma } = makeController();
    await controller.createTrainer(supervisor, body);
    expect(prisma.trainerProfile.create.mock.calls[0][0].data.organizationId).toBe(HOSPITAL);
    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe('trainer.create');
    expect(audit.organizationId).toBe(HOSPITAL);
    expect(audit.newValues.roleCode).toBe('trainer');
  });

  it('requires a name and an email', async () => {
    const { controller } = makeController();
    await expect(
      controller.createTrainer(supervisor, { nameAr: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.createTrainer(supervisor, { email: 'a@b.c' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
