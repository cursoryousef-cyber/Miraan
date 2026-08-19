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
    private provisioningService: OrganizationProvisioningService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'قائمة الجهات مع إمكانية الفلترة والبحث' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'typeId', required: false, type: String })
  @ApiQuery({ name: 'parentId', required: false, type: String })
  // Reading the directory is gated on ORG_VIEW, like hospitals-cards,
  // statistics and hospitals below it. The legacy 'view_organizations'
  // permission was never granted to org_manager or academic_supervisor in the
  // RBAC rows even though both hold ORG_VIEW, so once PermissionsGuard was
  // actually registered this route started refusing roles the capability model
  // says may read it. Authoring stays on manage_organizations. Neither trainer
  // nor trainee holds ORG_VIEW, so both remain refused.
  @RequireCapability(CAPABILITIES.ORG_VIEW)
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
    @Query('typeId') typeId?: string,
    @Query('parentId') parentId?: string,
    @Scope() scope?: ScopeContext,
  ) {
    return this.organizationsService.findAll(+page, +limit, search, typeId, parentId, scope?.visibleOrgIds ?? null);
  }

  // The clusters a sponsor may address a training request to. Held apart from
  // the general listing so a university gains no visibility it did not already
  // have: identity fields of active clusters only, for whoever may create a
  // training request.
  @Get('request-targets')
  @RequireCapability(CAPABILITIES.TRAINING_REQUEST_CREATE)
  @ApiOperation({ summary: 'التجمعات الصحية المتاحة كجهة مستهدفة لطلب تدريب' })
  async getRequestTargets() {
    return this.organizationsService.findRequestTargetClusters();
  }

  // Reference data — the catalogue of organisation types, not any organisation's
  // data. Any authenticated session may read it.
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
    // Platform sessions (visibleOrgIds === null) are national by default — an
    // explicit ?clusterId is an optional, soft display filter, but this must
    // never fall back to the caller's own home organisation for a
    // platform-level role. That fallback previously fired unconditionally,
    // so a platform_owner/system_admin whose home org happens to be a
    // cluster saw hospital cards (capacity/occupied — merged into the
    // /organizations list) scoped to that one cluster, while /statistics
    // (which has no such fallback) stayed correctly national. Non-platform
    // roles keep the original behaviour: default to their own organisation.
    const isPlatformScope = !scope || scope.visibleOrgIds === null;
    const targetClusterId = clusterId || (isPlatformScope ? undefined : user?.organizationId);
    return this.organizationsService.getHospitalCardsMetrics(targetClusterId);
  }

  @Get('statistics')
  @RequireCapability(CAPABILITIES.ORG_VIEW, CAPABILITIES.REPORT_VIEW)
  @ApiOperation({ summary: 'مؤشرات الجهات الموحّدة — مصدر واحد للوحات وصفحة الجهات' })
  // Scope comes from the caller's own session, never from the client — the
  // organizationId query param this used to accept let any authenticated role
  // read platform-wide totals just by omitting it. Same visibleOrgIds source
  // getTree right below uses.
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
