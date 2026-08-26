import { ForbiddenException } from '@nestjs/common';
import { RotationsController } from './rotations.controller';
import { ScopeContext } from '../../common/authz';

/**
 * Read scope for rotations and departments.
 *
 * Two defects are pinned here. Both endpoints filtered on the caller's own
 * `organizationId`: departments and rotations belong to the hospital that runs
 * them, so a cluster session — whose organisationId is the cluster's — matched
 * no rows and was told it had nothing, while holding CAPACITY_VIEW over exactly
 * those hospitals. And `getDepartments` took `organizationId` straight off the
 * query string, so naming another hospital returned that hospital's departments
 * to any caller holding the capability.
 *
 * Both now resolve through ScopeContext.visibleOrgIds, which is the cluster plus
 * its hospitals, a hospital alone, or null for platform (meaning unrestricted).
 */
describe('RotationsController read scope', () => {
  const CLUSTER = 'cluster-1';
  const HOSPITAL_A = 'hospital-A';
  const HOSPITAL_B = 'hospital-B';

  function makeController() {
    const prisma = {
      department: { findMany: jest.fn().mockResolvedValue([]) },
      rotation: { findMany: jest.fn().mockResolvedValue([]) },
      traineeProfile: { findFirst: jest.fn().mockResolvedValue(null) },
      trainerProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    return { controller: new RotationsController(prisma, { getDepartmentOccupancy: jest.fn().mockResolvedValue({ capacity: 0, occupied: 0, available: 0, occupancyPercentage: 0 }) } as any), prisma };
  }

  function scopeOf(organizationId: string, visibleOrgIds: string[] | null): ScopeContext {
    return { organizationId, visibleOrgIds } as ScopeContext;
  }

  const clusterUser = { organizationId: CLUSTER, roles: ['cluster_manager'] } as any;
  const hospitalUser = { organizationId: HOSPITAL_A, roles: ['hospital_training_admin'] } as any;
  const platformUser = { organizationId: CLUSTER, roles: ['platform_owner'] } as any;

  describe('GET /rotations/departments', () => {
    it('queries the cluster and its hospitals, not the cluster alone', async () => {
      const { controller, prisma } = makeController();
      const scope = scopeOf(CLUSTER, [CLUSTER, HOSPITAL_A, HOSPITAL_B]);

      await controller.getDepartments(clusterUser, undefined, scope);

      expect(prisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: { in: [CLUSTER, HOSPITAL_A, HOSPITAL_B] },
          }),
        }),
      );
    });

    it('refuses an organizationId outside the visible set', async () => {
      const { controller } = makeController();
      const scope = scopeOf(HOSPITAL_A, [HOSPITAL_A]);

      await expect(
        controller.getDepartments(hospitalUser, HOSPITAL_B, scope),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('honours an organizationId that is inside the visible set', async () => {
      const { controller, prisma } = makeController();
      const scope = scopeOf(CLUSTER, [CLUSTER, HOSPITAL_A]);

      await controller.getDepartments(clusterUser, HOSPITAL_A, scope);

      expect(prisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: HOSPITAL_A }),
        }),
      );
    });

    it('leaves a platform session unfiltered rather than empty', async () => {
      const { controller, prisma } = makeController();

      await controller.getDepartments(platformUser, undefined, scopeOf(CLUSTER, null));

      const where = prisma.department.findMany.mock.calls[0][0].where;
      expect(where.organizationId).toBeUndefined();
    });
  });

  describe('GET /rotations', () => {
    it('queries the whole visible set for a cluster session', async () => {
      const { controller, prisma } = makeController();
      const scope = scopeOf(CLUSTER, [CLUSTER, HOSPITAL_A, HOSPITAL_B]);

      await controller.findAll(clusterUser, scope);

      expect(prisma.rotation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: { in: [CLUSTER, HOSPITAL_A, HOSPITAL_B] } },
        }),
      );
    });

    it('confines a hospital session to its own organisation', async () => {
      const { controller, prisma } = makeController();

      await controller.findAll(hospitalUser, scopeOf(HOSPITAL_A, [HOSPITAL_A]));

      expect(prisma.rotation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: { in: [HOSPITAL_A] } },
        }),
      );
    });

    it('leaves a platform session unfiltered rather than empty', async () => {
      const { controller, prisma } = makeController();

      await controller.findAll(platformUser, scopeOf(CLUSTER, null));

      expect(prisma.rotation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('falls back to the caller organisation when no scope was attached', async () => {
      const { controller, prisma } = makeController();

      await controller.findAll(hospitalUser, undefined);

      expect(prisma.rotation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: { in: [HOSPITAL_A] } },
        }),
      );
    });
  });
});
