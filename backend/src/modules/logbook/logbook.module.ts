import { Module } from '@nestjs/common';
import { LogbookController } from './logbook.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LogbookController],
})
export class LogbookModule {}
