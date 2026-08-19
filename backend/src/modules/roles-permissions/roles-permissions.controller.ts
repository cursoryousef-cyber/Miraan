import {
  Controller, Get, Post, Body, Param, Patch, Delete, UseGuards,
  BadRequestException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, RequireRoles } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLE_SCOPES } from '../../common/role-scope';
import { ROLE_CAPABILITIES } from '../../common/authz';

/**
 * The role catalogue, defined in code rather than read from the database.
 *
 * Authority in this system is derived from a role's *code*: ROLE_CAPABILITIES
 * maps each code to what it may do, and `RequireRoles` compares codes directly.
 * A role whose code appears there is therefore part of the security model and
 * its definition is not runtime-editable.
 *
 * The `roles.is_system` column cannot be the guard on its own: in the live data
 * `platform_owner`, `trainer` and `trainee` all carry `is_system = false`, so a
 * check against that column would have protected almost nothing. The column is
 * still honoured below — a deployment that flags additional roles gets that
 * protection too — but the code catalogue is the floor.
 */
const PROTECTED_ROLE_CODES = new Set(Object.keys(ROLE_CAPABILITIES));

@ApiTags('Dynamic RBAC (إدارة الأدوار والصلاحيات الديناميكية)')
@Controller('roles-permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class RolesPermissionsController {
  constructor(private prisma: PrismaService) {}

  @Get('roles')
  @RequireRoles('platform_owner', 'org_manager')
  @ApiOperation({ summary: 'قائمة الأدوار المتاحة والمسجلة' })
  async getRoles() {
    const roles = await this.prisma.role.findMany({
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
      orderBy: { hierarchyLevel: 'desc' },
    });
    return { data: roles };
  }

  @Get('role-scopes')
  @ApiOperation({
    summary: 'عقد نطاق الأدوار — ما يتطلبه كل دور من جهة/مستشفى (مصدر موحّد للواجهة والخادم)',
  })
  async getRoleScopes() {
    return {
      data: Object.entries(ROLE_SCOPES).map(([code, rule]) => ({ code, ...rule })),
    };
  }

  @Get('permissions')
  @RequireRoles('platform_owner', 'org_manager')
  @ApiOperation({ summary: 'قائمة الصلاحيات المتاحة بالنظام' })
  async getPermissions() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: { module: 'asc' },
    });
    return { data: permissions };
  }

  /**
   * Loads a role and refuses one that belongs to the security model.
   *
   * Editing or deleting such a role is an escalation, not an edit: the update
   * path below replaces a role's permission rows wholesale, so granting
   * `trainee` the organisation-management permission — or stripping
   * `platform_owner` of its own — was a single call away. Deleting the
   * sovereign role locked platform administration out entirely.
   */
  private async requireEditableRole(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('الدور غير موجود');
    if (PROTECTED_ROLE_CODES.has(role.code) || role.isSystem) {
      throw new ForbiddenException(
        `الدور «${role.code}» جزء من نموذج الصلاحيات الأساسي ولا يمكن تعديله أو حذفه — عدّل الصلاحيات عبر كتالوج القدرات في الكود`,
      );
    }
    return role;
  }

  private async auditRole(
    user: IAuthenticatedUser,
    action: string,
    entityId: string | null,
    oldValues: unknown,
    newValues: unknown,
  ) {
    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.accountId,
        action,
        entityType: 'Role',
        entityId,
        oldValues: (oldValues ?? undefined) as never,
        newValues: (newValues ?? undefined) as never,
      },
    });
  }

  @Post('roles')
  @RequireRoles('platform_owner')
  @ApiOperation({ summary: 'إنشاء دور ديناميكي جديد' })
  async createRole(
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { code: string; nameAr: string; nameEn?: string; descriptionAr?: string; hierarchyLevel?: number; permissions?: string[] },
  ) {
    const code = dto.code?.trim();
    if (!code) throw new BadRequestException('رمز الدور مطلوب');

    // A new role may not claim a code the security model already reasons about.
    // The unique index would reject an exact duplicate, but only after the
    // request had been accepted as legitimate; this states the rule.
    if (PROTECTED_ROLE_CODES.has(code)) {
      throw new ForbiddenException(
        `الرمز «${code}» محجوز لدور أساسي في نموذج الصلاحيات — اختر رمزاً آخر`,
      );
    }

    // A dynamic role sits below every role in the catalogue. Accepting the
    // client's own hierarchyLevel let a caller mint a role ranking above the
    // sovereign one.
    const MAX_DYNAMIC_HIERARCHY = 5;
    const requested = dto.hierarchyLevel ?? 1;
    if (requested > MAX_DYNAMIC_HIERARCHY) {
      throw new ForbiddenException(
        `مستوى الدور الديناميكي لا يتجاوز ${MAX_DYNAMIC_HIERARCHY} — لا يمكن إنشاء دور يعلو الأدوار الأساسية`,
      );
    }

    const role = await this.prisma.role.create({
      data: {
        code,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn || code,
        descriptionAr: dto.descriptionAr,
        hierarchyLevel: requested,
        isSystem: false,
      },
    });

    if (dto.permissions && dto.permissions.length > 0) {
      for (const permCode of dto.permissions) {
        const perm = await this.prisma.permission.findUnique({ where: { code: permCode } });
        if (perm) {
          await this.prisma.rolePermission.create({
            data: { roleId: role.id, permissionId: perm.id },
          });
        }
      }
    }

    await this.auditRole(user, 'role.create', role.id, null, {
      code: role.code, hierarchyLevel: role.hierarchyLevel, permissions: dto.permissions ?? [],
    });
    return { success: true, role };
  }

  @Patch('roles/:id')
  @RequireRoles('platform_owner')
  @ApiOperation({ summary: 'تعديل بيانات ورخص دور ديناميكي' })
  async updateRole(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { nameAr?: string; descriptionAr?: string; permissions?: string[] },
  ) {
    const before = await this.requireEditableRole(id);
    const previousPermissions = (
      await this.prisma.rolePermission.findMany({
        where: { roleId: id },
        include: { permission: { select: { code: true } } },
      })
    ).map((rp) => rp.permission.code);

    const role = await this.prisma.role.update({
      where: { id },
      data: {
        nameAr: dto.nameAr,
        descriptionAr: dto.descriptionAr,
      },
    });

    if (dto.permissions) {
      await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
      for (const permCode of dto.permissions) {
        const perm = await this.prisma.permission.findUnique({ where: { code: permCode } });
        if (perm) {
          await this.prisma.rolePermission.create({
            data: { roleId: id, permissionId: perm.id },
          });
        }
      }
    }

    await this.auditRole(
      user, 'role.update', id,
      { nameAr: before.nameAr, descriptionAr: before.descriptionAr, permissions: previousPermissions },
      { nameAr: role.nameAr, descriptionAr: role.descriptionAr, permissions: dto.permissions ?? previousPermissions },
    );
    return { success: true, role };
  }

  @Delete('roles/:id')
  @RequireRoles('platform_owner')
  @ApiOperation({ summary: 'حذف دور ديناميكي غير سيادي' })
  async deleteRole(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) {
    const role = await this.requireEditableRole(id);

    // Deleting a role that is still granted to someone would either cascade the
    // grant away silently or fail on the foreign key as a 500. Neither tells
    // the caller what is actually in the way.
    const assigned = await this.prisma.userRole.count({ where: { roleId: id } });
    if (assigned > 0) {
      throw new BadRequestException(
        `لا يمكن حذف دور مُسند إلى ${assigned} مستخدم — انزع الدور عن المستخدمين أولاً`,
      );
    }

    await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await this.prisma.role.delete({ where: { id } });
    await this.auditRole(user, 'role.delete', id, { code: role.code, nameAr: role.nameAr }, null);
    return { success: true, message: 'تم حذف الدور بنجاح' };
  }
}
