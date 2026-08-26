import { CAPABILITIES as C, capabilitiesForRoles, capabilityAllowedInContext } from './capabilities';

/**
 * Role → capability alignment, pinned against the screens that read it.
 *
 * The same hospital role was defined twice and the definitions disagreed. The
 * role table describes `hospital_administrator` as overseeing training and
 * capacity in its own hospital and grants it view_trainees / view_rotations,
 * while its capability list held six unrelated entries and no training one — and
 * capabilities are what the guards read, so every training screen answered it 403.
 *
 * The line these tests draw: hospital_training_admin owns hospital training
 * entirely; hospital_administrator administers the organisation and holds no
 * training capability. The legacy `permissions` table disagrees — it still calls
 * this role a training manager — but capabilities are what the guards read, so
 * that description is stale rather than authoritative. The client gates on these
 * capabilities rather than on a role name, which is what sent this role into a
 * workspace that then answered it 403 on every screen.
 */
describe('role → capability alignment', () => {
  const caps = (role: string) => new Set(capabilitiesForRoles([role]));

  describe('hospital_administrator — oversight of training, not the running of it', () => {
    const held = caps('hospital_administrator');

    it('holds the organisation and incident capabilities its screens need', () => {
      expect(held).toContain(C.ORG_VIEW);
      expect(held).toContain(C.ORG_MEMBER_VIEW);
      expect(held).toContain(C.ORG_MEMBER_MANAGE);
      expect(held).toContain(C.INCIDENT_VIEW);
      expect(held).toContain(C.INCIDENT_MANAGE);
      expect(held).toContain(C.REPORT_VIEW);
    });

    // The legacy permissions table still describes this role as running training,
    // and that description is stale: capabilities are the live contract and they
    // grant it none. Pinned so the two are not "reconciled" by widening this role.
    it('holds no training capability, whatever the legacy role table says', () => {
      expect(held).not.toContain(C.TRAINEE_VIEW_HOSPITAL);
      expect(held).not.toContain(C.CAPACITY_VIEW);
      expect(held).not.toContain(C.TRAINING_REQUEST_VIEW);
    });

    it('does NOT inherit the training manager\'s operating capabilities', () => {
      expect(held).not.toContain(C.DEPARTMENT_MANAGE);
      expect(held).not.toContain(C.CAPACITY_MANAGE);
      expect(held).not.toContain(C.TRAINER_MANAGE);
      expect(held).not.toContain(C.ALLOCATION_HOSPITAL_ASSIGN);
      expect(held).not.toContain(C.ALLOCATION_HOSPITAL_REASSIGN);
      expect(held).not.toContain(C.SCHEDULE_CREATE);
      expect(held).not.toContain(C.SCHEDULE_PUBLISH);
    });

    it('is strictly weaker than hospital_training_admin on training', () => {
      const trainingAdmin = caps('hospital_training_admin');
      const operating = [
        C.DEPARTMENT_MANAGE, C.CAPACITY_MANAGE, C.TRAINER_MANAGE,
        C.ALLOCATION_HOSPITAL_ASSIGN, C.SCHEDULE_CREATE, C.SCHEDULE_PUBLISH,
      ];
      for (const cap of operating) {
        expect(trainingAdmin).toContain(cap);
        expect(held).not.toContain(cap);
      }
    });
  });

  describe('hospital_training_admin — the role that owns hospital training', () => {
    const held = caps('hospital_training_admin');

    it('holds every capability the hospital training workspace calls', () => {
      expect(held).toContain(C.DEPARTMENT_MANAGE);
      expect(held).toContain(C.CAPACITY_MANAGE);
      expect(held).toContain(C.TRAINER_MANAGE);
      expect(held).toContain(C.ALLOCATION_HOSPITAL_ASSIGN);
      expect(held).toContain(C.ALLOCATION_HOSPITAL_REASSIGN);
      expect(held).toContain(C.TRAINEE_VIEW_HOSPITAL);
    });

    it('may use them from a hospital context', () => {
      expect(capabilityAllowedInContext(C.DEPARTMENT_MANAGE, 'hospital')).toBe(true);
      expect(capabilityAllowedInContext(C.ALLOCATION_HOSPITAL_REASSIGN, 'hospital')).toBe(true);
    });

    it('may not use them from a cluster context', () => {
      expect(capabilityAllowedInContext(C.DEPARTMENT_MANAGE, 'cluster')).toBe(false);
      expect(capabilityAllowedInContext(C.CAPACITY_MANAGE, 'cluster')).toBe(false);
    });
  });

  describe('trainer — gets the trainer workspace', () => {
    const held = caps('trainer');

    it('holds what the trainer screens need', () => {
      expect(held).toContain(C.TRAINEE_VIEW_ASSIGNED);
      expect(held).toContain(C.LOGBOOK_VIEW);
      expect(held).toContain(C.LOGBOOK_APPROVE);
      expect(held).toContain(C.EVALUATION_SUBMIT);
      expect(held).toContain(C.SCHEDULE_VIEW);
    });

    it('does not reach hospital-wide administration', () => {
      expect(held).not.toContain(C.DEPARTMENT_MANAGE);
      expect(held).not.toContain(C.TRAINER_MANAGE);
      expect(held).not.toContain(C.TRAINEE_VIEW_HOSPITAL);
    });
  });

  describe('trainee — sees none of the trainer capabilities', () => {
    const held = caps('trainee');

    it('may submit and read its own logbook', () => {
      expect(held).toContain(C.LOGBOOK_SUBMIT);
      expect(held).toContain(C.LOGBOOK_VIEW);
      expect(held).toContain(C.SELF_VIEW);
    });

    it('cannot approve records or evaluate anyone', () => {
      expect(held).not.toContain(C.LOGBOOK_APPROVE);
      expect(held).not.toContain(C.EVALUATION_SUBMIT);
      expect(held).not.toContain(C.TRAINEE_VIEW_ASSIGNED);
      expect(held).not.toContain(C.TRAINEE_VIEW_HOSPITAL);
    });
  });

  describe('cluster_manager — unchanged by the hospital fixes', () => {
    const held = caps('cluster_manager');

    it('keeps its cluster allocation capabilities', () => {
      expect(held).toContain(C.ALLOCATION_CLUSTER_MANUAL);
      expect(held).toContain(C.CAPACITY_VIEW);
      expect(held).toContain(C.TRAINEE_VIEW_SCOPE);
    });

    it('still holds no hospital write capability', () => {
      expect(held).not.toContain(C.DEPARTMENT_MANAGE);
      expect(held).not.toContain(C.CAPACITY_MANAGE);
      expect(held).not.toContain(C.ALLOCATION_HOSPITAL_ASSIGN);
    });
  });
});
