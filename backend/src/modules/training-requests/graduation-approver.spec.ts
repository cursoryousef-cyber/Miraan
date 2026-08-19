import { GraduationService } from './graduation.service';

/**
 * Which of the caller's roles the approval is recorded under. The chain itself
 * is unchanged — these only pin down that the choice no longer depends on the
 * order roles arrive in, which is what `roles[0]` made it depend on.
 */
describe('GraduationService approver role selection', () => {
  const TRAINEE = 'trainee-profile-1';

  function makeService() {
    const upsert = jest.fn().mockImplementation(({ where }) => ({
      id: 'approval-1',
      approverRole: where.traineeProfileId_approverRole.approverRole,
    }));
    const prisma = {
      traineeProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: TRAINEE,
          isLocked: false,
          organizationId: 'hospital-1',
        }),
      },
      graduationApproval: {
        upsert,
        // Only one approval on file, so the chain never completes and the test
        // stops at the recording step rather than running the graduation path.
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: { create: jest.fn() },
    } as any;

    const service = new GraduationService(prisma, {} as any, {} as any);
    return { service, upsert };
  }

  const approveAs = async (roles: string[]) => {
    const { service, upsert } = makeService();
    await service.submitApproval(TRAINEE, { accountId: 'acct-1', roles } as any);
    return upsert.mock.calls[0][0].where.traineeProfileId_approverRole.approverRole;
  };

  it('records a chain role even when it is not first in the list', async () => {
    // Previously this account approved as… nothing: roles[0] was
    // 'academic_supervisor', which is not in the chain, so it was rejected
    // outright despite holding a chain role.
    expect(await approveAs(['academic_supervisor', 'trainer'])).toBe('trainer');
  });

  it('picks the chain role regardless of ordering', async () => {
    expect(await approveAs(['trainer', 'hospital_training_admin'])).toBe('trainer');
    expect(await approveAs(['hospital_training_admin', 'trainer'])).toBe('trainer');
  });

  it('still refuses an account holding no chain role at all', async () => {
    const { service } = makeService();
    await expect(
      service.submitApproval(TRAINEE, { accountId: 'acct-1', roles: ['trainee'] } as any),
    ).rejects.toThrow(/غير مخول/);
  });

  it('refuses an account with no roles rather than reading undefined', async () => {
    const { service } = makeService();
    await expect(
      service.submitApproval(TRAINEE, { accountId: 'acct-1', roles: [] } as any),
    ).rejects.toThrow(/غير مخول/);
  });
});
