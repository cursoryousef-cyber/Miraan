import {
  DILIGENCE_WEIGHTS, ACK_TARGET_SECONDS, ARRIVAL_TARGET_SECONDS,
  secondsBetween, average, speedScore,
} from './calls.controller';

/**
 * The call lifecycle and the score derived from it.
 *
 * Verified end to end against the running system: a trainer launched a call, the
 * trainee acknowledged and self-reported arrival, the trainer confirmed it, and
 * the four timestamps landed in `call_participants` 20s / 22s apart with a 2s
 * verification gap. `/calls/diligence` then returned every component at 100 and a
 * total of 100. These pin the arithmetic behind that result.
 */
describe('call lifecycle → diligence', () => {
  /** The observed end-to-end run. */
  const RUN = { notified: '2026-08-25T10:12:47Z', ack: '2026-08-25T10:13:07Z',
                selfArrived: '2026-08-25T10:13:09Z', confirmed: '2026-08-25T10:13:11Z' };
  const d = (s: string) => new Date(s);

  describe('the timestamps produce the intervals the API reported', () => {
    it('acknowledgement took 20 seconds', () => {
      expect(secondsBetween(d(RUN.notified), d(RUN.ack))).toBe(20);
    });

    it('arrival took 22 seconds from notification', () => {
      expect(secondsBetween(d(RUN.notified), d(RUN.selfArrived))).toBe(22);
    });

    it('verificationGapSeconds is self-arrival to trainer confirmation', () => {
      // Not measured from notification: the gap is how long the trainee's own
      // claim waited to be verified.
      expect(secondsBetween(d(RUN.selfArrived), d(RUN.confirmed))).toBe(2);
    });

    it('a confirmation that never came leaves no gap to average', () => {
      expect(average([])).toBeNull();
    });
  });

  describe('the components that run produced', () => {
    const responsePct = 100;   // acknowledged 1 of 1
    const attendancePct = 100; // confirmed 1 of 1
    const ackSpeedPct = speedScore(20, ACK_TARGET_SECONDS);
    const arrivalSpeedPct = speedScore(22, ARRIVAL_TARGET_SECONDS);

    it('20s acknowledgement is inside the target, so full speed marks', () => {
      expect(ackSpeedPct).toBe(100);
    });

    it('22s arrival is well inside its target, so full speed marks', () => {
      expect(arrivalSpeedPct).toBe(100);
    });

    it('totals to the 100 the endpoint returned', () => {
      const total = Math.round(
        responsePct * (DILIGENCE_WEIGHTS.response / 100) +
        attendancePct * (DILIGENCE_WEIGHTS.attendance / 100) +
        ackSpeedPct * (DILIGENCE_WEIGHTS.ackSpeed / 100) +
        arrivalSpeedPct * (DILIGENCE_WEIGHTS.arrivalSpeed / 100),
      );
      expect(total).toBe(100);
    });
  });

  describe('a slower run scores lower on the same outcomes', () => {
    it('a late acknowledgement costs exactly the ack-speed weight', () => {
      const slow = Math.round(
        100 * (DILIGENCE_WEIGHTS.response / 100) +
        100 * (DILIGENCE_WEIGHTS.attendance / 100) +
        speedScore(ACK_TARGET_SECONDS * 3, ACK_TARGET_SECONDS) * (DILIGENCE_WEIGHTS.ackSpeed / 100) +
        100 * (DILIGENCE_WEIGHTS.arrivalSpeed / 100),
      );
      expect(slow).toBe(100 - DILIGENCE_WEIGHTS.ackSpeed);
    });

    it('acknowledging without arriving scores the response weight alone', () => {
      const ackOnly = Math.round(
        100 * (DILIGENCE_WEIGHTS.response / 100) +
        0 * (DILIGENCE_WEIGHTS.attendance / 100) +
        100 * (DILIGENCE_WEIGHTS.ackSpeed / 100) +
        0 * (DILIGENCE_WEIGHTS.arrivalSpeed / 100),
      );
      expect(ackOnly).toBe(DILIGENCE_WEIGHTS.response + DILIGENCE_WEIGHTS.ackSpeed);
    });

    it('never responding scores nothing', () => {
      expect(speedScore(null, ACK_TARGET_SECONDS)).toBe(0);
    });
  });
});
