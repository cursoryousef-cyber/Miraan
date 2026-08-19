import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CallsController],
})
export class CallsModule {}
