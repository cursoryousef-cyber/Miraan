import { ForbiddenException } from '@nestjs/common';
import { RolesPermissionsController } from './roles-permissions.controller';

/**
 * The role catalogue is part of the security model, not content.
 *
 * `updateRole` replaces a role's permission rows wholesale and `deleteRole`
 * removed the row outright, and neither checked what it was operating on. The
 * live data makes that worse than it looks: `platform_owner`, `trainer` and
 * `trainee` all carry `is_system = false`, so a check against that column alone
 * would have let every one of them through. These assert the code catalogue is
 * the floor, whatever the column says.
 */
describe('Role catalogue protection', () => {
  function makeController(role: { id: string; code: string; isSystem: boolean } | null, assigned = 0) {
    const prisma = {
      role: {
        findUnique: jest.fn().mockResolvedValue(role),
        update: jest.fn().mockResolvedValue(role),
        delete: jest.fn().mockResolvedValue(role),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'new-role', ...data })),
      },
      rolePermission: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      permission: { findUnique: jest.fn().mockResolvedValue({ id: 'perm-1' }) },
      userRole: { count: jest.fn().mockResolvedValue(assigned) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as any;
    return { controller: new RolesPermissionsController(prisma), prisma };
  }

  const owner = { accountId: 'acct-1', organizationId: 'org-1', roles: ['platform_owner'] } as any;

  // `is_system: false` on purpose — this is the live value for these codes.
  const SOVEREIGN = { id: 'r1', code: 'platform_owner', isSystem: false };
  const TRAINEE = { id: 'r2', code: 'trainee', isSystem: false };

  it('refuses to re-grant permissions on a catalogue role', async () => {
    const { controller, prisma } = makeController(TRAINEE);
    await expect(
      controller.updateRole('r2', owner, { permissions: ['manage_organizations'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // The wholesale permission swap must not have started.
    expect(prisma.rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses to delete the sovereign role', async () => {
    const { controller, prisma } = makeController(SOVEREIGN);
    await expect(controller.deleteRole('r1', owner)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.role.delete).not.toHaveBeenCalled();
  });

  it('honours is_system even for a code outside the catalogue', async () => {
    const { controller } = makeController({ id: 'r3', code: 'legacy_custom', isSystem: true });
    await expect(controller.deleteRole('r3', owner)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to mint a role reusing a catalogue code', async () => {
    const { controller } = makeController(null);
    await expect(
      controller.createRole(owner, { code: 'hospital_training_admin', nameAr: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a dynamic role ranked above the catalogue', async () => {
    const { controller } = makeController(null);
    await expect(
      controller.createRole(owner, { code: 'custom_reviewer', nameAr: 'x', hierarchyLevel: 999 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('still allows a genuine dynamic role', async () => {
    const { controller, prisma } = makeController(null);
    const res = await controller.createRole(owner, { code: 'custom_reviewer', nameAr: 'مراجع' });
    expect(res.success).toBe(true);
    expect(prisma.role.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('refuses deleting a dynamic role still granted to users', async () => {
    const { controller } = makeController({ id: 'r9', code: 'custom_reviewer', isSystem: false }, 3);
    await expect(controller.deleteRole('r9', owner)).rejects.toThrow(/مُسند إلى 3 مستخدم/);
  });

  it('deletes an unassigned dynamic role and audits it', async () => {
    const { controller, prisma } = makeController({ id: 'r9', code: 'custom_reviewer', isSystem: false }, 0);
    const res = await controller.deleteRole('r9', owner);
    expect(res.success).toBe(true);
    expect(prisma.role.delete).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});
