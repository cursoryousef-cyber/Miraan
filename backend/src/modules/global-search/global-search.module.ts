import { Module } from '@nestjs/common';
import { GlobalSearchController } from './global-search.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GlobalSearchController],
})
export class GlobalSearchModule {}
