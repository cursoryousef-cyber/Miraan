import { Module, Global } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { IntegrationsController } from './integrations.controller';

@Global()
@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, OutboxDispatcherService],
  exports: [IntegrationsService, OutboxDispatcherService],
})
export class IntegrationsModule {}
