import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationDirectoryService } from './organization-directory.service';
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
    OrganizationDirectoryService,
    OrganizationHierarchyService,
    OrganizationProvisioningService,
    OrganizationAffiliationsService,
    CapacityService,
    HospitalCapacityService,
  ],
  exports: [
    OrganizationsService,
    OrganizationDirectoryService,
    OrganizationHierarchyService,
    OrganizationProvisioningService,
    OrganizationAffiliationsService,
    CapacityService,
    HospitalCapacityService,
  ],
})
export class OrganizationsModule {}
