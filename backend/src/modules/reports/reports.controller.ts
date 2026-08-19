import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import {
  CreateReportDefinitionDto,
  GenerateReportDto,
  UpdateReportDefinitionDto,
} from './dto/report.dto';
import { CurrentUser, RequireRoles } from '../../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';

/**
 * Authorisation here is role-based, matching /programs and /training-requests.
 *
 * The previous @RequirePermissions decorators were inert — PermissionsGuard was
 * imported but never registered, so every authenticated user reached every
 * route. Registering it was not the fix: production carries no rolePermission
 * rows at all, so a permission check would have locked out every role except
 * the platform bypass. Roles are what the rest of this codebase gates on and
 * what the JWT actually carries.
 */
const REPORT_READ_ROLES = [
  'platform_owner', 'system_admin', 'org_manager',
  'cluster_administrator', 'cluster_manager', 'training_director',
  'hospital_training_admin', 'hospital_administrator',
  'university_administrator', 'academic_supervisor',
] as const;

// Authoring templates is narrower than reading them: the cluster owns its own
// catalogue, the platform owns the national one.
const REPORT_AUTHOR_ROLES = [
  'platform_owner', 'system_admin', 'cluster_manager',
] as const;

@ApiTags('Reporting Service (خدمة التقارير والتحليلات المستقلة)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('definitions')
  @RequireRoles(...REPORT_READ_ROLES)
  @ApiOperation({ summary: 'قائمة قوالب التقارير المتاحة ضمن نطاق المستخدم' })
  async findAllDefinitions(@CurrentUser() user: IAuthenticatedUser) {
    return this.reportsService.findAllDefinitions(user);
  }

  @Post('definitions')
  @RequireRoles(...REPORT_AUTHOR_ROLES)
  @ApiOperation({ summary: 'إنشاء قالب تقرير ضمن نطاق الجهة' })
  async createDefinition(
    @Body() dto: CreateReportDefinitionDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.reportsService.createDefinition(dto, user);
  }

  // No DELETE by design — deactivation via isActive keeps generated history valid.
  @Patch('definitions/:id')
  @RequireRoles(...REPORT_AUTHOR_ROLES)
  @ApiOperation({ summary: 'تعديل أو تعطيل/تفعيل قالب تقرير' })
  async updateDefinition(
    @Param('id') id: string,
    @Body() dto: UpdateReportDefinitionDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.reportsService.updateDefinition(id, dto, user);
  }

  @Post('generate')
  @RequireRoles(...REPORT_READ_ROLES)
  @ApiOperation({ summary: 'توليد تقرير وإرجاع صفوفه الفعلية' })
  async generateReport(
    @Body() dto: GenerateReportDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.reportsService.generateReport(dto, user);
  }

  @Get('my-reports')
  @RequireRoles(...REPORT_READ_ROLES)
  @ApiOperation({ summary: 'سجل التقارير التي قمت بتوليدها' })
  async findUserReports(@CurrentUser() user: IAuthenticatedUser) {
    return this.reportsService.findUserReports(user);
  }

  @Get(':id/data')
  @RequireRoles(...REPORT_READ_ROLES)
  @ApiOperation({ summary: 'صفوف تقرير مولَّد سابقاً' })
  async getReportData(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) {
    return this.reportsService.getReportData(id, user);
  }
}
