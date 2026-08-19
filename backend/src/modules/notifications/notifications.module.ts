import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationService } from './notification.service';
import { EmailChannelService } from './channels/email-channel.service';
import { PushChannelService } from './channels/push-channel.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationService, EmailChannelService, PushChannelService],
  exports: [NotificationService, EmailChannelService, PushChannelService],
})
export class NotificationsModule {}
