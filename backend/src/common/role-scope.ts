/**
 * Where a role is allowed to operate.
 *
 * Account, role and scope are three separate things that were being conflated:
 * an account could be created with a hospital role but only a cluster
 * organisation, or a platform owner could be narrowed by whichever organisation
 * happened to be in context. This table is the single place that states, for
 * each role, what scope it needs — the backend validates writes against it and
 * the frontend drives its form off the same contract.
 */

export type RoleScopeKind =
  /** Governs the whole federation; never narrowed by the active organisation. */
  | 'platform'
  /** Operates inside one organisation (university, cluster, holding). */
  | 'organization'
  /** Operates inside exactly one hospital, which must belong to the organisation. */
  | 'hospital';

export interface RoleScopeRule {
  kind: RoleScopeKind;
  /** An organisation must be supplied. */
  requiresOrganization: boolean;
  /** A hospital must be supplied, and must sit under the organisation. */
  requiresHospital: boolean;
  labelAr: string;
  /**
   * When set, the supplied organisation must be of this OrganizationType code.
   * Hospital-scoped roles already get this via requiresHospital; this covers
   * the university/cluster half of the same rule — a university_administrator
   * account created against a hospital (or vice versa) was previously accepted
   * outright, since only the hospital branch validated organisation type.
   */
  expectedOrgTypeCode?: string;
}

const PLATFORM: Omit<RoleScopeRule, 'labelAr'> = {
  kind: 'platform', requiresOrganization: false, requiresHospital: false,
};
const ORGANIZATION: Omit<RoleScopeRule, 'labelAr'> = {
  kind: 'organization', requiresOrganization: true, requiresHospital: false,
};
const HOSPITAL: Omit<RoleScopeRule, 'labelAr'> = {
  kind: 'hospital', requiresOrganization: true, requiresHospital: true,
};

export const ROLE_SCOPES: Record<string, RoleScopeRule> = {
  // ── Platform ──────────────────────────────────────────────────────────────
  platform_owner: { ...PLATFORM, labelAr: 'نطاق وطني — كل الجهات' },
  system_admin: { ...PLATFORM, labelAr: 'نطاق وطني — كل الجهات' },
  holding_administrator: { ...PLATFORM, labelAr: 'نطاق وطني — كل الجهات' },

  // ── Organisation ──────────────────────────────────────────────────────────
  org_manager: { ...ORGANIZATION, labelAr: 'جهة واحدة' },
  cluster_administrator: { ...ORGANIZATION, labelAr: 'تجمع صحي واحد', expectedOrgTypeCode: 'cluster' },
  cluster_manager: { ...ORGANIZATION, labelAr: 'تجمع صحي واحد', expectedOrgTypeCode: 'cluster' },
  training_director: { ...ORGANIZATION, labelAr: 'تجمع صحي واحد', expectedOrgTypeCode: 'cluster' },
  university_administrator: { ...ORGANIZATION, labelAr: 'جامعة واحدة', expectedOrgTypeCode: 'university' },
  academic_affairs: { ...ORGANIZATION, labelAr: 'جامعة واحدة' },
  academic_supervisor: { ...ORGANIZATION, labelAr: 'جهة أكاديمية واحدة' },

  // ── Hospital ──────────────────────────────────────────────────────────────
  hospital_administrator: { ...HOSPITAL, labelAr: 'مستشفى واحد' },
  hospital_training_admin: { ...HOSPITAL, labelAr: 'مستشفى واحد' },
  trainer: { ...HOSPITAL, labelAr: 'مستشفى واحد' },
  trainee: { ...HOSPITAL, labelAr: 'مستشفى واحد' },
};

/** Unknown roles default to organisation scope — the safe middle ground. */
export function roleScope(roleCode?: string | null): RoleScopeRule {
  if (!roleCode) return { ...ORGANIZATION, labelAr: 'جهة واحدة' };
  return ROLE_SCOPES[roleCode] ?? { ...ORGANIZATION, labelAr: 'جهة واحدة' };
}

export function isPlatformScoped(roleCode?: string | null): boolean {
  return roleScope(roleCode).kind === 'platform';
}

export function requiresHospital(roleCode?: string | null): boolean {
  return roleScope(roleCode).requiresHospital;
}

/** Any role that must be pinned to a hospital. Used by validation and reporting. */
export const HOSPITAL_SCOPED_ROLES = Object.entries(ROLE_SCOPES)
  .filter(([, r]) => r.requiresHospital)
  .map(([code]) => code);

export const PLATFORM_SCOPED_ROLES = Object.entries(ROLE_SCOPES)
  .filter(([, r]) => r.kind === 'platform')
  .map(([code]) => code);
