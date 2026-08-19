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
  ForbiddenException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CAPABILITIES, CapabilityGuard, RequireCapability, Scope, ScopeContext, ScopeGuard, ScopedResource,
} from '../../common/authz';
import { TRAINEE_ROW_STATUS } from '../../common/status-constants';

@ApiTags('Rotations & Departments (الروتيشنات والأقسام السريرية)')
@Controller('rotations')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard, ScopeGuard)
@ApiBearerAuth('JWT-auth')
export class RotationsController {
  constructor(private prisma: PrismaService) {}

  /**
   * The invariants a rotation must satisfy before it may exist, mirroring the
   * ones TraineeAllocationService.assignWithinHospital enforces on the
   * allocation path. Every relation is re-read from the database and compared
   * against the trainee's own hospital — never against an id the caller sent —
   * so a Hospital A session cannot name a Hospital B department or trainer.
   */
  /**
   * Replacement department/trainer on an existing rotation must belong to that
   * rotation's own hospital. The hospital is read from the stored row, never
   * from the request, so the check cannot be steered by the caller.
   */
  private async assertRotationEditTargetsUsable(
    rotationId: string,
    dto: {
      departmentId?: string;
      trainerProfileId?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<void> {
    const existing = await this.prisma.rotation.findUnique({
      where: { id: rotationId },
      select: { organizationId: true, startDate: true, endDate: true },
    });
    if (!existing) throw new NotFoundException('الروتيشن غير موجود');
    const hospitalId = existing.organizationId;

    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: dto.departmentId },
        select: { organizationId: true },
      });
      if (!department) throw new NotFoundException('القسم غير موجود');
      if (department.organizationId !== hospitalId) {
        throw new ForbiddenException('لا يمكن نقل الروتيشن إلى قسم في مستشفى آخر');
      }
    }

    if (dto.trainerProfileId) {
      const trainer = await this.prisma.trainerProfile.findUnique({
        where: { id: dto.trainerProfileId },
        select: { organizationId: true },
      });
      if (!trainer) throw new NotFoundException('ملف المدرب غير موجود');
      if (trainer.organizationId !== hospitalId) {
        throw new ForbiddenException('لا يمكن إسناد الروتيشن إلى مدرب من مستشفى آخر');
      }
    }

    // Dates stay coherent whether one end or both are being moved.
    const start = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const end = dto.endDate ? new Date(dto.endDate) : existing.endDate;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('تواريخ الروتيشن غير صالحة');
    }
    if (start >= end) {
      throw new BadRequestException('تاريخ البداية يجب أن يسبق تاريخ النهاية');
    }
  }

  private async assertRotationTargetsUsable(
    dto: {
      traineeProfileId: string;
      departmentId: string;
      trainerProfileId: string;
      startDate: string;
      endDate: string;
    },
    user: IAuthenticatedUser,
    scope?: ScopeContext,
  ): Promise<void> {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('تواريخ الروتيشن غير صالحة');
    }
    if (start >= end) {
      throw new BadRequestException('تاريخ البداية يجب أن يسبق تاريخ النهاية');
    }

    const trainee = await this.prisma.traineeProfile.findUnique({
      where: { id: dto.traineeProfileId },
      select: { id: true, organizationId: true, isLocked: true },
    });
    if (!trainee) throw new NotFoundException('ملف المتدرب غير موجود');
    if (trainee.isLocked) {
      throw new ForbiddenException('ملف المتدرب مغلق بعد التخرج — لا يمكن إنشاء روتيشن جديد');
    }

    // The hospital is the trainee's own, not the caller's claim. A restricted
    // session must be able to see it; platform sessions (null) are unrestricted.
    const hospitalId = trainee.organizationId;
    if (scope && scope.visibleOrgIds !== null && !scope.visibleOrgIds.includes(hospitalId)) {
      throw new ForbiddenException('هذا المتدرب خارج نطاق صلاحياتك التنظيمية');
    }

    // Acceptance gate. The candidate row is where the hospital's decision lives;
    // a trainee still under review has not been accepted and may not be placed.
    // Rows already active are legitimately re-placed (a later rotation in the
    // same programme), which is why both statuses pass.
    const candidateRow = await this.prisma.trainingRequestTrainee.findFirst({
      where: { traineeProfileId: dto.traineeProfileId },
      select: { status: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (
      candidateRow &&
      ![TRAINEE_ROW_STATUS.HOSPITAL_ACCEPTED, TRAINEE_ROW_STATUS.ACTIVE].includes(
        candidateRow.status as never,
      )
    ) {
      throw new ConflictException(
        `لا يمكن إنشاء روتيشن قبل قبول المستشفى للمتدرب — الحالة الحالية «${candidateRow.status}»`,
      );
    }

    const department = await this.prisma.department.findUnique({
      where: { id: dto.departmentId },
      select: { organizationId: true },
    });
    if (!department) throw new NotFoundException('القسم غير موجود');
    if (department.organizationId !== hospitalId) {
      throw new ForbiddenException('القسم المحدد لا يتبع مستشفى المتدرب');
    }

    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id: dto.trainerProfileId },
      select: { organizationId: true },
    });
    if (!trainer) throw new NotFoundException('ملف المدرب غير موجود');
    if (trainer.organizationId !== hospitalId) {
      throw new ForbiddenException('المدرب المحدد لا يتبع مستشفى المتدرب');
    }
  }

  @Get('my')
  async getMyRotations(@CurrentUser() user: IAuthenticatedUser) {
    const traineeProfile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
    });
    if (!traineeProfile) return { data: [] };
    const rotations = await this.prisma.rotation.findMany({
      where: { traineeProfileId: traineeProfile.id },
      include: { department: true, trainerProfile: { include: { person: true } } },
      orderBy: { startDate: 'asc' },
    });
    return { data: rotations };
  }

  @Get()
  @RequireCapability(
    CAPABILITIES.TRAINEE_VIEW_SCOPE,
    CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
    CAPABILITIES.TRAINEE_VIEW_DEPARTMENT,
    CAPABILITIES.TRAINEE_VIEW_ASSIGNED,
  )
  async findAll(@CurrentUser() user: IAuthenticatedUser) {
    if (user.roles.includes('trainee')) {
      const traineeProfile = await this.prisma.traineeProfile.findFirst({
        where: { person: { userAccounts: { some: { id: user.accountId } } } },
      });
      if (!traineeProfile) return { data: [] };
      const rotations = await this.prisma.rotation.findMany({
        where: { traineeProfileId: traineeProfile.id },
        include: { department: true, trainerProfile: { include: { person: true } } },
        orderBy: { startDate: 'asc' },
      });
      return { data: rotations };
    }

    if (user.roles.includes('trainer')) {
      const trainer = await this.prisma.trainerProfile.findFirst({
        where: { person: { userAccounts: { some: { id: user.accountId } } } },
      });
      if (!trainer) return { data: [] };
      const rotations = await this.prisma.rotation.findMany({
        where: { trainerProfileId: trainer.id, status: 'active' },
        include: {
          department: true,
          traineeProfile: {
            include: {
              person: {
                include: { userAccounts: { select: { id: true, isActive: true } } },
              },
            },
          },
          trainerProfile: { include: { person: true } },
        },
        orderBy: { startDate: 'asc' },
      });
      return { data: rotations };
    }

    const rotations = await this.prisma.rotation.findMany({
      where: { organizationId: user.organizationId },
      include: {
        department: true,
        traineeProfile: {
          include: {
            // Trainer mode derives evaluateeId (UserAccount.id) from these
            // accounts for evaluation/midpoint submissions.
            person: {
              include: { userAccounts: { select: { id: true, isActive: true } } },
            },
          },
        },
        trainerProfile: { include: { person: true } },
      },
      orderBy: { startDate: 'asc' },
    });
    return { data: rotations };
  }

  // Rotation writes are hospital *training* management, so they are gated on the
  // capability that means exactly that, not on a role list. The previous list
  // admitted `hospital_administrator` — the role that holds no training
  // capability at all by construction — while excluding
  // `hospital_training_admin`, the role that owns hospital training. See
  // capabilities.ts for the two role definitions this contradicted.
  @Post()
  @RequireCapability(
    CAPABILITIES.ALLOCATION_HOSPITAL_ASSIGN,
    CAPABILITIES.ALLOCATION_HOSPITAL_REASSIGN,
  )
  @ApiOperation({ summary: 'إنشاء روتيشن جديد وتعيين المتدرب والمدرب والقسم' })
  async createRotation(
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: {
      traineeProfileId: string;
      departmentId: string;
      trainerProfileId: string;
      startDate: string;
      endDate: string;
      status?: string;
    },
    @Scope() scope?: ScopeContext,
  ) {
    // Direct rotation creation reaches the same end state as the allocation
    // path — a trainee placed with a department and a trainer — but it went
    // through none of that path's checks. The capability above only established
    // that the caller may place trainees *somewhere*; every id below arrives
    // from the client, so without this the endpoint would place any trainee
    // with any trainer in any department, before the hospital had accepted
    // them, bypassing the acceptance gate enforced in TraineeAllocationService.
    // The invariants are the same ones that path enforces.
    await this.assertRotationTargetsUsable(dto, user, scope);

    const rotation = await this.prisma.rotation.create({
      data: {
        organizationId: user.organizationId,
        traineeProfileId: dto.traineeProfileId,
        departmentId: dto.departmentId,
        trainerProfileId: dto.trainerProfileId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        status: dto.status || 'active',
      },
      include: {
        department: true,
        traineeProfile: { include: { person: true } },
        trainerProfile: { include: { person: true } },
      },
    });
    return { success: true, data: rotation };
  }

  @Patch(':id')
  @RequireCapability(
    CAPABILITIES.ALLOCATION_HOSPITAL_ASSIGN,
    CAPABILITIES.ALLOCATION_HOSPITAL_REASSIGN,
  )
  @ScopedResource('rotation', 'id')
  @ApiOperation({ summary: 'تعديل بيانات روتيشن (القسم / المدرب / التواريخ / الحالة)' })
  async updateRotation(
    @Param('id') id: string,
    @Body() dto: {
      departmentId?: string;
      trainerProfileId?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
    },
  ) {
    // ScopeGuard proved the caller may touch *this* rotation. It says nothing
    // about the ids in the body: a Hospital A supervisor could take their own
    // rotation and patch in a Hospital B trainer or department, moving another
    // hospital's staff onto their rotation. The replacements are therefore
    // checked against the rotation's own hospital, read from the database.
    // `traineeProfileId` and `organizationId` are absent from the DTO by
    // design — the trainee and the hospital of a rotation are immutable here.
    await this.assertRotationEditTargetsUsable(id, dto);

    const rotation = await this.prisma.rotation.update({
      where: { id },
      data: {
        departmentId: dto.departmentId,
        trainerProfileId: dto.trainerProfileId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        status: dto.status,
      },
      include: {
        department: true,
        traineeProfile: { include: { person: true } },
        trainerProfile: { include: { person: true } },
      },
    });
    return { success: true, data: rotation };
  }

  @Delete(':id')
  @RequireCapability(
    CAPABILITIES.ALLOCATION_HOSPITAL_ASSIGN,
    CAPABILITIES.ALLOCATION_HOSPITAL_REASSIGN,
  )
  @ScopedResource('rotation', 'id')
  @ApiOperation({ summary: 'حذف روتيشن' })
  async deleteRotation(@Param('id') id: string) {
    await this.prisma.rotation.delete({ where: { id } });
    return { success: true, message: 'تم حذف الروتيشن' };
  }

  // ─── Departments Endpoints ───────────────────────────────────────────────
  @Get('departments')
  @RequireCapability(
    CAPABILITIES.DEPARTMENT_MANAGE,
    CAPABILITIES.CAPACITY_VIEW,
    CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
    CAPABILITIES.TRAINEE_VIEW_DEPARTMENT,
  )
  @ApiOperation({ summary: 'قائمة الأقسام السريرية وطاقتها الاستيعابية' })
  async getDepartments(
    @CurrentUser() user: IAuthenticatedUser,
    @Query('organizationId') organizationId?: string,
  ) {
    const targetOrgId = organizationId || user.organizationId;
    const departments = await this.prisma.department.findMany({
      where: { organizationId: targetOrgId, isActive: true, deletedAt: null },
      include: {
        _count: { select: { rotations: true, trainerProfiles: true } },
      },
      orderBy: { nameAr: 'asc' },
    });
    return { data: departments };
  }

  @Post('departments')
  @RequireCapability(CAPABILITIES.DEPARTMENT_MANAGE, CAPABILITIES.CAPACITY_MANAGE)
  @ApiOperation({ summary: 'إنشاء قسم سريري جديد' })
  async createDepartment(
    @CurrentUser() user: IAuthenticatedUser,
    @Body()
    dto: {
      nameAr: string;
      nameEn?: string;
      code?: string;
      capacity?: number;
      startDate?: string;
      endDate?: string;
      trainingPeriod?: string;
    },
  ) {
    if (!dto.nameAr || !dto.nameAr.trim()) {
      throw new BadRequestException('اسم القسم مطلوب');
    }
    if (dto.capacity !== undefined && dto.capacity < 1) {
      throw new BadRequestException('عدد المقاعد يجب أن يكون 1 على الأقل');
    }
    if (dto.startDate && dto.endDate && dto.startDate > dto.endDate) {
      throw new BadRequestException('تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية');
    }

    const settings: Record<string, any> = {};
    if (dto.startDate) settings.startDate = dto.startDate;
    if (dto.endDate) settings.endDate = dto.endDate;
    if (dto.trainingPeriod) settings.trainingPeriod = dto.trainingPeriod;

    const dept = await this.prisma.department.create({
      data: {
        organizationId: user.organizationId,
        nameAr: dto.nameAr.trim(),
        nameEn: dto.nameEn,
        code: dto.code || dto.nameAr.trim().toUpperCase().slice(0, 10),
        capacity: dto.capacity ?? 10,
        settings,
      },
    });
    return { success: true, data: dept };
  }

  @Patch('departments/:id')
  @RequireCapability(CAPABILITIES.DEPARTMENT_MANAGE)
  @ScopedResource('department', 'id')
  @ApiOperation({ summary: 'تحديث بيانات القسم والطاقة الاستيعابية' })
  async updateDepartment(
    @Param('id') id: string,
    @Body() dto: { nameAr?: string; nameEn?: string; capacity?: number; isActive?: boolean },
  ) {
    const dept = await this.prisma.department.update({
      where: { id },
      data: dto,
    });
    return { success: true, data: dept };
  }

  @Delete('departments/:id')
  @RequireCapability(CAPABILITIES.DEPARTMENT_MANAGE)
  @ScopedResource('department', 'id')
  @ApiOperation({ summary: 'حذف قسم سريري (رفض عند الارتباط بسجلات قائمة، تعطيل ناعم عند خلوّه)' })
  async deleteDepartment(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    // Never a hard delete. Rotations, trainer profiles, allocations, shifts and
    // case logs all reference the department, so deleting the row would trip a
    // foreign key and orphan every record that names it. First count the live
    // relations — any positive count blocks the delete and the caller is told
    // exactly which relations stand in the way (and the reason is logged). A
    // pristine department is still removed softly (isActive=false + deletedAt) so
    // historical references keep resolving and the record stays in audit history.
    const dept = await this.prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            caseLogs: true,
            clinicalPrivileges: true,
            commonMistakes: true,
            objectives: true,
            orgAssignments: true,
            rotations: true,
            shifts: true,
            trainerCalls: true,
            trainerProfiles: true,
            trainerReassignments: true,
            trainingRequestTrainees: true,
            traineeAllocations: true,
          },
        },
      },
    });
    if (!dept) throw new NotFoundException('القسم غير موجود');

    const counts = dept._count as Record<string, number>;
    const blockingRelations: Array<[string, number]> = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]) as Array<[string, number]>;

    if (blockingRelations.length > 0) {
      for (const [relation, count] of blockingRelations) {
        console.log(
          `DELETE BLOCKED BY EXISTING RELATION → Relation: ${relation} (count=${count}) — department ${id}`,
        );
      }
      throw new ConflictException(
        `لا يمكن حذف هذا القسم لارتباطه بسجلات قائمة (${blockingRelations
          .map(([r, n]) => `${r}: ${n}`)
          .join('، ')}).`,
      );
    }

    const updated = await this.prisma.department.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date(), deletedById: user.accountId },
    });
    return { success: true, message: 'تم حذف القسم', data: updated };
  }
}
