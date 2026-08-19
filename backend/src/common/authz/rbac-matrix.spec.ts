import { ROLE_CAPABILITIES, CAPABILITIES } from './capabilities';
import { ROLE_SCOPES } from '../role-scope';

/**
 * Invariants of the permission matrix.
 *
 * The matrix is data, and data drifts: a capability added to the wrong array is
 * a silent privilege grant that no route-level test would catch, because every
 * route would still be doing exactly what its guard says. These lock the shape
 * of the model rather than the behaviour of any one endpoint.
 */
describe('RBAC matrix invariants', () => {
  const roles = Object.keys(ROLE_CAPABILITIES);
  const allCaps = new Set<string>(Object.values(CAPABILITIES));

  it('gives every catalogue role a scope rule', () => {
    // A role with no scope rule falls back to whatever the resolver defaults
    // to, which is how a hospital role quietly becomes organisation-wide.
    const unscoped = roles.filter((r) => !ROLE_SCOPES[r]);
    expect(unscoped).toEqual([]);
  });

  it('grants only capabilities that exist', () => {
    const unknown = roles.flatMap((r) =>
      ROLE_CAPABILITIES[r].filter((c) => !allCaps.has(c)).map((c) => `${r}:${c}`),
    );
    expect(unknown).toEqual([]);
  });

  it('grants no capability to every role at once', () => {
    // Something held by all fourteen roles is not a permission, it is a default,
    // and it should not be expressed as a grant.
    const universal = [...allCaps].filter((c) =>
      roles.every((r) => (ROLE_CAPABILITIES[r] as string[]).includes(c)),
    );
    expect(universal).toEqual([]);
  });

  describe('trainee — self scope only', () => {
    const caps = ROLE_CAPABILITIES.trainee;

    it('holds no management or approval capability', () => {
      const forbidden = caps.filter((c) =>
        /\.(manage|approve|create|publish|delete|reassign|assign)$/.test(c) && c !== CAPABILITIES.LOGBOOK_SUBMIT,
      );
      expect(forbidden).toEqual([]);
    });

    it('cannot read other trainees at any breadth', () => {
      for (const cap of [
        CAPABILITIES.TRAINEE_VIEW_SCOPE,
        CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
        CAPABILITIES.TRAINEE_VIEW_DEPARTMENT,
        CAPABILITIES.TRAINEE_VIEW_ASSIGNED,
        CAPABILITIES.TRAINEE_VIEW_SPONSORED,
      ]) {
        expect(caps).not.toContain(cap);
      }
    });
  });

  describe('trainer — assigned trainees only', () => {
    const caps = ROLE_CAPABILITIES.trainer;

    it('reads trainees only through the assigned breadth', () => {
      expect(caps).toContain(CAPABILITIES.TRAINEE_VIEW_ASSIGNED);
      expect(caps).not.toContain(CAPABILITIES.TRAINEE_VIEW_HOSPITAL);
      expect(caps).not.toContain(CAPABILITIES.TRAINEE_VIEW_SCOPE);
    });

    it('may draft a schedule but never publish or delete one', () => {
      expect(caps).toContain(CAPABILITIES.SCHEDULE_CREATE);
      expect(caps).toContain(CAPABILITIES.SCHEDULE_UPDATE);
      expect(caps).not.toContain(CAPABILITIES.SCHEDULE_PUBLISH);
      expect(caps).not.toContain(CAPABILITIES.SCHEDULE_DELETE);
    });

    it('holds no organisation, capacity or member management', () => {
      for (const cap of [
        CAPABILITIES.ORG_MEMBER_MANAGE,
        CAPABILITIES.CAPACITY_MANAGE,
        CAPABILITIES.DEPARTMENT_MANAGE,
        CAPABILITIES.TRAINER_MANAGE,
      ]) {
        expect(caps).not.toContain(cap);
      }
    });
  });

  describe('hospital_training_admin — one hospital', () => {
    const caps = ROLE_CAPABILITIES.hospital_training_admin;

    it('is hospital scoped', () => {
      expect(ROLE_SCOPES.hospital_training_admin.kind).toBe('hospital');
    });

    it('staffs and schedules its own hospital', () => {
      for (const cap of [
        CAPABILITIES.TRAINER_MANAGE,
        CAPABILITIES.DEPARTMENT_MANAGE,
        CAPABILITIES.CAPACITY_MANAGE,
        CAPABILITIES.SCHEDULE_PUBLISH,
        CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
      ]) {
        expect(caps).toContain(cap);
      }
    });

    it('holds no cluster allocation authority', () => {
      for (const cap of [
        CAPABILITIES.ALLOCATION_CLUSTER_AUTO,
        CAPABILITIES.ALLOCATION_CLUSTER_MANUAL,
        CAPABILITIES.ALLOCATION_CLUSTER_REASSIGN,
        CAPABILITIES.TRAINING_REQUEST_APPROVE,
      ]) {
        expect(caps).not.toContain(cap);
      }
    });
  });

  describe('hospital_administrator — not a training role', () => {
    it('holds no training capability', () => {
      const caps = ROLE_CAPABILITIES.hospital_administrator;
      for (const cap of [
        CAPABILITIES.TRAINER_MANAGE,
        CAPABILITIES.SCHEDULE_CREATE,
        CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
        CAPABILITIES.ALLOCATION_HOSPITAL_ASSIGN,
      ]) {
        expect(caps).not.toContain(cap);
      }
    });
  });

  describe('cluster roles — cluster allocation, not hospital operations', () => {
    for (const role of ['cluster_manager', 'cluster_administrator', 'training_director']) {
      it(`${role} allocates but does not run a hospital`, () => {
        const caps = ROLE_CAPABILITIES[role];
        expect(caps).toContain(CAPABILITIES.ALLOCATION_CLUSTER_MANUAL);
        expect(caps).not.toContain(CAPABILITIES.TRAINER_MANAGE);
        expect(caps).not.toContain(CAPABILITIES.DEPARTMENT_MANAGE);
        expect(caps).not.toContain(CAPABILITIES.SCHEDULE_PUBLISH);
      });
    }
  });

  describe('university roles — sponsored trainees only', () => {
    for (const role of ['university_administrator', 'academic_affairs']) {
      it(`${role} raises requests and sees only whom it sponsors`, () => {
        const caps = ROLE_CAPABILITIES[role];
        expect(caps).toContain(CAPABILITIES.TRAINING_REQUEST_CREATE);
        expect(caps).toContain(CAPABILITIES.TRAINEE_VIEW_SPONSORED);
        expect(caps).not.toContain(CAPABILITIES.TRAINEE_VIEW_HOSPITAL);
        expect(caps).not.toContain(CAPABILITIES.TRAINING_REQUEST_APPROVE);
      });
    }
  });

  describe('platform roles', () => {
    it('platform_owner and system_admin hold everything', () => {
      expect(new Set(ROLE_CAPABILITIES.platform_owner)).toEqual(allCaps);
      expect(new Set(ROLE_CAPABILITIES.system_admin)).toEqual(allCaps);
    });

    it('holding_administrator is read-only', () => {
      const writes = ROLE_CAPABILITIES.holding_administrator.filter((c) =>
        /\.(manage|approve|create|submit|publish|delete|reassign|assign|operate|review|return)$/.test(c),
      );
      expect(writes).toEqual([]);
    });
  });
});
