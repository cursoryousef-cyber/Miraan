import { CallsController } from './calls.controller';

/**
 * The notification a launched call sends out.
 *
 * `call_alert` rows were written with `referenceType`/`referenceId` left null,
 * so the notification named no record. Every consumer that turns a notification
 * into a destination reads those two fields, which meant a trainee could be
 * told a call had been launched and had no way to open it. The call id already
 * exists at that point and the Notification model already carries both columns,
 * so this asserts they are filled — no schema change is involved.
 */
describe('POST /calls/launch — call_alert notification reference', () => {
  const HOSPITAL = 'hospital-A';
  const CALL_ID = 'call-1';
  const TRAINEE_ACCOUNT = 'trainee-account-1';

  function makeController() {
    const notificationCreate = jest.fn().mockResolvedValue({});
    const prisma = {
      trainerProfile: {
        findFirst: jest.fn().mockResolvedValue({ id: 'trainer-profile-A', departmentId: 'dept-A' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      department: { findFirst: jest.fn().mockResolvedValue({ id: 'dept-A' }) },
      trainerCall: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: CALL_ID, callType: 'urgent' }),
      },
      traineeProfile: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'trainee-profile-1',
            person: { userAccounts: [{ id: TRAINEE_ACCOUNT }] },
          },
        ]),
      },
      callParticipant: { create: jest.fn().mockResolvedValue({}) },
      notification: { create: notificationCreate },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as any;

    return { controller: new CallsController(prisma), notificationCreate };
  }

  const user = {
    accountId: 'acct-trainer',
    organizationId: HOSPITAL,
    roles: ['trainer'],
  } as any;

  it('names the call the notification is about', async () => {
    const { controller, notificationCreate } = makeController();

    await controller.launchCall(user, { callType: 'urgent' });

    expect(notificationCreate).toHaveBeenCalledTimes(1);
    const { data } = notificationCreate.mock.calls[0][0];
    expect(data.type).toBe('call_alert');
    expect(data.referenceType).toBe('TrainerCall');
    expect(data.referenceId).toBe(CALL_ID);
  });

  it('addresses the notification to the recipient, inside the caller hospital', async () => {
    const { controller, notificationCreate } = makeController();

    await controller.launchCall(user, { callType: 'urgent' });

    const { data } = notificationCreate.mock.calls[0][0];
    expect(data.userId).toBe(TRAINEE_ACCOUNT);
    expect(data.organizationId).toBe(HOSPITAL);
    expect(data.isRead).toBe(false);
  });
});
