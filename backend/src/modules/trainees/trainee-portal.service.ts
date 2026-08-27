import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../../common/interfaces';

@Injectable()
export class TraineePortalService {
  constructor(private readonly prisma: PrismaService) {}

  async getTrainingOverview(user: IAuthenticatedUser) {
    const profile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
      include: {
        person: true,
        program: true,
        organization: true,
        sponsorOrganization: true,
        rotations: {
          orderBy: { startDate: 'asc' },
          include: {
            department: true,
            trainerProfile: { include: { person: true } },
            organization: true,
          },
        },
      },
    });

    if (!profile) throw new NotFoundException('لا يوجد ملف متدرب لهذا الحساب');

    const allocation = await this.prisma.traineeAllocation.findFirst({
      where: { traineeRowId: { in: await this.findTraineeRowIds(profile.id) }, status: 'open' },
      orderBy: { performedAt: 'desc' },
      include: {
        hospital: { select: { id: true, nameAr: true } },
        department: { select: { id: true, nameAr: true } },
        trainerProfile: { select: { id: true, person: { select: { nameAr: true } } } },
        performedBy: { select: { id: true, person: { select: { nameAr: true } } } },
      },
    });

    const hospitalId = allocation?.hospitalId || profile.organizationId || null;
    const schedules = hospitalId
      ? await this.prisma.trainingSchedule.findMany({
          where: {
            organizationId: hospitalId,
            status: 'published',
            OR: [
              { participants: { some: { traineeProfileId: profile.id } } },
              { sessions: { some: { traineeProfileId: profile.id } } },
            ],
          },
          include: {
            department: true,
            sessions: {
              where: { OR: [{ traineeProfileId: profile.id }, { traineeProfileId: null }] },
              include: {
                department: true,
                trainerProfile: { include: { person: true } },
              },
              orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
            },
            participants: { where: { traineeProfileId: profile.id } },
          },
          orderBy: { startDate: 'asc' },
        })
      : [];

    const activeRotation = profile.rotations.find((r) => r.status === 'active') || null;
    const firstRotation = profile.rotations[0] || null;
    const lastRotation = profile.rotations[profile.rotations.length - 1] || null;
    const trainingStart = (profile as any).trainingStartDate || (profile as any).internshipStartDate || firstRotation?.startDate || null;
    const trainingEnd = (profile as any).trainingEndDate || (profile as any).internshipEndDate || lastRotation?.endDate || null;
    const durationMonths = (profile.program as any)?.durationMonths ?? (profile.program as any)?.months ?? null;

    const shifts = hospitalId
      ? await this.prisma.shift.findMany({
          where: { traineeProfileId: profile.id, organizationId: hospitalId },
          include: { department: true },
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
          take: 100,
        })
      : [];

    return {
      profile,
      training: {
        program: profile.program,
        programNameAr: profile.program?.nameAr ?? null,
        durationMonths,
        startDate: trainingStart,
        endDate: trainingEnd,
        academicNumber: profile.traineeNumber,
        university: profile.sponsorOrganization,
        hospital: allocation?.hospital || profile.organization,
        allocation,
        activeRotation,
      },
      schedules,
      shifts,
    };
  }

  private async findTraineeRowIds(traineeProfileId: string) {
    const rows = await this.prisma.trainingRequestTrainee.findMany({
      where: { traineeProfileId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
