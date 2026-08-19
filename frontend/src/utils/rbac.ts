export type RBACAction = 'create' | 'read' | 'update' | 'delete' | 'details' | 'approve' | 'export';
export type RBACScope =
  | 'organizations'
  | 'clusters'
  | 'hospitals'
  | 'universities'
  | 'colleges'
  | 'departments'
  | 'programs'
  | 'intakes'
  | 'agreements'
  | 'users'
  | 'roles'
  | 'permissions'
  | 'workflow'
  | 'settings'
  | 'audit'
  | 'students'
  | 'assignments'
  | 'rotations'
  | 'schedules'
  | 'trainers'
  | 'tasks'
  | 'notes'
  | 'evaluations'
  | 'competencies'
  | 'logbook'
  | 'procedures'
  | 'completed_programs'
  | 'final_results';

export function hasPermission(user: any, action: RBACAction, scope: RBACScope): boolean {
  if (!user || !user.roles || !Array.isArray(user.roles)) return false;
  const roles: string[] = user.roles;

  // 1. Platform Owner / System Admin -> Full CRUD on everything except Audit Delete
  if (roles.includes('platform_owner') || roles.includes('system_admin') || roles.includes('holding_administrator')) {
    if (scope === 'audit' && action === 'delete') return false; // Audit trail is immutable
    return true;
  }

  // 2. University Admin -> CRUD on Students, Intakes, Training Applications
  if (roles.includes('university_administrator') || roles.includes('academic_affairs')) {
    if (['students', 'intakes', 'applications', 'agreements', 'programs'].includes(scope)) {
      return ['create', 'read', 'update', 'delete', 'details'].includes(action);
    }
    return action === 'read';
  }

  // 3. Cluster Training Admin -> CRUD on Allocation, Hospitals, Intakes, Assignments
  if (roles.includes('cluster_administrator') || roles.includes('training_director')) {
    if (['assignments', 'hospitals', 'clusters', 'intakes', 'agreements'].includes(scope)) {
      return ['create', 'read', 'update', 'delete', 'details'].includes(action);
    }
    return action === 'read';
  }

  // 4. Hospital Supervisor -> CRUD on Rotations, Schedules, Student Distribution, Trainers Assignment
  if (roles.includes('hospital_training_admin')) {
    if (['rotations', 'schedules', 'assignments', 'trainers', 'departments'].includes(scope)) {
      return ['create', 'read', 'update', 'delete', 'details'].includes(action);
    }
    return action === 'read';
  }

  // 5. Trainer -> CRUD on Tasks, Notes, Evaluations, Approve Competencies/Logbook for assigned trainees
  if (roles.includes('trainer')) {
    if (['tasks', 'notes', 'evaluations', 'competencies', 'logbook'].includes(scope)) {
      if (action === 'delete') return false; // Trainer cannot delete trainees or programs
      return ['create', 'read', 'update', 'approve', 'details'].includes(action);
    }
    return action === 'read';
  }

  // 6. Trainee -> Create/Update Logbook, Procedures, Tasks before approval. Read own data.
  if (roles.includes('trainee')) {
    if (['logbook', 'procedures', 'tasks'].includes(scope)) {
      if (action === 'delete') return false; // Trainee cannot delete after submission
      return ['create', 'read', 'update', 'details'].includes(action);
    }
    return action === 'read';
  }

  // 7. Academic Supervisor -> Read completed programs, Update final result approval/rejection
  if (roles.includes('academic_supervisor')) {
    if (['completed_programs', 'final_results'].includes(scope)) {
      return ['read', 'update', 'approve', 'details'].includes(action);
    }
    return action === 'read';
  }

  return false;
}
