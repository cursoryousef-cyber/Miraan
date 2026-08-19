import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSettingDto } from './dto/setting.dto';
import { CurrentUser, OrgContext, RequirePermissions } from '../../common/decorators';
import { JwtAuthGuard, PermissionsGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';
import {
  CAPABILITIES, CapabilityGuard, RequireCapability,
} from '../../common/authz';

@ApiTags('Settings (مركز الإعدادات الديناميكية للمنصة والجهات - Configuration Service)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard, CapabilityGuard)
@Controller('settings')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get()
  @RequireCapability(CAPABILITIES.ORG_VIEW)
  @ApiOperation({ summary: 'قائمة إعدادات الجهة النشطة والمنصة' })
  async getSettings(@OrgContext() orgId: string) {
    return this.settingsService.getSettings(orgId);
  }

  @Get(':key')
  @RequireCapability(CAPABILITIES.ORG_VIEW)
  @ApiOperation({ summary: 'قراءة قيمة إعداد محدد عبر المفتاح' })
  async getSettingByKey(@Param('key') key: string, @OrgContext() orgId: string) {
    return this.settingsService.getSettingByKey(key, orgId);
  }

  @Post()
  @ApiOperation({ summary: 'تحديث قيمة إعداد في قاعدة البيانات (Database-backed Dynamic Config)' })
  @RequirePermissions('manage_organizations')
  async updateSetting(
    @Body() dto: UpdateSettingDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.settingsService.updateSetting(dto, user);
  }
}
