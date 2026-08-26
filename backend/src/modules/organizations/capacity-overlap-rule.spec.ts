import { periodsOverlap } from './capacity.service';

/**
 * One definition of "occupied", shared by the three layers that decide it.
 *
 * The capacity trigger counted every rotation with status='active' in a
 * department regardless of when it ran, while CapacityService counted anything
 * ending today or later. A department whose seats were held until September was
 * therefore refused a January placement by the trigger, and a department the UI
 * reported as full could still accept a non-overlapping one — the number shown
 * and the number enforced came from two different rules.
 *
 * The rule is now overlap, in all three: `start <= other_end AND end >= other_start`.
 * These pin the predicate itself; capacity-window.spec.ts pins the listing that
 * reports it and the live API test proves the trigger enforces it.
 */
describe('capacity occupancy — the overlap rule', () => {
  const d = (iso: string) => new Date(iso);

  describe('periods that overlap — the seat is taken', () => {
    it('counts an identical period', () => {
      expect(periodsOverlap(d('2026-08-01'), d('2026-09-30'), d('2026-08-01'), d('2026-09-30'))).toBe(true);
    });

    it('counts a partial overlap at the tail', () => {
      expect(periodsOverlap(d('2026-09-01'), d('2026-10-31'), d('2026-08-01'), d('2026-09-30'))).toBe(true);
    });

    it('counts a period fully contained in another', () => {
      expect(periodsOverlap(d('2026-08-10'), d('2026-08-20'), d('2026-08-01'), d('2026-09-30'))).toBe(true);
    });

    it('counts periods that merely touch on one day', () => {
      expect(periodsOverlap(d('2026-09-30'), d('2026-10-30'), d('2026-08-01'), d('2026-09-30'))).toBe(true);
    });

    it('counts an open-ended period as still running', () => {
      expect(periodsOverlap(d('2027-01-01'), null, d('2026-08-01'), d('2026-09-30'))).toBe(false);
      expect(periodsOverlap(d('2026-01-01'), null, d('2026-08-01'), d('2026-09-30'))).toBe(true);
    });
  });

  describe('periods that do not overlap — the seat is free', () => {
    it('does not count a period ending before the window opens', () => {
      expect(periodsOverlap(d('2027-01-01'), d('2027-03-01'), d('2026-08-01'), d('2026-09-30'))).toBe(false);
    });

    it('does not count a period starting after the window closes', () => {
      expect(periodsOverlap(d('2026-01-01'), d('2026-03-01'), d('2026-08-01'), d('2026-09-30'))).toBe(false);
    });

    it('does not count a period ending the day before the window starts', () => {
      expect(periodsOverlap(d('2026-10-01'), d('2026-11-30'), d('2026-08-01'), d('2026-09-30'))).toBe(false);
    });
  });

  describe('the rule is symmetric — the same pair either clashes or does not', () => {
    it.each([
      ['2026-08-01', '2026-09-30', '2026-09-01', '2026-10-31'],
      ['2026-08-01', '2026-09-30', '2027-01-01', '2027-03-01'],
      ['2026-08-01', '2026-09-30', '2026-08-01', '2026-09-30'],
    ])('%s→%s vs %s→%s', (aS, aE, bS, bE) => {
      expect(periodsOverlap(d(aS), d(aE), d(bS), d(bE)))
        .toBe(periodsOverlap(d(bS), d(bE), d(aS), d(aE)));
    });
  });

  describe('the scenario that exposed the split', () => {
    // Department capacity 3, three placements running Aug–Sep. A January
    // placement was refused by the old trigger even though those seats are free
    // by then, while the listing reported "0 remaining" for every period at once.
    const existing: Array<[Date, Date]> = [
      [d('2026-08-01'), d('2026-09-30')],
      [d('2026-08-01'), d('2026-09-30')],
      [d('2026-09-06'), d('2027-09-05')],
    ];

    const occupiedDuring = (start: Date, end: Date) =>
      existing.filter(([s, e]) => periodsOverlap(s, e, start, end)).length;

    it('a January period sees only the placement that runs into it', () => {
      expect(occupiedDuring(d('2027-01-01'), d('2027-03-01'))).toBe(1);
    });

    it('a mid-August period sees only the two running then', () => {
      // The third starts 2026-09-06, after this window closes.
      expect(occupiedDuring(d('2026-08-15'), d('2026-08-20'))).toBe(2);
    });

    it('a mid-September period sees all three overlapping at once', () => {
      expect(occupiedDuring(d('2026-09-10'), d('2026-09-20'))).toBe(3);
    });

    it('a period after everything ends sees none', () => {
      expect(occupiedDuring(d('2028-01-01'), d('2028-03-01'))).toBe(0);
    });

    it('remaining = capacity - occupied, per period', () => {
      const capacity = 3;
      expect(capacity - occupiedDuring(d('2026-09-10'), d('2026-09-20'))).toBe(0);
      expect(capacity - occupiedDuring(d('2026-08-15'), d('2026-08-20'))).toBe(1);
      expect(capacity - occupiedDuring(d('2027-01-01'), d('2027-03-01'))).toBe(2);
      expect(capacity - occupiedDuring(d('2028-01-01'), d('2028-03-01'))).toBe(3);
    });
  });
});
