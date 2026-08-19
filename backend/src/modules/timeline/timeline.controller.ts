import { Controller, Get, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, RequireRoles } from '../../common/decorators';
import {
  CAPABILITIES, CapabilityGuard, RequireCapability, Scope, ScopeContext,
} from '../../common/authz';
import { IAuthenticatedUser } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import { TimelineService } from './timeline.service';

@ApiTags('Trainee Timeline (الخط الزمني للمتدرب)')
@Controller('timeline')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
@ApiBearerAuth('JWT-auth')
export class TimelineController {
  constructor(
    private timelineService: TimelineService,
    private prisma: PrismaService,
  ) {}

  // Literal routes are declared before ':traineeProfileId' so they are not
  // swallowed by the parameterised one.

  @Get('me')
  @RequireRoles('trainee')
  @ApiOperation({ summary: 'الخط الزمني للمتدرب الحالي' })
  async myTimeline(@CurrentUser() user: IAuthenticatedUser) {
    const account = await this.prisma.userAccount.findUnique({
      where: { id: user.accountId },
      select: { personId: true },
    });
    const profile = account
      ? await this.prisma.traineeProfile.findFirst({
          where: { personId: account.personId, deletedAt: null },
          select: { id: true },
        })
      : null;
    if (!profile) throw new NotFoundException('لا يوجد ملف متدرب مرتبط بحسابك');
    return this.timelineService.getTraineeTimeline(profile.id);
  }

  /**
   * The shared dashboard feed. Hospital, university and cluster views all read
   * this, so their numbers are computed once and cannot diverge.
   */
  @Get('dashboard')
  @RequireRoles(
    'platform_owner', 'system_admin', 'org_manager',
    'cluster_administrator', 'cluster_manager', 'training_director',
    'hospital_training_admin', 'hospital_administrator',
    'university_administrator', 'academic_supervisor',
  )
  @ApiOperation({ summary: 'ملخص الخطوط الزمنية للوحات المستشفى والجامعة والتجمع' })
  async dashboard(
    @CurrentUser() user: IAuthenticatedUser,
    @Query('scope') scope: 'hospital' | 'university' | 'cluster' = 'hospital',
    @Query('organizationId') organizationId?: string,
    @Query('programId') programId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.timelineService.getDashboardTimelines({
      scope,
      organizationId: organizationId || user.organizationId,
      programId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('journey/:traineeRowId')
  @RequireCapability(
    CAPABILITIES.TIMELINE_VIEW,
    CAPABILITIES.TRAINEE_VIEW_SCOPE,
    CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
  )
  @ApiOperation({
    summary:
      'مسار المتدرب الكامل: الطلب ← المراجعة ← الاعتماد ← الدفعة ← التخصيص ← القسم ← المدرب ← التدريب ← التخرج',
  })
  async journey(
    @Param('traineeRowId') traineeRowId: string,
    @Scope() scope: ScopeContext,
  ) {
    return this.timelineService.getTraineeJourney(traineeRowId, scope);
  }

  @Get(':traineeProfileId/readiness')
  @RequireRoles(
    'platform_owner', 'system_admin', 'org_manager',
    'cluster_administrator', 'cluster_manager', 'training_director',
    'hospital_training_admin', 'trainer',
    'university_administrator', 'academic_supervisor',
  )
  @ApiOperation({ summary: 'جاهزية المتدرب للتخرج ومتطلباته المتبقية' })
  async readiness(@Param('traineeProfileId') traineeProfileId: string) {
    return this.timelineService.getGraduationReadiness(traineeProfileId);
  }

  @Get(':traineeProfileId')
  @RequireRoles(
    'platform_owner', 'system_admin', 'org_manager',
    'cluster_administrator', 'cluster_manager', 'training_director',
    'hospital_training_admin', 'trainer',
    'university_administrator', 'academic_supervisor',
  )
  @ApiOperation({ summary: 'الخط الزمني الكامل للمتدرب مع تقدم كل روتيشن' })
  async traineeTimeline(@Param('traineeProfileId') traineeProfileId: string) {
    return this.timelineService.getTraineeTimeline(traineeProfileId);
  }
}
