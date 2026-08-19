import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, RequireRoles } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import { roleScope } from '../../common/role-scope';
import { OrganizationAssignmentService } from '../organization-assignments/organization-assignment.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

@ApiTags('Org Members (إدارة أعضاء الجهة)')
@Controller('org-members')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class OrgMembersController {
  constructor(
    private prisma: PrismaService,
    private orgAssignments: OrganizationAssignmentService,
  ) {}

  // ─── قائمة أعضاء الجهة ───────────────────────────────────────────────────
  @Get()
  @RequireRoles('org_manager', 'academic_supervisor', 'platform_owner', 'cluster_administrator', 'cluster_manager', 'training_director', 'hospital_administrator', 'hospital_training_admin', 'university_administrator', 'trainer')
  @ApiOperation({ summary: 'قائمة أعضاء الجهة مع أدوارهم' })
  async findAll(
    @CurrentUser() user: IAuthenticatedUser,
    @Query('roleCode') roleCode?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    const orgIds = [user.organizationId];
    if (user.organizationId) {
      const children = await this.prisma.organization.findMany({
        where: { parentId: user.organizationId, deletedAt: null },
        select: { id: true },
      });
      orgIds.push(...children.map((c) => c.id));
    }

    const { members: rows, total } = await this.orgAssignments.findMembershipsInOrg(
      orgIds,
      { skip: page ? (parseInt(page) - 1) * 20 : 0, take: 50 },
    );

    let members = rows.map((m) => ({
      id: m.userAccountId,
      email: m.userAccount.email,
      username: m.userAccount.username,
      isActive: m.isActive && m.userAccount.isActive,
      nameAr: m.userAccount.person?.nameAr,
      nameEn: m.userAccount.person?.nameEn,
      nationalId: m.userAccount.person?.nationalId,
      phone: m.userAccount.person?.phone,
      // Merged from both role models: UserRole (legacy) and each
      // OrganizationAssignment's own role (newer — this is what
      // hospital_training_admin/training_director/etc. assignments carry).
      // Reading only the first meant a member assigned through the newer model
      // showed an empty role list, so no role filter or badge could ever find
      // them even though they were a real, visible member of the org.
      roles: this.mergeRoles(
        m.userAccount.userRoles.map((ur: any) => ({ code: ur.role.code, nameAr: ur.role.nameAr, id: ur.role.id })),
        m.assignedRoles ?? [],
      ),
      isPrimary: m.isPrimary,
    }));

    if (roleCode) {
      members = members.filter((m) => m.roles.some((r) => r.code === roleCode));
    }

    return { data: members, meta: { total, page: parseInt(page || '1'), limit: 50 } };
  }

  private mergeRoles(
    a: Array<{ id: string; code: string; nameAr: string }>,
    b: Array<{ id: string; code: string; nameAr: string }>,
  ): Array<{ id: string; code: string; nameAr: string }> {
    const byId = new Map<string, { id: string; code: string; nameAr: string }>();
    for (const r of [...a, ...b]) byId.set(r.id, r);
    return [...byId.values()];
  }

  // ─── إضافة عضو جديد ──────────────────────────────────────────────────────
  @Post()
  @RequireRoles('org_manager', 'platform_owner', 'cluster_administrator', 'cluster_manager', 'training_director', 'hospital_administrator', 'hospital_training_admin', 'university_administrator')
  @ApiOperation({ summary: 'إضافة عضو جديد للجهة' })
  async create(@CurrentUser() user: IAuthenticatedUser, @Body() dto: any) {
    if (!dto.roleCode && (!dto.roleCodes || dto.roleCodes.length === 0)) {
      throw new BadRequestException('الرجاء اختيار الدور الوظيفي للعضو الجديد');
    }

    if (dto.roleCode === 'trainee' || (Array.isArray(dto.roleCodes) && dto.roleCodes.includes('trainee'))) {
      throw new BadRequestException(
        'لا يمكن إنشاء حساب متدرب مباشرة عبر أعضاء الجهة — ينشأ المتدربون حصراً عبر مسار طلب التدريب والدفعة الأكاديمية (جامعة ← طلب تدريب ← اعتماد التجمع ← دفعة أكاديمية).',
      );
    }

    // Hospital-scoped roles must resolve to an actual hospital before anything
    // is written. Previously the member was attached to whatever organisation
    // the creator happened to be in, so a cluster administrator adding a trainer
    // produced a trainer sitting on the cluster with no hospital at all.
    const scopeRule = roleScope(dto.roleCode);
    const targetOrgId: string = dto.hospitalId || dto.organizationId || user.organizationId;

    const targetOrg = await this.prisma.organization.findFirst({
      where: { id: targetOrgId, deletedAt: null },
      select: { id: true, parentId: true, organizationType: { select: { code: true } } },
    });
    if (!targetOrg) {
      throw new BadRequestException('الجهة المحددة غير موجودة');
    }

    if (scopeRule.requiresHospital) {
      if (targetOrg.organizationType?.code !== 'hospital') {
        throw new BadRequestException(
          `الدور "${dto.roleCode}" يتطلب تحديد مستشفى — الجهة المختارة ليست مستشفى`,
        );
      }
      // Cascading: the hospital must belong to the creator's organisation,
      // unless the creator is already inside that hospital.
      if (
        user.organizationId &&
        targetOrg.id !== user.organizationId &&
        targetOrg.parentId !== user.organizationId
      ) {
        throw new BadRequestException('المستشفى المحدد لا يتبع جهتك');
      }
    } else if (scopeRule.expectedOrgTypeCode && targetOrg.organizationType?.code !== scopeRule.expectedOrgTypeCode) {
      // The hospital branch above already refuses a hospital role pointed at a
      // non-hospital organisation; this is the same rule for the
      // university/cluster roles, which previously accepted any organisation
      // at all — a university_administrator could be created against a
      // hospital, or a training_director against a university.
      throw new BadRequestException(
        `الدور "${dto.roleCode}" يتطلب جهة من نوع "${scopeRule.expectedOrgTypeCode}" — الجهة المختارة من نوع آخر`,
      );
    }

    const memberOrgId = targetOrg.id;

    if (dto.roleCode === 'trainer' && dto.nationalId) {
      const existingPerson = await this.prisma.person.findUnique({
        where: { nationalId: dto.nationalId },
        select: { id: true },
      });
      if (existingPerson) {
        const existingTrainer = await this.prisma.trainerProfile.findFirst({
          where: {
            personId: existingPerson.id,
            organizationId: memberOrgId,
            isActive: true,
          },
        });
        if (existingTrainer) {
          throw new BadRequestException('الرقم الوظيفي (رقم الهوية/الإقامة) مُدخل مسبقاً لمدرب آخر في هذا المستشفى');
        }
      }
    }

    // Password rules live here, once, for every caller of this endpoint —
    // TrainerCards, OrgMembers and any direct API client alike. Checked in the
    // handler rather than a DTO because the body is untyped, so the global
    // ValidationPipe never inspects it. 8 characters matches the rule the rest
    // of the platform already enforces on every other password-setting path
    // (activation, change-password, user-account create).
    const createsTrainer =
      dto.roleCode === 'trainer' ||
      (Array.isArray(dto.roleCodes) && dto.roleCodes.includes('trainer'));

    // A trainer must be able to log in. With no password the account falls back
    // to the unguessable random secret below, and the platform has no
    // self-service reset — so it would be created active but permanently
    // unreachable. Required for trainers only; every other role keeps the
    // existing optional behaviour.
    if (createsTrainer && !dto.password) {
      throw new BadRequestException(
        'كلمة المرور الابتدائية مطلوبة لحساب المدرب — بدونها يتعذّر عليه تسجيل الدخول',
      );
    }

    if (dto.password !== undefined && dto.password !== null && dto.password !== '') {
      if (typeof dto.password !== 'string' || dto.password.trim().length < 8) {
        throw new BadRequestException('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      }
    }

    // No shared fallback password. This previously defaulted to a fixed string
    // that was also published as the Swagger example for POST /auth/login, so
    // every member created without an explicit password shared one publicly
    // documented credential. When the caller supplies no password the account
    // gets a random one that nobody holds — it cannot be logged into until a
    // password is set through the normal reset/activation path.
    const passwordHash = await bcrypt.hash(
      dto.password || randomBytes(32).toString('base64url'),
      10,
    );

    // إنشاء/تحديث Person
    const person = await this.prisma.person.upsert({
      where: { nationalId: dto.nationalId },
      create: {
        nationalId: dto.nationalId,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        email: dto.email,
        phone: dto.phone,
      },
      update: { nameAr: dto.nameAr, nameEn: dto.nameEn, phone: dto.phone },
    });

    // إنشاء UserAccount
    let account = await this.prisma.userAccount.findUnique({ where: { email: dto.email } });
    if (!account) {
      account = await this.prisma.userAccount.create({
        data: {
          personId: person.id,
          email: dto.email,
          username: dto.email.split('@')[0],
          passwordHash,
          isEmailVerified: true,
          isActive: true,
        },
      });
    }

    // ربط بالجهة — يُكتب في النموذجين للحفاظ على التوافق
    await this.prisma.userOrganization.upsert({
      where: { userAccountId_organizationId: { userAccountId: account.id, organizationId: memberOrgId } },
      create: { userAccountId: account.id, organizationId: memberOrgId, isPrimary: true },
      update: { isActive: true },
    });
    await this.orgAssignments.upsertMembership({
      userAccountId: account.id,
      organizationId: memberOrgId,
      isPrimary: true,
      createdById: user.accountId,
    });

    // تعيين الدور
    if (dto.roleCode) {
      const role = await this.prisma.role.findUnique({ where: { code: dto.roleCode } });
      if (role) {
        await this.prisma.userRole.upsert({
          where: { userAccountId_roleId_organizationId: { userAccountId: account.id, roleId: role.id, organizationId: memberOrgId } },
          create: { userAccountId: account.id, roleId: role.id, organizationId: memberOrgId, assignedById: user.accountId },
          update: {},
        });
      }
    }

    // A trainer account without a TrainerProfile is a trainer with no hospital
    // record — it cannot be allocated to, cannot hold rotations and does not
    // appear in capacity. The profile is now always created, with the department
    // optional rather than a precondition.
    if (dto.roleCode === 'trainer') {
      const existing = await this.prisma.trainerProfile.findFirst({ where: { personId: person.id } });
      if (!existing) {
        await this.prisma.trainerProfile.create({
          data: {
            personId: person.id,
            organizationId: memberOrgId,
            departmentId: dto.departmentId || null,
            titleAr: dto.titleAr || null,
            maxTrainees: dto.maxTrainees ?? 5,
          },
        });
      } else if (existing.organizationId !== memberOrgId) {
        // Keep the profile in step when the member is moved to another hospital.
        await this.prisma.trainerProfile.update({
          where: { id: existing.id },
          data: { organizationId: memberOrgId, departmentId: dto.departmentId ?? existing.departmentId },
        });
      }
    }

    return {
      success: true,
      message: `تم إنشاء حساب ${dto.nameAr} بنجاح`,
      accountId: account.id,
    };
  }

  // ─── تعديل عضو ───────────────────────────────────────────────────────────
  @Patch(':id')
  @RequireRoles('org_manager', 'platform_owner', 'cluster_administrator', 'cluster_manager', 'training_director', 'hospital_administrator', 'hospital_training_admin', 'university_administrator')
  @ApiOperation({ summary: 'تعديل بيانات عضو' })
  async update(@Param('id') accountId: string, @CurrentUser() user: IAuthenticatedUser, @Body() dto: any) {
    // The account must be a member of the caller's own organization — the same
    // boundary deactivate/activate already enforce via this compound key —
    // otherwise a caller could edit or grant a role to a member of another
    // organization purely by knowing their account id.
    const membership = await this.prisma.userOrganization.findUnique({
      where: { userAccountId_organizationId: { userAccountId: accountId, organizationId: user.organizationId } },
    });
    if (!membership) return { message: 'هذا الحساب ليس عضواً في جهتك' };

    const account = await this.prisma.userAccount.findUnique({
      where: { id: accountId },
      include: { person: true },
    });
    if (!account) return { message: 'الحساب غير موجود' };

    // تحديث بيانات Person
    await this.prisma.person.update({
      where: { id: account.personId },
      data: {
        nameAr: dto.nameAr || account.person.nameAr,
        nameEn: dto.nameEn,
        phone: dto.phone,
      },
    });

    // تعيين دور جديد إن وُجد
    if (dto.roleCode) {
      const role = await this.prisma.role.findUnique({ where: { code: dto.roleCode } });
      if (role) {
        // Granting the trainer role here is a second door onto the same end
        // state POST guards: a member created for a non-trainer role holds the
        // unguessable random password, so promoting them without setting one
        // produced a trainer who could never sign in. Only a genuine promotion
        // is gated — the edit dialog resends the member's current role on every
        // save, so requiring a password unconditionally would break renaming an
        // existing trainer.
        if (role.code === 'trainer') {
          const alreadyTrainer = await this.prisma.userRole.findFirst({
            where: { userAccountId: accountId, roleId: role.id, organizationId: user.organizationId },
          });

          if (!alreadyTrainer) {
            if (!dto.password) {
              throw new BadRequestException(
                'كلمة المرور الابتدائية مطلوبة عند ترقية العضو إلى مدرب — بدونها يتعذّر عليه تسجيل الدخول',
              );
            }
            if (typeof dto.password !== 'string' || dto.password.trim().length < 8) {
              throw new BadRequestException('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
            }
            await this.prisma.userAccount.update({
              where: { id: accountId },
              data: { passwordHash: await bcrypt.hash(dto.password, 10) },
            });
          }
        }

        await this.prisma.userRole.upsert({
          where: { userAccountId_roleId_organizationId: { userAccountId: accountId, roleId: role.id, organizationId: user.organizationId } },
          create: { userAccountId: accountId, roleId: role.id, organizationId: user.organizationId, assignedById: user.accountId },
          update: {},
        });

        // Same profile guarantee POST makes: a trainer without a TrainerProfile
        // has no hospital record, so cannot be allocated to, cannot hold
        // rotations and does not appear in capacity. Promotion reached the role
        // grant above but stopped short of the profile, producing exactly that.
        // Keyed on personId like POST, so re-saving an existing trainer finds
        // the profile and adds nothing.
        if (role.code === 'trainer') {
          const existingProfile = await this.prisma.trainerProfile.findFirst({
            where: { personId: account.personId },
          });
          if (!existingProfile) {
            await this.prisma.trainerProfile.create({
              data: {
                personId: account.personId,
                organizationId: user.organizationId,
                departmentId: dto.departmentId || null,
                titleAr: dto.titleAr || null,
                maxTrainees: dto.maxTrainees ?? 5,
              },
            });
          } else if (existingProfile.organizationId !== user.organizationId) {
            await this.prisma.trainerProfile.update({
              where: { id: existingProfile.id },
              data: {
                organizationId: user.organizationId,
                departmentId: dto.departmentId ?? existingProfile.departmentId,
              },
            });
          }
        }
      }
    }

    return { success: true, message: 'تم تعديل البيانات بنجاح' };
  }

  // ─── صلاحيات عضو ─────────────────────────────────────────────────────────
  /**
   * The three layers that make up what a member may actually do, kept separate
   * so the caller can see *why* a permission is or is not in force:
   *
   *   role   — inherited from the member's role(s) via RolePermission
   *   grant  — UserPermission(granted: true), an addition the role lacks
   *   deny   — UserPermission(granted: false), a withdrawal of an inherited one
   *
   * `effective` is computed with exactly the rule AuthService.getRolesAndPermissions
   * applies when it mints a token, so this screen can never disagree with what
   * authorisation actually does.
   */
  @Get(':id/permissions')
  @RequireRoles('org_manager', 'platform_owner', 'cluster_administrator', 'cluster_manager', 'training_director', 'hospital_training_admin', 'university_administrator')
  @ApiOperation({ summary: 'صلاحيات العضو — الموروثة والإضافية والمسحوبة والفعلية' })
  async getMemberPermissions(@Param('id') accountId: string, @CurrentUser() user: IAuthenticatedUser) {
    const account = await this.requireMemberOfMyOrg(accountId, user);

    const [userRoles, assignments, overrides, catalogue] = await Promise.all([
      this.prisma.userRole.findMany({
        where: { userAccountId: accountId, organizationId: user.organizationId },
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
      }),
      this.prisma.organizationAssignment.findMany({
        where: { userAccountId: accountId, organizationId: user.organizationId, isActive: true, roleId: { not: null } },
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
      }),
      this.prisma.userPermission.findMany({
        where: { userAccountId: accountId, organizationId: user.organizationId },
        include: { permission: true },
      }),
      this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] }),
    ]);

    const roles: Array<{ code: string; nameAr: string }> = [];
    const inherited = new Set<string>();
    for (const source of [...userRoles, ...assignments]) {
      if (!source.role) continue;
      roles.push({ code: source.role.code, nameAr: source.role.nameAr });
      for (const rp of source.role.rolePermissions) inherited.add(rp.permission.code);
    }

    const grants = new Set(overrides.filter((o) => o.granted).map((o) => o.permission.code));
    const denies = new Set(overrides.filter((o) => !o.granted).map((o) => o.permission.code));

    // Same order of operations as the token resolver: role ∪ grants, minus denies.
    const effective = new Set([...inherited, ...grants]);
    for (const code of denies) effective.delete(code);

    return {
      data: {
        member: {
          id: account.id,
          email: account.email,
          isActive: account.isActive,
          nameAr: account.person?.nameAr,
          organizationId: user.organizationId,
          roles,
        },
        permissions: catalogue.map((p) => ({
          code: p.code,
          nameAr: p.nameAr,
          nameEn: p.nameEn,
          module: p.module,
          inherited: inherited.has(p.code),
          granted: grants.has(p.code),
          denied: denies.has(p.code),
          effective: effective.has(p.code),
          // What the UI labels the row with, resolved server-side so the two
          // never drift: an override always outranks the role.
          source: denies.has(p.code)
            ? 'user_deny'
            : grants.has(p.code)
              ? 'user_grant'
              : inherited.has(p.code)
                ? 'role'
                : 'none',
        })),
        effectiveCount: effective.size,
      },
    };
  }

  /**
   * Sets one permission override for one member. `mode` mirrors the three states
   * the screen offers: 'grant' and 'deny' write a UserPermission row, 'inherit'
   * removes it so the role decides again — there is no fourth state, and no way
   * to edit RolePermission from here, which keeps role definitions the single
   * source of the baseline.
   */
  @Patch(':id/permissions')
  @RequireRoles('org_manager', 'platform_owner', 'cluster_administrator', 'cluster_manager', 'training_director', 'hospital_training_admin', 'university_administrator')
  @ApiOperation({ summary: 'منح أو سحب صلاحية لعضو (لا يعدّل صلاحيات الدور)' })
  async setMemberPermission(
    @Param('id') accountId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { permissionCode: string; mode: 'grant' | 'deny' | 'inherit' },
  ) {
    await this.requireMemberOfMyOrg(accountId, user);

    if (!dto?.permissionCode?.trim()) {
      throw new BadRequestException('رمز الصلاحية مطلوب');
    }
    if (!['grant', 'deny', 'inherit'].includes(dto.mode)) {
      throw new BadRequestException('القيمة المسموحة لـ mode هي grant أو deny أو inherit');
    }

    // Only codes already in the catalogue — this endpoint never invents a
    // permission, so the vocabulary stays exactly what RolePermission uses.
    const permission = await this.prisma.permission.findUnique({ where: { code: dto.permissionCode.trim() } });
    if (!permission) throw new BadRequestException('رمز الصلاحية غير موجود في جدول الصلاحيات');

    const key = {
      userAccountId_permissionId_organizationId: {
        userAccountId: accountId,
        permissionId: permission.id,
        organizationId: user.organizationId,
      },
    };

    const previous = await this.prisma.userPermission.findUnique({ where: key });

    if (dto.mode === 'inherit') {
      if (previous) await this.prisma.userPermission.delete({ where: key });
    } else {
      const granted = dto.mode === 'grant';
      await this.prisma.userPermission.upsert({
        where: key,
        create: {
          userAccountId: accountId,
          permissionId: permission.id,
          organizationId: user.organizationId,
          granted,
          grantedById: user.accountId,
        },
        update: { granted, grantedById: user.accountId },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.accountId,
        action: 'org_member.permission_override',
        entityType: 'UserPermission',
        entityId: accountId,
        oldValues: previous ? { permission: permission.code, granted: previous.granted } : undefined,
        newValues: { permission: permission.code, mode: dto.mode },
      },
    });

    return {
      success: true,
      message:
        dto.mode === 'inherit'
          ? 'تمت إعادة الصلاحية إلى ما يقرره الدور'
          : dto.mode === 'grant'
            ? 'تم منح الصلاحية للعضو'
            : 'تم سحب الصلاحية من العضو',
    };
  }

  /**
   * Every member-scoped route resolves the target through the caller's own
   * organisation, so knowing an account id from another org is never enough.
   */
  private async requireMemberOfMyOrg(accountId: string, user: IAuthenticatedUser) {
    const membership = await this.prisma.userOrganization.findUnique({
      where: { userAccountId_organizationId: { userAccountId: accountId, organizationId: user.organizationId } },
    });
    if (!membership) throw new BadRequestException('هذا الحساب ليس عضواً في جهتك');

    const account = await this.prisma.userAccount.findUnique({
      where: { id: accountId },
      include: { person: true },
    });
    if (!account) throw new BadRequestException('الحساب غير موجود');
    return account;
  }

  // ─── تعطيل عضو ───────────────────────────────────────────────────────────
  @Delete(':id')
  @RequireRoles('org_manager', 'platform_owner', 'cluster_administrator', 'cluster_manager', 'hospital_administrator', 'hospital_training_admin')
  @ApiOperation({ summary: 'تعطيل حساب عضو' })
  async deactivate(@Param('id') accountId: string, @CurrentUser() user: IAuthenticatedUser) {
    await this.prisma.userOrganization.update({
      where: { userAccountId_organizationId: { userAccountId: accountId, organizationId: user.organizationId } },
      data: { isActive: false },
    });
    await this.orgAssignments.setMembershipActive(accountId, user.organizationId, false);
    return { success: true, message: 'تم تعطيل الحساب من الجهة' };
  }

  // ─── تفعيل عضو ───────────────────────────────────────────────────────────
  @Patch(':id/activate')
  @RequireRoles('org_manager', 'platform_owner', 'cluster_administrator', 'cluster_manager', 'hospital_administrator', 'hospital_training_admin')
  @ApiOperation({ summary: 'تفعيل حساب عضو' })
  async activate(@Param('id') accountId: string, @CurrentUser() user: IAuthenticatedUser) {
    await this.prisma.userOrganization.update({
      where: { userAccountId_organizationId: { userAccountId: accountId, organizationId: user.organizationId } },
      data: { isActive: true },
    });
    await this.orgAssignments.setMembershipActive(accountId, user.organizationId, true);
    return { success: true, message: 'تم إعادة تفعيل الحساب' };
  }

  // ─── إزالة دور من عضو ─────────────────────────────────────────────────────
  @Delete(':id/roles/:roleCode')
  @RequireRoles('org_manager', 'platform_owner')
  @ApiOperation({ summary: 'إزالة دور من عضو' })
  async removeRole(@Param('id') accountId: string, @Param('roleCode') roleCode: string, @CurrentUser() user: IAuthenticatedUser) {
    const role = await this.prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) return { message: 'الدور غير موجود' };

    await this.prisma.userRole.deleteMany({
      where: { userAccountId: accountId, roleId: role.id, organizationId: user.organizationId },
    });
    return { success: true, message: 'تم إزالة الدور' };
  }

  // ─── قائمة الأدوار المتاحة ────────────────────────────────────────────────
  @Get('roles/available')
  @RequireRoles('org_manager', 'academic_supervisor', 'platform_owner', 'cluster_administrator', 'cluster_manager', 'training_director', 'hospital_administrator', 'hospital_training_admin', 'university_administrator', 'trainer')
  @ApiOperation({ summary: 'قائمة الأدوار المتاحة للتعيين' })
  async getAvailableRoles() {
    const roles = await this.prisma.role.findMany({
      where: { isActive: true, code: { in: ['org_manager', 'academic_supervisor', 'trainer', 'trainee'] } },
      select: { id: true, code: true, nameAr: true, nameEn: true, hierarchyLevel: true },
      orderBy: { hierarchyLevel: 'desc' },
    });
    return { data: roles };
  }

  // ─── قائمة الأقسام ───────────────────────────────────────────────────────
  @Get('departments')
  @RequireRoles('org_manager', 'academic_supervisor', 'platform_owner', 'cluster_administrator', 'cluster_manager', 'training_director', 'hospital_administrator', 'hospital_training_admin', 'university_administrator', 'trainer')
  @ApiOperation({ summary: 'قائمة الأقسام في الجهة' })
  async getDepartments(@CurrentUser() user: IAuthenticatedUser) {
    const departments = await this.prisma.department.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, nameAr: true, nameEn: true, code: true },
    });
    return { data: departments };
  }
}
