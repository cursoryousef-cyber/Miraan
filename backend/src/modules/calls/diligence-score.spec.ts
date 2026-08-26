import {
  DILIGENCE_WEIGHTS,
  ACK_TARGET_SECONDS,
  ARRIVAL_TARGET_SECONDS,
  secondsBetween,
  average,
  speedScore,
} from './calls.controller';

/**
 * The diligence score and its weights.
 *
 * The platform provisions `call_system.diligence_weights` as response 40,
 * attendance 30, ack speed 20, arrival speed 10 — but the score was computed as
 * `acked*0.3 + arrived*0.4 + confirmed*0.3`, which matches neither those weights
 * nor the four components they name, and measured no speed at all. These pin the
 * weights and the pieces the score is built from.
 */
describe('diligence score', () => {
  describe('weights', () => {
    it('are the four the platform provisions', () => {
      expect(DILIGENCE_WEIGHTS).toEqual({
        response: 40,
        attendance: 30,
        ackSpeed: 20,
        arrivalSpeed: 10,
      });
    });

    it('sum to 100, so the weighted total is a percentage', () => {
      const total = Object.values(DILIGENCE_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(total).toBe(100);
    });

    it('weights response above attendance above the two speeds', () => {
      expect(DILIGENCE_WEIGHTS.response).toBeGreaterThan(
        DILIGENCE_WEIGHTS.attendance,
      );
      expect(DILIGENCE_WEIGHTS.attendance).toBeGreaterThan(
        DILIGENCE_WEIGHTS.ackSpeed,
      );
      expect(DILIGENCE_WEIGHTS.ackSpeed).toBeGreaterThan(
        DILIGENCE_WEIGHTS.arrivalSpeed,
      );
    });
  });

  describe('secondsBetween — measured from server timestamps', () => {
    it('returns the gap in seconds', () => {
      expect(
        secondsBetween(
          new Date('2026-08-24T10:00:00Z'),
          new Date('2026-08-24T10:02:00Z'),
        ),
      ).toBe(120);
    });

    it('never returns a negative interval', () => {
      expect(
        secondsBetween(
          new Date('2026-08-24T10:02:00Z'),
          new Date('2026-08-24T10:00:00Z'),
        ),
      ).toBe(0);
    });
  });

  describe('average', () => {
    it('is null with no samples, so an uncalled trainee is not scored on speed', () => {
      expect(average([])).toBeNull();
    });

    it('averages the samples it has', () => {
      expect(average([10, 20, 30])).toBe(20);
    });
  });

  describe('speedScore', () => {
    it('gives full marks at or under the target', () => {
      expect(speedScore(30, ACK_TARGET_SECONDS)).toBe(100);
      expect(speedScore(ACK_TARGET_SECONDS, ACK_TARGET_SECONDS)).toBe(100);
    });

    it('gives nothing at or beyond three times the target', () => {
      expect(speedScore(ACK_TARGET_SECONDS * 3, ACK_TARGET_SECONDS)).toBe(0);
      expect(speedScore(ACK_TARGET_SECONDS * 10, ACK_TARGET_SECONDS)).toBe(0);
    });

    it('falls linearly in between', () => {
      expect(
        speedScore(ACK_TARGET_SECONDS * 2, ACK_TARGET_SECONDS),
      ).toBeCloseTo(50, 5);
    });

    it('scores nothing when there is no measurement', () => {
      expect(speedScore(null, ACK_TARGET_SECONDS)).toBe(0);
    });

    it('uses a longer target for arrival than for acknowledgement', () => {
      expect(ARRIVAL_TARGET_SECONDS).toBeGreaterThan(ACK_TARGET_SECONDS);
    });
  });

  describe('the weighted total', () => {
    const score = (
      response: number,
      attendance: number,
      ack: number,
      arrival: number,
    ) =>
      Math.round(
        response * (DILIGENCE_WEIGHTS.response / 100) +
          attendance * (DILIGENCE_WEIGHTS.attendance / 100) +
          ack * (DILIGENCE_WEIGHTS.ackSpeed / 100) +
          arrival * (DILIGENCE_WEIGHTS.arrivalSpeed / 100),
      );

    it('is 100 when every component is perfect', () => {
      expect(score(100, 100, 100, 100)).toBe(100);
    });

    it('is 0 when nothing was done', () => {
      expect(score(0, 0, 0, 0)).toBe(0);
    });

    it('credits responding without arriving at exactly the response weight', () => {
      expect(score(100, 0, 0, 0)).toBe(DILIGENCE_WEIGHTS.response);
    });

    it('credits confirmed attendance at exactly the attendance weight', () => {
      expect(score(0, 100, 0, 0)).toBe(DILIGENCE_WEIGHTS.attendance);
    });

    it('ranks a fast responder above a slow one with the same outcomes', () => {
      expect(score(100, 100, 100, 100)).toBeGreaterThan(score(100, 100, 0, 0));
    });
  });
});
