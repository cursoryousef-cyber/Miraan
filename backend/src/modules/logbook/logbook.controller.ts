import { Controller, Get, Post, Body, Param, Patch, Put, Query, UseGuards, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, RequireRoles } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeContextService } from '../../common/authz';
import { CreateLogEntryDto } from './dto/create-log-entry.dto';

@ApiTags('Clinical Logbook & Competencies (السجل السريري وحقيبة الكفاءات)')
@Controller('logbook')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class LogbookController {
  constructor(
    private prisma: PrismaService,
    private scopeContext: ScopeContextService,
  ) {}

  /**
   * Every role reaches this by a different rule, but none may be skipped —
   * the previous version bypassed the check entirely for anyone holding a
   * supervisory/admin role (including a user with BOTH 'trainer' and any of
   * those roles), which meant no scoping at all for hospital_training_admin,
   * cluster_administrator, training_director and
   * academic_supervisor.
   *
   *   trainer            → only a trainee currently assigned to them (open
   *                         TraineeAllocation or active/scheduled Rotation).
   *   trainee             → only themself.
   *   everyone else        → ScopeContextService.visibleOrgIds — a hospital
   *                         role sees only its own hospital, a cluster role
   *                         sees its cluster and the hospitals beneath it,
   *                         platform roles are unrestricted. This is the same
   *                         resolver every other correctly-scoped endpoint in
   *                         the codebase uses — nothing bespoke here.
   */
  /**
   * A graduated trainee's file is closed. `TraineeProfile.isLocked` is set the
   * moment graduation completes, and this refuses any further clinical write
   * against it — new entries, approvals, rejections or competency edits.
   * Nothing already recorded is touched; the history stays readable.
   */
  private async assertProfileNotLocked(traineeProfileId: string): Promise<void> {
    const profile = await this.prisma.traineeProfile.findUnique({
      where: { id: traineeProfileId },
      select: { isLocked: true },
    });
    if (profile?.isLocked) {
      throw new ForbiddenException('ملف المتدرب مغلق بعد التخرج — لا يمكن إضافة أو تعديل السجلات السريرية');
    }
  }

  /**
   * The role a sign-off is recorded under. The approve path already derived
   * this from the roles the caller actually holds; the reject and
   * request-modification paths used `roles[0]`, so the same account signed as
   * different roles depending on the order the JWT happened to list them —
   * an account holding [academic_supervisor, trainer] recorded its rejections
   * as academic even when it was acting as the trainer, and any account whose
   * first role was unrelated signed as the literal 'reviewer'. The signature
   * ledger is audit evidence, so it must not depend on array order.
   */
  private signerRoleFor(user: IAuthenticatedUser): string {
    if (user.roles?.includes('academic_supervisor')) return 'academic_supervisor';
    if (user.roles?.includes('trainer')) return 'trainer';
    return user.roles?.[0] || 'reviewer';
  }

  private async assertTrainerScope(user: IAuthenticatedUser, traineeProfileId: string): Promise<void> {
    if (user.roles.includes('platform_owner')) return;

    const isSupervisor = user.roles.some((r) =>
      ['hospital_training_admin', 'org_manager', 'academic_supervisor', 'cluster_administrator', 'training_director'].includes(r),
    );

    if (user.roles.includes('trainer') && !isSupervisor) {
      let trainer = await this.prisma.trainerProfile.findFirst({
        where: {
          OR: [
            { person: { userAccounts: { some: { id: user.accountId } } } },
            ...(user.personId ? [{ personId: user.personId }] : []),
          ],
        },
      });
      if (!trainer && user.personId) {
        trainer = await this.prisma.trainerProfile.create({
          data: {
            personId: user.personId,
            organizationId: user.organizationId,
            maxTrainees: 5,
          },
        });
      }
      if (!trainer) throw new ForbiddenException('لا يوجد ملف مدرب مرتبط بهذا الحساب');

      const assigned =
        (await this.prisma.traineeAllocation.findFirst({
          where: { traineeProfileId, trainerProfileId: trainer.id, status: 'open' },
        })) ||
        (await this.prisma.rotation.findFirst({
          where: { traineeProfileId, trainerProfileId: trainer.id, status: { in: ['scheduled', 'active', 'completed'] } },
        })) ||
        (this.prisma.scheduleSession?.findFirst
          ? await this.prisma.scheduleSession.findFirst({
              where: { traineeProfileId, trainerProfileId: trainer.id },
            })
          : null);
      if (!assigned) {
        throw new ForbiddenException('غير مصرح لك بالوصول لبيانات متدرب غير مسند إليك');
      }
      return;
    }

    if (user.roles.includes('trainee') && !isSupervisor) {
      const own = await this.prisma.traineeProfile.findFirst({
        where: {
          OR: [
            { person: { userAccounts: { some: { id: user.accountId } } } },
            ...(user.personId ? [{ personId: user.personId }] : []),
          ],
        },
      });
      if (own?.id !== traineeProfileId) {
        throw new ForbiddenException('غير مصرح بالوصول لبيانات متدرب آخر');
      }
      return;
    }

    const profile = await this.prisma.traineeProfile.findUnique({
      where: { id: traineeProfileId },
      select: { organizationId: true },
    });
    if (!profile) throw new BadRequestException('المتدرب غير موجود');
    const scope = await this.scopeContext.resolve(user);
    this.scopeContext.assertOrgInScope(scope, profile.organizationId);
  }

  // ─── 1. مكتبة الإجراءات الطبية (Procedures Catalog) ──────────────────────
  @Get('procedures')
  @RequireRoles('trainee', 'trainer', 'hospital_training_admin', 'academic_supervisor', 'cluster_administrator', 'training_director', 'org_manager', 'platform_owner')
  @ApiOperation({ summary: 'استعراض مكتبة الإجراءات والمهارات السريرية المتاحة' })
  async getProcedures(@Query('category') category?: string, @Query('includeInactive') includeInactive?: string) {
    const where: any = {};
    if (includeInactive !== 'true') {
      where.isActive = true;
    }
    if (category) where.category = category;

    const procedures = await this.prisma.procedureCatalog.findMany({
      where,
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });
    return { data: procedures };
  }

  @Post('procedures')
  @RequireRoles('org_manager', 'platform_owner', 'academic_supervisor', 'hospital_training_admin', 'cluster_administrator', 'training_director')
  @ApiOperation({ summary: 'إضافة إجراء سريري جديد لمكتبة الإجراءات' })
  async createProcedure(@Body() dto: { code: string; titleAr: string; titleEn: string; category: string; minRequired?: number; descriptionAr?: string }) {
    const proc = await this.prisma.procedureCatalog.create({
      data: {
        code: dto.code,
        titleAr: dto.titleAr,
        titleEn: dto.titleEn,
        category: dto.category,
        minRequired: dto.minRequired || 5,
        descriptionAr: dto.descriptionAr,
      },
    });
    return { success: true, procedure: proc };
  }

  @Patch('procedures/:id')
  @RequireRoles('org_manager', 'platform_owner', 'academic_supervisor', 'hospital_training_admin', 'cluster_administrator', 'training_director')
  @ApiOperation({ summary: 'تعديل بيانات إجراء سريري في المكتبة' })
  async updateProcedure(
    @Param('id') id: string,
    @Body() dto: { code?: string; titleAr?: string; titleEn?: string; category?: string; minRequired?: number; descriptionAr?: string; isActive?: boolean }
  ) {
    const proc = await this.prisma.procedureCatalog.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.titleAr !== undefined ? { titleAr: dto.titleAr } : {}),
        ...(dto.titleEn !== undefined ? { titleEn: dto.titleEn } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.minRequired !== undefined ? { minRequired: dto.minRequired } : {}),
        ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    return { success: true, procedure: proc };
  }

  @Patch('procedures/:id/deactivate')
  @RequireRoles('org_manager', 'platform_owner', 'academic_supervisor', 'hospital_training_admin', 'cluster_administrator', 'training_director')
  @ApiOperation({ summary: 'تعطيل / تفعيل إجراء سريري (Soft Delete/Deactivate)' })
  async toggleProcedureActive(@Param('id') id: string, @Body() dto: { isActive: boolean }) {
    const proc = await this.prisma.procedureCatalog.update({
      where: { id },
      data: { isActive: dto.isActive },
    });
    return { success: true, procedure: proc };
  }

  // ─── 2. سجل الحالات والإجراءات للمتدرب (Case & Procedure Logs) ─────────────
  @Get('my-logs')
  @RequireRoles('trainee', 'trainer', 'hospital_training_admin', 'cluster_administrator', 'cluster_manager', 'training_director', 'platform_owner', 'org_manager')
  @ApiOperation({ summary: 'عرض سجل الحالات والإجراءات الخاصة بالمتدرب الحالي أو المدرب/المشرف' })
  async getMyLogs(@CurrentUser() user: IAuthenticatedUser) {
    if (user.roles.includes('hospital_administrator')) {
      return { data: [] };
    }

    const isTrainee = user.roles.includes('trainee');
    const isTrainer = user.roles.includes('trainer');

    if (isTrainee) {
      const profile = await this.prisma.traineeProfile.findFirst({
        where: { person: { userAccounts: { some: { id: user.accountId } } } },
      });
      if (!profile) return { data: [] };

      const logs = await this.prisma.clinicalCaseLog.findMany({
        where: { traineeProfileId: profile.id },
        include: {
          procedure: true,
          department: true,
          trainerProfile: { include: { person: true } },
          signoffs: { include: { signer: { include: { person: true } } } },
        },
        orderBy: { performedAt: 'desc' },
      });
      return { data: logs };
    }

    if (isTrainer) {
      const trainer = await this.prisma.trainerProfile.findFirst({
        where: { person: { userAccounts: { some: { id: user.accountId } } } },
      });
      if (!trainer) return { data: [] };

      const logs = await this.prisma.clinicalCaseLog.findMany({
        where: {
          OR: [
            { trainerProfileId: trainer.id },
            { traineeProfile: { rotations: { some: { trainerProfileId: trainer.id } } } },
          ],
        },
        include: {
          traineeProfile: { include: { person: true } },
          procedure: true,
          department: true,
          trainerProfile: { include: { person: true } },
          signoffs: { include: { signer: { include: { person: true } } } },
        },
        orderBy: { performedAt: 'desc' },
      });
      return { data: logs };
    }

    // Supervisors and admins
    const logs = await this.prisma.clinicalCaseLog.findMany({
      where: { organizationId: user.organizationId },
      include: {
        traineeProfile: { include: { person: true } },
        procedure: true,
        department: true,
        trainerProfile: { include: { person: true } },
        signoffs: { include: { signer: { include: { person: true } } } },
      },
      orderBy: { performedAt: 'desc' },
    });
    return { data: logs };
  }

  @Get('trainee-logs/:traineeId')
  @RequireRoles('trainer', 'academic_supervisor', 'hospital_training_admin', 'cluster_administrator', 'cluster_manager', 'training_director', 'org_manager', 'platform_owner')
  @ApiOperation({ summary: 'عرض سجل الحالات لمتدرب محدد — للمدرب والمشرف الأكاديمي' })
  async getTraineeLogs(@Param('traineeId') traineeId: string, @CurrentUser() user: IAuthenticatedUser) {
    await this.assertTrainerScope(user, traineeId);
    const logs = await this.prisma.clinicalCaseLog.findMany({
      where: { traineeProfileId: traineeId },
      include: {
        procedure: true,
        department: true,
        trainerProfile: { include: { person: true } },
        signoffs: { include: { signer: { include: { person: true } } } },
      },
      orderBy: { performedAt: 'desc' },
    });

    return { data: logs };
  }

  // `trainee` is deliberately absent: a trainee does not author their own
  // clinical log. `/logbook/cases` is an alias that calls straight into this
  // method, so gating only that alias left this — the real endpoint — open to
  // any trainee calling it directly, regardless of the hidden UI button.
  @Post('entries')
  @RequireRoles('trainer', 'hospital_training_admin', 'cluster_administrator', 'cluster_manager', 'training_director', 'platform_owner', 'org_manager')
  @ApiOperation({ summary: 'تسجيل حالة سريرية أو إجراء طبي جديد' })
  async createLogEntry(
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: CreateLogEntryDto,
  ) {
    if (user.roles.includes('hospital_administrator')) {
      throw new ForbiddenException('غير مصرح لمدير المستشفى الإداري بالوصول إلى العمليات التدريبية');
    }

    if (!dto.diagnosis?.trim()) {
      throw new BadRequestException('التشخيص أو وصف الحالة إلزامي');
    }

    const isTrainee = user.roles.includes('trainee');
    const isTrainer = user.roles.includes('trainer');

    let targetTraineeId: string | undefined = dto.traineeProfileId;
    let trainerProfileId: string | undefined;

    if (isTrainee) {
      const profile = await this.prisma.traineeProfile.findFirst({
        where: { person: { userAccounts: { some: { id: user.accountId } } } },
      });
      if (!profile) throw new BadRequestException('لا يوجد ملف متدرب مراد بالتسجيل عليه');
      targetTraineeId = profile.id;
    } else if (isTrainer) {
      const trainer = await this.prisma.trainerProfile.findFirst({
        where: { person: { userAccounts: { some: { id: user.accountId } } } },
      });
      if (!trainer) throw new BadRequestException('لا يوجد ملف مدرب مرتبط بهذا الحساب');
      trainerProfileId = trainer.id;

      if (!targetTraineeId) {
        throw new BadRequestException('يرجى تحديد المتدرب المراد تسجيل الحالة له');
      }

      // Verify assignment guard
      const isAssigned = await this.prisma.traineeAllocation.findFirst({
        where: {
          traineeProfileId: targetTraineeId,
          trainerProfileId: trainer.id,
          status: 'open',
        },
      }) || await this.prisma.rotation.findFirst({
        where: {
          traineeProfileId: targetTraineeId,
          trainerProfileId: trainer.id,
          status: { in: ['scheduled', 'active'] },
        },
      });

      if (!isAssigned) {
        throw new ForbiddenException('غير مصرح للمدرب بإضافة حالة لمتدرب غير مسند إليه');
      }
    } else if (!targetTraineeId) {
      throw new BadRequestException('يرجى تحديد المتدرب المراد تسجيل الحالة له');
    }

    const profile = await this.prisma.traineeProfile.findUnique({
      where: { id: targetTraineeId },
    });
    if (!profile) throw new BadRequestException('ملف المتدرب غير موجود');
    await this.assertProfileNotLocked(profile.id);

    const activeRotation = await this.prisma.rotation.findFirst({
      where: { traineeProfileId: profile.id, status: 'active' },
    });

    const validProcedureId = dto.procedureId && dto.procedureId.trim() !== '' ? dto.procedureId : null;
    const parsedAge = typeof dto.patientAge === 'string' ? parseInt(dto.patientAge, 10) : dto.patientAge;

    const entry = await this.prisma.clinicalCaseLog.create({
      data: {
        organizationId: profile.organizationId,
        traineeProfileId: profile.id,
        trainerProfileId: activeRotation?.trainerProfileId ?? trainerProfileId ?? null,
        rotationId: activeRotation?.id ?? null,
        departmentId: activeRotation?.departmentId ?? null,
        procedureId: validProcedureId,
        diagnosis: dto.diagnosis,
        patientAge: isNaN(parsedAge as any) ? null : parsedAge ?? null,
        patientGender: dto.patientGender || null,
        specialtyAr: dto.specialtyAr || null,
        complexity: dto.complexity || 'medium',
        participationLevel: dto.participationLevel || 'performed',
        notes: dto.notes || null,
        evidenceUrls: dto.evidenceUrls || [],
        status: 'submitted',
        performedAt: new Date(),
      },
    });

    // تحديث نسبة الكفاءة والتقدم
    if (validProcedureId) {
      const comp = await this.prisma.competencyProgress.findUnique({
        where: { traineeProfileId_procedureId: { traineeProfileId: profile.id, procedureId: validProcedureId } },
      });
      if (comp) {
        const newCount = comp.completedCount + 1;
        await this.prisma.competencyProgress.update({
          where: { id: comp.id },
          data: {
            completedCount: newCount,
            status: newCount >= comp.requiredCount ? 'completed' : 'in_progress',
            lastUpdated: new Date(),
          },
        });
      } else {
        const proc = await this.prisma.procedureCatalog.findUnique({ where: { id: validProcedureId } });
        await this.prisma.competencyProgress.create({
          data: {
            traineeProfileId: profile.id,
            procedureId: validProcedureId,
            requiredCount: proc?.minRequired || 5,
            completedCount: 1,
            status: 1 >= (proc?.minRequired || 5) ? 'completed' : 'in_progress',
          },
        });
      }
    }

    return { success: true, entry };
  }

  @Get('cases')
  @RequireRoles('trainer', 'academic_supervisor', 'org_manager', 'platform_owner', 'hospital_training_admin', 'trainee')
  async getCases(@CurrentUser() user: IAuthenticatedUser) {
    const isTrainee = user.roles?.includes('trainee');
    const trainer = isTrainee ? null : await this.prisma.trainerProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
    });
    const traineeProfile = isTrainee ? await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
    }) : null;
    const logs = await this.prisma.clinicalCaseLog.findMany({
      where: {
        organizationId: user.organizationId,
        ...(trainer ? { trainerProfileId: trainer.id } : {}),
        ...(traineeProfile ? { traineeProfileId: traineeProfile.id } : {}),
      },
      include: {
        traineeProfile: { include: { person: true } },
        procedure: true,
        department: true,
        trainerProfile: { include: { person: true } },
        signoffs: { include: { signer: { include: { person: true } } } },
      },
      orderBy: { performedAt: 'desc' },
    });
    return { data: logs };
  }

  @Post('cases')
  @RequireRoles('trainer', 'academic_supervisor', 'hospital_training_admin', 'org_manager', 'platform_owner')
  async createCaseAlias(@CurrentUser() user: IAuthenticatedUser, @Body() dto: any) {
    return this.createLogEntry(user, dto);
  }

  // ─── 3. الاعتماد الإلكتروني (Digital Sign-off Workflow) ─────────────────────
  @Post('entries/:id/approve')
  @RequireRoles('trainer', 'academic_supervisor', 'org_manager', 'platform_owner')
  @ApiOperation({ summary: 'اعتماد حالة سريرية إلكترونياً من قبل المدرب أو المشرف الأكاديمي' })
  async approveLogEntry(
    @Param('id') logId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { feedback?: string; signatureUrl?: string }
  ) {
    const isAcademic = user.roles.includes('academic_supervisor');
    const isTrainer = user.roles.includes('trainer') || user.roles.includes('org_manager') || user.roles.includes('platform_owner');

    const nextStatus = isAcademic ? 'completed' : 'trainer_approved';

    const previous = await this.prisma.clinicalCaseLog.findUnique({ where: { id: logId } });
    if (!previous) throw new BadRequestException('السجل غير موجود');
    await this.assertTrainerScope(user, previous.traineeProfileId);
    await this.assertProfileNotLocked(previous.traineeProfileId);
    const updatedLog = await this.prisma.clinicalCaseLog.update({
      where: { id: logId },
      data: {
        status: nextStatus,
      },
    });

    await this.prisma.logbookSignoff.create({
      data: {
        caseLogId: logId,
        signerId: user.accountId,
        signerRole: isAcademic ? 'academic_supervisor' : 'trainer',
        signatureUrl: dto.signatureUrl ? (dto.signatureUrl.length > 500 ? dto.signatureUrl.slice(0, 500) : dto.signatureUrl) : null,
        feedback: dto.feedback,
        signedAt: new Date(),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.accountId,
        action: 'logbook.approve',
        entityType: 'ClinicalCaseLog',
        entityId: logId,
        oldValues: previous ? { status: previous.status } : undefined,
        newValues: { status: nextStatus },
      },
    });

    const trainee = await this.prisma.traineeProfile.findUnique({
      where: { id: previous.traineeProfileId },
      include: { person: { include: { userAccounts: { select: { id: true }, take: 1 } } } },
    });
    const traineeAccountId = trainee?.person?.userAccounts[0]?.id;
    if (traineeAccountId) {
      await this.prisma.notification.create({
        data: {
          organizationId: previous.organizationId,
          userId: traineeAccountId,
          titleAr: 'اعتماد سجل الحالة السريرية',
          titleEn: 'Clinical Case Log Approved',
          bodyAr: `تم اعتماد سجل الحالة السريرية (${previous.diagnosis})`,
          type: 'logbook_approved',
          referenceType: 'ClinicalCaseLog',
          referenceId: logId,
          sentVia: 'in_app',
        },
      }).catch(() => null);
    }

    return { success: true, log: updatedLog };
  }

  @Patch('entries/:id')
  @RequireRoles('trainee', 'platform_owner', 'org_manager')
  @ApiOperation({ summary: 'تعديل مسودة سجل سريري قبل الاعتماد' })
  async updateLogEntry(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser, @Body() dto: any) {
    const profile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
    });
    const previous = await this.prisma.clinicalCaseLog.findFirst({
      where: {
        id,
        ...(profile ? { traineeProfileId: profile.id } : { organizationId: user.organizationId }),
        status: { in: ['draft', 'submitted', 'modification_requested', 'rejected'] },
      },
    });
    if (!previous) return { success: false, message: 'لا يمكن تعديل هذا السجل' };
    const log = await this.prisma.clinicalCaseLog.update({
      where: { id },
      data: {
        diagnosis: dto.diagnosis,
        procedureId: dto.procedureId,
        patientAge: dto.patientAge,
        patientGender: dto.patientGender,
        specialtyAr: dto.specialtyAr,
        complexity: dto.complexity,
        participationLevel: dto.participationLevel,
        notes: dto.notes,
        evidenceUrls: dto.evidenceUrls,
        status: dto.status,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.accountId,
        action: 'logbook.update',
        entityType: 'ClinicalCaseLog',
        entityId: id,
        oldValues: { status: previous.status },
        newValues: { status: log.status },
      },
    });
    return { success: true, data: log };
  }

  @Patch('entries/:id/submit')
  @RequireRoles('trainee', 'platform_owner', 'org_manager')
  async submitLogEntry(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) {
    return this.transitionLog(id, user, 'submitted', 'logbook.submit');
  }

  @Put('cases/:id/approve')
  @RequireRoles('trainer', 'academic_supervisor', 'org_manager', 'platform_owner')
  async approveCaseAlias(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) {
    return this.approveLogEntry(id, user, {});
  }

  @Put('cases/:id/reject')
  @RequireRoles('trainer', 'academic_supervisor', 'org_manager', 'platform_owner')
  async rejectCaseAlias(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser, @Body() dto: { reason?: string; feedback?: string }) {
    return this.rejectLogEntry(id, user, { feedback: dto.reason ?? dto.feedback });
  }

  @Patch('entries/:id/reject')
  @RequireRoles('trainer', 'academic_supervisor', 'org_manager', 'platform_owner')
  async rejectLogEntry(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser, @Body() dto: { feedback?: string }) {
    if (!dto.feedback?.trim()) {
      throw new BadRequestException('سبب الرفض إلزامي');
    }
    const target = await this.prisma.clinicalCaseLog.findUnique({ where: { id } });
    if (!target) throw new BadRequestException('السجل غير موجود');
    await this.assertTrainerScope(user, target.traineeProfileId);
    await this.assertProfileNotLocked(target.traineeProfileId);
    if (target.organizationId !== user.organizationId && !user.roles.includes('platform_owner')) {
      throw new ForbiddenException('غير مصرح بالوصول لسجل خارج جهتك');
    }

    const result = await this.transitionLog(id, user, 'rejected', 'logbook.reject');
    if (result.success) {
      await this.prisma.logbookSignoff.create({
        data: { caseLogId: id, signerId: user.accountId, signerRole: this.signerRoleFor(user), feedback: dto.feedback },
      });
      const trainee = await this.prisma.traineeProfile.findUnique({
        where: { id: target.traineeProfileId },
        include: { person: { include: { userAccounts: { select: { id: true }, take: 1 } } } },
      });
      const traineeAccountId = trainee?.person?.userAccounts[0]?.id;
      if (traineeAccountId) {
        await this.prisma.notification.create({
          data: {
            organizationId: target.organizationId,
            userId: traineeAccountId,
            titleAr: 'رفض سجل الحالة السريرية',
            titleEn: 'Clinical Case Log Rejected',
            bodyAr: `تم رفض سجل الحالة السريرية (${target.diagnosis}). السبب: ${dto.feedback}`,
            type: 'logbook_rejected',
            referenceType: 'ClinicalCaseLog',
            referenceId: id,
            sentVia: 'in_app',
          },
        }).catch(() => null);
      }
    }
    return result;
  }

  @Patch('entries/:id/request-modification')
  @RequireRoles('trainer', 'academic_supervisor', 'org_manager', 'platform_owner')
  async requestModification(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser, @Body() dto: { feedback?: string }) {
    const result = await this.transitionLog(id, user, 'modification_requested', 'logbook.request_modification');
    if (result.success && dto.feedback) {
      await this.prisma.logbookSignoff.create({
        data: { caseLogId: id, signerId: user.accountId, signerRole: this.signerRoleFor(user), feedback: dto.feedback },
      });
    }
    return result;
  }

  // ─── 4. حقيبة الكفاءات والتقدم (Competency Portfolio Progress) ───────────
  @Get('competencies')
  @RequireRoles('trainee', 'trainer', 'hospital_training_admin', 'academic_supervisor', 'org_manager', 'platform_owner')
  @ApiOperation({ summary: 'عرض كفاءات وتقدم المتدرب ونسبة الإنجاز المطلوبة' })
  async getCompetencies(@CurrentUser() user: IAuthenticatedUser, @Query('traineeId') traineeId?: string) {
    let targetTraineeId = traineeId;

    if (!targetTraineeId) {
      const profile = await this.prisma.traineeProfile.findFirst({
        where: { person: { userAccounts: { some: { id: user.accountId } } } },
      });
      targetTraineeId = profile?.id;
    }

    if (!targetTraineeId) return { data: [], overallPercentage: 0 };
    if (traineeId) {
      await this.assertTrainerScope(user, targetTraineeId);
    }

    const competencies = await this.prisma.competencyProgress.findMany({
      where: { traineeProfileId: targetTraineeId },
      include: { procedure: true },
    });

    const totalRequired = competencies.reduce((acc, curr) => acc + curr.requiredCount, 0);
    const totalCompleted = competencies.reduce((acc, curr) => acc + curr.completedCount, 0);
    const overallPercentage = totalRequired > 0 ? Math.min(100, Math.round((totalCompleted / totalRequired) * 100)) : 0;

    return {
      overallPercentage,
      totalRequired,
      totalCompleted,
      data: competencies,
    };
  }

  /**
   * Trainer records the trainee's progress on a competency. The counters and
   * status already exist on CompetencyProgress and are maintained automatically
   * when a case log is approved; this is the manual correction path the trainer
   * needs, guarded by the same trainer→trainee scope as the read above.
   */
  @Patch('competencies/:id')
  @RequireRoles('trainer', 'hospital_training_admin', 'org_manager', 'platform_owner')
  @ApiOperation({ summary: 'تحديث تقدم كفاءة للمتدرب — للمدرب المسؤول فقط' })
  async updateCompetency(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { completedCount?: number; requiredCount?: number; status?: string },
  ) {
    const existing = await this.prisma.competencyProgress.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('سجل الكفاءة غير موجود');
    await this.assertTrainerScope(user, existing.traineeProfileId);
    await this.assertProfileNotLocked(existing.traineeProfileId);

    const completedCount = dto.completedCount ?? existing.completedCount;
    const requiredCount = dto.requiredCount ?? existing.requiredCount;
    if (completedCount < 0 || requiredCount < 0) {
      throw new BadRequestException('القيم يجب أن تكون أرقاماً موجبة');
    }

    const data = await this.prisma.competencyProgress.update({
      where: { id },
      data: {
        completedCount,
        requiredCount,
        status: dto.status ?? (completedCount >= requiredCount ? 'completed' : 'in_progress'),
        lastUpdated: new Date(),
      },
      include: { procedure: true },
    });
    return { success: true, data };
  }

  // ─── 5. إحصائيات والتحليلات اللحظية للـ Logbook ──────────────────────────
  @Get('dashboard-stats')
  @RequireRoles('trainee', 'trainer', 'hospital_training_admin', 'academic_supervisor', 'org_manager', 'platform_owner')
  @ApiOperation({ summary: 'إحصائيات Logbook اللحظية للدشبورد' })
  async getLogbookStats(@CurrentUser() user: IAuthenticatedUser) {
    let profile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
    });
    if (!profile && !user.roles.includes('platform_owner') && !user.roles.includes('org_manager')) {
    }

    const whereCondition = profile ? { traineeProfileId: profile.id } : { organizationId: user.organizationId };

    const totalCases = await this.prisma.clinicalCaseLog.count({
      where: whereCondition,
    });

    const approvedCases = await this.prisma.clinicalCaseLog.count({
      where: { ...whereCondition, status: { in: ['trainer_approved', 'completed'] } },
    });

    const pendingApproval = await this.prisma.clinicalCaseLog.count({
      where: { ...whereCondition, status: 'submitted' },
    });

    return {
      totalCases,
      approvedCases,
      pendingApproval,
      completionRate: totalCases > 0 ? Math.round((approvedCases / totalCases) * 100) : 0,
    };
  }

  private async transitionLog(id: string, user: IAuthenticatedUser, status: string, action: string) {
    const previous = await this.prisma.clinicalCaseLog.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!previous) return { success: false, message: 'السجل غير موجود' };
    const log = await this.prisma.clinicalCaseLog.update({ where: { id }, data: { status } });
    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.accountId,
        action,
        entityType: 'ClinicalCaseLog',
        entityId: id,
        oldValues: { status: previous.status },
        newValues: { status },
      },
    });
    return { success: true, data: log };
  }
}
