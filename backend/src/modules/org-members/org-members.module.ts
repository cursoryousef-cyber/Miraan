import { Module } from '@nestjs/common';
import { OrgMembersController } from './org-members.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { OrganizationAssignmentModule } from '../organization-assignments/organization-assignment.module';

@Module({
  imports: [PrismaModule, OrganizationAssignmentModule],
  controllers: [OrgMembersController],
})
export class OrgMembersModule {}
