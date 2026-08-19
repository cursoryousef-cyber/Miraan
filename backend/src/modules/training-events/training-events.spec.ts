import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TrainingEventsService, RECIPIENT_STATUS } from './training-events.service';

/**
 * Audience is a request; scope is the authority. These drive the service
 * directly — the path a caller bypassing the UI takes — and cover the two
 * failures the earlier call-launch defect taught: addressing people outside
 * your reach, and writing anything before the audience has been validated.
 */
describe('TrainingEventsService', () => {
  const CLUSTER_A = 'cluster-A';
  const HOSPITAL_A = 'hospital-A';
  const TRAINER_A = 'trainer-profile-A';

  function makeService(opts: {
    /** Trainee profiles the database would return, keyed by org membership. */
    traineesInScope?: string[];
    trainersInScope?: string[];
    ownTraineeIds?: string[];
    callerTrainerProfile?: string | null;
    created?: any[];
  } = {}) {
    const created: any[] = opts.created ?? [];

    const selectRows = (known: string[], where: any) => {
      const asked: string[] | undefined = where.id?.in;
      const pool = asked ? known.filter((id) => asked.includes(id)) : known;
      return pool.map((id) => ({
        id,
        person: { userAccounts: [{ id: `account-of-${id}` }] },
      }));
    };

    const tx = {
      trainingEvent: {
        create: jest.fn().mockImplementation((args) => {
          created.push(args.data);
          return { id: 'event-1', ...args.data };
        }),
      },
      trainingEventRecipient: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      notification: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: jest.fn() },
    };

    const prisma = {
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
      traineeProfile: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }) => selectRows(opts.traineesInScope ?? [], where)),
      },
      trainerProfile: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }) => selectRows(opts.trainersInScope ?? [], where)),
        findFirst: jest.fn().mockResolvedValue(
          opts.callerTrainerProfile === null ? null : { id: opts.callerTrainerProfile ?? TRAINER_A },
        ),
      },
      rotation: {
        findMany: jest.fn().mockResolvedValue(
          (opts.ownTraineeIds ?? []).map((id) => ({ traineeProfileId: id })),
        ),
      },
      traineeAllocation: { findMany: jest.fn().mockResolvedValue([]) },
      trainingEventRecipient: { findFirst: jest.fn(), update: jest.fn() },
      trainingEvent: { findUnique: jest.fn() },
      auditLog: { create: jest.fn() },
    } as any;

    return { service: new TrainingEventsService(prisma, {} as any), prisma, tx, created };
  }

  const clusterUser = { accountId: 'acct-cm', roles: ['cluster_manager'] } as any;
  const clusterScope = {
    organizationId: CLUSTER_A,
    visibleOrgIds: [CLUSTER_A, HOSPITAL_A],
    roles: ['cluster_manager'],
  } as any;

  const trainerUser = { accountId: 'acct-tr', roles: ['trainer'] } as any;
  const trainerScope = {
    organizationId: HOSPITAL_A,
    visibleOrgIds: [HOSPITAL_A],
    roles: ['trainer'],
  } as any;

  const baseDto = {
    eventType: 'announcement',
    title: 'إعلان',
    responseMode: 'information_only',
    audienceType: 'all_trainees',
  };

  describe('input validation', () => {
    it.each([
      ['eventType', { ...baseDto, eventType: 'party' }],
      ['responseMode', { ...baseDto, responseMode: 'telepathy' }],
      ['audienceType', { ...baseDto, audienceType: 'everyone' }],
    ])('refuses an unsupported %s', async (_label, dto) => {
      const { service } = makeService({ traineesInScope: ['t1'] });
      await expect(service.create(clusterUser, clusterScope, dto as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses an end date before the start date', async () => {
      const { service } = makeService({ traineesInScope: ['t1'] });
      await expect(
        service.create(clusterUser, clusterScope, {
          ...baseDto,
          startAt: '2026-05-01',
          endAt: '2026-04-01',
        } as any),
      ).rejects.toThrow(/يسبق تاريخ النهاية/);
    });
  });

  describe('audience resolution and scope', () => {
    it('resolves all_trainees across the cluster the sender can see', async () => {
      const { service, created } = makeService({ traineesInScope: ['t1', 't2'] });
      const res = await service.create(clusterUser, clusterScope, baseDto as any);
      expect(res.data.recipientCount).toBe(2);
      expect(created[0].organizationId).toBe(CLUSTER_A);
    });

    it('refuses a selected trainee outside the sender scope', async () => {
      // Only t1 is inside; naming t-other lowers the resolved count.
      const { service } = makeService({ traineesInScope: ['t1'] });
      await expect(
        service.create(clusterUser, clusterScope, {
          ...baseDto,
          audienceType: 'selected_trainees',
          recipientProfileIds: ['t1', 't-in-cluster-B'],
        } as any),
      ).rejects.toThrow(/خارج نطاق صلاحياتك/);
    });

    it('refuses a selected trainer outside the sender scope', async () => {
      const { service } = makeService({ trainersInScope: ['tr1'] });
      await expect(
        service.create(clusterUser, clusterScope, {
          ...baseDto,
          audienceType: 'selected_trainers',
          recipientProfileIds: ['tr1', 'tr-in-hospital-B'],
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to send when nothing resolves rather than creating an empty event', async () => {
      const { service, created } = makeService({ traineesInScope: [] });
      await expect(
        service.create(clusterUser, clusterScope, baseDto as any),
      ).rejects.toThrow(/لا يوجد مستلمون/);
      expect(created).toHaveLength(0);
    });

    it('writes nothing at all when validation fails — no orphan event', async () => {
      const { service, tx } = makeService({ traineesInScope: ['t1'] });
      await expect(
        service.create(clusterUser, clusterScope, {
          ...baseDto,
          audienceType: 'selected_trainees',
          recipientProfileIds: ['t-foreign'],
        } as any),
      ).rejects.toThrow();
      expect(tx.trainingEvent.create).not.toHaveBeenCalled();
      expect(tx.notification.createMany).not.toHaveBeenCalled();
    });
  });

  describe('trainer reach', () => {
    it('reaches its own assigned trainees', async () => {
      const { service } = makeService({
        ownTraineeIds: ['mine'],
        traineesInScope: ['mine'],
      });
      const res = await service.create(trainerUser, trainerScope, {
        ...baseDto,
        audienceType: 'my_trainees',
      } as any);
      expect(res.data.recipientCount).toBe(1);
    });

    it("refuses another trainer's trainee", async () => {
      const { service } = makeService({
        ownTraineeIds: ['mine'],
        traineesInScope: ['mine', 'theirs'],
      });
      await expect(
        service.create(trainerUser, trainerScope, {
          ...baseDto,
          audienceType: 'my_trainees',
          recipientProfileIds: ['theirs'],
        } as any),
      ).rejects.toThrow(/غير مسند إليك/);
    });

    it('refuses a trainer addressing trainers', async () => {
      const { service } = makeService({ ownTraineeIds: ['mine'] });
      await expect(
        service.create(trainerUser, trainerScope, {
          ...baseDto,
          audienceType: 'all_trainers',
        } as any),
      ).rejects.toThrow(/لا يمكن للمدرب/);
    });

    it('refuses a caller with no trainer profile', async () => {
      const { service } = makeService({ callerTrainerProfile: null });
      await expect(
        service.create(trainerUser, trainerScope, {
          ...baseDto,
          audienceType: 'my_trainees',
        } as any),
      ).rejects.toThrow(/لا يوجد ملف مدرب/);
    });
  });

  describe('recipient responses', () => {
    function makeResponder(recipient: any, event: any) {
      const prisma = {
        trainingEventRecipient: {
          findFirst: jest.fn().mockResolvedValue(recipient ? { ...recipient, event } : null),
          update: jest.fn().mockImplementation((a) => a.data),
        },
        auditLog: { create: jest.fn() },
      } as any;
      return new TrainingEventsService(prisma, {} as any);
    }

    const recipientRow = (status = RECIPIENT_STATUS.PENDING) => ({
      id: 'rec-1',
      status,
      recipientAccountId: 'acct-me',
      event: undefined,
    });
    const me = { accountId: 'acct-me', roles: ['trainee'] } as any;

    it('refuses someone who is not a recipient', async () => {
      const s = makeResponder(null, null);
      await expect(s.respond('event-1', me, 'acknowledge')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses an action the response mode does not offer', async () => {
      const s = makeResponder(recipientRow(), {
        responseMode: 'information_only',
        status: 'sent',
        organizationId: HOSPITAL_A,
      });
      await expect(s.respond('event-1', me, 'acknowledge')).rejects.toThrow(/غير متاح لفعالية/);
    });

    it('refuses an action from the wrong current status', async () => {
      const s = makeResponder(recipientRow(RECIPIENT_STATUS.PENDING), {
        responseMode: 'attendance',
        status: 'sent',
        organizationId: HOSPITAL_A,
      });
      // attend requires an accepted invitation first
      await expect(s.respond('event-1', me, 'attend')).rejects.toThrow(/الحالة الحالية/);
    });

    it('records arrival as a self-report and never as the confirmation', async () => {
      const s = makeResponder(recipientRow(), {
        responseMode: 'arrival',
        status: 'sent',
        organizationId: HOSPITAL_A,
      });
      const res = await s.respond('event-1', me, 'arrive');
      expect(res.data.status).toBe(RECIPIENT_STATUS.ARRIVED);
      expect(res.data.confirmedAt).toBeUndefined();
      expect(res.data.arrivedAt).toBeInstanceOf(Date);
    });
  });

  describe('operator confirmation', () => {
    function makeConfirmer(opts: {
      eventOrg?: string;
      createdById?: string;
      recipient?: any;
    }) {
      const prisma = {
        trainingEvent: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'event-1',
            organizationId: opts.eventOrg ?? HOSPITAL_A,
            createdById: opts.createdById ?? 'acct-owner',
            status: 'sent',
          }),
        },
        trainingEventRecipient: {
          findFirst: jest.fn().mockResolvedValue(
            opts.recipient === undefined
              ? { id: 'rec-1', status: RECIPIENT_STATUS.ARRIVED, recipientAccountId: 'acct-them' }
              : opts.recipient,
          ),
          update: jest.fn().mockImplementation((a) => a.data),
        },
        auditLog: { create: jest.fn() },
      } as any;
      return new TrainingEventsService(prisma, {} as any);
    }

    const owner = { accountId: 'acct-owner', roles: ['hospital_training_admin'] } as any;
    const inScope = { visibleOrgIds: [HOSPITAL_A] } as any;
    const otherHospital = { visibleOrgIds: ['hospital-B'] } as any;

    it('lets the event owner confirm an arrived recipient', async () => {
      const s = makeConfirmer({});
      const res = await s.confirmAttendance('event-1', 'rec-1', owner, inScope);
      expect(res.data.status).toBe(RECIPIENT_STATUS.CONFIRMED);
      expect(res.data.confirmedById).toBe('acct-owner');
    });

    it('refuses a caller from another hospital who did not create it', async () => {
      const s = makeConfirmer({ createdById: 'someone-else' });
      await expect(
        s.confirmAttendance('event-1', 'rec-1', { accountId: 'acct-x', roles: [] } as any, otherHospital),
      ).rejects.toThrow(/خارج نطاق/);
    });

    it('refuses confirming yourself', async () => {
      const s = makeConfirmer({
        recipient: { id: 'rec-1', status: RECIPIENT_STATUS.ARRIVED, recipientAccountId: 'acct-owner' },
      });
      await expect(
        s.confirmAttendance('event-1', 'rec-1', owner, inScope),
      ).rejects.toThrow(/تأكيد حضور نفسك/);
    });

    it('refuses confirming a recipient who never reported arriving', async () => {
      const s = makeConfirmer({
        recipient: { id: 'rec-1', status: RECIPIENT_STATUS.PENDING, recipientAccountId: 'acct-them' },
      });
      await expect(
        s.confirmAttendance('event-1', 'rec-1', owner, inScope),
      ).rejects.toThrow(/الحالة الحالية/);
    });

    it('refuses a recipient id belonging to a different event', async () => {
      const s = makeConfirmer({ recipient: null });
      await expect(
        s.confirmAttendance('event-1', 'rec-elsewhere', owner, inScope),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

/**
 * The authorization layer in front of the service. Capability answers "may this
 * role run training operations at all", context answers "from where", and the
 * service (covered above) answers "reaching whom". All three must line up or a
 * legitimate sender is refused before the service is ever consulted.
 */
describe('TrainingEvents authorization matrix', () => {
  // Imported lazily so this block reads as a check of the shipped tables.
  const authz = require('../../common/authz/capabilities');
  const CAP = authz.CAPABILITIES.TRAINING_OPERATE;
  const holds = (role: string) => authz.capabilitiesForRoles([role]).includes(CAP);
  const usable = (role: string, ctx: string) =>
    holds(role) && authz.capabilityAllowedInContext(CAP, ctx);

  it('lets a cluster manager operate from a cluster context', () => {
    expect(usable('cluster_manager', 'cluster')).toBe(true);
  });

  it('lets a hospital training admin operate from a hospital context', () => {
    expect(usable('hospital_training_admin', 'hospital')).toBe(true);
  });

  it('lets a trainer operate from a hospital context', () => {
    expect(usable('trainer', 'hospital')).toBe(true);
  });

  it.each(['trainee', 'academic_supervisor', 'hospital_administrator', 'university_administrator'])(
    'does not let %s create events',
    (role) => {
      expect(holds(role)).toBe(false);
    },
  );

  it('keeps the capability unusable from a university vantage point', () => {
    expect(authz.capabilityAllowedInContext(CAP, 'university')).toBe(false);
  });

  it('does not hand any role capabilities beyond training operation', () => {
    // Guards against the grant being pasted into the wrong list: the trainer
    // must not have picked up cluster-level allocation authority alongside it.
    const trainerCaps = authz.capabilitiesForRoles(['trainer']);
    expect(trainerCaps).not.toContain(authz.CAPABILITIES.ALLOCATION_CLUSTER_MANUAL);
    expect(trainerCaps).not.toContain(authz.CAPABILITIES.TRAINING_REQUEST_APPROVE);
  });
});

/**
 * Event details. `eventId` alone must never be enough, and the roster is
 * narrowed a second time for a trainer so that receiving or sending an event
 * cannot become a way to read a colleague's trainees.
 */
describe('TrainingEventsService.findOneDetailed', () => {
  const HOSPITAL_A = 'hospital-A';

  function makeService(opts: {
    eventOrg?: string;
    createdById?: string;
    recipients?: any[];
    ownTraineeIds?: string[];
  } = {}) {
    const prisma = {
      trainingEvent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'event-1',
          organizationId: opts.eventOrg ?? HOSPITAL_A,
          createdById: opts.createdById ?? 'acct-owner',
          eventType: 'announcement',
          title: 'ت',
          responseMode: 'acknowledge',
          audienceType: 'all_trainees',
          status: 'sent',
          createdBy: { id: 'acct-owner', person: { nameAr: 'المرسل' } },
          recipients: opts.recipients ?? [
            { id: 'r1', status: 'accepted', traineeProfileId: 'mine', acceptedAt: new Date(), recipientAccount: { person: { nameAr: 'أ' } } },
            { id: 'r2', status: 'pending', traineeProfileId: 'theirs', recipientAccount: { person: { nameAr: 'ب' } } },
          ],
        }),
      },
      trainerProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'trainer-A' }) },
      rotation: {
        findMany: jest.fn().mockResolvedValue(
          (opts.ownTraineeIds ?? []).map((id) => ({ traineeProfileId: id })),
        ),
      },
      traineeAllocation: { findMany: jest.fn().mockResolvedValue([]) },
      // resolveOwnTrainees resolves its ids back through loadTrainees, so the
      // fixture has to answer that lookup the way the table would.
      traineeProfile: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          const asked: string[] = where.id?.in ?? [];
          return asked.map((id) => ({
            id,
            person: { userAccounts: [{ id: `account-of-${id}` }] },
          }));
        }),
      },
    } as any;
    return new TrainingEventsService(prisma, {} as any);
  }

  const supervisor = { accountId: 'acct-owner', roles: ['hospital_training_admin'] } as any;
  const inScope = { visibleOrgIds: [HOSPITAL_A], roles: ['hospital_training_admin'] } as any;

  it('returns the full roster to an in-scope supervisor', async () => {
    const res = await makeService().findOneDetailed('event-1', supervisor, inScope);
    expect(res.data.summary.total).toBe(2);
    expect(res.data.summary.accepted).toBe(1);
  });

  it('refuses an event outside the caller scope', async () => {
    const s = makeService({ eventOrg: 'hospital-B', createdById: 'someone-else' });
    await expect(
      s.findOneDetailed('event-1', { accountId: 'acct-x', roles: [] } as any, inScope),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("narrows the roster to a trainer's own trainees", async () => {
    const s = makeService({ ownTraineeIds: ['mine'] });
    const res = await s.findOneDetailed(
      'event-1',
      { accountId: 'acct-tr', roles: ['trainer'] } as any,
      { visibleOrgIds: [HOSPITAL_A], roles: ['trainer'] } as any,
    );
    expect(res.data.recipients).toHaveLength(1);
    expect(res.data.recipients[0].nameAr).toBe('أ');
    // The summary counts only what was visible — it must not leak the real size.
    expect(res.data.summary.total).toBe(1);
  });

  it('reports the most recent action as lastActionAt', async () => {
    const res = await makeService().findOneDetailed('event-1', supervisor, inScope);
    expect(res.data.recipients[0].lastActionAt).toBeInstanceOf(Date);
    expect(res.data.recipients[1].lastActionAt).toBeNull();
  });
});

/**
 * Who may attest that a recipient turned up. Organisational scope bounds the
 * event; trainer ownership bounds the person. Both are checked server-side, so
 * these call the service directly rather than through the UI's button.
 */
describe('TrainingEventsService.confirmAttendance authorization', () => {
  const HOSPITAL_A = 'hospital-A';

  function makeService(opts: {
    eventOrg?: string;
    createdById?: string;
    recipientStatus?: string;
    recipientTraineeId?: string;
    recipientAccountId?: string;
    ownTraineeIds?: string[];
  } = {}) {
    const prisma = {
      trainingEvent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'event-1',
          organizationId: opts.eventOrg ?? HOSPITAL_A,
          createdById: opts.createdById ?? 'acct-owner',
          status: 'sent',
        }),
      },
      trainingEventRecipient: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'rec-1',
          status: opts.recipientStatus ?? 'arrived',
          recipientAccountId: opts.recipientAccountId ?? 'acct-them',
          traineeProfileId: opts.recipientTraineeId ?? 'mine',
        }),
        update: jest.fn().mockImplementation((a) => a.data),
      },
      trainerProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'trainer-A' }) },
      rotation: {
        findMany: jest.fn().mockResolvedValue(
          (opts.ownTraineeIds ?? []).map((id) => ({ traineeProfileId: id })),
        ),
      },
      traineeAllocation: { findMany: jest.fn().mockResolvedValue([]) },
      traineeProfile: {
        findMany: jest.fn().mockImplementation(({ where }) =>
          (where.id?.in ?? []).map((id: string) => ({
            id, person: { userAccounts: [{ id: `account-of-${id}` }] },
          })),
        ),
      },
      auditLog: { create: jest.fn() },
    } as any;
    return new TrainingEventsService(prisma, {} as any);
  }

  const trainer = { accountId: 'acct-tr', roles: ['trainer'] } as any;
  const trainerScope = { visibleOrgIds: [HOSPITAL_A], roles: ['trainer'] } as any;
  const supervisor = { accountId: 'acct-owner', roles: ['hospital_training_admin'] } as any;
  const supervisorScope = { visibleOrgIds: [HOSPITAL_A], roles: ['hospital_training_admin'] } as any;
  const clusterMgr = { accountId: 'acct-cm', roles: ['cluster_manager'] } as any;

  it('lets a trainer confirm their own trainee', async () => {
    const s = makeService({ ownTraineeIds: ['mine'], recipientTraineeId: 'mine' });
    const res = await s.confirmAttendance('event-1', 'rec-1', trainer, trainerScope);
    expect(res.data.status).toBe(RECIPIENT_STATUS.CONFIRMED);
  });

  it("refuses a trainer confirming another trainer's trainee in the same hospital", async () => {
    // The event is hospital-wide so organisational scope passes; ownership must
    // still stop it — this is the case the scope check alone did not cover.
    const s = makeService({ ownTraineeIds: ['mine'], recipientTraineeId: 'theirs' });
    await expect(
      s.confirmAttendance('event-1', 'rec-1', trainer, trainerScope),
    ).rejects.toThrow(/متدرب غير مسند إليك/);
  });

  it('lets a hospital supervisor confirm inside their own hospital', async () => {
    const s = makeService({});
    const res = await s.confirmAttendance('event-1', 'rec-1', supervisor, supervisorScope);
    expect(res.data.confirmedById).toBe('acct-owner');
  });

  it('refuses a supervisor confirming on another hospital event', async () => {
    const s = makeService({ eventOrg: 'hospital-B', createdById: 'someone-else' });
    await expect(
      s.confirmAttendance('event-1', 'rec-1', supervisor, supervisorScope),
    ).rejects.toThrow(/خارج نطاق/);
  });

  it('lets a cluster manager confirm inside their own cluster', async () => {
    const s = makeService({ createdById: 'someone-else' });
    const res = await s.confirmAttendance('event-1', 'rec-1', clusterMgr, {
      visibleOrgIds: ['cluster-A', HOSPITAL_A], roles: ['cluster_manager'],
    } as any);
    expect(res.data.status).toBe(RECIPIENT_STATUS.CONFIRMED);
  });

  it('refuses a cluster manager reaching another cluster', async () => {
    const s = makeService({ eventOrg: 'hospital-in-cluster-B', createdById: 'someone-else' });
    await expect(
      s.confirmAttendance('event-1', 'rec-1', clusterMgr, {
        visibleOrgIds: ['cluster-A', HOSPITAL_A], roles: ['cluster_manager'],
      } as any),
    ).rejects.toThrow(/خارج نطاق/);
  });

  it('refuses confirming yourself', async () => {
    const s = makeService({ recipientAccountId: 'acct-owner' });
    await expect(
      s.confirmAttendance('event-1', 'rec-1', supervisor, supervisorScope),
    ).rejects.toThrow(/تأكيد حضور نفسك/);
  });

  it('refuses re-confirming an already confirmed recipient', async () => {
    const s = makeService({ recipientStatus: 'confirmed' });
    await expect(
      s.confirmAttendance('event-1', 'rec-1', supervisor, supervisorScope),
    ).rejects.toThrow(/الحالة الحالية/);
  });

  it.each(['pending', 'acknowledged', 'declined'])(
    'refuses confirming from the %s state',
    async (status) => {
      const s = makeService({ recipientStatus: status });
      await expect(
        s.confirmAttendance('event-1', 'rec-1', supervisor, supervisorScope),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});

/**
 * Optional training-context links. Each id comes from the client, so each is
 * resolved and bounded by the caller's own visibility. All three stay optional:
 * a general announcement carries none of them.
 */
describe('TrainingEventsService context links', () => {
  const HOSPITAL_A = 'hospital-A';
  const HOSPITAL_B = 'hospital-B';

  function makeService(opts: {
    rotationOrg?: string | null;
    scheduleOrg?: string | null;
    fileOrg?: string | null;
    fileDeleted?: boolean;
    filePublic?: boolean;
  } = {}) {
    const prisma = {
      rotation: {
        findUnique: jest.fn().mockResolvedValue(
          opts.rotationOrg === null ? null : { organizationId: opts.rotationOrg ?? HOSPITAL_A },
        ),
      },
      trainingSchedule: {
        findUnique: jest.fn().mockResolvedValue(
          opts.scheduleOrg === null ? null : { organizationId: opts.scheduleOrg ?? HOSPITAL_A },
        ),
      },
      storedFile: {
        findUnique: jest.fn().mockResolvedValue(
          opts.fileOrg === null
            ? null
            : {
                organizationId: opts.fileOrg ?? HOSPITAL_A,
                deletedAt: opts.fileDeleted ? new Date() : null,
                isPublic: opts.filePublic ?? false,
              },
        ),
      },
    } as any;
    return new TrainingEventsService(prisma, {} as any);
  }

  const scopeA = { visibleOrgIds: [HOSPITAL_A] } as any;
  const check = (s: TrainingEventsService, links: any, scope: any = scopeA) =>
    (s as any).assertContextLinksUsable(scope, links);

  it('accepts a rotation inside the caller scope', async () => {
    await expect(check(makeService(), { rotationId: 'rot-A' })).resolves.toBeUndefined();
  });

  it('refuses a rotation from another hospital', async () => {
    await expect(
      check(makeService({ rotationOrg: HOSPITAL_B }), { rotationId: 'rot-B' }),
    ).rejects.toThrow(/الروتيشن خارج نطاق/);
  });

  it('accepts a schedule inside the caller scope', async () => {
    await expect(check(makeService(), { scheduleId: 'sch-A' })).resolves.toBeUndefined();
  });

  it('refuses a schedule from another hospital', async () => {
    await expect(
      check(makeService({ scheduleOrg: HOSPITAL_B }), { scheduleId: 'sch-B' }),
    ).rejects.toThrow(/الجدول خارج نطاق/);
  });

  it('accepts a file owned by the caller organisation', async () => {
    await expect(check(makeService(), { resourceFileId: 'file-A' })).resolves.toBeUndefined();
  });

  it("refuses another organisation's file", async () => {
    await expect(
      check(makeService({ fileOrg: HOSPITAL_B }), { resourceFileId: 'file-B' }),
    ).rejects.toThrow(/الملف خارج نطاق/);
  });

  it('allows a platform-wide public file from anywhere', async () => {
    await expect(
      check(makeService({ fileOrg: HOSPITAL_B, filePublic: true }), { resourceFileId: 'file-pub' }),
    ).resolves.toBeUndefined();
  });

  it('refuses a soft-deleted file', async () => {
    await expect(
      check(makeService({ fileDeleted: true }), { resourceFileId: 'file-gone' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['rotation', { rotationId: 'nope' }, { rotationOrg: null }],
    ['schedule', { scheduleId: 'nope' }, { scheduleOrg: null }],
  ])('refuses a non-existent %s', async (_l, links, opts) => {
    await expect(check(makeService(opts as any), links)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('passes a public event that carries no links at all', async () => {
    await expect(check(makeService(), {})).resolves.toBeUndefined();
  });

  it('treats a platform session as unrestricted', async () => {
    await expect(
      check(makeService({ rotationOrg: HOSPITAL_B }), { rotationId: 'rot-B' }, { visibleOrgIds: null }),
    ).resolves.toBeUndefined();
  });
});

/**
 * Notifications must be readable by the person they were written for.
 *
 * NotificationService filters a reader's notifications by that reader's own
 * visibleOrgIds. Stamping the row with the *sender's* organisation therefore
 * made every cross-organisation event silently invisible: a cluster manager
 * addressing hospital trainees produced notifications that never reached a
 * badge or a list. Found in browser E2E, where the trainee's unread badge read
 * 0 while the row existed in the database.
 */
describe('TrainingEventsService notification scoping', () => {
  const CLUSTER_A = 'cluster-A';
  const HOSPITAL_A = 'hospital-A';

  function makeService(traineeOrg: string | undefined) {
    const notifications: any[] = [];
    const tx = {
      trainingEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
      trainingEventRecipient: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      notification: {
        createMany: jest.fn().mockImplementation((a) => {
          notifications.push(...a.data);
          return { count: a.data.length };
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
      traineeProfile: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'trainee-1',
            organizationId: traineeOrg,
            person: { userAccounts: [{ id: 'acct-trainee' }] },
          },
        ]),
      },
      trainerProfile: { findMany: jest.fn(), findFirst: jest.fn() },
      rotation: { findMany: jest.fn() },
      traineeAllocation: { findMany: jest.fn() },
    } as any;
    return { service: new TrainingEventsService(prisma, {} as any), notifications };
  }

  const sender = { accountId: 'acct-cm', roles: ['cluster_manager'] } as any;
  const senderScope = {
    organizationId: CLUSTER_A,
    visibleOrgIds: [CLUSTER_A, HOSPITAL_A],
    roles: ['cluster_manager'],
  } as any;
  const dto = {
    eventType: 'announcement',
    title: 'إعلان',
    responseMode: 'information_only',
    audienceType: 'all_trainees',
  } as any;

  it("stamps the notification with the recipient's organisation, not the sender's", async () => {
    const { service, notifications } = makeService(HOSPITAL_A);
    await service.create(sender, senderScope, dto);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].organizationId).toBe(HOSPITAL_A);
    expect(notifications[0].organizationId).not.toBe(CLUSTER_A);
  });

  it("falls back to the sender's organisation when a recipient carries none", async () => {
    const { service, notifications } = makeService(undefined);
    await service.create(sender, senderScope, dto);
    expect(notifications[0].organizationId).toBe(CLUSTER_A);
  });
});
