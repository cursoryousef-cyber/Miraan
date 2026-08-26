import { ForbiddenException } from '@nestjs/common';
import { SchedulesService } from './schedules.service';

/**
 * نطاق جدول المتدرب.
 *
 * المتدرب يرى جلساته هو، من جداول منشورة فقط، ولا يستطيع توسيع النطاق بتمرير
 * معرّف متدرب آخر — وهو المسار الذي كان يسمح سابقًا بقراءة جدول غيره.
 */
describe('نطاق جدول المتدرب', () => {
  const OWN = 'trainee-own';
  const OTHER = 'trainee-other';

  function makeService() {
    const captured: { where?: any } = {};
    const prisma = {
      traineeProfile: { findFirst: jest.fn().mockResolvedValue({ id: OWN }) },
      trainerProfile: { findFirst: jest.fn().mockResolvedValue(null) },
      trainingSchedule: {
        findMany: jest.fn().mockImplementation((args: any) => {
          captured.where = args.where;
          return Promise.resolve([]);
        }),
      },
      scheduleSession: {
        findMany: jest.fn().mockImplementation((args: any) => {
          captured.where = args.where;
          return Promise.resolve([]);
        }),
      },
    } as any;
    const service = new SchedulesService(prisma, { resolve: jest.fn(), assertOrgInScope: jest.fn() } as any);
    const user = { accountId: 'acct-t', organizationId: 'hospital-A', roles: ['trainee'] };
    return { service, user, captured };
  }

  // 11
  it('يحصر الجداول في مشاركة المتدرب نفسه', async () => {
    const { service, user, captured } = makeService();
    await service.findAll(user as any);
    expect(captured.where.participants.some.traineeProfileId).toBe(OWN);
  });

  // 12
  it('لا يعرض للمتدرب إلا الجداول المنشورة', async () => {
    const { service, user, captured } = makeService();
    await service.findAll(user as any);
    expect(captured.where.status).toBe('published');
  });

  // 13
  it('يرفض تمرير معرّف متدرب آخر بدل الاكتفاء بتجاهله', async () => {
    const { service, user } = makeService();
    await expect(service.findAll(user as any, { traineeId: OTHER })).rejects.toThrow(ForbiddenException);
  });

  // 14
  it('يقبل تمرير معرّف المتدرب نفسه', async () => {
    const { service, user } = makeService();
    await expect(service.findAll(user as any, { traineeId: OWN })).resolves.toBeDefined();
  });

  // 15
  it('جلسات المتدرب محصورة بجلساته هو ومن جداول منشورة', async () => {
    const { service, user, captured } = makeService();
    await service.findSessions(user as any, { startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(captured.where.traineeProfileId).toBe(OWN);
    expect(captured.where.schedule).toEqual({ status: 'published' });
  });

  // 16
  it('الجلسات محصورة أيضًا بجهة المتدرب', async () => {
    const { service, user, captured } = makeService();
    await service.findSessions(user as any, { startDate: '2026-08-01' });
    expect(captured.where.organizationId).toBe('hospital-A');
  });
});
