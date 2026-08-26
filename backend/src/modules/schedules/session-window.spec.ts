import { BadRequestException } from '@nestjs/common';
import { SchedulesService } from './schedules.service';

/**
 * Sessions are queried by date window.
 *
 * `GET /schedules` returns schedules, which run for weeks — a day view built from
 * those showed the same content on every date the schedule covered, so choosing
 * Friday displayed Sunday's content. Sessions carry their own `date`, so the
 * window filters the rows themselves and a different day genuinely returns a
 * different set. These pin that the window reaches the query, and that scoping
 * is applied to the query rather than to the result.
 */
describe('SchedulesService.findSessions — date window', () => {
  const ORG = 'hospital-A';

  function makeService(overrides: Partial<Record<string, any>> = {}) {
    const scheduleSession = { findMany: jest.fn().mockResolvedValue([]) };
    const prisma = {
      scheduleSession,
      traineeProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'trainee-1' }) },
      trainerProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'trainer-1' }) },
      ...overrides,
    } as any;
    return { service: new SchedulesService(prisma, {} as any), scheduleSession };
  }

  const admin = { accountId: 'a1', organizationId: ORG, roles: ['hospital_training_admin'] } as any;
  const trainee = { accountId: 'a2', organizationId: ORG, roles: ['trainee'] } as any;
  const trainer = { accountId: 'a3', organizationId: ORG, roles: ['trainer'] } as any;

  const whereOf = (m: any) => m.findMany.mock.calls[0][0].where;

  describe('the window reaches the query', () => {
    it('a single date queries that day alone', async () => {
      const { service, scheduleSession } = makeService();
      await service.findSessions(admin, { startDate: '2026-08-28' });

      expect(whereOf(scheduleSession).date).toEqual({
        gte: new Date('2026-08-28'),
        lte: new Date('2026-08-28'),
      });
    });

    it('a week queries the whole span', async () => {
      const { service, scheduleSession } = makeService();
      await service.findSessions(admin, { startDate: '2026-08-23', endDate: '2026-08-29' });

      expect(whereOf(scheduleSession).date).toEqual({
        gte: new Date('2026-08-23'),
        lte: new Date('2026-08-29'),
      });
    });

    it('two different days produce two different queries', async () => {
      const a = makeService();
      await a.service.findSessions(admin, { startDate: '2026-08-23' });
      const b = makeService();
      await b.service.findSessions(admin, { startDate: '2026-08-28' });

      expect(whereOf(a.scheduleSession).date).not.toEqual(whereOf(b.scheduleSession).date);
    });

    it('orders chronologically for the agenda', async () => {
      const { service, scheduleSession } = makeService();
      await service.findSessions(admin, { startDate: '2026-08-23', endDate: '2026-08-29' });

      expect(scheduleSession.findMany.mock.calls[0][0].orderBy).toEqual([
        { date: 'asc' },
        { startTime: 'asc' },
      ]);
    });

    it('narrows by department when asked', async () => {
      const { service, scheduleSession } = makeService();
      await service.findSessions(admin, { startDate: '2026-08-23', departmentId: 'dept-1' });

      expect(whereOf(scheduleSession).departmentId).toBe('dept-1');
    });
  });

  describe('invalid windows are refused, not silently widened', () => {
    it.each(['not-a-date', ''])('refuses startDate %p', async (bad) => {
      const { service } = makeService();
      await expect(service.findSessions(admin, { startDate: bad })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an end before the start', async () => {
      const { service } = makeService();
      await expect(
        service.findSessions(admin, { startDate: '2026-08-29', endDate: '2026-08-23' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('visibility is applied to the query', () => {
    it('confines a trainee to their own sessions in published schedules', async () => {
      const { service, scheduleSession } = makeService();
      await service.findSessions(trainee, { startDate: '2026-08-23' });

      const where = whereOf(scheduleSession);
      expect(where.traineeProfileId).toBe('trainee-1');
      expect(where.schedule).toEqual({ status: 'published' });
    });

    it('confines a trainer to sessions they run', async () => {
      const { service, scheduleSession } = makeService();
      await service.findSessions(trainer, { startDate: '2026-08-23' });

      expect(whereOf(scheduleSession).trainerProfileId).toBe('trainer-1');
    });

    it('scopes every caller to their own organisation', async () => {
      const { service, scheduleSession } = makeService();
      await service.findSessions(admin, { startDate: '2026-08-23' });

      expect(whereOf(scheduleSession).organizationId).toBe(ORG);
    });

    it('returns nothing for a trainee with no profile rather than the hospital list', async () => {
      const { service, scheduleSession } = makeService({
        traineeProfile: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      const res = await service.findSessions(trainee, { startDate: '2026-08-23' });

      expect(res).toEqual({ data: [] });
      expect(scheduleSession.findMany).not.toHaveBeenCalled();
    });
  });
});
