import { toOrgContract } from './auth.service';

/**
 * The organisation contract shared by /auth/login and /auth/me.
 *
 * These endpoints each built their own organisation literal and drifted apart:
 * login sent `isPrimary` but no `type`, me sent `type` and `logoUrl` but no
 * `isPrimary`. The iOS client keeps whichever payload started the session rather
 * than re-fetching, so the fields it had for an organisation depended on how the
 * user signed in — and without `type` it could not tell a hospital from the
 * cluster administering it, which is what made a trainee look posted to two
 * organisations at once.
 *
 * Both endpoints now serialise through `toOrgContract`. These tests pin the key
 * set, so adding a field to one endpoint cannot silently skip the other.
 */
describe('auth organisation contract', () => {
  const EXPECTED_KEYS = [
    'id',
    'code',
    'nameAr',
    'nameEn',
    'type',
    'logoUrl',
    'parentId',
    'parentNameAr',
    'isPrimary',
  ].sort();

  const hospital = {
    id: 'hospital-1',
    code: 'E2E-HOSP-1',
    nameAr: 'مستشفى 1',
    nameEn: 'Hospital 1',
    organizationType: { code: 'hospital' },
    logoUrl: null,
    parentId: 'cluster-1',
    parent: { nameAr: 'إدارة التدريب بالتجمع الصحي أ' },
  };

  it('emits exactly the agreed key set', () => {
    expect(Object.keys(toOrgContract(hospital, true)).sort()).toEqual(EXPECTED_KEYS);
  });

  it('emits the same key set regardless of how much the organisation carries', () => {
    const bare = { id: 'org-1', code: null, nameAr: 'جهة', nameEn: null };
    expect(Object.keys(toOrgContract(bare)).sort()).toEqual(EXPECTED_KEYS);
  });

  it('carries the organisation type through', () => {
    expect(toOrgContract(hospital).type).toBe('hospital');
  });

  it('names the administering parent', () => {
    const contract = toOrgContract(hospital);
    expect(contract.parentId).toBe('cluster-1');
    expect(contract.parentNameAr).toBe('إدارة التدريب بالتجمع الصحي أ');
  });

  it('defaults an unknown organisation type to hospital rather than undefined', () => {
    expect(toOrgContract({ id: 'x', organizationType: null }).type).toBe('hospital');
  });

  it('reports a missing parent as null, never undefined', () => {
    const cluster = { id: 'cluster-1', organizationType: { code: 'cluster' } };
    const contract = toOrgContract(cluster);
    expect(contract.parentId).toBeNull();
    expect(contract.parentNameAr).toBeNull();
  });

  it('preserves the primary flag both ways', () => {
    expect(toOrgContract(hospital, true).isPrimary).toBe(true);
    expect(toOrgContract(hospital, false).isPrimary).toBe(false);
  });

  it('never leaks account credentials even if handed a joined row', () => {
    const polluted = {
      ...hospital,
      passwordHash: 'should-not-appear',
      refreshTokenHash: 'should-not-appear',
    };
    const serialised = JSON.stringify(toOrgContract(polluted));
    expect(serialised).not.toContain('should-not-appear');
  });
});
