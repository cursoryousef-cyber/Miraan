import { BadRequestException } from '@nestjs/common';
import { TrainingRequestsService } from './training-requests.service';

/**
 * Approval is the step that sends a request to the hospitals, so it must refuse
 * to run before an assignment exists. validateCapacity iterates `allocations`
 * and passes trivially on an empty array, which is what previously let a request
 * with nobody placed reach the "sent to hospitals" list.
 */
describe('TrainingRequestsService.approve — assignment precondition', () => {
  const requestId = '11111111-1111-4111-8111-111111111111';

  const buildService = (assignedRows: Array<{ id: string; assignedHospitalId: string }>) => {
    const prisma = {
      trainingRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: requestId,
          status: 'auto_allocated',
          requestNumber: 'TR-2026-0012',
          sourceOrgId: 'src',
          targetOrgId: 'tgt',
          allocations: [],
        }),
        update: jest.fn().mockResolvedValue({
          id: requestId,
          requestNumber: 'TR-2026-0012',
          sourceOrgId: 'src',
          targetOrgId: 'tgt',
        }),
      },
      trainingRequestTrainee: { findMany: jest.fn().mockResolvedValue(assignedRows) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const notificationService = { notifyOrgUsers: jest.fn().mockResolvedValue(undefined) };

    const service = Object.create(TrainingRequestsService.prototype) as TrainingRequestsService;
    Object.assign(service, { prisma, notificationService });
    // Capacity is validated separately; isolate the assignment precondition.
    (service as unknown as { validateCapacity: unknown }).validateCapacity = jest
      .fn()
      .mockResolvedValue({ isValid: true, errors: [] });

    return { service, prisma, notificationService };
  };

  it('refuses approval when no trainee row has been assigned to a hospital', async () => {
    const { service, prisma } = buildService([]);

    await expect(service.approve(requestId)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.trainingRequest.update).not.toHaveBeenCalled();
  });

  it('approves once rows are assigned, and notifies each hospital by its own seat count', async () => {
    const { service, prisma, notificationService } = buildService([
      { id: 'row-1', assignedHospitalId: 'hospital-a' },
      { id: 'row-2', assignedHospitalId: 'hospital-a' },
    ]);

    const result = await service.approve(requestId);

    expect(result.success).toBe(true);
    expect(prisma.trainingRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'approved' }) }),
    );

    const hospitalNotice = notificationService.notifyOrgUsers.mock.calls.find(
      ([orgId]) => orgId === 'hospital-a',
    );
    expect(hospitalNotice).toBeDefined();
    expect(hospitalNotice![1]).toBe('hospital_training_admin');
    // Two rows at the same hospital collapse into one notice carrying 2 seats.
    expect(hospitalNotice![2].bodyAr).toContain('2');
    expect(hospitalNotice![2].referenceId).toBe(requestId);
    expect(
      notificationService.notifyOrgUsers.mock.calls.filter(([orgId]) => orgId === 'hospital-a'),
    ).toHaveLength(1);
  });
});
