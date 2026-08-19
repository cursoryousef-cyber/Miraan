import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PoliciesService } from './policies.service';
import { PolicyEvaluatorService } from './policy-evaluator.service';
import { CreatePolicyDto, EvaluatePolicyDto } from './dto/policy.dto';
import { CurrentUser, OrgContext, RequirePermissions } from '../../common/decorators';
import { JwtAuthGuard, PermissionsGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';
import {
  CAPABILITIES, CapabilityGuard, RequireCapability,
} from '../../common/authz';

@ApiTags('Policies (محرك سياسات الوصول - Policy Engine ABAC)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard, CapabilityGuard)
@Controller('policies')
export class PoliciesController {
  constructor(
    private policiesService: PoliciesService,
    private evaluatorService: PolicyEvaluatorService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'قائمة سياسات التحكم بالوصول' })
  @RequirePermissions('manage_roles')
  async findAll(@OrgContext() orgId: string) {
    return this.policiesService.findAll(orgId);
  }

  @Post()
  @ApiOperation({ summary: 'إنشاء سياسة تحكم بالوصول جديدة (ABAC Policy)' })
  @RequirePermissions('manage_roles')
  async create(
    @Body() dto: CreatePolicyDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.policiesService.create(dto, user);
  }

  @Post('evaluate')
  @RequireCapability(CAPABILITIES.ORG_VIEW)
  @ApiOperation({ summary: 'اختبار وتقييم سياسات الوصول ديناميكياً (Policy Evaluation Debugger)' })
  async evaluate(
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: EvaluatePolicyDto,
  ) {
    return this.evaluatorService.evaluate({
      user,
      resource: dto.resource,
      action: dto.action,
      context: dto.context,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف سياسة' })
  @RequirePermissions('manage_roles')
  async remove(@Param('id') id: string) {
    return this.policiesService.remove(id);
  }
}
