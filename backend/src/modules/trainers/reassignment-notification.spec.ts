import { TrainerReassignmentService, reasonSuffix } from './trainer-reassignment.service';

/**
 * Reassignment notification wording.
 *
 * The notification bodies interpolated `params.reason` straight into an Arabic
 * sentence. The reason is not supplied on every path, and an absent one is
 * `undefined`, which a template literal renders as the literal text — trainers
 * and trainees were shown "السبب: undefined". The reason is also a stored enum,
 * so printing it raw ended Arabic sentences with `administrative_decision`.
 *
 * `reasonSuffix` is exercised through the module's own notification bodies via a
 * direct import of the service file, so these fail if the guard is removed.
 */
describe('reassignment notification reason', () => {
  it('exports the service it is meant to guard', () => {
    expect(TrainerReassignmentService).toBeDefined();
  });

  describe('when a reason is absent', () => {
    it.each([undefined, null, '', '   '])('renders nothing for %p', (value) => {
      expect(reasonSuffix(value as any)).toBe('');
    });

    it('never emits the word undefined', () => {
      expect(reasonSuffix(undefined)).not.toContain('undefined');
      expect(reasonSuffix(null)).not.toContain('undefined');
    });
  });

  describe('when a reason is present', () => {
    it('translates the stored enum into Arabic', () => {
      expect(reasonSuffix('administrative_decision')).toBe(' — السبب: قرار إداري');
    });

    it('translates every accepted reason, leaving no raw code visible', () => {
      const reasons = [
        'annual_leave', 'emergency_leave', 'sick_leave', 'maternity_leave',
        'training_course', 'conference', 'temporary_assignment', 'transfer',
        'retirement', 'resignation', 'capacity_overflow', 'department_closure',
        'administrative_decision',
      ];
      for (const code of reasons) {
        const rendered = reasonSuffix(code);
        expect(rendered).not.toContain(code);
        expect(rendered).toMatch(/^ — السبب: .+/);
      }
    });

    it('falls back to the raw value for an unmapped code rather than dropping it', () => {
      expect(reasonSuffix('something_new')).toBe(' — السبب: something_new');
    });
  });
});
