import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { OrganizationDirectoryService } from './organization-directory.service';
import { OrganizationProvisioningService } from './organization-provisioning.service';
import { CreateOrganizationDto, UpdateOrganizationDto, ProvisionOrgWizardDto } from './dto/organization.dto';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { JwtAuthGuard, PermissionsGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';
import {
  CAPABILITIES, CapabilityGuard, RequireCapability,
  Scope, ScopeContext, ScopeGuard, ScopedResource,
} from '../../common/authz';

@ApiTags('Organizations (إدارة الجهات والشجرة التنظيمية)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard, CapabilityGuard, ScopeGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private organizationsService: OrganizationsService,
    private directoryService: OrganizationDirectoryService,
    private provisioningService: OrganizationProvisioningService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'قائمة الجهات مع إمكانية الفلترة والبحث' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'typeId', required: false, type: String })
  @ApiQuery({ name: 'parentId', required: false, type: String })
  @RequireCapability(CAPABILITIES.ORG_VIEW)
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('typeId') typeId?: string,
    @Query('parentId') parentId?: string,
    @Scope() scope?: ScopeContext,
  ) {
    return this.directoryService.findAll(
      +page,
      +limit,
      search,
      typeId,
      parentId,
      status,
      scope?.visibleOrgIds ?? null,
    );
  }

  @Get('request-targets')
  @RequireCapability(CAPABILITIES.TRAINING_REQUEST_CREATE)
  @ApiOperation({ summary: 'التجمعات الصحية المتاحة كجهة مستهدفة لطلب تدريب' })
  async getRequestTargets() {
    return this.organizationsService.findRequestTargetClusters();
  }

  @Get('types')
  @ApiOperation({ summary: 'قائمة أنواع الجهات (مستشفى، جامعة، تجمع صحي...)' })
  async getTypes() {
    return this.organizationsService.getTypes();
  }

  @Get('hospitals-cards')
  @RequireCapability(CAPABILITIES.ORG_VIEW, CAPABILITIES.CAPACITY_VIEW)
  @ApiOperation({ summary: 'بطاقات بطاقات المستشفيات مع إحصائيات الطاقة الاستيعابية والنسب المباشرة' })
  async getHospitalCards(
    @Query('clusterId') clusterId?: string,
    @CurrentUser() user?: IAuthenticatedUser,
    @Scope() scope?: ScopeContext,
  ) {
    const isPlatformScope = !scope || scope.visibleOrgIds === null;
    const targetClusterId = clusterId || (isPlatformScope ? undefined : user?.organizationId);
    return this.organizationsService.getHospitalCardsMetrics(targetClusterId);
  }

  @Get('statistics')
  @RequireCapability(CAPABILITIES.ORG_VIEW, CAPABILITIES.REPORT_VIEW)
  @ApiOperation({ summary: 'مؤشرات الجهات الموحّدة — مصدر واحد للوحات وصفحة الجهات' })
  async getStatistics(@Scope() scope: ScopeContext) {
    return this.organizationsService.getStatistics(scope.visibleOrgIds);
  }

  @Get('hospitals')
  @RequireCapability(CAPABILITIES.ORG_VIEW, CAPABILITIES.CAPACITY_VIEW)
  @ApiOperation({
    summary: 'مستشفيات جهة محددة — لتسلسل الاختيار (جهة ← مستشفى) في نماذج الحسابات',
  })
  @ApiQuery({ name: 'organizationId', required: false, type: String })
  async getHospitals(@Query('organizationId') organizationId?: string) {
    return this.organizationsService.getHospitalsForOrganization(organizationId);
  }

  @Get('tree')
  @ApiOperation({ summary: 'الهيكل التنظيمي الكامل كشجرة ديناميكية' })
  @RequireCapability(CAPABILITIES.ORG_VIEW)
  async getTree(@Scope() scope?: ScopeContext) {
    return this.organizationsService.getTree(scope?.visibleOrgIds ?? null);
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل جهة محددة والتراخيص والميزات والجهات التابعة' })
  @RequireCapability(CAPABILITIES.ORG_VIEW)
  @ScopedResource('organization', 'id')
  async findOne(@Param('id') id: string) {
    return this.organizationsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'إنشاء جهة جديدة مباشرة' })
  @RequirePermissions('manage_organizations')
  async create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.organizationsService.create(dto, user);
  }

  @Post('provision-wizard')
  @ApiOperation({ summary: 'معالج إنشاء جهة آلياً (Auto Provisioning Wizard) — جهة + حساب إداري + دور + إعدادات + تفعيل' })
  @RequirePermissions('manage_organizations')
  async provisionWizard(
    @Body() dto: ProvisionOrgWizardDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.provisioningService.provisionOrganization(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'تحديث بيانات جهة' })
  @RequirePermissions('manage_organizations')
  @ScopedResource('organization', 'id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.organizationsService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف جهة (Soft Delete)' })
  @RequirePermissions('manage_organizations')
  @ScopedResource('organization', 'id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.organizationsService.softDelete(id, user);
  }
}
