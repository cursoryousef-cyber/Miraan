import { OrganizationAssignmentService } from './organization-assignment.service';

/**
 * Regression coverage for the "11 members disappear" bug: the legacy
 * UserOrganization fallback must merge per account, not per organization —
 * an account already covered by an OrganizationAssignment row must never be
 * duplicated, and an account with no assignment row must still surface via
 * the legacy relation even when other accounts in the same org do have one.
 */
describe('OrganizationAssignmentService membership merge', () => {
  const orgId = 'org-1';

  function makeService(assignments: any[], legacyUserOrgs: any[]) {
    const prisma = {
      organizationAssignment: {
        findMany: jest.fn().mockResolvedValue(assignments),
      },
      userOrganization: {
        findMany: jest.fn().mockResolvedValue(legacyUserOrgs),
      },
    } as any;
    return { service: new OrganizationAssignmentService(prisma), prisma };
  }

  describe('findMembershipsInOrg', () => {
    it('includes a legacy-only account alongside an account that has an assignment row', async () => {
      const { service } = makeService(
        [
          {
            userAccountId: 'acct-new',
            isActive: true,
            isPrimary: true,
            userAccount: { id: 'acct-new' },
            role: { id: 'role-1', code: 'trainer', nameAr: 'مدرب' },
          },
        ],
        [
          {
            userAccountId: 'acct-legacy',
            isActive: true,
            isPrimary: false,
            userAccount: { id: 'acct-legacy' },
          },
        ],
      );

      const { members, total } = await service.findMembershipsInOrg(orgId);

      expect(total).toBe(2);
      const ids = members.map((m) => m.userAccountId).sort();
      expect(ids).toEqual(['acct-legacy', 'acct-new']);
    });

    it('does not duplicate an account present in both sources, and prefers the assignment row', async () => {
      const { service } = makeService(
        [
          {
            userAccountId: 'acct-both',
            isActive: true,
            isPrimary: true,
            userAccount: { id: 'acct-both', marker: 'from-assignment' },
            role: { id: 'role-1', code: 'trainer', nameAr: 'مدرب' },
          },
        ],
        [
          {
            userAccountId: 'acct-both',
            isActive: false,
            isPrimary: false,
            userAccount: { id: 'acct-both', marker: 'from-legacy' },
          },
        ],
      );

      const { members, total } = await service.findMembershipsInOrg(orgId);

      expect(total).toBe(1);
      expect(members[0].userAccount.marker).toBe('from-assignment');
      expect(members[0].assignedRoles).toHaveLength(1);
    });

    it('still returns all legacy accounts when no assignment rows exist at all', async () => {
      const { service } = makeService(
        [],
        [
          { userAccountId: 'acct-1', isActive: true, isPrimary: true, userAccount: { id: 'acct-1' } },
          { userAccountId: 'acct-2', isActive: true, isPrimary: false, userAccount: { id: 'acct-2' } },
        ],
      );

      const { total } = await service.findMembershipsInOrg(orgId);
      expect(total).toBe(2);
    });
  });

  describe('countMembershipsByOrg', () => {
    it('counts a legacy-only account even when the org already has assignment rows for other accounts', async () => {
      const prisma = {
        organizationAssignment: {
          findMany: jest.fn().mockResolvedValue([
            { organizationId: orgId, userAccountId: 'acct-new' },
          ]),
        },
        userOrganization: {
          findMany: jest.fn().mockResolvedValue([
            { organizationId: orgId, userAccountId: 'acct-legacy' },
          ]),
        },
      } as any;
      const service = new OrganizationAssignmentService(prisma);

      const counts = await service.countMembershipsByOrg([orgId]);
      expect(counts.get(orgId)).toBe(2);
    });

    it('deduplicates an account counted from both sources', async () => {
      const prisma = {
        organizationAssignment: {
          findMany: jest.fn().mockResolvedValue([
            { organizationId: orgId, userAccountId: 'acct-both' },
          ]),
        },
        userOrganization: {
          findMany: jest.fn().mockResolvedValue([
            { organizationId: orgId, userAccountId: 'acct-both' },
          ]),
        },
      } as any;
      const service = new OrganizationAssignmentService(prisma);

      const counts = await service.countMembershipsByOrg([orgId]);
      expect(counts.get(orgId)).toBe(1);
    });
  });
});
