import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { OperationsController } from './operations.controller';
import { EvaluationService } from './evaluation.service';
import { TimelineModule } from '../timeline/timeline.module';

@Module({
  imports: [PrismaModule, TimelineModule],
  controllers: [OperationsController],
  providers: [EvaluationService],
  exports: [EvaluationService],
})
export class OperationsModule {}
