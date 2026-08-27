import { Module, forwardRef } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TraineesController } from './trainees.controller';
import { TraineePortalController } from './trainee-portal.controller';
import { TraineePortalService } from './trainee-portal.service';
import { TraineeProfileProjectionInterceptor } from './trainee-profile-projection.interceptor';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TrainingRequestsModule } from '../training-requests/training-requests.module';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    OrganizationsModule,
    // Reallocation delegates to TraineeAllocationService — the single sanctioned
    // way to change where a trainee is placed.
    forwardRef(() => TrainingRequestsModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_CARD_SECRET') || 'miran-card-secret-change-in-production-2024',
      }),
    }),
  ],
  controllers: [TraineesController, TraineePortalController],
  providers: [
    TraineePortalService,
    TraineeProfileProjectionInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useExisting: TraineeProfileProjectionInterceptor,
    },
  ],
})
export class TraineesModule {}