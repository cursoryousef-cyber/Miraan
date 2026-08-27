import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../../common/interfaces';

/**
 * Read-only schedule projection for a trainee.
 *
 * A trainee's active organization selector can point at the parent cluster,
 * while the TrainingSchedule rows are owned by the trainee's actual hospital.
 * The trainee's own profile is therefore the authoritative scope here; never
 * the X-Organization-Id header / user.organizationId.
 *
 * The participant relation is preferred, but legacy schedules can have sessions
 * addressed to a trainee without a participant row. The OR keeps both shapes
 * visible without widening the trainee's access beyond their own profile.
 */
@Injectable()
export class TraineeScheduleReaderService {
  constructor(private prisma: PrismaService) {}

  private async getTraineeProfile(accountId: string) {
    return this.prisma.traineeProfile.findFirst({
      where: {
        person: { userAccounts: { some: { id: accountId } } },
      },
      select: {
        id: true,
        organizationId: true,
      },
    });
  }

  private includeShape() {
    return {
      department: true,
      createdBy: {
        select: {
          id: true,
          person: { select: { nameAr: true, email: true } },
        },
      },
      participants: {
        include: {
          traineeProfile: { include: { person: true } },
        },
      },
      sessions: {
        include: {
          department: true,
          trainerProfile: { include: { person: true } },
          traineeProfile: { include: { person: true } },
        },
        orderBy: [{ date: 'asc' as const }, { startTime: 'asc' as const }],
      },
      revisions: {
        orderBy: { revision: 'desc' as const },
        take: 1,
      },
    };
  }

  async findAll(
    user: IAuthenticatedUser,
    query?: { traineeId?: string; departmentId?: string },
  ) {
    const profile = await this.getTraineeProfile(user.accountId);
    if (!profile) return { data: [] };

    if (query?.traineeId && query.traineeId !== profile.id) {
      throw new ForbiddenException('لا يمكنك الاطلاع على جدول متدرب آخر');
    }

    const schedules = await this.prisma.trainingSchedule.findMany({
      where: {
        organizationId: profile.organizationId,
        status: 'published',
        ...(query?.departmentId ? { departmentId: query.departmentId } : {}),
        OR: [
          { participants: { some: { traineeProfileId: profile.id } } },
          { sessions: { some: { traineeProfileId: profile.id } } },
        ],
      },
      include: this.includeShape(),
      orderBy: { startDate: 'desc' },
    });

    return { data: schedules };
  }

  async findOne(id: string, user: IAuthenticatedUser) {
    const profile = await this.getTraineeProfile(user.accountId);
    if (!profile) throw new NotFoundException('لا يوجد ملف متدرب لهذا الحساب');

    const schedule = await this.prisma.trainingSchedule.findFirst({
      where: {
        id,
        organizationId: profile.organizationId,
        status: 'published',
        OR: [
          { participants: { some: { traineeProfileId: profile.id } } },
          { sessions: { some: { traineeProfileId: profile.id } } },
        ],
      },
      include: {
        ...this.includeShape(),
        revisions: { orderBy: { revision: 'desc' as const } },
      },
    });

    if (!schedule) throw new NotFoundException('الجدول التدريبي غير موجود أو غير مسند إليك');
    return { data: schedule };
  }
}
