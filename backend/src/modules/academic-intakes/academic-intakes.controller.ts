import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AcademicIntakesService } from './academic-intakes.service';
import { AcademicBatchService } from './academic-batch.service';
import {
  UpdateAcademicIntakeDto,
  AssignTraineesToIntakeDto,
} from './dto/academic-intake.dto';
import { CreateBatchFromRequestDto } from './dto/academic-batch.dto';
import { CurrentUser, OrgContext } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';
import {
  CAPABILITIES,
  CapabilityGuard,
  RequireCapability,
  Scope,
  ScopeContext,
  ScopeGuard,
  ScopedResource,
} from '../../common/authz';

@ApiTags('Academic Intakes (إدارة الدفعات الأكاديمية والطلاب)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, CapabilityGuard, ScopeGuard)
@Controller('academic-intakes')
export class AcademicIntakesController {
  constructor(
    private intakesService: AcademicIntakesService,
    private batchService: AcademicBatchService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'قائمة الدفعات الأكاديمية (مثل: دفعة امتياز 2027)' })
  @ApiQuery({ name: 'academicYear', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @RequireCapability(
    CAPABILITIES.ACADEMIC_BATCH_MANAGE,
    CAPABILITIES.TRAINEE_VIEW_SCOPE,
    CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
    CAPABILITIES.TRAINEE_VIEW_SPONSORED,
  )
  async findAll(
    @OrgContext() orgId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('academicYear') academicYear?: string,
  ) {
    return this.intakesService.findAll(orgId, +page, +limit, academicYear);
  }

  /**
   * The batch with its provenance chain — source request, university, approver.
   * Declared before `:id` so the literal segment is not captured as an id.
   */
  @Get(':id/provenance')
  @RequireCapability(
    CAPABILITIES.ACADEMIC_BATCH_MANAGE,
    CAPABILITIES.TRAINEE_VIEW_SCOPE,
    CAPABILITIES.TRAINEE_VIEW_SPONSORED,
  )
  @ScopedResource('academicIntake', 'id')
  @ApiOperation({
    summary: 'الدفعة مع مصدرها: الطلب المعتمد، الجامعة، المعتمِد، والمتدربون',
  })
  async provenance(@Param('id') id: string, @Scope() scope: ScopeContext) {
    return this.batchService.findWithProvenance(id, scope);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'تفاصيل دفعة أكاديمية مع قائمة المتدربين المسجلين بها',
  })
  @RequireCapability(
    CAPABILITIES.ACADEMIC_BATCH_MANAGE,
    CAPABILITIES.TRAINEE_VIEW_SCOPE,
    CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
    CAPABILITIES.TRAINEE_VIEW_SPONSORED,
  )
  @ScopedResource('academicIntake', 'id')
  async findOne(@Param('id') id: string) {
    return this.intakesService.findOne(id);
  }

  /**
   * The only route that creates a batch. It takes a training request id, not a
   * set of batch fields, because the batch's facts are the request's facts — the
   * free-standing POST that let a batch be typed into existence is gone.
   */
  @Post('from-request')
  @RequireCapability(CAPABILITIES.ACADEMIC_BATCH_CREATE_FROM_REQUEST)
  @ApiOperation({
    summary:
      'إنشاء الدفعة الأكاديمية من طلب تدريب معتمد (المسار الوحيد للإنشاء)',
  })
  async createFromRequest(
    @Body() dto: CreateBatchFromRequestDto,
    @CurrentUser() user: IAuthenticatedUser,
    @Scope() scope: ScopeContext,
  ) {
    return this.batchService.createFromApprovedRequest(
      dto.trainingRequestId,
      user,
      scope,
      {
        code: dto.code,
        nameAr: dto.nameAr,
        academicYear: dto.academicYear,
        notes: dto.notes,
      },
    );
  }

  @Post(':id/assign-trainees')
  @ApiOperation({
    summary: 'توزيع قائمة من المتدربين على هذه الدفعة الأكاديمية',
  })
  @RequireCapability(CAPABILITIES.ACADEMIC_BATCH_MANAGE)
  @ScopedResource('academicIntake', 'id')
  async assignTrainees(
    @Param('id') id: string,
    @Body() dto: AssignTraineesToIntakeDto,
  ) {
    return this.intakesService.assignTrainees(id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'تحديث بيانات دفعة أكاديمية' })
  @RequireCapability(CAPABILITIES.ACADEMIC_BATCH_MANAGE)
  @ScopedResource('academicIntake', 'id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAcademicIntakeDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.intakesService.update(id, dto, user);
  }
}
