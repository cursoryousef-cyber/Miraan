import { Module } from '@nestjs/common';
import { RotationsController } from './rotations.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  // OrganizationsModule exports CapacityService, which is what the departments
  // listing uses to report real occupancy instead of a raw relation count.
  imports: [PrismaModule, OrganizationsModule],
  controllers: [RotationsController],
})
export class RotationsModule {}
