import { CAPABILITIES as C, capabilitiesForRoles } from './capabilities';

/**
 * Hospital training management and cluster management are separate roles.
 *
 * The iOS client picked a user's workspace by testing their capabilities against
 * the cluster persona first, and `org.view` was one of the capabilities in that
 * test. Every role holds `org.view`, so `hospital_training_admin` matched the
 * cluster branch before reaching its own and was shown the cluster dashboard —
 * cluster approvals, cluster members, automatic distribution. The backend refused
 * all of it, so the screen was both wrong for the role and largely inert.
 *
 * The distinguishing capabilities are the cluster allocation ones. These pin that
 * they belong to the cluster roles alone, so a client gating on them cannot make
 * the same mistake, and that neither role's own work was taken away.
 */
describe('hospital vs cluster role separation', () => {
  const caps = (role: string) => new Set(capabilitiesForRoles([role]));

  const CLUSTER_ONLY = [
    C.ALLOCATION_CLUSTER_AUTO,
    C.ALLOCATION_CLUSTER_MANUAL,
    C.ALLOCATION_CLUSTER_REASSIGN,
  ];

  const HOSPITAL_TRAINING = [
    C.DEPARTMENT_MANAGE,
    C.CAPACITY_MANAGE,
    C.TRAINER_MANAGE,
    C.ALLOCATION_HOSPITAL_ASSIGN,
    C.ALLOCATION_HOSPITAL_REASSIGN,
    C.TRAINEE_VIEW_HOSPITAL,
    C.SCHEDULE_CREATE,
    C.SCHEDULE_PUBLISH,
  ];

  describe('hospital_training_admin', () => {
    const held = caps('hospital_training_admin');

    it('holds every capability its own dashboard calls', () => {
      for (const cap of HOSPITAL_TRAINING) expect(held).toContain(cap);
    });

    it('holds no cluster allocation capability', () => {
      for (const cap of CLUSTER_ONLY) expect(held).not.toContain(cap);
    });

    it('holds org.view — which is why org.view cannot identify a cluster role', () => {
      // This is the exact capability the client used to gate the cluster persona on.
      expect(held).toContain(C.ORG_VIEW);
    });
  });

  describe('cluster_manager', () => {
    const held = caps('cluster_manager');

    it('holds the cluster allocation capabilities', () => {
      for (const cap of CLUSTER_ONLY) expect(held).toContain(cap);
    });

    it('keeps its own work — the hospital fix took nothing from it', () => {
      expect(held).toContain(C.TRAINING_REQUEST_APPROVE);
      expect(held).toContain(C.TRAINING_REQUEST_REVIEW);
      expect(held).toContain(C.TRAINEE_VIEW_SCOPE);
      expect(held).toContain(C.CAPACITY_VIEW);
    });

    it('does not hold the hospital operating capabilities', () => {
      expect(held).not.toContain(C.DEPARTMENT_MANAGE);
      expect(held).not.toContain(C.CAPACITY_MANAGE);
      expect(held).not.toContain(C.ALLOCATION_HOSPITAL_ASSIGN);
    });
  });

  describe('org.view cannot distinguish the two — the defect in one assertion', () => {
    // A trainee holds neither, which is why it was never mis-routed; the roles that
    // collided are the administrative ones that all carry org.view.
    it.each(['hospital_training_admin', 'cluster_manager', 'hospital_administrator'])(
      '%s holds org.view',
      (role) => {
        expect(caps(role)).toContain(C.ORG_VIEW);
      },
    );

    it('but only the cluster roles hold the allocation capabilities', () => {
      const clusterRoles = ['cluster_manager', 'training_director', 'cluster_administrator'];
      const others = ['hospital_training_admin', 'hospital_administrator', 'trainer', 'trainee', 'academic_supervisor', 'org_manager'];

      for (const role of clusterRoles) {
        expect(caps(role)).toContain(C.ALLOCATION_CLUSTER_MANUAL);
      }
      for (const role of others) {
        expect(caps(role)).not.toContain(C.ALLOCATION_CLUSTER_MANUAL);
      }
    });
  });

  describe('the roles do not overlap on what they operate', () => {
    it('no role holds both cluster allocation and hospital allocation', () => {
      const roles = [
        'hospital_training_admin', 'hospital_administrator', 'cluster_manager',
        'training_director', 'cluster_administrator', 'trainer', 'trainee',
        'academic_supervisor', 'university_administrator',
      ];
      for (const role of roles) {
        const held = caps(role);
        const hasCluster = CLUSTER_ONLY.some((c) => held.has(c));
        const hasHospital = held.has(C.ALLOCATION_HOSPITAL_ASSIGN);
        expect(hasCluster && hasHospital).toBe(false);
      }
    });
  });
});
