import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FeatureFlagsService } from './feature-flags.service';
import { ToggleFeatureFlagDto } from './dto/feature-flag.dto';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { JwtAuthGuard, PermissionsGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';

@ApiTags('Feature Flags (إدارة ميزات الوحدات للجهات)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private flagsService: FeatureFlagsService) {}

  @Get('organization/:orgId')
  @ApiOperation({ summary: 'قائمة الميزات المفتوحة والمغلقة لجهة محددة' })
  @RequirePermissions('manage_organizations')
  async getOrgFlags(@Param('orgId') orgId: string) {
    return this.flagsService.getOrgFlags(orgId);
  }

  @Post('toggle')
  @ApiOperation({ summary: 'تفعيل أو إيقاف ميزة محددة لجهة (Toggle Feature Flag)' })
  @RequirePermissions('manage_organizations')
  async toggleFlag(
    @Body() dto: ToggleFeatureFlagDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.flagsService.toggleFlag(dto, user);
  }
}
