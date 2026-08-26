// ============================================================================
// Capability model — the authorisation vocabulary of the training platform.
//
// Why this exists
// ---------------
// The legacy `permissions` table speaks in verbs that are too coarse to express
// the boundary the business actually needs. `assign_rotations` is held by both
// `cluster_administrator` and `hospital_administrator`; measured against each
// other, those two roles share 9 of 10 training permissions. There is literally
// no permission string in the old vocabulary that means "may move a trainee
// between hospitals" as distinct from "may move a trainee between departments
// of my own hospital" — so the separation between cluster training management
// and hospital training management could not be enforced, only described.
//
// Capabilities are that missing vocabulary. The pair that carries the whole
// architecture is:
//
//   allocation.cluster.*   — the cluster training manager places trainees INTO
//                            hospitals, and moves them BETWEEN hospitals.
//   allocation.hospital.*  — the hospital training manager places trainees into
//                            departments and trainers WITHIN one hospital.
//
// No role holds both. That is the separation, stated once, in one place.
//
// A capability is never sufficient on its own. Every authorisation decision is
//     capability  ∧  active context type  ∧  resource within visible scope
// which is why each entry below also declares the context it must be used from.
// See scope-context.service.ts for how the scope half is resolved.
// ============================================================================

/** The organisational vantage point a request is being made from. */
export type ContextType = 'platform' | 'cluster' | 'university' | 'hospital';

export const CAPABILITIES = {
  // ── Training requests (university → cluster) ───────────────────────────────
  TRAINING_REQUEST_CREATE: 'training_request.create',
  TRAINING_REQUEST_VIEW: 'training_request.view',
  TRAINING_REQUEST_REVIEW: 'training_request.review',
  TRAINING_REQUEST_APPROVE: 'training_request.approve',
  TRAINING_REQUEST_RETURN: 'training_request.return',

  // ── Academic batches (cluster, from an approved request only) ──────────────
  ACADEMIC_BATCH_CREATE_FROM_REQUEST: 'academic_batch.create_from_request',
  ACADEMIC_BATCH_MANAGE: 'academic_batch.manage',

  // ── Allocation — cluster level: which hospital a trainee goes to ───────────
  ALLOCATION_CLUSTER_AUTO: 'allocation.cluster.auto',
  ALLOCATION_CLUSTER_MANUAL: 'allocation.cluster.manual',
  ALLOCATION_CLUSTER_REASSIGN: 'allocation.cluster.reassign',

  // ── Allocation — hospital level: which department/trainer, same hospital ───
  ALLOCATION_HOSPITAL_ASSIGN: 'allocation.hospital.assign',
  ALLOCATION_HOSPITAL_REASSIGN: 'allocation.hospital.reassign',

  // ── Hospital training operations ──────────────────────────────────────────
  DEPARTMENT_MANAGE: 'department.manage',
  CAPACITY_VIEW: 'capacity.view',
  CAPACITY_MANAGE: 'capacity.manage',
  TRAINER_MANAGE: 'trainer.manage',
  TRAINING_OPERATE: 'training.operate',

  // ── Trainee visibility — deliberately graded, narrowest wins ──────────────
  TRAINEE_VIEW_SCOPE: 'trainee.view.scope',
  TRAINEE_VIEW_HOSPITAL: 'trainee.view.hospital',
  TRAINEE_VIEW_DEPARTMENT: 'trainee.view.department',
  TRAINEE_VIEW_ASSIGNED: 'trainee.view.assigned',
  TRAINEE_VIEW_SPONSORED: 'trainee.view.sponsored',
  SELF_VIEW: 'self.view',

  // ── Clinical / academic follow-up ─────────────────────────────────────────
  LOGBOOK_VIEW: 'logbook.view',
  LOGBOOK_APPROVE: 'logbook.approve',
  LOGBOOK_SUBMIT: 'logbook.submit',
  EVALUATION_SUBMIT: 'evaluation.submit',
  GRADUATION_APPROVE: 'graduation.approve',
  TIMELINE_VIEW: 'timeline.view',

  // ── Training schedules ───────────────────────────────────────────────────
  SCHEDULE_CREATE: 'schedule.create',
  SCHEDULE_VIEW: 'schedule.view',
  SCHEDULE_UPDATE: 'schedule.update',
  SCHEDULE_DELETE: 'schedule.delete',
  SCHEDULE_PUBLISH: 'schedule.publish',

  // ── General (non-training) administration ─────────────────────────────────
  ORG_VIEW: 'org.view',
  ORG_MEMBER_VIEW: 'org_member.view',
  ORG_MEMBER_MANAGE: 'org_member.manage',
  INCIDENT_VIEW: 'incident.view',
  INCIDENT_MANAGE: 'incident.manage',
  REPORT_VIEW: 'report.view',
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

const C = CAPABILITIES;

/**
 * Contexts a capability may be exercised from. A capability used from the wrong
 * vantage point is refused even when the role holds it — this is what stops a
 * cluster training manager from editing hospital internals by switching nothing
 * but the URL.
 *
 * `platform` is accepted everywhere because platform roles govern the whole
 * federation by definition; they are not narrowed by the active organisation.
 */
export const CAPABILITY_CONTEXTS: Record<Capability, ContextType[]> = {
  [C.TRAINING_REQUEST_CREATE]: ['university', 'platform', 'cluster'],
  [C.TRAINING_REQUEST_VIEW]: ['university', 'cluster', 'platform', 'hospital'],
  [C.TRAINING_REQUEST_REVIEW]: ['cluster', 'platform'],
  [C.TRAINING_REQUEST_APPROVE]: ['cluster', 'platform'],
  [C.TRAINING_REQUEST_RETURN]: ['cluster', 'platform'],

  [C.ACADEMIC_BATCH_CREATE_FROM_REQUEST]: ['cluster', 'platform'],
  [C.ACADEMIC_BATCH_MANAGE]: ['cluster', 'platform'],

  [C.ALLOCATION_CLUSTER_AUTO]: ['cluster', 'platform'],
  [C.ALLOCATION_CLUSTER_MANUAL]: ['cluster', 'platform'],
  [C.ALLOCATION_CLUSTER_REASSIGN]: ['cluster', 'platform'],

  [C.ALLOCATION_HOSPITAL_ASSIGN]: ['hospital', 'platform'],
  [C.ALLOCATION_HOSPITAL_REASSIGN]: ['hospital', 'platform'],

  [C.DEPARTMENT_MANAGE]: ['hospital', 'platform'],
  [C.CAPACITY_VIEW]: ['cluster', 'hospital', 'platform'],
  [C.CAPACITY_MANAGE]: ['hospital', 'platform'],
  [C.TRAINER_MANAGE]: ['hospital', 'platform'],
  // 'cluster' added because training operations legitimately run from a cluster
  // vantage point too — a cluster manager addressing their own hospitals. Held
  // apart from the grant above: this says the capability is *usable* from a
  // cluster context, the role table says who holds it, and visibleOrgIds says
  // how far it reaches. Without this a cluster_manager holding the capability
  // would still be refused by capabilityAllowedInContext.
  [C.TRAINING_OPERATE]: ['hospital', 'cluster', 'platform'],

  [C.TRAINEE_VIEW_SCOPE]: ['cluster', 'university', 'platform'],
  [C.TRAINEE_VIEW_HOSPITAL]: ['hospital', 'platform'],
  [C.TRAINEE_VIEW_DEPARTMENT]: ['hospital', 'platform'],
  [C.TRAINEE_VIEW_ASSIGNED]: ['hospital', 'platform'],
  [C.TRAINEE_VIEW_SPONSORED]: ['university', 'platform'],
  [C.SELF_VIEW]: ['platform', 'cluster', 'university', 'hospital'],

  [C.LOGBOOK_VIEW]: ['cluster', 'university', 'hospital', 'platform'],
  [C.LOGBOOK_APPROVE]: ['hospital', 'platform'],
  [C.LOGBOOK_SUBMIT]: ['hospital', 'platform'],
  [C.EVALUATION_SUBMIT]: ['hospital', 'platform'],
  [C.GRADUATION_APPROVE]: ['cluster', 'university', 'hospital', 'platform'],
  [C.TIMELINE_VIEW]: ['cluster', 'university', 'hospital', 'platform'],

  [C.SCHEDULE_CREATE]: ['hospital', 'platform'],
  [C.SCHEDULE_VIEW]: ['hospital', 'university', 'cluster', 'platform'],
  [C.SCHEDULE_UPDATE]: ['hospital', 'platform'],
  [C.SCHEDULE_DELETE]: ['hospital', 'platform'],
  [C.SCHEDULE_PUBLISH]: ['hospital', 'platform'],

  [C.ORG_VIEW]: ['platform', 'cluster', 'university', 'hospital'],
  [C.ORG_MEMBER_VIEW]: ['platform', 'cluster', 'university', 'hospital'],
  [C.ORG_MEMBER_MANAGE]: ['platform', 'cluster', 'university', 'hospital'],
  [C.INCIDENT_VIEW]: ['platform', 'cluster', 'university', 'hospital'],
  [C.INCIDENT_MANAGE]: ['platform', 'cluster', 'hospital'],
  [C.REPORT_VIEW]: ['platform', 'cluster', 'university', 'hospital'],
};

const ALL_CAPABILITIES = Object.values(C) as Capability[];
const READ_ONLY_CAPABILITIES: Capability[] = [
  C.TRAINING_REQUEST_VIEW,
  C.CAPACITY_VIEW,
  C.TRAINEE_VIEW_SCOPE,
  C.LOGBOOK_VIEW,
  C.TIMELINE_VIEW,
  C.ORG_VIEW,
  C.ORG_MEMBER_VIEW,
  C.INCIDENT_VIEW,
  C.REPORT_VIEW,
];

/**
 * Role → capabilities. This is the whole RBAC surface for the training domain;
 * nothing outside this table grants a training capability.
 *
 * Roles absent from this table (auditor, reviewer, external_system, and any role
 * added later) resolve to no capabilities at all, which is the safe default: a
 * new role has to be granted its powers deliberately rather than inheriting them
 * by being unrecognised.
 */
export const ROLE_CAPABILITIES: Record<string, Capability[]> = {
  // ── Platform ──────────────────────────────────────────────────────────────
  platform_owner: ALL_CAPABILITIES,
  system_admin: ALL_CAPABILITIES,
  holding_administrator: READ_ONLY_CAPABILITIES,

  // ── Cluster training management (Canonical: cluster_manager) ────────────
  cluster_manager: [
    // Running training operations across the cluster — the events/calls layer.
    // The capability guarded nothing until TrainingEvents existed, so granting
    // it here widens access to that feature and to nothing else. Scope is a
    // separate question and stays with ScopeContextService: this says the
    // cluster manager may run training operations, `visibleOrgIds` says the
    // operations reach their own cluster only.
    C.TRAINING_OPERATE,
    C.TRAINING_REQUEST_CREATE,
    C.TRAINING_REQUEST_VIEW,
    C.TRAINING_REQUEST_REVIEW,
    C.TRAINING_REQUEST_APPROVE,
    C.TRAINING_REQUEST_RETURN,
    C.ACADEMIC_BATCH_CREATE_FROM_REQUEST,
    C.ACADEMIC_BATCH_MANAGE,
    C.ALLOCATION_CLUSTER_AUTO,
    C.ALLOCATION_CLUSTER_MANUAL,
    C.ALLOCATION_CLUSTER_REASSIGN,
    C.CAPACITY_VIEW,
    C.TRAINEE_VIEW_SCOPE,
    C.LOGBOOK_VIEW,
    C.TIMELINE_VIEW,
    C.ORG_VIEW,
    C.ORG_MEMBER_VIEW,
    C.ORG_MEMBER_MANAGE,
    C.INCIDENT_VIEW,
    C.INCIDENT_MANAGE,
    C.REPORT_VIEW,
  ],
  // Legacy aliases for cluster management
  training_director: [
    C.TRAINING_REQUEST_CREATE,
    C.TRAINING_REQUEST_VIEW,
    C.TRAINING_REQUEST_REVIEW,
    C.TRAINING_REQUEST_APPROVE,
    C.TRAINING_REQUEST_RETURN,
    C.ACADEMIC_BATCH_CREATE_FROM_REQUEST,
    C.ACADEMIC_BATCH_MANAGE,
    C.ALLOCATION_CLUSTER_AUTO,
    C.ALLOCATION_CLUSTER_MANUAL,
    C.ALLOCATION_CLUSTER_REASSIGN,
    C.CAPACITY_VIEW,
    C.TRAINEE_VIEW_SCOPE,
    C.LOGBOOK_VIEW,
    C.TIMELINE_VIEW,
    C.ORG_VIEW,
    C.ORG_MEMBER_VIEW,
    C.ORG_MEMBER_MANAGE,
    C.INCIDENT_VIEW,
    C.INCIDENT_MANAGE,
    C.REPORT_VIEW,
  ],
  cluster_administrator: [
    C.TRAINING_REQUEST_CREATE,
    C.TRAINING_REQUEST_VIEW,
    C.TRAINING_REQUEST_REVIEW,
    C.TRAINING_REQUEST_APPROVE,
    C.TRAINING_REQUEST_RETURN,
    C.ACADEMIC_BATCH_CREATE_FROM_REQUEST,
    C.ACADEMIC_BATCH_MANAGE,
    C.ALLOCATION_CLUSTER_AUTO,
    C.ALLOCATION_CLUSTER_MANUAL,
    C.ALLOCATION_CLUSTER_REASSIGN,
    C.CAPACITY_VIEW,
    C.TRAINEE_VIEW_SCOPE,
    C.LOGBOOK_VIEW,
    C.TIMELINE_VIEW,
    C.ORG_VIEW,
    C.ORG_MEMBER_VIEW,
    C.ORG_MEMBER_MANAGE,
    C.INCIDENT_VIEW,
    C.REPORT_VIEW,
  ],

  // ── Hospital training management (Canonical: hospital_training_admin) ────
  hospital_training_admin: [
    // The hospital training administration is a first-class actor in the
    // request workflow: it opens the requests routed to its own hospital,
    // reviews them, and accepts or rejects them. Without this the role could
    // list rows through the legacy role check on /hospital-review but got a
    // 403 from CapabilityGuard the moment it opened a request, which is what
    // stalled the workflow at the hospital step. TRAINING_REQUEST_VIEW is
    // already declared valid from a 'hospital' context in CAPABILITY_CONTEXTS;
    // only the grant was missing. Review/approve/return stay cluster-only —
    // this is view access, scoped to the hospital's own rows by ScopeGuard.
    C.TRAINING_REQUEST_VIEW,
    C.DEPARTMENT_MANAGE,
    C.CAPACITY_VIEW,
    C.CAPACITY_MANAGE,
    C.TRAINER_MANAGE,
    C.ALLOCATION_HOSPITAL_ASSIGN,
    C.ALLOCATION_HOSPITAL_REASSIGN,
    C.TRAINEE_VIEW_HOSPITAL,
    C.TRAINING_OPERATE,
    C.LOGBOOK_VIEW,
    C.TIMELINE_VIEW,
    C.SCHEDULE_CREATE,
    C.SCHEDULE_VIEW,
    C.SCHEDULE_UPDATE,
    C.SCHEDULE_DELETE,
    C.SCHEDULE_PUBLISH,
    C.ORG_VIEW,
    C.ORG_MEMBER_VIEW,
    C.ORG_MEMBER_MANAGE,
    C.INCIDENT_VIEW,
    C.INCIDENT_MANAGE,
    C.REPORT_VIEW,
  ],
  // hospital_administrator is NOT a training role. It administers the hospital
  // as an organisation (members, incidents, reports) and holds ZERO training
  // capabilities, so hospital_training_admin is the only hospital training
  // management role in the model.
  // Hospital administration — deliberately not a training role.
  //
  // The legacy `permissions` table still describes this role as «يدير عمليات
  // التدريب والسعة داخل مستشفاه» and grants it manage_trainers / assign_rotations.
  // That description is not the live contract: capabilities are what the guards
  // read, and three separate specs assert this role holds no training capability.
  // The `hospital_administrator_accepted` request status is likewise historical
  // naming — the transition map routes that step to hospital_training_admin, not
  // to this role.
  //
  // Training inside a hospital is owned by hospital_training_admin alone. This
  // role administers the organisation: its members, its incidents, its reports.
  hospital_administrator: [
    C.ORG_VIEW,
    C.ORG_MEMBER_VIEW,
    C.ORG_MEMBER_MANAGE,
    C.INCIDENT_VIEW,
    C.INCIDENT_MANAGE,
    C.REPORT_VIEW,
  ],

  // department_head, training_supervisor and hospitalAdmin are NOT roles. They have been
  // removed. Any account still carrying those codes resolves to zero
  // capabilities and is rejected by ScopeContextService.

  trainer: [
    // A trainer runs training for the trainees assigned to them, which includes
    // calling them to an event. The reach is not granted here and cannot be:
    // TrainingEventsService resolves a trainer's audience from their own
    // rotations/allocations, and refuses them the trainer-facing audiences
    // outright.
    C.TRAINING_OPERATE,
    C.TRAINEE_VIEW_ASSIGNED,
    C.LOGBOOK_VIEW,
    C.LOGBOOK_APPROVE,
    C.EVALUATION_SUBMIT,
    C.TIMELINE_VIEW,
    C.SCHEDULE_CREATE,
    C.SCHEDULE_VIEW,
    C.SCHEDULE_UPDATE,
    C.INCIDENT_VIEW,
  ],

  academic_supervisor: [
    C.TRAINEE_VIEW_SCOPE,
    C.GRADUATION_APPROVE,
    C.LOGBOOK_VIEW,
    C.TIMELINE_VIEW,
    C.SCHEDULE_VIEW,
    C.ORG_VIEW,
    C.INCIDENT_VIEW,
    C.REPORT_VIEW,
  ],

  // ── University (sponsor) ──────────────────────────────────────────────────
  university_administrator: [
    C.TRAINING_REQUEST_CREATE,
    C.TRAINING_REQUEST_VIEW,
    C.TRAINEE_VIEW_SPONSORED,
    C.LOGBOOK_VIEW,
    C.TIMELINE_VIEW,
    C.SCHEDULE_VIEW,
    C.ORG_VIEW,
    C.ORG_MEMBER_VIEW,
    C.ORG_MEMBER_MANAGE,
    C.INCIDENT_VIEW,
    C.REPORT_VIEW,
  ],
  academic_affairs: [
    C.TRAINING_REQUEST_CREATE,
    C.TRAINING_REQUEST_VIEW,
    C.TRAINEE_VIEW_SPONSORED,
    C.LOGBOOK_VIEW,
    C.TIMELINE_VIEW,
    C.SCHEDULE_VIEW,
    C.ORG_VIEW,
    C.INCIDENT_VIEW,
    C.REPORT_VIEW,
  ],

  // ── Trainee ───────────────────────────────────────────────────────────────
  trainee: [
    C.SELF_VIEW,
    C.LOGBOOK_SUBMIT,
    C.LOGBOOK_VIEW,
    C.TIMELINE_VIEW,
    C.SCHEDULE_VIEW,
    C.INCIDENT_VIEW,
  ],

  // ── Non-training organisational administration ────────────────────────────
  org_manager: [
    C.ORG_VIEW,
    C.ORG_MEMBER_VIEW,
    C.ORG_MEMBER_MANAGE,
    C.REPORT_VIEW,
  ],
};

/** Capabilities granted by a set of role codes, deduplicated. */
export function capabilitiesForRoles(roleCodes: string[]): Capability[] {
  const set = new Set<Capability>();
  for (const code of roleCodes) {
    for (const cap of ROLE_CAPABILITIES[code] ?? []) set.add(cap);
  }
  return Array.from(set);
}

/** Whether a capability may be exercised from the given active context. */
export function capabilityAllowedInContext(
  cap: Capability,
  context: ContextType,
): boolean {
  return (CAPABILITY_CONTEXTS[cap] ?? []).includes(context);
}

/**
 * Roles granting a capability. Used to address notifications to whoever can act
 * on them, instead of naming a role code at the call site and hoping it stays
 * the right one.
 */
export function rolesWithCapability(cap: Capability): string[] {
  return Object.entries(ROLE_CAPABILITIES)
    .filter(([, caps]) => caps.includes(cap))
    .map(([role]) => role);
}

/** Roles that operate the training workflow at all — used by reporting/seeds. */
export const TRAINING_CAPABILITIES: Capability[] = [
  C.TRAINING_REQUEST_CREATE,
  C.TRAINING_REQUEST_REVIEW,
  C.TRAINING_REQUEST_APPROVE,
  C.TRAINING_REQUEST_RETURN,
  C.ACADEMIC_BATCH_CREATE_FROM_REQUEST,
  C.ACADEMIC_BATCH_MANAGE,
  C.ALLOCATION_CLUSTER_AUTO,
  C.ALLOCATION_CLUSTER_MANUAL,
  C.ALLOCATION_CLUSTER_REASSIGN,
  C.ALLOCATION_HOSPITAL_ASSIGN,
  C.ALLOCATION_HOSPITAL_REASSIGN,
  C.DEPARTMENT_MANAGE,
  C.CAPACITY_MANAGE,
  C.TRAINER_MANAGE,
  C.TRAINING_OPERATE,
];
