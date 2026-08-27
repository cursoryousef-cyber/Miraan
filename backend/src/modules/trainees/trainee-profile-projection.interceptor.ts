import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Keeps the existing /trainees/me contract useful while allocation is the
 * canonical placement record.
 *
 * Historically the trainee dashboard read `profile.rotations`, but the current
 * placement workflow stores the authoritative hospital/department/trainer in
 * TraineeAllocation. When a trainee had an open allocation but no Rotation row
 * yet, the dashboard therefore displayed "لا يوجد روتيشن" even though the
 * placement was already recorded. This interceptor projects the open allocation
 * into the read-only `rotations` shape expected by the existing dashboard.
 *
 * Real Rotation rows remain authoritative and are never replaced or modified.
 */
@Injectable()
export class TraineeProfileProjectionInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler();
    const controller = context.getClass();
    const request = context.switchToHttp().getRequest<any>();
    const user = request?.user;

    // Scope this projection strictly to TraineesController.getMyProfile.
    if (
      controller?.name !== 'TraineesController' ||
      handler?.name !== 'getMyProfile' ||
      request?.method !== 'GET' ||
      !user?.roles?.includes('trainee')
    ) {
      return next.handle();
    }

    return next.handle().pipe(
      switchMap((body: any) =>
        from(this.projectOpenAllocation(body)).pipe(
          switchMap((projected) => from(Promise.resolve(projected))),
        ),
      ),
    );
  }

  private async projectOpenAllocation(body: any) {
    if (!body || !body.id || (Array.isArray(body.rotations) && body.rotations.length > 0)) {
      return body;
    }

    const latestRow = await this.prisma.trainingRequestTrainee.findFirst({
      where: { traineeProfileId: body.id },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!latestRow) return body;

    const allocation = await this.prisma.traineeAllocation.findFirst({
      where: { traineeRowId: latestRow.id, status: 'open' },
      include: {
        hospital: { select: { id: true, nameAr: true, nameEn: true } },
        department: { select: { id: true, nameAr: true, nameEn: true } },
        trainerProfile: {
          include: {
            person: { select: { id: true, nameAr: true, nameEn: true } },
          },
        },
      },
      orderBy: { performedAt: 'desc' },
    });
    if (!allocation) return body;

    return {
      ...body,
      rotations: [
        {
          id: `allocation:${allocation.id}`,
          status: 'active',
          startDate: allocation.startDate,
          endDate: allocation.endDate,
          organization: allocation.hospital,
          department: allocation.department,
          trainerProfile: allocation.trainerProfile,
          _projectedFromAllocation: true,
        },
      ],
    };
  }
}
