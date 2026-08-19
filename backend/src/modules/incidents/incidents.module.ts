import { Module } from '@nestjs/common';
import { IncidentsController } from './incidents.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [IncidentsController],
})
export class IncidentsModule {}
