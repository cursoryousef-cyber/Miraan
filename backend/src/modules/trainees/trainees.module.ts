import { Module, forwardRef } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TraineesController } from './trainees.controller';
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
    // Separate signing key from the auth access/refresh tokens: a card QR token
    // is a different trust boundary (long-lived, scanned by third parties) and
    // must not share a secret with session tokens.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_CARD_SECRET') || 'miran-card-secret-change-in-production-2024',
      }),
    }),
  ],
  controllers: [TraineesController],
  providers: [
    TraineeProfileProjectionInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useExisting: TraineeProfileProjectionInterceptor,
    },
  ],
})
export class TraineesModule {}
