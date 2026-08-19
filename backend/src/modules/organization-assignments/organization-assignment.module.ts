import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { OrganizationAssignmentService } from './organization-assignment.service';
import { OrganizationAssignmentController } from './organization-assignment.controller';

@Module({
  imports: [PrismaModule],
  controllers: [OrganizationAssignmentController],
  providers: [OrganizationAssignmentService],
  exports: [OrganizationAssignmentService],
})
export class OrganizationAssignmentModule {}
