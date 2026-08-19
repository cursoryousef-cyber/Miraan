import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CallsController } from './calls.controller';

/**
 * The response half of a call: acknowledge, self-report arrival, confirm
 * arrival, end. Hospital scope was already enforced by the call lookup; what
 * these pin down is who may act on a given call and which half of the
 * arrival record each side may write.
 */
describe('CallsController response flow', () => {
  const HOSPITAL_A = 'hospital-A';
  const OWNER_TRAINER = 'trainer-profile-A';
  const OTHER_TRAINER = 'trainer-profile-B';
  const TRAINEE_A = 'trainee-profile-A';

  function makeController(opts: {
    callExists?: boolean;
    callStatus?: string;
    callTrainerProfileId?: string;
    callerTrainerProfileId?: string | null;
    callerTraineeProfileId?: string | null;
    participantExists?: boolean;
  } = {}) {
    const updated: any[] = [];
    const prisma = {
      trainerCall: {
        findFirst: jest.fn().mockImplementation(({ where }) =>
          opts.callExists === false || where.organizationId !== HOSPITAL_A
            ? null
            : {
                id: 'call-1',
                status: opts.callStatus ?? 'active',
                trainerProfileId: opts.callTrainerProfileId ?? OWNER_TRAINER,
                participants: [],
              },
        ),
        findUnique: jest.fn().mockResolvedValue({ status: opts.callStatus ?? 'active' }),
        update: jest.fn().mockResolvedValue({}),
      },
      trainerProfile: {
        findFirst: jest.fn().mockResolvedValue(
          opts.callerTrainerProfileId === null
            ? null
            : { id: opts.callerTrainerProfileId ?? OWNER_TRAINER },
        ),
      },
      traineeProfile: {
        findFirst: jest.fn().mockResolvedValue(
          opts.callerTraineeProfileId === null ? null : { id: opts.callerTraineeProfileId ?? TRAINEE_A },
        ),
      },
      callParticipant: {
        findFirst: jest.fn().mockResolvedValue(
          opts.participantExists === false ? null : { id: 'participant-1', state: 'notified' },
        ),
        update: jest.fn().mockImplementation((args) => {
          updated.push(args.data);
          return args.data;
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: { create: jest.fn() },
    } as any;

    return { controller: new CallsController(prisma), prisma, updated };
  }

  const trainer = (org = HOSPITAL_A) =>
    ({ accountId: 'acct-trainer', organizationId: org, roles: ['trainer'] }) as any;
  const trainee = { accountId: 'acct-trainee', organizationId: HOSPITAL_A, roles: ['trainee'] } as any;

  describe('confirm-arrival', () => {
    it('lets the call owner confirm a participant', async () => {
      const { controller } = makeController({ callerTrainerProfileId: OWNER_TRAINER });
      await expect(
        controller.confirmArrival('call-1', trainer(), { traineeProfileId: TRAINEE_A }),
      ).resolves.toMatchObject({ success: true });
    });

    it("refuses a trainer confirming on another trainer's call", async () => {
      const { controller } = makeController({ callerTrainerProfileId: OTHER_TRAINER });
      await expect(
        controller.confirmArrival('call-1', trainer(), { traineeProfileId: TRAINEE_A }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a call in another hospital', async () => {
      const { controller } = makeController({});
      await expect(
        controller.confirmArrival('call-1', trainer('hospital-B'), { traineeProfileId: TRAINEE_A }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a trainee who is not a participant', async () => {
      const { controller } = makeController({ participantExists: false });
      await expect(
        controller.confirmArrival('call-1', trainer(), { traineeProfileId: 'outsider' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses an already-ended call', async () => {
      const { controller } = makeController({ callStatus: 'ended' });
      await expect(
        controller.confirmArrival('call-1', trainer(), { traineeProfileId: TRAINEE_A }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('end', () => {
    it('lets the call owner end it', async () => {
      const { controller } = makeController({ callerTrainerProfileId: OWNER_TRAINER });
      await expect(controller.endCall('call-1', trainer(), {})).resolves.toMatchObject({
        success: true,
      });
    });

    it("refuses ending another trainer's call", async () => {
      const { controller } = makeController({ callerTrainerProfileId: OTHER_TRAINER });
      await expect(controller.endCall('call-1', trainer(), {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses a call in another hospital', async () => {
      const { controller } = makeController({});
      await expect(controller.endCall('call-1', trainer('hospital-B'), {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses re-ending an ended call', async () => {
      const { controller } = makeController({ callStatus: 'ended' });
      await expect(controller.endCall('call-1', trainer(), {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('trainee side', () => {
    it('acknowledges through its own participant row', async () => {
      const { controller, updated } = makeController({});
      await controller.acknowledgeCall('call-1', trainee);
      expect(updated[0]).toMatchObject({ state: 'acknowledged' });
    });

    it('records arrival as a self-report, never as the trainer confirmation', async () => {
      const { controller, updated } = makeController({});
      await controller.arrived('call-1', trainee);
      expect(updated[0].state).toBe('self_arrived');
      expect(updated[0].confirmedAt).toBeUndefined();
      expect(updated[0].selfArrivedAt).toBeInstanceOf(Date);
    });

    it('refuses a caller with no trainee profile', async () => {
      const { controller } = makeController({ callerTraineeProfileId: null });
      await expect(controller.acknowledgeCall('call-1', trainee)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses a call the trainee was not invited to', async () => {
      const { controller } = makeController({ participantExists: false });
      await expect(controller.acknowledgeCall('call-1', trainee)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses acting on an ended call', async () => {
      const { controller } = makeController({ callStatus: 'ended' });
      await expect(controller.acknowledgeCall('call-1', trainee)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
