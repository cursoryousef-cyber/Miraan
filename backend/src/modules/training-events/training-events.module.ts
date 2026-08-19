import { Module } from '@nestjs/common';
import { TrainingEventsController } from './training-events.controller';
import { TrainingEventsService } from './training-events.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthzModule } from '../../common/authz/authz.module';

@Module({
  imports: [PrismaModule, AuthzModule],
  controllers: [TrainingEventsController],
  providers: [TrainingEventsService],
  exports: [TrainingEventsService],
})
export class TrainingEventsModule {}
