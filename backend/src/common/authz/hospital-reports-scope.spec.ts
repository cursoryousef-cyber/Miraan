import { CAPABILITIES as C, capabilitiesForRoles, capabilityAllowedInContext } from './capabilities';

/**
 * What the hospital reports screen may read, and from where.
 *
 * The screen composes seven reports out of endpoints that already resolve the
 * organisation from the session — rotations, trainer workspace cards, programmes,
 * departments, attendance, evaluations and the hospital review queue. No hospital
 * id is sent from the client, so the guarantee rests on two things: the role holds
 * the read capabilities, and those capabilities only apply from a hospital
 * vantage point. Both are pinned here; the live API tests cover the 403 on another
 * hospital's id.
 */
describe('hospital reports — capability and scope', () => {
  const caps = (role: string) => new Set(capabilitiesForRoles([role]));

  /** The reads the seven reports are built from. */
  const REPORT_READS = [
    C.TRAINEE_VIEW_HOSPITAL,
    C.TRAINER_MANAGE,
    C.CAPACITY_VIEW,
    C.SCHEDULE_VIEW,
    C.LOGBOOK_VIEW,
    C.REPORT_VIEW,
    C.TRAINING_REQUEST_VIEW,
  ];

  describe('hospital_training_admin can build every report', () => {
    const held = caps('hospital_training_admin');

    it.each(REPORT_READS)('holds %s', (cap) => {
      expect(held).toContain(cap);
    });

    it('may exercise them from a hospital context', () => {
      for (const cap of [C.TRAINEE_VIEW_HOSPITAL, C.CAPACITY_VIEW, C.SCHEDULE_VIEW]) {
        expect(capabilityAllowedInContext(cap, 'hospital')).toBe(true);
      }
    });

    it('cannot exercise the hospital-only reads from a cluster context', () => {
      // Even holding the capability, a cluster vantage point does not grant it —
      // which is what stops a hospital report being answered for another scope.
      expect(capabilityAllowedInContext(C.TRAINEE_VIEW_HOSPITAL, 'cluster')).toBe(false);
    });
  });

  describe('the reports carry no cluster authority', () => {
    const held = caps('hospital_training_admin');

    it.each([
      C.ALLOCATION_CLUSTER_AUTO,
      C.ALLOCATION_CLUSTER_MANUAL,
      C.ALLOCATION_CLUSTER_REASSIGN,
    ])('does not hold %s', (cap) => {
      expect(held).not.toContain(cap);
    });
  });

  describe('cluster_manager does not gain the hospital reporting surface', () => {
    const held = caps('cluster_manager');

    it('holds no hospital-scoped trainee read', () => {
      expect(held).not.toContain(C.TRAINEE_VIEW_HOSPITAL);
    });

    it('holds no trainer management', () => {
      expect(held).not.toContain(C.TRAINER_MANAGE);
    });

    it('keeps its own cluster-wide read instead', () => {
      expect(held).toContain(C.TRAINEE_VIEW_SCOPE);
      expect(held).toContain(C.REPORT_VIEW);
    });
  });

  describe('roles with no reporting business are excluded', () => {
    it.each(['trainer', 'trainee'])('%s cannot read hospital reports', (role) => {
      const held = caps(role);
      expect(held).not.toContain(C.REPORT_VIEW);
      expect(held).not.toContain(C.TRAINEE_VIEW_HOSPITAL);
    });

    it('hospital_administrator may read reports but not the training data behind them', () => {
      const held = caps('hospital_administrator');
      expect(held).toContain(C.REPORT_VIEW);
      expect(held).not.toContain(C.TRAINEE_VIEW_HOSPITAL);
      expect(held).not.toContain(C.CAPACITY_VIEW);
      expect(held).not.toContain(C.TRAINER_MANAGE);
    });
  });
});
