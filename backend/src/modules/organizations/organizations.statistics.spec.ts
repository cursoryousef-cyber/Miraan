import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

/**
 * GET /organizations/statistics used to take an optional `organizationId`
 * query param and fell back to counting every organisation in the platform
 * when it was omitted — which every non-platform caller's frontend request
 * did. A cluster manager or hospital session saw the same totals as
 * platform_owner, even though the organisation tree right below those numbers
 * was already correctly scoped by ScopeContextService.
 *
 * The fix removes the query param entirely and derives scope the same way
 * getTree (the sibling endpoint) already did: from `scope.visibleOrgIds`,
 * resolved server-side from the JWT. There is no parameter left through which
 * a client could ask for a wider scope than their own session carries.
 */
describe('OrganizationsController.getStatistics scope', () => {
  it('has no client-supplied parameter — only @Scope() reaches the service', async () => {
    const service = { getStatistics: jest.fn().mockResolvedValue({ data: {} }) } as any;
    const controller = new OrganizationsController(service, {} as any);

    const scope = { visibleOrgIds: ['hospital-A'] } as any;
    await controller.getStatistics(scope);

    // The only way visibleOrgIds could differ from the caller's own session is
    // if the controller read it from somewhere else — it does not; the method
    // takes exactly one argument, the resolved ScopeContext.
    expect(service.getStatistics).toHaveBeenCalledWith(['hospital-A']);
    expect(service.getStatistics).toHaveBeenCalledTimes(1);
  });

  it('a platform session (visibleOrgIds: null) still gets the unrestricted view', async () => {
    const service = { getStatistics: jest.fn().mockResolvedValue({ data: {} }) } as any;
    const controller = new OrganizationsController(service, {} as any);

    await controller.getStatistics({ visibleOrgIds: null } as any);

    expect(service.getStatistics).toHaveBeenCalledWith(null);
  });
});

describe('OrganizationsService.getStatistics — visibleOrgIds filtering', () => {
  function makeService(orgs: Array<{ id: string; status: string; organizationTypeId: string }>) {
    const prisma = {
      organizationType: { findMany: jest.fn().mockResolvedValue([{ id: 'type-hospital', code: 'hospital' }]) },
      organization: {
        findMany: jest.fn((args: any) => {
          const ids: string[] | undefined = args?.where?.id?.in;
          const filtered = ids ? orgs.filter((o) => ids.includes(o.id)) : orgs;
          return Promise.resolve(
            filtered.map((o) => ({ ...o, _count: { traineeProfiles: 0, trainerProfiles: 0, departments: 0 } })),
          );
        }),
      },
    } as any;
    const capacityService = { getHospitalOccupancy: jest.fn().mockResolvedValue({ capacity: 0, occupied: 0 }) } as any;
    return new OrganizationsService(prisma, {} as any, capacityService, {} as any);
  }

  const HOSPITAL_A = { id: 'hospital-A', status: 'active', organizationTypeId: 'type-hospital' };
  const HOSPITAL_B = { id: 'hospital-B', status: 'active', organizationTypeId: 'type-hospital' };

  it('counts only organisations inside visibleOrgIds — cluster_manager scoped to its own cluster', async () => {
    const service = makeService([HOSPITAL_A, HOSPITAL_B]);

    const result = await service.getStatistics(['hospital-A']);

    expect(result.data.totalOrganizations).toBe(1);
  });

  it('hospital_training_admin / hospital_administrator scoped to exactly one hospital', async () => {
    const service = makeService([HOSPITAL_A, HOSPITAL_B]);

    const result = await service.getStatistics(['hospital-A']);

    expect(result.data.totalOrganizations).toBe(1);
    expect(result.data.hospitals).toBe(1);
  });

  it('platform_owner (null) still sees every organisation', async () => {
    const service = makeService([HOSPITAL_A, HOSPITAL_B]);

    const result = await service.getStatistics(null);

    expect(result.data.totalOrganizations).toBe(2);
  });

  it('cross-cluster: a cluster scoped to its own hospital never counts a sibling cluster’s hospital', async () => {
    const service = makeService([HOSPITAL_A, HOSPITAL_B]);

    const resultA = await service.getStatistics(['hospital-A']);
    const resultB = await service.getStatistics(['hospital-B']);

    expect(resultA.data.totalOrganizations).toBe(1);
    expect(resultB.data.totalOrganizations).toBe(1);
    // Neither scoped call ever reaches the other cluster's organisation.
  });
});
