import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationHierarchyService } from './organization-hierarchy.service';
import { OrganizationProvisioningService } from './organization-provisioning.service';
import { OrganizationAffiliationsService } from './organization-affiliations.service';
import { CapacityService } from './capacity.service';
import { HospitalCapacityService } from './hospital-capacity.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationAffiliationsController } from './organization-affiliations.controller';
import { HospitalCapacityController } from './hospital-capacity.controller';
import { OrganizationAssignmentModule } from '../organization-assignments/organization-assignment.module';

@Module({
  imports: [OrganizationAssignmentModule],
  controllers: [OrganizationsController, OrganizationAffiliationsController, HospitalCapacityController],
  providers: [
    OrganizationsService,
    OrganizationHierarchyService,
    OrganizationProvisioningService,
    OrganizationAffiliationsService,
    CapacityService,
    HospitalCapacityService,
  ],
  exports: [
    OrganizationsService,
    OrganizationHierarchyService,
    OrganizationProvisioningService,
    OrganizationAffiliationsService,
    CapacityService,
    HospitalCapacityService,
  ],
})
export class OrganizationsModule {}
