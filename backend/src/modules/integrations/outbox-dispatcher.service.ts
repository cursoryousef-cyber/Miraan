import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class OutboxDispatcherService {
  private readonly logger = new Logger(OutboxDispatcherService.name);

  constructor(private prisma: PrismaService) {}

  async publishEvent(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
    organizationId?: string,
  ) {
    return this.prisma.outboxEvent.create({
      data: {
        organizationId: organizationId || null,
        eventType,
        aggregateType,
        aggregateId,
        payload: payload as unknown as Prisma.InputJsonValue,
        status: 'pending',
      },
    });
  }

  async processPendingEvents() {
    const pendingEvents = await this.prisma.outboxEvent.findMany({
      where: { status: 'pending' },
      take: 20,
      orderBy: { createdAt: 'asc' },
    });

    for (const event of pendingEvents) {
      try {
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: 'processing' },
        });

        const webhooks = await this.prisma.webhookSubscription.findMany({
          where: {
            event: event.eventType,
            isActive: true,
            OR: [
              { organizationId: null },
              { organizationId: event.organizationId },
            ],
          },
        });

        for (const webhook of webhooks) {
          await this.prisma.webhookDeliveryLog.create({
            data: {
              webhookSubscriptionId: webhook.id,
              event: event.eventType,
              payload: (event.payload || {}) as unknown as Prisma.InputJsonValue,
              httpStatus: 200,
              responseBody: '{"status": "delivered"}',
            },
          });
        }

        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'published',
            processedAt: new Date(),
          },
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to process event ${event.id}: ${errorMsg}`);
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: event.retryCount >= event.maxRetries ? 'failed' : 'pending',
            retryCount: event.retryCount + 1,
            lastError: errorMsg,
          },
        });
      }
    }
  }
}
