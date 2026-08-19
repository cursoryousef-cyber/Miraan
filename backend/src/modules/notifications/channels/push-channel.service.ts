import { Injectable, Logger } from '@nestjs/common';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChannelMessage, NotificationChannel } from './notification-channel.interface';

/**
 * FCM push channel. Stays dormant until FIREBASE_SERVICE_ACCOUNT_JSON is set;
 * until then isConfigured() is false and NotificationService skips it.
 *
 * Device tokens come from the rows written by
 * POST /operations/notifications/register-device (Setting key `push_device:{userId}:{deviceId}`).
 */
@Injectable()
export class PushChannelService implements NotificationChannel {
  readonly name = 'push';
  private readonly logger = new Logger(PushChannelService.name);
  private app: App | null = null;

  constructor(private prisma: PrismaService) {}

  isConfigured(): boolean {
    return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  private getApp(): App {
    if (!this.app) {
      const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON as string);
      const existing = getApps();
      this.app = existing.length
        ? existing[0]
        : initializeApp({ credential: cert(credentials) });
    }
    return this.app;
  }

  private async getDeviceTokens(userId: string): Promise<string[]> {
    const rows = await this.prisma.setting.findMany({
      where: { key: { startsWith: `push_device:${userId}:` } },
      select: { value: true },
    });
    return rows
      .map((r) => (r.value as Record<string, unknown>)?.token)
      .filter((t): t is string => typeof t === 'string' && t.length > 0);
  }

  async send(message: ChannelMessage): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(`تخطي الإشعار الجوال (Firebase غير مُهيأ): ${message.title}`);
      return;
    }

    const tokens = await this.getDeviceTokens(message.userId);
    if (tokens.length === 0) return;

    await getMessaging(this.getApp()).sendEachForMulticast({
      tokens,
      notification: { title: message.title, body: message.body },
      data: message.data,
    });
  }
}
