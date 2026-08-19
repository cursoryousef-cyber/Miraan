import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationHierarchyService } from './organization-hierarchy.service';
import { ProvisionOrgWizardDto } from './dto/organization.dto';
import { IAuthenticatedUser } from '../../common/interfaces';

@Injectable()
export class OrganizationProvisioningService {
  constructor(
    private prisma: PrismaService,
    private hierarchyService: OrganizationHierarchyService,
  ) {}

  async provisionOrganization(dto: ProvisionOrgWizardDto, actorUser?: IAuthenticatedUser) {
    const { organization: orgDto, adminEmail, adminNameAr, adminNationalId, adminPhone } = dto;

    // Check code uniqueness
    const existingOrg = await this.prisma.organization.findUnique({
      where: { code: orgDto.code.toUpperCase() },
    });
    if (existingOrg) {
      throw new ConflictException(`رمز الجهة (${orgDto.code}) مستخدم مسبقاً`);
    }

    // Verify OrganizationType exists
    const orgType = await this.prisma.organizationType.findUnique({
      where: { id: orgDto.organizationTypeId },
    });
    if (!orgType) {
      throw new NotFoundException('نوع الجهة المحدد غير موجود');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Create Organization
      const org = await tx.organization.create({
        data: {
          organizationTypeId: orgDto.organizationTypeId,
          parentId: orgDto.parentId || null,
          code: orgDto.code.toUpperCase(),
          nameAr: orgDto.nameAr,
          nameEn: orgDto.nameEn || orgDto.nameAr,
          status: orgDto.status || 'active',
          cityAr: orgDto.cityAr,
          cityEn: orgDto.cityEn,
          regionAr: orgDto.regionAr,
          regionEn: orgDto.regionEn,
          contactEmail: orgDto.contactEmail || adminEmail,
          contactPhone: orgDto.contactPhone || adminPhone,
          createdById: actorUser?.accountId,
        },
      });

      // 2. Build Closure Hierarchy
      await this.hierarchyService.addNode(org.id, org.parentId || undefined);

      // 3. Create or find Person for Admin
      let person = await tx.person.findFirst({
        where: {
          OR: [
            adminNationalId ? { nationalId: adminNationalId } : {},
            { email: adminEmail.toLowerCase() },
          ],
        },
      });

      if (!person) {
        person = await tx.person.create({
          data: {
            nationalId: adminNationalId || null,
            nameAr: adminNameAr,
            email: adminEmail.toLowerCase(),
            phone: adminPhone || null,
            createdById: actorUser?.accountId,
          },
        });
      }

      // 4. Create UserAccount with activation token
      const activationToken = uuidv4();
      const tempHash = await bcrypt.hash(uuidv4(), 10);

      let account = await tx.userAccount.findUnique({
        where: { email: adminEmail.toLowerCase() },
      });

      if (!account) {
        account = await tx.userAccount.create({
          data: {
            personId: person.id,
            email: adminEmail.toLowerCase(),
            username: adminEmail.toLowerCase(),
            passwordHash: tempHash,
            activationToken,
            createdById: actorUser?.accountId,
          },
        });
      }

      // 5. Link User to Organization
      await tx.userOrganization.upsert({
        where: {
          userAccountId_organizationId: {
            userAccountId: account.id,
            organizationId: org.id,
          },
        },
        create: {
          userAccountId: account.id,
          organizationId: org.id,
          isPrimary: true,
        },
        update: {
          isActive: true,
        },
      });

      // Mirror the membership into OrganizationAssignment (same transaction).
      const existingAssignment = await tx.organizationAssignment.findFirst({
        where: { userAccountId: account.id, organizationId: org.id },
        select: { id: true },
      });
      if (existingAssignment) {
        await tx.organizationAssignment.update({
          where: { id: existingAssignment.id },
          data: { isActive: true },
        });
      } else {
        await tx.organizationAssignment.create({
          data: {
            userAccountId: account.id,
            organizationId: org.id,
            isPrimary: true,
            isActive: true,
            assignmentType: 'permanent',
            sourceType: 'user_organization',
            createdById: actorUser?.accountId,
          },
        });
      }

      // 6. Assign Default Role for OrgType (e.g. cluster_administrator, hospital_administrator)
      const roleCode = orgType.autoCreateRole || 'hospital_administrator';
      const defaultRole = await tx.role.findUnique({
        where: { code: roleCode },
      });

      if (defaultRole) {
        await tx.userRole.upsert({
          where: {
            userAccountId_roleId_organizationId: {
              userAccountId: account.id,
              roleId: defaultRole.id,
              organizationId: org.id,
            },
          },
          create: {
            userAccountId: account.id,
            roleId: defaultRole.id,
            organizationId: org.id,
            assignedById: actorUser?.accountId,
          },
          update: {},
        });
      }

      // 7. Create Default Settings for the organization
      await tx.setting.createMany({
        data: [
          {
            organizationId: org.id,
            key: 'general.language',
            value: { default: 'ar' },
            descriptionAr: 'اللغة الافتراضية للجهة',
          },
          {
            organizationId: org.id,
            key: 'call_system.diligence_weights',
            value: { response: 40, attendance: 30, ackSpeed: 20, arrivalSpeed: 10 },
            descriptionAr: 'أوزان مؤشر الانضباط والتجاوب للنداءات',
          },
          {
            organizationId: org.id,
            key: 'notifications.channels',
            value: { email: true, push: true, sms: false },
            descriptionAr: 'قنوات الإشعارات المفعّلة',
          },
        ],
      });

      // 8. Create Organization License (Default Enterprise trial)
      await tx.organizationLicense.create({
        data: {
          organizationId: org.id,
          plan: 'enterprise',
          maxUsers: 100,
          maxTrainees: 500,
          maxStorageGb: 50,
          startDate: new Date(),
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          status: 'active',
          createdById: actorUser?.accountId,
        },
      });

      // 9. Write to Audit Log
      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          actorId: actorUser?.accountId || null,
          action: 'organization.provisioned',
          entityType: 'organization',
          entityId: org.id,
          newValues: {
            orgCode: org.code,
            orgName: org.nameAr,
            adminEmail: account.email,
          },
        },
      });

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const activationLink = `${frontendUrl}/activate?token=${activationToken}`;

      return {
        organization: org,
        adminPerson: person,
        adminAccount: account,
        activationToken,
        activationLink,
        message: 'تم إنشاء الجهة وتجهيز الحساب الإداري وإصدار رابط التفعيل بنجاح',
      };
    });
  }
}
