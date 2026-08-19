import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LicensesService } from './licenses.service';
import { UpdateLicenseDto } from './dto/license.dto';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { JwtAuthGuard, PermissionsGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';

@ApiTags('Licenses & Subscriptions (إدارة تراخيص الباقات والسعات للجهات)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('licenses')
export class LicensesController {
  constructor(private licensesService: LicensesService) {}

  @Get('organization/:orgId')
  @ApiOperation({ summary: 'عرض ترخيص وسعة جهة محددة (السعة التخزينية، عدد المتدربين، تاريخ الانتهاء)' })
  @RequirePermissions('view_organizations')
  async getLicense(@Param('orgId') orgId: string) {
    return this.licensesService.getLicense(orgId);
  }

  @Post('update')
  @ApiOperation({ summary: 'تحديث أو تجديد باقة ترخيص جهة (Update Tenant Subscription)' })
  @RequirePermissions('manage_organizations')
  async updateLicense(
    @Body() dto: UpdateLicenseDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.licensesService.updateLicense(dto, user);
  }
}
