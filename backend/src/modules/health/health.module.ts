import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TerminusModule, NotificationsModule],
  controllers: [HealthController],
})
export class HealthModule {}
