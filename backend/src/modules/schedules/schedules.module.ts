import { Module } from '@nestjs/common';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { TraineeScheduleReaderService } from './trainee-schedule-reader.service';
import { ConflictEngineService } from './conflict-engine.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SchedulesController],
  providers: [SchedulesService, TraineeScheduleReaderService, ConflictEngineService],
  exports: [SchedulesService, TraineeScheduleReaderService, ConflictEngineService],
})
export class SchedulesModule {}
