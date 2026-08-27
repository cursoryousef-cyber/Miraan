import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, RequireRoles } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Trainee Training Overview')
@Controller('trainees')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class TrainingOverviewController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me/training-overview')
  @RequireRoles('trainee', 'platform_owner', 'org_manager')
  @ApiOperation({ summary: 'ملخص رحلة التدريب والجدول والمناوبات للمتدرب الحالي' })
  async getMyTrainingOverview(@CurrentUser() user: IAuthenticatedUser) {
    const profile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
      include: {
        person: true,
        organization: true,
        program: true,
      },
    });

    if (!profile) {
      return {
        training: {
          hospital: null,
          programNameAr: null,
          allocation: null,
          activeRotation: null,
        },
        schedules: [],
        shifts: [],
      };
    }

    const activeRotation = await this.prisma.rotation.findFirst({
      where: { traineeProfileId: profile.id, status: 'active' },
      orderBy: { startDate: 'asc' },
      include: {
        department: true,
        trainerProfile: { include: { person: true } },
      },
    });

    const allocation = await this.prisma.traineeAllocation.findFirst({
      where: { traineeProfileId: profile.id, status: 'open' },
      orderBy: { performedAt: 'desc' },
      include: {
        hospital: true,
        department: true,
        trainerProfile: { include: { person: true } },
      },
    });

    const participantRows = await this.prisma.scheduleParticipant.findMany({
      where: { traineeProfileId: profile.id },
      select: { scheduleId: true },
    });
    const scheduleIds = [...new Set(participantRows.map((row) => row.scheduleId))];

    const scheduleWhere = scheduleIds.length
      ? { id: { in: scheduleIds }, status: { not: 'draft' } }
      : { id: { in: [] as string[] } };

    const schedules = await this.prisma.trainingSchedule.findMany({
      where: scheduleWhere,
      orderBy: { startDate: 'asc' },
      include: { department: true },
    });

    const sessions = await this.prisma.scheduleSession.findMany({
      where: {
        OR: [
          { traineeProfileId: profile.id },
          ...(scheduleIds.length ? [{ scheduleId: { in: scheduleIds } }] : []),
        ],
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      include: {
        department: true,
        trainerProfile: { include: { person: true } },
      },
    });

    const sessionsBySchedule = new Map<string, typeof sessions>();
    for (const session of sessions) {
      const existing = sessionsBySchedule.get(session.scheduleId) ?? [];
      existing.push(session);
      sessionsBySchedule.set(session.scheduleId, existing);
    }

    const scheduleData = schedules.map((schedule) => ({
      ...schedule,
      sessions: sessionsBySchedule.get(schedule.id) ?? [],
    }));

    const shifts = await this.prisma.shift.findMany({
      where: { traineeProfileId: profile.id },
      orderBy: { date: 'asc' },
      include: { department: true },
    });

    return {
      training: {
        hospital: allocation?.hospital ?? profile.organization ?? null,
        programNameAr: profile.program?.nameAr ?? null,
        allocation,
        activeRotation,
      },
      schedules: scheduleData,
      shifts,
    };
  }
}
