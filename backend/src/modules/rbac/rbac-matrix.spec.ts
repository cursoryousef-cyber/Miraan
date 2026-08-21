import { CAPABILITIES, ROLE_CAPABILITIES } from '../../common/authz/capabilities';

describe('RBAC Platform Capabilities & Role Boundary Verification', () => {
  const C = CAPABILITIES;

  describe('1. hospital_training_admin (مدير تدريب المستشفى)', () => {
    const caps = ROLE_CAPABILITIES['hospital_training_admin'] ?? [];

    it('holds all required hospital training operational capabilities', () => {
      expect(caps).toContain(C.TRAINING_REQUEST_VIEW);
      expect(caps).toContain(C.DEPARTMENT_MANAGE);
      expect(caps).toContain(C.CAPACITY_VIEW);
      expect(caps).toContain(C.CAPACITY_MANAGE);
      expect(caps).toContain(C.TRAINER_MANAGE);
      expect(caps).toContain(C.ALLOCATION_HOSPITAL_ASSIGN);
      expect(caps).toContain(C.ALLOCATION_HOSPITAL_REASSIGN);
      expect(caps).toContain(C.TRAINEE_VIEW_HOSPITAL);
      expect(caps).toContain(C.TRAINING_OPERATE);
      expect(caps).toContain(C.LOGBOOK_VIEW);
      expect(caps).toContain(C.TIMELINE_VIEW);
      expect(caps).toContain(C.SCHEDULE_CREATE);
      expect(caps).toContain(C.SCHEDULE_VIEW);
      expect(caps).toContain(C.SCHEDULE_UPDATE);
      expect(caps).toContain(C.SCHEDULE_DELETE);
      expect(caps).toContain(C.SCHEDULE_PUBLISH);
      expect(caps).toContain(C.INCIDENT_VIEW);
      expect(caps).toContain(C.REPORT_VIEW);
    });

    it('does NOT hold cluster allocation or approval authority', () => {
      expect(caps).not.toContain(C.ALLOCATION_CLUSTER_AUTO);
      expect(caps).not.toContain(C.ALLOCATION_CLUSTER_MANUAL);
      expect(caps).not.toContain(C.ALLOCATION_CLUSTER_REASSIGN);
      expect(caps).not.toContain(C.TRAINING_REQUEST_APPROVE);
      expect(caps).not.toContain(C.TRAINING_REQUEST_REVIEW);
      expect(caps).not.toContain(C.TRAINING_REQUEST_RETURN);
      expect(caps).not.toContain(C.ACADEMIC_BATCH_MANAGE);
    });
  });

  describe('2. hospital_administrator (مدير المستشفى الإداري)', () => {
    const caps = ROLE_CAPABILITIES['hospital_administrator'] ?? [];

    it('holds non-training organizational administrative capabilities', () => {
      expect(caps).toContain(C.ORG_VIEW);
      expect(caps).toContain(C.ORG_MEMBER_VIEW);
      expect(caps).toContain(C.ORG_MEMBER_MANAGE);
      expect(caps).toContain(C.INCIDENT_VIEW);
      expect(caps).toContain(C.INCIDENT_MANAGE);
      expect(caps).toContain(C.REPORT_VIEW);
    });

    it('does NOT hold any training management capabilities', () => {
      expect(caps).not.toContain(C.TRAINING_OPERATE);
      expect(caps).not.toContain(C.CAPACITY_MANAGE);
      expect(caps).not.toContain(C.DEPARTMENT_MANAGE);
      expect(caps).not.toContain(C.TRAINER_MANAGE);
      expect(caps).not.toContain(C.TRAINEE_VIEW_HOSPITAL);
      expect(caps).not.toContain(C.ALLOCATION_HOSPITAL_ASSIGN);
      expect(caps).not.toContain(C.ALLOCATION_HOSPITAL_REASSIGN);
      expect(caps).not.toContain(C.SCHEDULE_CREATE);
      expect(caps).not.toContain(C.SCHEDULE_PUBLISH);
      expect(caps).not.toContain(C.LOGBOOK_APPROVE);
      expect(caps).not.toContain(C.EVALUATION_SUBMIT);
    });
  });

  describe('3. trainer (المدرب السريري)', () => {
    const caps = ROLE_CAPABILITIES['trainer'] ?? [];

    it('holds clinical training and assessment capabilities', () => {
      expect(caps).toContain(C.TRAINING_OPERATE);
      expect(caps).toContain(C.TRAINEE_VIEW_ASSIGNED);
      expect(caps).toContain(C.LOGBOOK_VIEW);
      expect(caps).toContain(C.LOGBOOK_APPROVE);
      expect(caps).toContain(C.EVALUATION_SUBMIT);
      expect(caps).toContain(C.TIMELINE_VIEW);
      expect(caps).toContain(C.SCHEDULE_CREATE);
      expect(caps).toContain(C.SCHEDULE_VIEW);
      expect(caps).toContain(C.SCHEDULE_UPDATE);
      expect(caps).toContain(C.INCIDENT_VIEW);
    });

    it('does NOT hold administrative or organizational management capabilities', () => {
      expect(caps).not.toContain(C.ORG_MEMBER_MANAGE);
      expect(caps).not.toContain(C.CAPACITY_MANAGE);
      expect(caps).not.toContain(C.TRAINER_MANAGE);
      expect(caps).not.toContain(C.TRAINING_REQUEST_REVIEW);
      expect(caps).not.toContain(C.TRAINING_REQUEST_APPROVE);
      expect(caps).not.toContain(C.ALLOCATION_HOSPITAL_ASSIGN);
    });
  });

  describe('4. trainee (طبيب الامتياز)', () => {
    const caps = ROLE_CAPABILITIES['trainee'] ?? [];

    it('holds self-service trainee capabilities', () => {
      expect(caps).toContain(C.SELF_VIEW);
      expect(caps).toContain(C.LOGBOOK_SUBMIT);
      expect(caps).toContain(C.LOGBOOK_VIEW);
      expect(caps).toContain(C.TIMELINE_VIEW);
      expect(caps).toContain(C.SCHEDULE_VIEW);
      expect(caps).toContain(C.INCIDENT_VIEW);
    });

    it('does NOT hold any evaluation or approval authority', () => {
      expect(caps).not.toContain(C.LOGBOOK_APPROVE);
      expect(caps).not.toContain(C.EVALUATION_SUBMIT);
      expect(caps).not.toContain(C.TRAINING_OPERATE);
      expect(caps).not.toContain(C.TRAINER_MANAGE);
      expect(caps).not.toContain(C.CAPACITY_MANAGE);
      expect(caps).not.toContain(C.SCHEDULE_CREATE);
    });
  });

  describe('5. university_administrator & academic_supervisor', () => {
    const uniCaps = ROLE_CAPABILITIES['university_administrator'] ?? [];
    const acadCaps = ROLE_CAPABILITIES['academic_supervisor'] ?? [];

    it('university_administrator has request creation, incident and report view', () => {
      expect(uniCaps).toContain(C.TRAINING_REQUEST_CREATE);
      expect(uniCaps).toContain(C.TRAINING_REQUEST_VIEW);
      expect(uniCaps).toContain(C.TRAINEE_VIEW_SPONSORED);
      expect(uniCaps).toContain(C.INCIDENT_VIEW);
      expect(uniCaps).toContain(C.REPORT_VIEW);
    });

    it('academic_supervisor has graduation approval, incident and report view', () => {
      expect(acadCaps).toContain(C.GRADUATION_APPROVE);
      expect(acadCaps).toContain(C.LOGBOOK_VIEW);
      expect(acadCaps).toContain(C.INCIDENT_VIEW);
      expect(acadCaps).toContain(C.REPORT_VIEW);
    });
  });

  describe('6. User Accounts PATCH /user-accounts/:id Authorization Guard Policy', () => {
    // Replicate the exact gate logic from UserAccountsController.update
    const evaluateUpdateAccess = (
      targetAccountId: string,
      user: { accountId: string; roles: string[]; permissions: string[] },
    ): boolean => {
      const isSelf = user?.accountId === targetAccountId;
      const canManage =
        user?.roles?.includes('platform_owner') ||
        user?.roles?.includes('system_admin') ||
        user?.permissions?.includes('manage_users');
      return Boolean(isSelf || canManage);
    };

    it('(1) allows legitimate self-update for standard users (trainee/trainer) without manage_users', () => {
      const traineeUser = {
        accountId: 'acc-trainee-123',
        roles: ['trainee'],
        permissions: ['view_schedules', 'logbook_entry'],
      };

      const canUpdateSelf = evaluateUpdateAccess('acc-trainee-123', traineeUser);
      expect(canUpdateSelf).toBe(true);
    });

    it('(2) blocks unauthorized users (trainee/trainer/hospital_training_admin) from updating OTHER accounts', () => {
      const hospitalTrainingAdmin = {
        accountId: 'acc-hta-999',
        roles: ['hospital_training_admin'],
        permissions: ['view_trainees', 'manage_departments'], // does NOT hold manage_users
      };

      const trainerUser = {
        accountId: 'acc-trainer-456',
        roles: ['trainer'],
        permissions: ['evaluate_trainees'],
      };

      expect(evaluateUpdateAccess('acc-other-target-777', hospitalTrainingAdmin)).toBe(false);
      expect(evaluateUpdateAccess('acc-other-target-777', trainerUser)).toBe(false);
    });

    it('(3) allows platform_owner, system_admin, or users holding manage_users permission to update other accounts', () => {
      const platformOwner = {
        accountId: 'acc-owner-1',
        roles: ['platform_owner'],
        permissions: [],
      };

      const systemAdmin = {
        accountId: 'acc-admin-2',
        roles: ['system_admin'],
        permissions: [],
      };

      const customAdminWithPerm = {
        accountId: 'acc-custom-3',
        roles: ['custom_manager'],
        permissions: ['manage_users'],
      };

      expect(evaluateUpdateAccess('acc-target-888', platformOwner)).toBe(true);
      expect(evaluateUpdateAccess('acc-target-888', systemAdmin)).toBe(true);
      expect(evaluateUpdateAccess('acc-target-888', customAdminWithPerm)).toBe(true);
    });
  });
});

