import { CAPABILITIES as C, capabilitiesForRoles } from './capabilities';

/**
 * Persona isolation: which workspace each role lands in.
 *
 * The client picks a workspace by testing the signed-in user's capabilities in a
 * fixed order, and the first branch — the platform one — accepted `org.view` and
 * `org_member.manage`. Nine roles hold the first and seven hold the second, so a
 * hospital training supervisor matched the very first branch and was given the
 * platform workspace: cluster organisations, programmes, cluster-wide capacity.
 * Repairing the cluster branch did nothing, because the platform branch runs
 * before it.
 *
 * `platform_owner` and `system_admin` are granted ALL_CAPABILITIES, so no
 * capability can identify the platform — that branch must test roles. These
 * assertions state which capabilities may and may not decide a persona, so a
 * capability held broadly can never again promote a hospital role.
 */
describe('persona isolation — capabilities that must not decide a workspace', () => {
  const caps = (role: string) => new Set(capabilitiesForRoles([role]));

  const ADMIN_ROLES = [
    'platform_owner', 'cluster_manager', 'training_director', 'cluster_administrator',
    'hospital_training_admin', 'hospital_administrator', 'university_administrator',
  ];

  describe('org.view and org_member.manage identify nothing', () => {
    it('org.view is held by every administrative role, platform and hospital alike', () => {
      const holders = ADMIN_ROLES.filter((r) => caps(r).has(C.ORG_VIEW));
      // If this were a platform marker, only the platform roles would hold it.
      expect(holders.length).toBeGreaterThan(1);
      expect(holders).toContain('hospital_training_admin');
      expect(holders).toContain('platform_owner');
    });

    it('org_member.manage is likewise held across levels', () => {
      const holders = ADMIN_ROLES.filter((r) => caps(r).has(C.ORG_MEMBER_MANAGE));
      expect(holders.length).toBeGreaterThan(1);
      expect(holders).toContain('hospital_training_admin');
    });

    it('platform roles hold every capability, so none is unique to them', () => {
      const platform = caps('platform_owner');
      const hospital = caps('hospital_training_admin');
      for (const cap of hospital) {
        expect(platform).toContain(cap);
      }
    });
  });

  describe('the capabilities that DO separate the levels', () => {
    it('cluster allocation belongs to the cluster roles alone', () => {
      const clusterRoles = ['cluster_manager', 'training_director', 'cluster_administrator'];
      const others = ['hospital_training_admin', 'hospital_administrator', 'trainer', 'trainee'];

      for (const r of clusterRoles) expect(caps(r)).toContain(C.ALLOCATION_CLUSTER_MANUAL);
      for (const r of others) expect(caps(r)).not.toContain(C.ALLOCATION_CLUSTER_MANUAL);
    });

    it('hospital allocation belongs to the hospital training role alone', () => {
      expect(caps('hospital_training_admin')).toContain(C.ALLOCATION_HOSPITAL_ASSIGN);
      for (const r of ['cluster_manager', 'hospital_administrator', 'trainer', 'trainee']) {
        expect(caps(r)).not.toContain(C.ALLOCATION_HOSPITAL_ASSIGN);
      }
    });

    it('no role below the platform holds both levels of allocation', () => {
      // The platform roles legitimately hold everything; the separation that
      // matters is between the cluster and hospital levels beneath them.
      const scoped = ADMIN_ROLES
        .concat(['trainer', 'trainee', 'academic_supervisor'])
        .filter((r) => !['platform_owner', 'system_admin', 'holding_administrator'].includes(r));
      for (const r of scoped) {
        const held = caps(r);
        const cluster = held.has(C.ALLOCATION_CLUSTER_MANUAL);
        const hospital = held.has(C.ALLOCATION_HOSPITAL_ASSIGN);
        expect(cluster && hospital).toBe(false);
      }
    });
  });

  describe('hospital_training_admin is a hospital role, not a platform or cluster one', () => {
    const held = caps('hospital_training_admin');

    it('runs training inside its hospital', () => {
      for (const cap of [
        C.DEPARTMENT_MANAGE, C.CAPACITY_MANAGE, C.TRAINER_MANAGE,
        C.ALLOCATION_HOSPITAL_ASSIGN, C.TRAINEE_VIEW_HOSPITAL, C.SCHEDULE_PUBLISH,
      ]) {
        expect(held).toContain(cap);
      }
    });

    it('holds no cluster authority', () => {
      for (const cap of [
        C.ALLOCATION_CLUSTER_AUTO, C.ALLOCATION_CLUSTER_MANUAL, C.ALLOCATION_CLUSTER_REASSIGN,
        C.TRAINEE_VIEW_SCOPE, C.TRAINING_REQUEST_APPROVE,
      ]) {
        expect(held).not.toContain(cap);
      }
    });
  });

  describe('cluster_manager keeps its own authority', () => {
    const held = caps('cluster_manager');

    it('retains cluster allocation and request approval', () => {
      expect(held).toContain(C.ALLOCATION_CLUSTER_AUTO);
      expect(held).toContain(C.ALLOCATION_CLUSTER_MANUAL);
      expect(held).toContain(C.TRAINING_REQUEST_APPROVE);
      expect(held).toContain(C.TRAINEE_VIEW_SCOPE);
    });

    it('gains nothing hospital-operational from the fix', () => {
      expect(held).not.toContain(C.DEPARTMENT_MANAGE);
      expect(held).not.toContain(C.CAPACITY_MANAGE);
      expect(held).not.toContain(C.TRAINER_MANAGE);
    });
  });
});
