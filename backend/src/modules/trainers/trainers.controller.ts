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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import {
  CAPABILITIES,
  CapabilityGuard,
  RequireCapability,
  Scope,
  ScopeContext,
  ScopeGuard,
  ScopedResource,
} from '../../common/authz';
import { IAuthenticatedUser } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import { TrainerReassignmentService } from './trainer-reassignment.service';
import { TrainerLeaveService } from './trainer-leave.service';
import { TrainerQualificationService } from './trainer-qualification.service';
import { UserAccountsService } from '../user-accounts/user-accounts.service';

@ApiTags('Trainers (المدربون)')
@Controller('trainers')
// Trainer management is hospital training operations. `hospital_administrator`
// held every route here — including the reassignment routes, which move trainees
// between trainers and departments — so the hospital director could run training
// through this controller even after being removed from the others.
@UseGuards(JwtAuthGuard, CapabilityGuard, ScopeGuard)
@ApiBearerAuth('JWT-auth')
export class TrainersController {
  constructor(
    private prisma: PrismaService,
    private reassignmentService: TrainerReassignmentService,
    private leaveService: TrainerLeaveService,
    private qualificationService: TrainerQualificationService,
    private userAccountsService: UserAccountsService,
  ) {}

  // ─── Program Qualification ──────────────────────────────────────────────────
  // Registered before the parameterised trainer routes below so that the literal
  // segments are not swallowed by ':id'.

  /**
   * Create a trainer, account and all, inside the caller's own hospital.
   *
   * The hospital training administration is the role that staffs its own
   * departments, but it had no way to do this: `POST /user-accounts` is gated on
   * `manage_users`, which it does not hold, and no trainer-creation route
   * existed at all. So a hospital could be given trainees it had no way to
   * assign a trainer to, and every trainer had to be minted by the platform.
   *
   * Nothing here duplicates the account service — it delegates to the same
   * `UserAccountsService.create` every other account goes through, and gets its
   * duplicate-email, duplicate-person and activation handling for free. What
   * this route adds is the two things that must not come from the client:
   *
   *   role  — pinned to 'trainer'. A `roleCode` in the body is ignored, so this
   *           route can never mint a cluster or platform account, whatever the
   *           caller sends.
   *   scope — pinned to the caller's own organisation. A `hospitalId` in the
   *           body is ignored, so a hospital supervisor cannot staff another
   *           hospital.
   *
   * The password is never chosen here: the account service issues an activation
   * token and a random unusable hash, so the trainer sets their own password
   * through the activation link before they can sign in. That is the
   * first-login-forces-password-change requirement, and it is stronger than a
   * shared temporary password because no one but the trainer ever knows it.
   */
  @Post()
  @RequireCapability(CAPABILITIES.TRAINER_MANAGE)
  @ApiOperation({ summary: 'إضافة مدرب جديد بحساب دخول — ضمن مستشفى المشرف فقط' })
  async createTrainer(
    @CurrentUser() user: IAuthenticatedUser,
    @Body()
    dto: {
      nameAr?: string;
      nameEn?: string;
      nationalId?: string;
      email?: string;
      phone?: string;
      departmentId?: string;
      specialization?: string;
      titleAr?: string;
      maxTrainees?: number;
    },
  ) {
    const email = dto.email?.trim().toLowerCase();
    if (!email) throw new BadRequestException('البريد الإلكتروني للمدرب مطلوب');
    if (!dto.nameAr?.trim()) throw new BadRequestException('اسم المدرب بالعربية مطلوب');

    const hospitalId = user.organizationId;
    if (!hospitalId) throw new BadRequestException('تعذّر تحديد مستشفى المشرف');

    // A department, when named, must be one of this hospital's own. Without
    // this the trainer could be filed under another hospital's department.
    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, organizationId: hospitalId, deletedAt: null },
        select: { id: true },
      });
      if (!department) {
        throw new ForbiddenException('القسم المحدد لا يتبع مستشفاك');
      }
    }

    // A person may hold only one trainer profile — the schema makes personId
    // unique on TrainerProfile, and a raw insert would surface that as a 500.
    const existingByNationalId = dto.nationalId?.trim()
      ? await this.prisma.person.findUnique({
          where: { nationalId: dto.nationalId.trim() },
          include: { trainerProfile: { select: { id: true, organizationId: true } } },
        })
      : null;
    if (existingByNationalId?.trainerProfile) {
      throw new ConflictException(
        existingByNationalId.trainerProfile.organizationId === hospitalId
          ? 'هذا الشخص مسجل كمدرب في مستشفاك بالفعل'
          : 'هذا الشخص مسجل كمدرب في جهة أخرى — يلزم نقله عبر إعادة الإسناد',
      );
    }

    // Role and scope are pinned, not taken from the body.
    const created = await this.userAccountsService.create(
      {
        email,
        nameAr: dto.nameAr.trim(),
        nameEn: dto.nameEn?.trim(),
        nationalId: dto.nationalId?.trim(),
        phone: dto.phone?.trim(),
        roleCode: 'trainer',
        hospitalId,
      } as never,
      user,
    );

    const account = await this.prisma.userAccount.findUnique({
      where: { id: created.account.id },
      select: { personId: true },
    });
    if (!account) throw new BadRequestException('تعذّر إنشاء حساب المدرب');

    const profile = await this.prisma.trainerProfile.create({
      data: {
        personId: account.personId,
        organizationId: hospitalId,
        departmentId: dto.departmentId ?? null,
        specialization: dto.specialization?.trim() || null,
        titleAr: dto.titleAr?.trim() || null,
        maxTrainees: dto.maxTrainees ?? 5,
        createdById: user.accountId,
      },
      include: { person: true, department: true },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: hospitalId,
        actorId: user.accountId,
        action: 'trainer.create',
        entityType: 'TrainerProfile',
        entityId: profile.id,
        newValues: {
          email,
          hospitalId,
          departmentId: profile.departmentId,
          roleCode: 'trainer',
        } as never,
      },
    });

    return {
      success: true,
      data: { trainer: profile, activationLink: created.activationLink },
      message: 'تم إنشاء المدرب وحسابه — أُرسل رابط التفعيل لتعيين كلمة المرور عند أول دخول',
    };
  }

  @Get('workspace-cards')
  @RequireCapability(
    CAPABILITIES.TRAINER_MANAGE,
    CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
    CAPABILITIES.TRAINEE_VIEW_DEPARTMENT,
  )
  @ApiOperation({
    summary:
      'بطاقات المدربين لمساحة عمل المستشفى — التأهيل والسعة والإشغال والإجازة',
  })
  async workspaceCards(
    @CurrentUser() user: IAuthenticatedUser,
    @Query('organizationId') organizationId?: string,
    @Scope() scope?: ScopeContext,
  ) {
    const targetOrgId = organizationId || user.organizationId;
    if (scope && scope.visibleOrgIds !== null && !scope.visibleOrgIds.includes(targetOrgId)) {
      throw new ForbiddenException('هذه الجهة خارج نطاق صلاحياتك التنظيمية');
    }
    return this.qualificationService.listWorkspaceCards(targetOrgId);
  }

  @Get('qualified')
  @RequireCapability(
    CAPABILITIES.TRAINER_MANAGE,
    CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
    CAPABILITIES.TRAINEE_VIEW_DEPARTMENT,
  )
  @ApiOperation({ summary: 'المدربون المؤهلون لبرنامج تدريبي في الجهة' })
  async listQualifiedTrainers(
    @Query('programId') programId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Query('organizationId') organizationId?: string,
    @Scope() scope?: ScopeContext,
  ) {
    const targetOrgId = organizationId || user.organizationId;
    if (scope && scope.visibleOrgIds !== null && !scope.visibleOrgIds.includes(targetOrgId)) {
      throw new ForbiddenException('هذه الجهة خارج نطاق صلاحياتك التنظيمية');
    }
    return this.qualificationService.listQualifiedTrainers(
      targetOrgId,
      programId,
    );
  }

  @Get(':id/qualifications')
  @RequireCapability(
    CAPABILITIES.TRAINER_MANAGE,
    CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
    CAPABILITIES.TRAINEE_VIEW_DEPARTMENT,
  )
  @ScopedResource('trainerProfile', 'id')
  @ApiOperation({ summary: 'برامج المدرب المؤهل لها مع السعة والإشغال' })
  async listQualifications(@Param('id') trainerProfileId: string) {
    return this.qualificationService.listForTrainer(trainerProfileId);
  }

  @Post(':id/qualifications')
  @RequireCapability(CAPABILITIES.TRAINER_MANAGE)
  @ScopedResource('trainerProfile', 'id')
  @ApiOperation({ summary: 'تأهيل مدرب لبرنامج تدريبي' })
  async addQualification(
    @Param('id') trainerProfileId: string,
    @Body() dto: { programId: string; maxTrainees?: number },
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.qualificationService.addQualification(
      trainerProfileId,
      dto,
      user,
    );
  }

  @Patch('qualifications/:qualificationId')
  @RequireCapability(CAPABILITIES.TRAINER_MANAGE)
  @ApiOperation({ summary: 'تعديل سعة أو حالة تأهيل المدرب' })
  async updateQualification(
    @Param('qualificationId') qualificationId: string,
    @Body() dto: { maxTrainees?: number; isActive?: boolean },
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.qualificationService.updateQualification(
      qualificationId,
      dto,
      user,
    );
  }

  @Delete('qualifications/:qualificationId')
  @RequireCapability(CAPABILITIES.TRAINER_MANAGE)
  @ApiOperation({ summary: 'حذف تأهيل مدرب لبرنامج' })
  async removeQualification(
    @Param('qualificationId') qualificationId: string,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.qualificationService.removeQualification(qualificationId, user);
  }

  @Patch(':id')
  @RequireCapability(CAPABILITIES.TRAINER_MANAGE)
  @ScopedResource('trainerProfile', 'id')
  @ApiOperation({ summary: 'تعديل بيانات وأهلية وسعة المدرب' })
  async updateTrainerProfile(
    @Param('id') id: string,
    @Body() dto: { isActive?: boolean; maxTrainees?: number; departmentId?: string; titleAr?: string },
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.qualificationService.updateTrainerProfile(id, dto, user);
  }

  // ─── Profile Endpoints ──────────────────────────────────────────────────────

  /** Own profile — scoped by the caller's own account, so it needs no capability. */
  @Get('me')
  async getMyProfile(@CurrentUser() user: IAuthenticatedUser) {
    let profile = await this.prisma.trainerProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
      include: { person: true, organization: true, department: true },
    });
    if (!profile && user.personId) {
      profile = await this.prisma.trainerProfile.findFirst({
        where: { personId: user.personId },
        include: { person: true, organization: true, department: true },
      });
    }
    if (!profile && user.roles.includes('trainer') && user.personId && user.organizationId) {
      profile = await this.prisma.trainerProfile.create({
        data: {
          personId: user.personId,
          organizationId: user.organizationId,
          maxTrainees: 5,
        },
        include: { person: true, organization: true, department: true },
      });
    }
    if (!profile) return { data: null, message: 'لا يوجد ملف مدرب لهذا الحساب' };
    return { data: profile };
  }

  /**
   * The trainer roster is a training resource, not a staff directory: it is who
   * supervises trainees and how loaded they are. `org_member.view` is deliberately
   * NOT accepted here — the hospital director holds it, and accepting it would let
   * them back into training data through a read. General staff listings live at
   * /org-members.
   */
  @Get()
  @RequireCapability(
    CAPABILITIES.TRAINER_MANAGE,
    CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
    CAPABILITIES.TRAINEE_VIEW_DEPARTMENT,
  )
  async findAll(@CurrentUser() user: IAuthenticatedUser) {
    const trainers = await this.prisma.trainerProfile.findMany({
      where: { organizationId: user.organizationId },
      include: {
        person: true,
        department: true,
        _count: { select: { rotations: { where: { status: 'active' } } } },
      },
    });
    return { data: trainers };
  }

  // ─── Reassignment Endpoints ─────────────────────────────────────────────────

  @Post('reassign')
  @RequireCapability(CAPABILITIES.ALLOCATION_HOSPITAL_REASSIGN)
  @ApiOperation({ summary: 'إعادة إسناد متدرب واحد إلى مدرب آخر' })
  async reassignSingle(
    @CurrentUser() user: IAuthenticatedUser,
    @Body()
    dto: {
      traineeProfileId: string;
      rotationId: string;
      newTrainerId: string;
      reason: string;
      notes?: string;
      trainerLeaveId?: string;
    },
  ) {
    return this.reassignmentService.reassignSingle(
      dto,
      user.accountId,
      user.organizationId,
    );
  }

  @Post('reassign-bulk')
  @RequireCapability(CAPABILITIES.ALLOCATION_HOSPITAL_REASSIGN)
  @ApiOperation({ summary: 'إعادة إسناد عدة متدربين إلى مدرب آخر' })
  async reassignBulk(
    @CurrentUser() user: IAuthenticatedUser,
    @Body()
    dto: {
      traineeProfileIds: string[];
      newTrainerId: string;
      reason: string;
      notes?: string;
      trainerLeaveId?: string;
    },
  ) {
    return this.reassignmentService.reassignMultiple(
      dto,
      user.accountId,
      user.organizationId,
    );
  }

  @Post('reassign-trainer')
  @RequireCapability(CAPABILITIES.ALLOCATION_HOSPITAL_REASSIGN)
  @ApiOperation({ summary: 'نقل جميع متدربي مدرب إلى مدرب آخر' })
  async reassignEntireTrainer(
    @CurrentUser() user: IAuthenticatedUser,
    @Body()
    dto: {
      fromTrainerId: string;
      toTrainerId: string;
      reason: string;
      notes?: string;
      trainerLeaveId?: string;
    },
  ) {
    return this.reassignmentService.reassignEntireTrainer(
      dto,
      user.accountId,
      user.organizationId,
    );
  }

  @Post('reassign-department')
  @RequireCapability(CAPABILITIES.ALLOCATION_HOSPITAL_REASSIGN)
  @ApiOperation({ summary: 'نقل جميع متدربي قسم إلى مدرب آخر' })
  async reassignEntireDepartment(
    @CurrentUser() user: IAuthenticatedUser,
    @Body()
    dto: {
      departmentId: string;
      fromTrainerId?: string;
      toTrainerId: string;
      reason: string;
      notes?: string;
    },
  ) {
    return this.reassignmentService.reassignEntireDepartment(
      dto,
      user.accountId,
      user.organizationId,
    );
  }

  @Get(':id/suggest-replacements')
  @RequireCapability(
    CAPABILITIES.TRAINER_MANAGE,
    CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
    CAPABILITIES.TRAINEE_VIEW_DEPARTMENT,
  )
  @ScopedResource('trainerProfile', 'id')
  @ApiOperation({
    summary: 'اقتراح مدربين بدلاء مؤهلين (مرتبين حسب السعة المتاحة)',
  })
  async suggestReplacements(@Param('id') id: string) {
    return this.reassignmentService.suggestReplacements(id);
  }

  @Get('reassignment-history')
  @RequireCapability(
    CAPABILITIES.ALLOCATION_HOSPITAL_REASSIGN,
    CAPABILITIES.TIMELINE_VIEW,
  )
  @ApiOperation({ summary: 'سجل عمليات إعادة الإسناد (audit trail)' })
  async getReassignmentHistory(
    @CurrentUser() user: IAuthenticatedUser,
    @Query('trainerProfileId') trainerProfileId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reassignmentService.getReassignmentHistory({
      organizationId: user.organizationId,
      trainerProfileId,
      departmentId,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  // ─── Leave Endpoints ────────────────────────────────────────────────────────

  @Post('leaves')
  @RequireCapability(
    CAPABILITIES.TRAINER_MANAGE,
    CAPABILITIES.TRAINEE_VIEW_ASSIGNED,
  )
  @ApiOperation({ summary: 'تسجيل إجازة مدرب جديدة' })
  async createLeave(
    @CurrentUser() user: IAuthenticatedUser,
    @Body()
    dto: {
      trainerProfileId: string;
      leaveType: string;
      startDate: string;
      endDate: string;
      reason?: string;
      replacementTrainerId?: string;
    },
  ) {
    return this.leaveService.createLeave(
      dto,
      user.accountId,
      user.organizationId,
    );
  }

  @Get('leaves')
  @RequireCapability(
    CAPABILITIES.TRAINER_MANAGE,
    CAPABILITIES.TRAINEE_VIEW_ASSIGNED,
  )
  @ApiOperation({ summary: 'قائمة إجازات المدربين في المستشفى' })
  async getLeaves(
    @CurrentUser() user: IAuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.leaveService.getLeaves(user.organizationId, status);
  }

  @Get('leaves/upcoming')
  @RequireCapability(
    CAPABILITIES.TRAINER_MANAGE,
    CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
    CAPABILITIES.TRAINEE_VIEW_ASSIGNED,
  )
  @ApiOperation({ summary: 'الإجازات القادمة خلال 30 يوماً' })
  async getUpcomingLeaves(
    @CurrentUser() user: IAuthenticatedUser,
    @Query('days') days?: string,
  ) {
    return this.leaveService.getUpcomingLeaves(
      user.organizationId,
      days ? parseInt(days) : 30,
    );
  }

  @Patch('leaves/:id/approve')
  @RequireCapability(CAPABILITIES.TRAINER_MANAGE)
  @ApiOperation({ summary: 'الموافقة على إجازة مدرب' })
  async approveLeave(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.leaveService.approveLeave(
      id,
      user.accountId,
      user.organizationId,
    );
  }

  @Patch('leaves/:id/cancel')
  @RequireCapability(CAPABILITIES.TRAINER_MANAGE)
  @ApiOperation({ summary: 'إلغاء إجازة مدرب' })
  async cancelLeave(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.leaveService.cancelLeave(id, user.accountId, user.organizationId);
  }
}
