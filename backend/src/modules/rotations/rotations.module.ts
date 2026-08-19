import { Module } from '@nestjs/common';
import { RotationsController } from './rotations.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RotationsController],
})
export class RotationsModule {}
