import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { CreateIntegrationConfigDto, CreateWebhookSubDto } from './dto/integration.dto';
import { CurrentUser, OrgContext, RequirePermissions } from '../../common/decorators';
import { JwtAuthGuard, PermissionsGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';

@ApiTags('Integrations & Webhooks (مركز الربط والتكامل التكاملي - Integration Hub)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(private integrationsService: IntegrationsService) {}

  @Get('configs')
  @ApiOperation({ summary: 'قائمة إعدادات الربط والتكامل الخارجية (SCFHS, Nafis, Absher, Universities)' })
  @RequirePermissions('manage_organizations')
  async findAllConfigs(@OrgContext() orgId: string) {
    return this.integrationsService.findAllConfigs(orgId);
  }

  @Post('configs')
  @ApiOperation({ summary: 'إضافة إعداد تكامل جديد' })
  @RequirePermissions('manage_organizations')
  async createConfig(
    @Body() dto: CreateIntegrationConfigDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.integrationsService.createConfig(dto, user);
  }

  @Get('webhooks')
  @ApiOperation({ summary: 'قائمة اشتراكات الـ Webhooks الأحداث الخارجية' })
  @RequirePermissions('manage_organizations')
  async findAllWebhooks(@OrgContext() orgId: string) {
    return this.integrationsService.findAllWebhooks(orgId);
  }

  @Post('webhooks')
  @ApiOperation({ summary: 'إنشاء اشتراك Webhook جديد للأحداث (trainee.approved, card.issued, rotation.completed)' })
  @RequirePermissions('manage_organizations')
  async createWebhook(
    @Body() dto: CreateWebhookSubDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.integrationsService.createWebhook(dto, user);
  }

  @Delete('webhooks/:id')
  @ApiOperation({ summary: 'إلغاء اشتراك Webhook' })
  @RequirePermissions('manage_organizations')
  async removeWebhook(@Param('id') id: string) {
    return this.integrationsService.removeWebhook(id);
  }
}
