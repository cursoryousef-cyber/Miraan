import { CAPABILITIES as C, capabilitiesForRoles } from './capabilities';

/**
 * Trainer persona isolation.
 *
 * The client resolves a workspace by testing capabilities in a fixed order, and
 * the hospital branch used to accept `training.operate`. Four roles hold that
 * capability — cluster_manager, hospital_training_admin, trainer and org_manager
 * — so it identifies nobody. A trainer avoided the hospital workspace only
 * because the trainer branch happens to run first: an ordering accident, the
 * same shape of mistake `org.view` made in the platform branch.
 *
 * These assertions fix which capabilities may decide the trainer and hospital
 * workspaces, so a broadly held capability can never again promote a trainer
 * into hospital training operations, or a hospital supervisor into the trainer
 * workspace.
 */
describe('trainer persona — capabilities that must not decide a workspace', () => {
  const caps = (role: string) => new Set(capabilitiesForRoles([role]));

  // platform_owner and system_admin hold ALL_CAPABILITIES by design, so they are
  // excluded wherever the question is "which role does this capability identify".
  const OPERATIONAL_ROLES = [
    'cluster_manager', 'training_director', 'cluster_administrator',
    'hospital_training_admin', 'hospital_administrator',
    'trainer', 'trainee', 'academic_supervisor', 'university_administrator',
  ];

  // 1
  it('training.operate identifies nothing — a trainer and a cluster manager both hold it', () => {
    const holders = OPERATIONAL_ROLES.filter((r) => caps(r).has(C.TRAINING_OPERATE));
    expect(holders).toContain('trainer');
    expect(holders).toContain('hospital_training_admin');
    expect(holders.length).toBeGreaterThan(1);
  });

  // 2
  it('the hospital workspace gate is held by hospital_training_admin alone', () => {
    const gate = [C.TRAINEE_VIEW_HOSPITAL, C.DEPARTMENT_MANAGE, C.ALLOCATION_HOSPITAL_ASSIGN];
    for (const cap of gate) {
      const holders = OPERATIONAL_ROLES.filter((r) => caps(r).has(cap));
      expect(holders).toEqual(['hospital_training_admin']);
    }
  });

  // 3
  it('a trainer holds no capability in the hospital workspace gate', () => {
    const trainer = caps('trainer');
    expect(trainer.has(C.TRAINEE_VIEW_HOSPITAL)).toBe(false);
    expect(trainer.has(C.DEPARTMENT_MANAGE)).toBe(false);
    expect(trainer.has(C.ALLOCATION_HOSPITAL_ASSIGN)).toBe(false);
  });

  // 4
  it('a trainer holds no cluster allocation capability', () => {
    const trainer = caps('trainer');
    expect(trainer.has(C.ALLOCATION_CLUSTER_AUTO)).toBe(false);
    expect(trainer.has(C.ALLOCATION_CLUSTER_MANUAL)).toBe(false);
    expect(trainer.has(C.ALLOCATION_CLUSTER_REASSIGN)).toBe(false);
  });

  // 5
  it('a trainer holds neither org.view nor org_member.manage, the platform-branch traps', () => {
    const trainer = caps('trainer');
    expect(trainer.has(C.ORG_VIEW)).toBe(false);
    expect(trainer.has(C.ORG_MEMBER_MANAGE)).toBe(false);
  });

  // 6
  it('trainee.view.assigned is the trainer scope — never the hospital-wide one', () => {
    const trainer = caps('trainer');
    expect(trainer.has(C.TRAINEE_VIEW_ASSIGNED)).toBe(true);
    expect(trainer.has(C.TRAINEE_VIEW_HOSPITAL)).toBe(false);
  });

  // 7
  it('a trainer can approve a logbook and submit an evaluation', () => {
    const trainer = caps('trainer');
    expect(trainer.has(C.LOGBOOK_APPROVE)).toBe(true);
    expect(trainer.has(C.EVALUATION_SUBMIT)).toBe(true);
  });

  // 8
  it('a hospital training supervisor keeps its own gate after the trainer fix', () => {
    const hospital = caps('hospital_training_admin');
    expect(hospital.has(C.TRAINEE_VIEW_HOSPITAL)).toBe(true);
    expect(hospital.has(C.DEPARTMENT_MANAGE)).toBe(true);
  });

  // 9
  it('a cluster manager keeps its allocation capabilities after the trainer fix', () => {
    const cluster = caps('cluster_manager');
    expect(cluster.has(C.ALLOCATION_CLUSTER_AUTO)).toBe(true);
    expect(cluster.has(C.ALLOCATION_CLUSTER_MANUAL)).toBe(true);
  });

  // 10
  it('no operational role holds both the trainer scope and the hospital-wide scope', () => {
    const both = OPERATIONAL_ROLES.filter(
      (r) => caps(r).has(C.TRAINEE_VIEW_ASSIGNED) && caps(r).has(C.TRAINEE_VIEW_HOSPITAL),
    );
    expect(both).toEqual([]);
  });

  // 11
  it('schedule.view is a trainer capability, so «جدولي» is theirs to reach', () => {
    // The tab was absent from the trainer's list even though the capability and
    // the catalogue entry both allowed it.
    expect(caps('trainer').has(C.SCHEDULE_VIEW)).toBe(true);
  });

  // 12
  it('a trainer can approve a logbook entry, which is what the review queue is for', () => {
    expect(caps('trainer').has(C.LOGBOOK_APPROVE)).toBe(true);
  });

  // 13
  it('a trainer holds no capability that would open hospital capacity or allocation', () => {
    const trainer = caps('trainer');
    for (const cap of [
      C.ALLOCATION_HOSPITAL_ASSIGN, C.DEPARTMENT_MANAGE, C.TRAINEE_VIEW_HOSPITAL,
      C.ALLOCATION_CLUSTER_AUTO, C.ALLOCATION_CLUSTER_MANUAL, C.ALLOCATION_CLUSTER_REASSIGN,
    ]) {
      expect(trainer.has(cap)).toBe(false);
    }
  });
});
