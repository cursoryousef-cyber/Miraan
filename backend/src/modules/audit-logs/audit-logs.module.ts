import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AuditLogsController],
})
export class AuditLogsModule {}
