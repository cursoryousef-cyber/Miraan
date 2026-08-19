import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, RequireRoles } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { TrainingPlansService } from './training-plans.service';
import {
  CreateTrainingPlanDto,
  UpdateTrainingPlanDto,
  CreateVersionDto,
  PublishVersionDto,
  UpsertPlanRotationDto,
} from './dto/training-plan.dto';

@ApiTags('Training Plans (قوالب الخطط التدريبية)')
@Controller('training-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class TrainingPlansController {
  constructor(private plansService: TrainingPlansService) {}

  // Read access mirrors the program catalog: the university picks a plan when it
  // submits, the cluster allocates against it, the hospital runs it.
  @Get()
  @RequireRoles(
    'platform_owner', 'system_admin', 'org_manager',
    'cluster_administrator', 'cluster_manager', 'training_director',
    'hospital_training_admin', 'trainer',
    'university_administrator', 'academic_supervisor', 'trainee',
  )
  @ApiOperation({ summary: 'قوالب الخطط التدريبية وإصداراتها' })
  async listPlans(
    @Query('programId') programId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.plansService.listPlans({ programId, includeInactive: includeInactive === 'true' });
  }

  // Registered before ':planId' so the literal segment is not captured as an id.
  @Get('versions/:versionId')
  @RequireRoles(
    'platform_owner', 'system_admin', 'org_manager',
    'cluster_administrator', 'cluster_manager', 'training_director',
    'hospital_training_admin', 'trainer',
    'university_administrator', 'academic_supervisor', 'trainee',
  )
  @ApiOperation({ summary: 'إصدار خطة محدد مع روتيشناته' })
  async getVersion(@Param('versionId') versionId: string) {
    return this.plansService.getVersion(versionId);
  }

  @Get(':planId')
  @RequireRoles(
    'platform_owner', 'system_admin', 'org_manager',
    'cluster_administrator', 'cluster_manager', 'training_director',
    'hospital_training_admin', 'trainer',
    'university_administrator', 'academic_supervisor', 'trainee',
  )
  @ApiOperation({ summary: 'قالب خطة مع كامل إصداراته وروتيشناتها' })
  async getPlan(@Param('planId') planId: string) {
    return this.plansService.getPlan(planId);
  }

  // ─── Authoring ──────────────────────────────────────────────────────────────
  // Plan templates are national curriculum, so authoring stays with the platform
  // and the cluster training directorate.

  @Post()
  @RequireRoles('platform_owner', 'system_admin', 'training_director', 'cluster_administrator', 'cluster_manager')
  @ApiOperation({ summary: 'إنشاء قالب خطة تدريبية مع الإصدار الأول' })
  async createPlan(@Body() dto: CreateTrainingPlanDto, @CurrentUser() user: IAuthenticatedUser) {
    return this.plansService.createPlan(dto, user);
  }

  @Patch(':planId')
  @RequireRoles('platform_owner', 'system_admin', 'training_director', 'cluster_administrator', 'cluster_manager')
  @ApiOperation({ summary: 'تحديث بيانات القالب — لا يشمل المحتوى التدريبي' })
  async updatePlan(
    @Param('planId') planId: string,
    @Body() dto: UpdateTrainingPlanDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.plansService.updatePlan(planId, dto, user);
  }

  @Post(':planId/versions')
  @RequireRoles('platform_owner', 'system_admin', 'training_director', 'cluster_administrator', 'cluster_manager')
  @ApiOperation({ summary: 'فتح إصدار مسودة جديد منسوخ عن إصدار قائم' })
  async createVersion(
    @Param('planId') planId: string,
    @Body() dto: CreateVersionDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    const data = await this.plansService.createDraftVersion(planId, dto.sourceVersionId, user);
    return { data, success: true, message: `تم إنشاء الإصدار ${data.versionNumber} كمسودة` };
  }

  @Post('versions/:versionId/publish')
  @RequireRoles('platform_owner', 'system_admin', 'training_director', 'cluster_administrator', 'cluster_manager')
  @ApiOperation({ summary: 'اعتماد إصدار مسودة وأرشفة الإصدار السابق' })
  async publishVersion(
    @Param('versionId') versionId: string,
    @Body() dto: PublishVersionDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.plansService.publishVersion(versionId, dto, user);
  }

  @Post('versions/:versionId/rotations')
  @RequireRoles('platform_owner', 'system_admin', 'training_director', 'cluster_administrator', 'cluster_manager')
  @ApiOperation({
    summary: 'إضافة أو تعديل روتيشن في القالب — تعديل إصدار معتمد يُنشئ إصداراً جديداً تلقائياً',
  })
  async upsertRotation(
    @Param('versionId') versionId: string,
    @Body() dto: UpsertPlanRotationDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.plansService.upsertRotation(versionId, dto, user);
  }

  @Delete('versions/:versionId/rotations/:sequenceOrder')
  @RequireRoles('platform_owner', 'system_admin', 'training_director', 'cluster_administrator', 'cluster_manager')
  @ApiOperation({ summary: 'حذف روتيشن من القالب — على إصدار معتمد يُنشئ إصداراً جديداً' })
  async removeRotation(
    @Param('versionId') versionId: string,
    @Param('sequenceOrder', ParseIntPipe) sequenceOrder: number,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.plansService.removeRotation(versionId, sequenceOrder, user);
  }
}
