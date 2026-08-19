import { Module } from '@nestjs/common';
import { TraineeDocumentsController } from './trainee-documents.controller';
import { TraineeDocumentsService } from './trainee-documents.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [TraineeDocumentsController],
  providers: [TraineeDocumentsService],
  exports: [TraineeDocumentsService],
})
export class TraineeDocumentsModule {}
