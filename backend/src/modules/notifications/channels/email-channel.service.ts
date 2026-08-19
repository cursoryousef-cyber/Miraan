import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ChannelMessage, NotificationChannel } from './notification-channel.interface';

/**
 * SMTP email channel. Stays dormant until SMTP_HOST/SMTP_USER/SMTP_PASS are set;
 * until then isConfigured() is false and NotificationService skips it.
 */
@Injectable()
export class EmailChannelService implements NotificationChannel {
  readonly name = 'email';
  private readonly logger = new Logger(EmailChannelService.name);
  private transporter: nodemailer.Transporter | null = null;

  private get from(): string {
    return process.env.SMTP_FROM || 'no-reply@miran.health';
  }

  isConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    }
    return this.transporter;
  }

  async send(message: ChannelMessage): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(`تخطي إرسال البريد (SMTP غير مُهيأ): ${message.title}`);
      return;
    }
    if (!message.email) {
      this.logger.warn(`تخطي إرسال البريد (لا يوجد عنوان بريد للمستخدم ${message.userId})`);
      return;
    }

    await this.getTransporter().sendMail({
      from: this.from,
      to: message.email,
      subject: message.title,
      text: message.body,
    });
  }
}
