import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { OrgMembersController } from './org-members.controller';

/**
 * Adding a trainer must produce an account the trainer can actually log into.
 *
 * It did not. The hospital's "add trainer" form sent no password, so the
 * controller fell through to `randomBytes(32)` — a password nobody holds — and
 * generated no activation token. The account was created `isActive: true` yet
 * was unreachable: the platform has no self-service reset, so only a
 * platform_owner editing the account could ever make it usable.
 *
 * These drive the controller directly with a mocked Prisma, so nothing is
 * written anywhere and no production data is involved.
 */
describe('OrgMembersController — trainer provisioning', () => {
  const HOSPITAL_ID = 'hospital-A';
  const ROLE_ID = 'role-trainer';

  function makeController() {
    const created: Record<string, any> = {};

    const prisma = {
      organization: {
        findFirst: jest.fn().mockResolvedValue({
          id: HOSPITAL_ID,
          parentId: null,
          organizationType: { code: 'hospital' },
        }),
      },
      person: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(async (args: any) => {
          created.person = { id: 'person-1', ...args.create };
          return created.person;
        }),
      },
      userAccount: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async (args: any) => {
          created.account = { id: 'account-1', ...args.data };
          return created.account;
        }),
      },
      userOrganization: { upsert: jest.fn().mockResolvedValue({}) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: ROLE_ID, code: 'trainer' }) },
      userRole: {
        upsert: jest.fn(async (args: any) => {
          created.userRole = args.create;
          return created.userRole;
        }),
      },
      trainerProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async (args: any) => {
          created.trainerProfile = { id: 'trainer-profile-1', ...args.data };
          return created.trainerProfile;
        }),
        update: jest.fn(),
      },
    } as any;

    const orgAssignments = {
      upsertMembership: jest.fn(async (args: any) => {
        created.membership = args;
        return args;
      }),
    } as any;

    const controller = new OrgMembersController(prisma, orgAssignments);
    return { controller, prisma, created };
  }

  const caller = { accountId: 'admin-1', organizationId: HOSPITAL_ID, roles: ['hospital_training_admin'] } as any;

  const trainerDto = {
    roleCode: 'trainer',
    nationalId: '1234567890',
    nameAr: 'مدرب اختبار',
    titleAr: 'استشاري',
    email: 'trainer.1234567890@miran.sa',
    departmentId: 'dept-1',
    password: 'Str0ngPass!',
  };

  it('creates the full chain: Person → UserAccount → role=trainer → organisation → TrainerProfile', async () => {
    const { controller, created } = makeController();

    const res = await controller.create(caller, { ...trainerDto });

    expect(created.person).toBeDefined();
    expect(created.account).toBeDefined();
    expect(created.account.personId).toBe('person-1');
    expect(created.userRole).toMatchObject({ roleId: ROLE_ID, organizationId: HOSPITAL_ID });
    expect(created.membership).toMatchObject({ organizationId: HOSPITAL_ID });
    expect(created.trainerProfile).toMatchObject({
      personId: 'person-1',
      organizationId: HOSPITAL_ID,
    });
    expect(res.accountId).toBe('account-1');
  });

  it('derives a username so the account has a login identity', async () => {
    const { controller, created } = makeController();

    await controller.create(caller, { ...trainerDto });

    expect(created.account.username).toBe('trainer.1234567890');
    expect(created.account.email).toBe(trainerDto.email);
    expect(created.account.isActive).toBe(true);
  });

  it('stores the supplied password as a bcrypt hash that verifies — the account is loginable', async () => {
    const { controller, created } = makeController();

    await controller.create(caller, { ...trainerDto });

    const hash = created.account.passwordHash;
    expect(hash).toEqual(expect.stringMatching(/^\$2[aby]\$/)); // bcrypt, not plaintext
    expect(hash).not.toBe(trainerDto.password);
    // The decisive assertion: the hash verifies against what the hospital typed,
    // which is what makes the first login possible at all.
    await expect(bcrypt.compare(trainerDto.password, hash)).resolves.toBe(true);
  });

  it('never returns the hash or the password in the response', async () => {
    const { controller } = makeController();

    const res: any = await controller.create(caller, { ...trainerDto });

    expect(JSON.stringify(res)).not.toContain(trainerDto.password);
    expect(res.passwordHash).toBeUndefined();
    expect(Object.keys(res).sort()).toEqual(['accountId', 'message', 'success']);
  });

  it('refuses a password shorter than 8 characters', async () => {
    const { controller } = makeController();

    await expect(
      controller.create(caller, { ...trainerDto, password: 'short' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /**
   * The rule lives in the controller, not in either form, so both the
   * TrainerCards dialog and the OrgMembers "add member" dialog are covered by
   * the same check — as is any client calling the endpoint directly.
   */
  describe('a trainer can never be created without a usable password', () => {
    it('refuses a trainer with no password at all (the OrgMembers path before this fix)', async () => {
      const { controller } = makeController();
      const { password, ...noPassword } = trainerDto;

      await expect(controller.create(caller, noPassword)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses a trainer with an empty password', async () => {
      const { controller } = makeController();

      await expect(
        controller.create(caller, { ...trainerDto, password: '' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a trainer requested through the roleCodes array form', async () => {
      const { controller } = makeController();
      const { password, roleCode, ...rest } = trainerDto;

      await expect(
        controller.create(caller, { ...rest, roleCodes: ['trainer'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  /**
   * PATCH is a second door onto the same end state. It can attach the trainer
   * role to an account that was created for some other role — and such an
   * account holds the random fallback password, so before this guard the
   * promotion produced a trainer nobody could sign in as.
   */
  describe('PATCH /org-members/:id — promoting an existing member to trainer', () => {
    function makeUpdateController(
      opts: {
        alreadyTrainer?: boolean;
        existingProfile?: { id: string; organizationId: string; departmentId: string | null } | null;
        roleCode?: string;
      } = {},
    ) {
      const updated: Record<string, any> = {};
      const prisma = {
        userOrganization: { findUnique: jest.fn().mockResolvedValue({ id: 'membership-1' }) },
        userAccount: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'account-1',
            personId: 'person-1',
            person: { nameAr: 'عضو قائم' },
          }),
          update: jest.fn(async (args: any) => {
            updated.account = args.data;
            return args.data;
          }),
        },
        person: { update: jest.fn().mockResolvedValue({}) },
        role: {
          findUnique: jest.fn().mockResolvedValue({
            id: ROLE_ID,
            code: opts.roleCode ?? 'trainer',
          }),
        },
        userRole: {
          findFirst: jest.fn().mockResolvedValue(opts.alreadyTrainer ? { id: 'ur-1' } : null),
          upsert: jest.fn(async (args: any) => {
            updated.userRole = args.create;
            return args.create;
          }),
        },
        trainerProfile: {
          findFirst: jest.fn().mockResolvedValue(opts.existingProfile ?? null),
          create: jest.fn(async (args: any) => {
            updated.trainerProfileCreated = args.data;
            return { id: 'tp-new', ...args.data };
          }),
          update: jest.fn(async (args: any) => {
            updated.trainerProfileUpdated = args.data;
            return args.data;
          }),
        },
      } as any;
      const controller = new OrgMembersController(prisma, {} as any);
      return { controller, prisma, updated };
    }

    it('refuses to promote a member to trainer without a password', async () => {
      const { controller, updated } = makeUpdateController();

      await expect(
        controller.update('account-1', caller, { nameAr: 'عضو', roleCode: 'trainer' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      // The role must not have been granted on the failed attempt.
      expect(updated.userRole).toBeUndefined();
    });

    it('refuses a promotion password shorter than 8 characters', async () => {
      const { controller } = makeUpdateController();

      await expect(
        controller.update('account-1', caller, { roleCode: 'trainer', password: 'short' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('promotes with a password and stores a bcrypt hash that verifies', async () => {
      const { controller, updated } = makeUpdateController();

      await controller.update('account-1', caller, { roleCode: 'trainer', password: 'Str0ngPass!' });

      const hash = updated.account.passwordHash;
      expect(hash).toEqual(expect.stringMatching(/^\$2[aby]\$/));
      expect(hash).not.toBe('Str0ngPass!');
      await expect(bcrypt.compare('Str0ngPass!', hash)).resolves.toBe(true);
      expect(updated.userRole).toMatchObject({ roleId: ROLE_ID });
    });

    it('does not demand a password when editing someone who is already a trainer', async () => {
      // The edit dialog resends the member's current role on every save, so this
      // is the ordinary "rename a trainer" case and must keep working untouched.
      const { controller, updated } = makeUpdateController({ alreadyTrainer: true });

      const res: any = await controller.update('account-1', caller, {
        nameAr: 'اسم محدث',
        roleCode: 'trainer',
      });

      expect(res.success).toBe(true);
      expect(updated.account).toBeUndefined(); // password left alone
    });

    it('never returns the password or hash from a promotion', async () => {
      const { controller } = makeUpdateController();

      const res: any = await controller.update('account-1', caller, {
        roleCode: 'trainer',
        password: 'Str0ngPass!',
      });

      expect(JSON.stringify(res)).not.toContain('Str0ngPass!');
      expect(res.passwordHash).toBeUndefined();
    });

    // ── TrainerProfile: promotion must reach the same end state POST does ──

    it('creates a TrainerProfile bound to the person and the hospital', async () => {
      const { controller, updated } = makeUpdateController();

      await controller.update('account-1', caller, {
        roleCode: 'trainer',
        password: 'Str0ngPass!',
      });

      expect(updated.trainerProfileCreated).toMatchObject({
        personId: 'person-1',
        organizationId: HOSPITAL_ID,
      });
    });

    it('stores the department when one is supplied', async () => {
      const { controller, updated } = makeUpdateController();

      await controller.update('account-1', caller, {
        roleCode: 'trainer',
        password: 'Str0ngPass!',
        departmentId: 'dept-7',
        titleAr: 'استشاري',
      });

      expect(updated.trainerProfileCreated).toMatchObject({
        departmentId: 'dept-7',
        titleAr: 'استشاري',
      });
    });

    it('does not create a second profile when one already exists', async () => {
      const { controller, prisma, updated } = makeUpdateController({
        alreadyTrainer: true,
        existingProfile: { id: 'tp-1', organizationId: HOSPITAL_ID, departmentId: 'dept-1' },
      });

      await controller.update('account-1', caller, { nameAr: 'اسم محدث', roleCode: 'trainer' });

      expect(prisma.trainerProfile.create).not.toHaveBeenCalled();
      expect(updated.trainerProfileCreated).toBeUndefined();
    });

    it('leaves the existing passwordHash untouched while ensuring the profile', async () => {
      const { controller, prisma, updated } = makeUpdateController({
        alreadyTrainer: true,
        existingProfile: { id: 'tp-1', organizationId: HOSPITAL_ID, departmentId: null },
      });

      await controller.update('account-1', caller, { nameAr: 'اسم محدث', roleCode: 'trainer' });

      expect(prisma.userAccount.update).not.toHaveBeenCalled();
      expect(updated.account).toBeUndefined();
    });

    it('does not touch TrainerProfile for a non-trainer role', async () => {
      const { controller, prisma, updated } = makeUpdateController({
        roleCode: 'academic_supervisor',
      });

      const res: any = await controller.update('account-1', caller, {
        nameAr: 'مشرف أكاديمي',
        roleCode: 'academic_supervisor',
      });

      expect(res.success).toBe(true);
      expect(prisma.trainerProfile.findFirst).not.toHaveBeenCalled();
      expect(prisma.trainerProfile.create).not.toHaveBeenCalled();
      expect(prisma.userAccount.update).not.toHaveBeenCalled();
      expect(updated.userRole).toMatchObject({ roleId: ROLE_ID });
    });
  });

  it('leaves non-trainer roles free to be created without a password', async () => {
    const { controller, created } = makeController();

    await controller.create(caller, {
      roleCode: 'hospital_training_admin',
      nationalId: '2222222222',
      nameAr: 'مدير تدريب',
      email: 'admin.2222222222@miran.sa',
    });

    // Still hashed, still not a shared default — just not caller-supplied.
    expect(created.account.passwordHash).toEqual(expect.stringMatching(/^\$2[aby]\$/));
    await expect(bcrypt.compare('', created.account.passwordHash)).resolves.toBe(false);
  });
});
