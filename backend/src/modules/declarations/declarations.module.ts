import { Module } from '@nestjs/common';
import { DeclarationsService } from './declarations.service';
import { DeclarationsController } from './declarations.controller';

@Module({
  controllers: [DeclarationsController],
  providers: [DeclarationsService],
  exports: [DeclarationsService],
})
export class DeclarationsModule {}
