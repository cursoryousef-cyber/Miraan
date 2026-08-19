/**
 * Frontend mirror of the backend role-scope contract
 * (`backend/src/common/role-scope.ts`).
 *
 * The two must agree: the backend rejects an invalid organisation/hospital
 * combination on write, and this table makes the form unable to offer one in the
 * first place. Keep them in step — a role added on one side must be added here.
 */

export type RoleScopeKind = 'platform' | 'organization' | 'hospital';

export interface RoleScopeRule {
  kind: RoleScopeKind;
  requiresOrganization: boolean;
  requiresHospital: boolean;
  labelAr: string;
}

const PLATFORM: RoleScopeRule = {
  kind: 'platform', requiresOrganization: false, requiresHospital: false,
  labelAr: 'نطاق وطني — كل الجهات',
};
const ORGANIZATION = (labelAr: string): RoleScopeRule => ({
  kind: 'organization', requiresOrganization: true, requiresHospital: false, labelAr,
});
const HOSPITAL: RoleScopeRule = {
  kind: 'hospital', requiresOrganization: true, requiresHospital: true,
  labelAr: 'مستشفى واحد',
};

export const ROLE_SCOPES: Record<string, RoleScopeRule> = {
  platform_owner: PLATFORM,
  system_admin: PLATFORM,
  holding_administrator: PLATFORM,

  org_manager: ORGANIZATION('جهة واحدة'),
  cluster_administrator: ORGANIZATION('تجمع صحي واحد'),
  cluster_manager: ORGANIZATION('تجمع صحي واحد'),
  training_director: ORGANIZATION('تجمع صحي واحد'),
  university_administrator: ORGANIZATION('جامعة واحدة'),
  academic_affairs: ORGANIZATION('جامعة واحدة'),
  academic_supervisor: ORGANIZATION('جهة أكاديمية واحدة'),

  hospital_administrator: HOSPITAL,
  hospital_training_admin: HOSPITAL,
  trainer: HOSPITAL,
  trainee: HOSPITAL,
};

export function roleScope(roleCode?: string | null): RoleScopeRule {
  if (!roleCode) return ORGANIZATION('جهة واحدة');
  return ROLE_SCOPES[roleCode] ?? ORGANIZATION('جهة واحدة');
}

export const requiresHospital = (roleCode?: string | null) => roleScope(roleCode).requiresHospital;
export const requiresOrganization = (roleCode?: string | null) => roleScope(roleCode).requiresOrganization;
export const isPlatformScoped = (roleCode?: string | null) => roleScope(roleCode).kind === 'platform';

/** Short Arabic label describing where an account operates. */
export function scopeLabel(roleCode?: string | null): string {
  return roleScope(roleCode).labelAr;
}
