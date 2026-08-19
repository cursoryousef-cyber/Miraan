import { Module } from '@nestjs/common';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { ConflictEngineService } from './conflict-engine.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SchedulesController],
  providers: [SchedulesService, ConflictEngineService],
  exports: [SchedulesService, ConflictEngineService],
})
export class SchedulesModule {}
