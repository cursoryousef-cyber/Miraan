import { Module } from '@nestjs/common';
import { AcademicIntakesService } from './academic-intakes.service';
import { AcademicBatchService } from './academic-batch.service';
import { AcademicIntakesController } from './academic-intakes.controller';

@Module({
  controllers: [AcademicIntakesController],
  providers: [AcademicIntakesService, AcademicBatchService],
  exports: [AcademicIntakesService, AcademicBatchService],
})
export class AcademicIntakesModule {}
