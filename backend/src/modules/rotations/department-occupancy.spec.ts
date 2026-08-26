import { RotationsController } from './rotations.controller';
import { ScopeContext } from '../../common/authz';

/**
 * Departments report their real occupancy.
 *
 * The listing returned `capacity` and a `_count.rotations` taken straight off the
 * relation — every rotation the department has ever held, completed and cancelled
 * included. A client deriving "remaining" from that undercounts free seats, and a
 * department whose rotations have all ended reads as full. Worse, the figure shown
 * and the figure the overbooking trigger enforces came from two different places.
 *
 * CapacityService is that enforcement's own source, so the listing now reports
 * through it and the two agree.
 */
describe('GET /rotations/departments — occupancy', () => {
  const HOSPITAL = 'hospital-A';

  function makeController(departments: any[], occupancyById: Record<string, any>) {
    const prisma = {
      department: { findMany: jest.fn().mockResolvedValue(departments) },
      rotation: { findMany: jest.fn().mockResolvedValue([]) },
      traineeProfile: { findFirst: jest.fn().mockResolvedValue(null) },
      trainerProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const capacityService = {
      getDepartmentOccupancy: jest.fn(async (id: string) => occupancyById[id]),
    } as any;
    return { controller: new RotationsController(prisma, capacityService), capacityService };
  }

  const user = { organizationId: HOSPITAL, roles: ['hospital_training_admin'] } as any;
  const scope = { organizationId: HOSPITAL, visibleOrgIds: [HOSPITAL] } as ScopeContext;

  const dept = (id: string, nameAr: string, capacity: number, staleCount: number) => ({
    id,
    nameAr,
    capacity,
    organizationId: HOSPITAL,
    _count: { rotations: staleCount, trainerProfiles: 1 },
  });

  it('reports capacity, occupied and remaining for every department', async () => {
    const { controller } = makeController(
      [dept('d1', 'الباطنة', 5, 99)],
      { d1: { capacity: 5, occupied: 2, available: 3, occupancyPercentage: 40 } },
    );

    const res: any = await controller.getDepartments(user, undefined, scope);
    const row = res.data[0];

    expect(row.capacity).toBe(5);
    expect(row.occupied).toBe(2);
    expect(row.remaining).toBe(3);
    expect(row.occupancyPercentage).toBe(40);
  });

  it('satisfies remaining = capacity - occupied', async () => {
    const { controller } = makeController(
      [dept('d1', 'الباطنة', 5, 0), dept('d2', 'الأطفال', 3, 0)],
      {
        d1: { capacity: 5, occupied: 2, available: 3, occupancyPercentage: 40 },
        d2: { capacity: 3, occupied: 3, available: 0, occupancyPercentage: 100 },
      },
    );

    const res: any = await controller.getDepartments(user, undefined, scope);
    for (const row of res.data) {
      expect(row.remaining).toBe(row.capacity - row.occupied);
    }
  });

  it('does not derive occupancy from the stale relation count', async () => {
    // 99 historical rotations, 2 actually occupying seats.
    const { controller } = makeController(
      [dept('d1', 'الباطنة', 5, 99)],
      { d1: { capacity: 5, occupied: 2, available: 3, occupancyPercentage: 40 } },
    );

    const res: any = await controller.getDepartments(user, undefined, scope);
    expect(res.data[0].occupied).not.toBe(99);
    expect(res.data[0].occupied).toBe(2);
  });

  it('reports a full department as having no remaining seats', async () => {
    const { controller } = makeController(
      [dept('d1', 'الأطفال', 3, 3)],
      { d1: { capacity: 3, occupied: 3, available: 0, occupancyPercentage: 100 } },
    );

    const res: any = await controller.getDepartments(user, undefined, scope);
    expect(res.data[0].remaining).toBe(0);
  });

  it('passes the requested period through so the figure matches what is enforced', async () => {
    const { controller, capacityService } = makeController(
      [dept('d1', 'الباطنة', 5, 0)],
      { d1: { capacity: 5, occupied: 1, available: 4, occupancyPercentage: 20 } },
    );

    await controller.getDepartments(user, undefined, scope, '2027-01-01', '2027-03-01');

    expect(capacityService.getDepartmentOccupancy).toHaveBeenCalledWith(
      'd1',
      undefined,
      undefined,
      { start: new Date('2027-01-01'), end: new Date('2027-03-01') },
    );
  });

  it('defaults to "from today" when no period is given', async () => {
    const { controller, capacityService } = makeController(
      [dept('d1', 'الباطنة', 5, 0)],
      { d1: { capacity: 5, occupied: 1, available: 4, occupancyPercentage: 20 } },
    );

    await controller.getDepartments(user, undefined, scope);

    expect(capacityService.getDepartmentOccupancy).toHaveBeenCalledWith(
      'd1', undefined, undefined, undefined,
    );
  });

  it('asks the capacity service once per department', async () => {
    const { controller, capacityService } = makeController(
      [dept('d1', 'الباطنة', 5, 0), dept('d2', 'الأطفال', 3, 0)],
      {
        d1: { capacity: 5, occupied: 1, available: 4, occupancyPercentage: 20 },
        d2: { capacity: 3, occupied: 0, available: 3, occupancyPercentage: 0 },
      },
    );

    await controller.getDepartments(user, undefined, scope);
    expect(capacityService.getDepartmentOccupancy).toHaveBeenCalledTimes(2);
    expect(capacityService.getDepartmentOccupancy).toHaveBeenCalledWith('d1', undefined, undefined, undefined);
    expect(capacityService.getDepartmentOccupancy).toHaveBeenCalledWith('d2', undefined, undefined, undefined);
  });
});
