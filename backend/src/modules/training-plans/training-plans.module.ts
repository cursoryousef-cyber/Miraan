import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TrainingPlansService } from './training-plans.service';
import { PlanInstantiationService } from './plan-instantiation.service';
import { TrainingPlansController } from './training-plans.controller';

@Module({
  imports: [PrismaModule],
  controllers: [TrainingPlansController],
  providers: [TrainingPlansService, PlanInstantiationService],
  exports: [TrainingPlansService, PlanInstantiationService],
})
export class TrainingPlansModule {}
