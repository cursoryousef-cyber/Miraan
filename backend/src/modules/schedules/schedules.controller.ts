import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, RequireRoles } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { SchedulesService, CreateScheduleDto, UpdateScheduleDto } from './schedules.service';
import { CAPABILITIES, CapabilityGuard, RequireCapability } from '../../common/authz';
import { ProposedSession } from './conflict-engine.service';

@ApiTags('Training Schedule Builder (منشئ الخطة والجدول التدريبي)')
@Controller('schedules')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
@ApiBearerAuth('JWT-auth')
export class SchedulesController {
  constructor(private schedulesService: SchedulesService) {}

  @Get()
  @RequireCapability(
    CAPABILITIES.SCHEDULE_VIEW,
    CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
    CAPABILITIES.TRAINEE_VIEW_ASSIGNED,
    CAPABILITIES.SELF_VIEW,
  )
  @ApiOperation({ summary: 'استعراض الجداول التدريبية في المستشفى / للمدرب / للمتدرب' })
  async findAll(
    @CurrentUser() user: IAuthenticatedUser,
    @Query('status') status?: string,
    @Query('traineeId') traineeId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.schedulesService.findAll(user, { status, traineeId, departmentId });
  }

  // Sessions in a date window. `GET /schedules` returns schedules, which span
  // weeks — a day view built on those shows identical content for every date they
  // cover. Sessions carry their own date, so this is what a daily, weekly or
  // agenda view queries, and changing the selected date changes the result.
  @Get('sessions')
  @RequireCapability(
    CAPABILITIES.SCHEDULE_VIEW,
    CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
    CAPABILITIES.TRAINEE_VIEW_ASSIGNED,
    CAPABILITIES.SELF_VIEW,
  )
  @ApiOperation({ summary: 'جلسات الجدول التدريبي ضمن فترة محددة (يومي / أسبوعي / أجندة)' })
  async findSessions(
    @CurrentUser() user: IAuthenticatedUser,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.schedulesService.findSessions(user, { startDate, endDate, departmentId });
  }

  @Get(':id')
  @RequireCapability(CAPABILITIES.SCHEDULE_VIEW, CAPABILITIES.SELF_VIEW)
  @ApiOperation({ summary: 'تفاصيل جدول تدريبي محدد مع جلساته وإصداراته' })
  async findOne(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) {
    return this.schedulesService.findOne(id, user);
  }

  @Post('check-conflicts')
  @RequireCapability(CAPABILITIES.SCHEDULE_CREATE, CAPABILITIES.SCHEDULE_UPDATE)
  @ApiOperation({ summary: 'فحص التعارضات الزمانية والمكانية والسعة قبل حفظ الجلسات' })
  async checkConflicts(
    @CurrentUser() user: IAuthenticatedUser,
    @Body() body: { sessions: ProposedSession[]; scheduleId?: string },
  ) {
    return this.schedulesService.checkConflicts(user, body);
  }

  @Post()
  @RequireCapability(CAPABILITIES.SCHEDULE_CREATE)
  @ApiOperation({ summary: 'إنشاء جدول تدريبي جديد عبر الـ Wizard أو المنشئ السريع' })
  async create(@CurrentUser() user: IAuthenticatedUser, @Body() dto: CreateScheduleDto) {
    return this.schedulesService.create(user, dto);
  }

  @Patch(':id')
  @RequireCapability(CAPABILITIES.SCHEDULE_UPDATE)
  @ApiOperation({ summary: 'تحديث بيانات الجدول أو تعديل الجلسات والتفاعلات Drag & Drop' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.schedulesService.update(id, user, dto);
  }

  @Post(':id/publish')
  @RequireCapability(CAPABILITIES.SCHEDULE_PUBLISH)
  @ApiOperation({ summary: 'النشر النهائي للجدول وتوليد الشيفتات وحفظ الإصدار (ScheduleRevision Snapshot)' })
  async publish(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { changeReason?: string },
  ) {
    return this.schedulesService.publish(id, user, dto.changeReason);
  }

  @Patch('sessions/:sessionId/action')
  @RequireCapability(CAPABILITIES.SCHEDULE_VIEW, CAPABILITIES.SELF_VIEW, CAPABILITIES.TRAINING_OPERATE)
  @ApiOperation({ summary: 'تحديث حالة الجلسة أو تسجيل ملاحظة من قبل المدرب (بدء / إنهاء المناوبة)' })
  async updateSessionAction(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { status?: string; notes?: string },
  ) {
    return this.schedulesService.updateSessionAction(sessionId, user, dto);
  }

  @Post('sessions/:sessionId/change-request')
  @RequireCapability(CAPABILITIES.SCHEDULE_VIEW, CAPABILITIES.SELF_VIEW)
  @ApiOperation({ summary: 'طلب تعديل مناوبة / جلسة تدريبية إلى إدارة التدريب' })
  async requestSessionChange(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { proposedDate?: string; proposedStartTime?: string; proposedEndTime?: string; reason: string },
  ) {
    return this.schedulesService.requestSessionChange(sessionId, user, dto);
  }

  @Post('sessions/:sessionId/swap-request')
  @RequireCapability(CAPABILITIES.SCHEDULE_VIEW, CAPABILITIES.SELF_VIEW)
  @ApiOperation({ summary: 'طلب تبديل مناوبة مع مدرب بديل' })
  async requestSessionSwap(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { targetTrainerId?: string; targetTrainerName?: string; proposedDate?: string; reason: string },
  ) {
    return this.schedulesService.requestSessionSwap(sessionId, user, dto);
  }

  @Post('sessions/:sessionId/attendance')
  @RequireCapability(CAPABILITIES.SCHEDULE_VIEW, CAPABILITIES.SELF_VIEW, CAPABILITIES.TRAINING_OPERATE)
  @ApiOperation({ summary: 'تسجيل وتوثيق حضور المتدرب في الجلسة المناوبة' })
  async recordSessionAttendance(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { traineeProfileId: string; status?: string; checkIn?: string; notes?: string },
  ) {
    return this.schedulesService.recordSessionAttendance(sessionId, user, dto);
  }

  @Delete('sessions/:sessionId')
  @RequireCapability(CAPABILITIES.SCHEDULE_UPDATE)
  @ApiOperation({ summary: 'حذف جلسة تدريبية من الجدول' })
  async removeSession(@Param('sessionId') sessionId: string, @CurrentUser() user: IAuthenticatedUser) {
    return this.schedulesService.removeSession(sessionId, user);
  }

  @Delete(':id')
  @RequireCapability(CAPABILITIES.SCHEDULE_DELETE)
  @ApiOperation({ summary: 'حذف الجدول التدريبي بالكامل' })
  async remove(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) {
    return this.schedulesService.remove(id, user);
  }
}
