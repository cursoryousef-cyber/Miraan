import {
  assertValidTransition,
  TRAINING_REQUEST_TRAINEE_TRANSITIONS as TRAINEE,
  TRAINING_REQUEST_TRANSITIONS as REQUEST,
} from './transition-guard';

/**
 * The workflow the platform is required to enforce, asserted against the
 * transition tables the services actually guard on.
 *
 * These are deliberately written as the *rules*, not as a copy of the tables:
 * a table edited to allow a shortcut has to fail here rather than quietly
 * become the new truth.
 *
 *   University submission → Cluster review → Cluster allocation →
 *   Hospital review → Hospital acceptance → Department/Trainer assignment →
 *   Rotation & schedule → Active training → Completion
 */
const legal = (table: Record<string, string[]>, from: string, to: string) => {
  try {
    assertValidTransition('x', from, to, table);
    return true;
  } catch {
    return false;
  }
};

describe('training workflow — illegal shortcuts are refused', () => {
  describe('trainee lifecycle', () => {
    it('cannot start training before the hospital has accepted', () => {
      // The gate that makes "assigned but not yet started" representable.
      expect(legal(TRAINEE, 'hospital_review', 'active')).toBe(false);
      expect(legal(TRAINEE, 'allocated', 'active')).toBe(false);
      expect(legal(TRAINEE, 'hospital_accepted', 'active')).toBe(true);
    });

    it('cannot reach the hospital without passing the cluster', () => {
      expect(legal(TRAINEE, 'submitted', 'hospital_review')).toBe(false);
      expect(legal(TRAINEE, 'submitted', 'allocated')).toBe(false);
      expect(legal(TRAINEE, 'submitted', 'cluster_approved')).toBe(true);
      expect(legal(TRAINEE, 'cluster_approved', 'allocated')).toBe(true);
      expect(legal(TRAINEE, 'allocated', 'hospital_review')).toBe(true);
    });

    it('cannot graduate before training is active', () => {
      expect(legal(TRAINEE, 'hospital_accepted', 'graduated')).toBe(false);
      expect(legal(TRAINEE, 'hospital_review', 'graduated')).toBe(false);
      expect(legal(TRAINEE, 'active', 'graduated')).toBe(true);
    });

    it('treats rejection, merge and graduation as terminal', () => {
      for (const terminal of ['rejected', 'merged', 'split', 'graduated']) {
        expect(TRAINEE[terminal]).toEqual([]);
      }
    });

    it('cannot resurrect a rejected trainee', () => {
      expect(legal(TRAINEE, 'rejected', 'hospital_review')).toBe(false);
      expect(legal(TRAINEE, 'rejected', 'active')).toBe(false);
    });

    it('a hospital return goes back to the cluster, not straight onward', () => {
      expect(legal(TRAINEE, 'hospital_returned_to_cluster', 'allocated')).toBe(true);
      expect(legal(TRAINEE, 'hospital_returned_to_cluster', 'active')).toBe(false);
      expect(legal(TRAINEE, 'hospital_returned_to_cluster', 'hospital_accepted')).toBe(false);
    });
  });

  describe('request lifecycle', () => {
    it('requires the full acceptance chain before training starts', () => {
      expect(legal(REQUEST, 'approved', 'active')).toBe(false);
      expect(legal(REQUEST, 'hospital_accepted', 'active')).toBe(false);
      expect(legal(REQUEST, 'supervisor_accepted', 'active')).toBe(false);
      // Only the last link in the chain may start it.
      expect(legal(REQUEST, 'trainer_accepted', 'active')).toBe(true);
    });

    it('cannot skip cluster review on the way to a hospital', () => {
      expect(legal(REQUEST, 'submitted', 'approved')).toBe(false);
      expect(legal(REQUEST, 'submitted', 'hospital_accepted')).toBe(false);
    });

    it('cannot graduate before active', () => {
      expect(legal(REQUEST, 'trainer_accepted', 'graduated')).toBe(false);
      expect(legal(REQUEST, 'active', 'graduated')).toBe(true);
    });

    it('a returned request re-enters through the cluster', () => {
      expect(legal(REQUEST, 'returned_to_university', 'resubmitted')).toBe(true);
      expect(legal(REQUEST, 'resubmitted', 'under_cluster_review')).toBe(true);
      expect(legal(REQUEST, 'returned_to_university', 'approved')).toBe(false);
    });

    it('keeps the legacy allocated status usable rather than stranding old rows', () => {
      expect(legal(REQUEST, 'allocated', 'approved')).toBe(true);
    });
  });

  it('refuses a status that is not in the table at all', () => {
    expect(legal(TRAINEE, 'active', 'not_a_status')).toBe(false);
    expect(legal(TRAINEE, 'not_a_status', 'active')).toBe(false);
  });

  it('names the allowed targets when it refuses, so the caller can recover', () => {
    expect(() => assertValidTransition('طلب التدريب', 'hospital_review', 'active', TRAINEE))
      .toThrow(/hospital_accepted/);
  });
});
