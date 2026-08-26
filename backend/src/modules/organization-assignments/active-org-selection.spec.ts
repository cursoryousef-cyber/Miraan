import { pickActiveEntry } from './organization-assignment.service';

/**
 * Which organisation a session is active in.
 *
 * The flag lived on each membership row with nothing enforcing that only one of
 * them carried it, and trainee accounts existed that were primary in a hospital
 * and in the cluster above it at the same time. Selection was
 * `available.find(e => e.isPrimary)`, so the answer — and every scope derived
 * from it — came down to which row the database returned first. A partial unique
 * index now stops new duplicates from being written; this pins the selection
 * itself, so bad data still resolves to one deterministic answer.
 */
describe('pickActiveEntry — active organisation selection', () => {
  const CLUSTER = { id: 'cluster-1', parentId: null };
  const HOSPITAL = { id: 'hospital-1', parentId: 'cluster-1' };
  const OTHER_HOSPITAL = { id: 'hospital-2', parentId: 'cluster-1' };
  const UNIVERSITY = { id: 'university-1', parentId: null };

  const entry = (organization: any, isPrimary: boolean) => ({ organization, isPrimary });

  it('returns null when the user holds no memberships', () => {
    expect(pickActiveEntry([])).toBeNull();
  });

  it('returns the only primary membership', () => {
    const hospital = entry(HOSPITAL, true);
    expect(pickActiveEntry([entry(CLUSTER, false), hospital])).toBe(hospital);
  });

  it('prefers the hospital over the cluster that runs it when both are primary', () => {
    const hospital = entry(HOSPITAL, true);
    // Cluster first, which is the order that produced the wrong answer before.
    expect(pickActiveEntry([entry(CLUSTER, true), hospital])).toBe(hospital);
  });

  it('gives the same answer whichever order the rows arrive in', () => {
    const cluster = entry(CLUSTER, true);
    const hospital = entry(HOSPITAL, true);
    expect(pickActiveEntry([cluster, hospital])).toBe(hospital);
    expect(pickActiveEntry([hospital, cluster])).toBe(hospital);
  });

  it('falls back to a non-primary membership when none is flagged primary', () => {
    const only = entry(HOSPITAL, false);
    expect(pickActiveEntry([only])).toBe(only);
  });

  it('never selects a non-primary row while a primary exists', () => {
    const primary = entry(OTHER_HOSPITAL, true);
    const result = pickActiveEntry([entry(HOSPITAL, false), primary]);
    expect(result).toBe(primary);
  });

  it('stays deterministic for unrelated primaries rather than throwing', () => {
    const university = entry(UNIVERSITY, true);
    const hospital = entry(HOSPITAL, true);
    // Neither is the other's parent; the first candidate is the settled answer.
    expect(pickActiveEntry([university, hospital])).toBe(university);
  });
});
