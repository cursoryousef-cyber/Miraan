import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, RequireRoles } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { OrganizationAssignmentService } from './organization-assignment.service';

@ApiTags('Organization Assignments (تعيينات المستخدمين)')
@Controller('organization-assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class OrganizationAssignmentController {
  constructor(private svc: OrganizationAssignmentService) {}

  @Get('my')
  @RequireRoles('platform_owner', 'cluster_administrator', 'cluster_manager', 'hospital_administrator', 'training_director', 'university_administrator', 'trainer', 'trainee')
  @ApiOperation({ summary: 'تعيينات المستخدم الحالي' })
  async myAssignments(@CurrentUser() user: IAuthenticatedUser) {
    return this.svc.getAssignments(user.accountId);
  }

  @Get('org/:orgId/members')
  @RequireRoles('platform_owner', 'cluster_administrator', 'cluster_manager', 'hospital_administrator', 'training_director', 'university_administrator')
  @ApiOperation({ summary: 'أعضاء الجهة من خلال التعيينات' })
  async membersInOrg(@Param('orgId') orgId: string) {
    return this.svc.getMembersInOrg(orgId);
  }

  @Post('transfer')
  @RequireRoles('platform_owner', 'cluster_administrator', 'cluster_manager', 'hospital_administrator')
  @ApiOperation({ summary: 'نقل مستخدم إلى جهة أو قسم آخر' })
  async transfer(
    @Body() body: {
      userAccountId: string;
      toOrganizationId: string;
      toDepartmentId?: string;
      toRoleId?: string;
      assignmentType?: string;
      reason: string;
      notes?: string;
    },
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.svc.transferUser({ ...body, performedById: user.accountId });
  }

  @Post('backfill')
  @RequireRoles('platform_owner')
  @ApiOperation({ summary: 'ترحيل البيانات من النموذج القديم إلى OrganizationAssignment' })
  async backfill() {
    return this.svc.backfill();
  }
}
