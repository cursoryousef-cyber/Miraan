import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto, SwitchOrgDto, RefreshTokenDto, ActivateAccountDto, ChangePasswordDto } from './dto/auth.dto';
import { IAuthenticatedUser } from '../../common/interfaces';
import { OrganizationAssignmentService } from '../organization-assignments/organization-assignment.service';
import { capabilitiesForRoles } from '../../common/authz/capabilities';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private orgAssignments: OrganizationAssignmentService,
  ) {}

  /**
   * Resolves the roles, legacy permissions and capabilities a user holds *in one
   * organisation*. Called on login, on every context switch and on refresh, so a
   * session's powers are always those of the organisation currently active and
   * never a union across organisations.
   *
   * Roles come from two tables on purpose. UserRole is the original model;
   * OrganizationAssignment is the newer one and already carries 41 roled rows in
   * production. Reading only the first meant anyone assigned through the newer
   * model authenticated with an empty role set.
   */
  private async getRolesAndPermissions(accountId: string, orgId: string) {
    const [userRoles, assignments] = await Promise.all([
      this.prisma.userRole.findMany({
        where: { userAccountId: accountId, organizationId: orgId },
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
      }),
      this.prisma.organizationAssignment.findMany({
        where: { userAccountId: accountId, organizationId: orgId, isActive: true, roleId: { not: null } },
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
      }),
    ]);

    const roleSet = new Set<string>();
    const permissionsSet = new Set<string>();

    for (const source of [...userRoles, ...assignments]) {
      if (!source.role) continue;
      roleSet.add(source.role.code);
      for (const rp of source.role.rolePermissions) permissionsSet.add(rp.permission.code);
    }

    // الصلاحيات المباشرة للمستخدم — منح وسحب.
    //
    // `granted` is a tri-state in effect: a row with `true` adds a permission the
    // role does not carry, and a row with `false` withdraws one the role does.
    // Only the additive half used to be read, so a deny row was stored, shown in
    // the UI and audited, yet authorised anyway — the permission still arrived
    // from the role and nothing ever subtracted it. Both halves are applied here,
    // in the single resolver every session (login, org switch, refresh) already
    // goes through, so a deny takes effect everywhere at once rather than needing
    // each guard to learn about it.
    //
    // Denies are applied after grants so an explicit deny always wins.
    const directPermissions = await this.prisma.userPermission.findMany({
      where: { userAccountId: accountId, organizationId: orgId },
      include: { permission: true },
    });
    for (const dp of directPermissions) {
      if (dp.granted) permissionsSet.add(dp.permission.code);
    }
    for (const dp of directPermissions) {
      if (!dp.granted) permissionsSet.delete(dp.permission.code);
    }

    const roles = Array.from(roleSet);
    return {
      roles,
      permissions: Array.from(permissionsSet),
      capabilities: capabilitiesForRoles(roles) as string[],
    };
  }

  /**
   * An organisation context is only issuable when the user actually holds a role
   * in it. Without this, a membership row with no role produced a signed token
   * scoped to an organisation with an empty role set — a session that looked
   * authenticated to every unannotated endpoint.
   */
  private assertContextHasRoles(roles: string[], orgNameAr: string): void {
    if (roles.length === 0) {
      throw new ForbiddenException(
        `لا تملك دوراً في «${orgNameAr}» — لا يمكن العمل في هذا السياق. راجع مسؤول النظام.`,
      );
    }
  }

  async login(dto: LoginDto) {
    const input = (dto.email || '').trim().toLowerCase();
    const account = await this.prisma.userAccount.findFirst({
      where: {
        OR: [
          { email: input },
          { username: input },
        ],
        deletedAt: null,
      },
      include: { person: true },
    });

    if (!account) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    if (!account.isActive) {
      throw new ForbiddenException('هذا الحساب غير نشط. يرجى التواصل مع مسؤول النظام.');
    }

    if (account.lockedUntil && account.lockedUntil > new Date()) {
      throw new ForbiddenException('الحساب مقفل مؤقتاً بسبب تكرار المحاولات الخاطئة');
    }

    // An account created by an administrator carries an activation token and a
    // random unusable password hash, so the holder must set their own password
    // through the activation link before the account works. That was already
    // true in effect — nobody can guess the random hash — but only by accident
    // of the hash being unguessable, and the caller got "بيانات الدخول غير
    // صحيحة", which reads as a wrong password rather than an unactivated
    // account. Stating it here makes first-login-sets-the-password an explicit
    // rule and tells the user what to actually do.
    if (account.activationToken) {
      throw new ForbiddenException(
        'لم يتم تفعيل الحساب بعد — استخدم رابط التفعيل المُرسل إليك لتعيين كلمة المرور قبل أول دخول',
      );
    }

    const isPasswordValid = await bcrypt.compare(dto.password, account.passwordHash);
    if (!isPasswordValid) {
      const attempts = account.loginAttempts + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

      await this.prisma.userAccount.update({
        where: { id: account.id },
        data: { loginAttempts: attempts, lockedUntil },
      });

      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    await this.prisma.userAccount.update({
      where: { id: account.id },
      data: { loginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    // Multi-Org Resolution: OrganizationAssignment is the source of truth;
    // UserOrganization remains the fallback for users with no assignments.
    const orgContext = await this.orgAssignments.resolveOrgContext(account.id, { activeOnly: true });
    const primaryOrg = orgContext.active;

    if (!primaryOrg) {
      throw new ForbiddenException('المستخدم غير مرتبط بأي جهة تابعة للنظام');
    }

    // جلب الأدوار والصلاحيات للجهة الأساسية
    const { roles, permissions, capabilities } = await this.getRolesAndPermissions(
      account.id, primaryOrg.organization.id,
    );
    this.assertContextHasRoles(roles, primaryOrg.organization.nameAr);

    const tokens = await this.generateTokens(
      account.id, account.personId, primaryOrg.organization.id, account.email, roles, permissions, capabilities,
    );

    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.prisma.userAccount.update({
      where: { id: account.id },
      data: { refreshTokenHash },
    });

    return {
      user: {
        id: account.id,
        personId: account.personId,
        nameAr: account.person.nameAr,
        nameEn: account.person.nameEn,
        email: account.email,
        // ─── RBAC: الأدوار والصلاحيات والقدرات في الجهة النشطة ───
        roles,
        permissions,
        capabilities,
        // ────────────────────────────────────────────────────────
        activeOrganization: {
          id: primaryOrg.organization.id,
          code: primaryOrg.organization.code,
          nameAr: primaryOrg.organization.nameAr,
          nameEn: primaryOrg.organization.nameEn,
        },
        availableOrganizations: orgContext.available.map((entry) => ({
          id: entry.organization.id,
          code: entry.organization.code,
          nameAr: entry.organization.nameAr,
          nameEn: entry.organization.nameEn,
          isPrimary: entry.isPrimary,
        })),
      },
      tokens,
    };
  }

  async switchOrganization(user: IAuthenticatedUser, dto: SwitchOrgDto) {
    // Access decided by OrganizationAssignment, with UserOrganization as fallback.
    const allowed = await this.orgAssignments.canAccessOrg(user.accountId, dto.organizationId);
    const organization = allowed
      ? await this.prisma.organization.findUnique({ where: { id: dto.organizationId } })
      : null;

    if (!allowed || !organization || !organization.status) {
      throw new ForbiddenException('ليس لديك صلاحية الوصول لهذه الجهة');
    }

    // إعادة حساب الأدوار والقدرات للجهة الجديدة — لا تراكم بين السياقات:
    // القدرات تُبنى من الصفر لكل سياق، فلا يحمل المستخدم قدرات مستشفاه إلى
    // سياق التجمع ولا العكس.
    const { roles, permissions, capabilities } = await this.getRolesAndPermissions(
      user.accountId, organization.id,
    );
    this.assertContextHasRoles(roles, organization.nameAr);

    const tokens = await this.generateTokens(
      user.accountId, user.personId, organization.id, user.email, roles, permissions, capabilities,
    );

    return {
      activeOrganization: {
        id: organization.id,
        code: organization.code,
        nameAr: organization.nameAr,
        nameEn: organization.nameEn,
      },
      roles,
      permissions,
      capabilities,
      tokens,
    };
  }

  async refreshToken(dto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'miran-refresh-secret-change-in-production-2024',
      });

      const account = await this.prisma.userAccount.findUnique({
        where: { id: payload.sub },
      });

      if (!account || !account.refreshTokenHash) {
        throw new UnauthorizedException('رمز التحديث غير صالح');
      }

      const isTokenValid = await bcrypt.compare(dto.refreshToken, account.refreshTokenHash);
      if (!isTokenValid) {
        throw new UnauthorizedException('رمز التحديث انتهت صلاحيته');
      }

      // إعادة حساب الأدوار عند التحديث — دور سُحب من المستخدم يسقط عند أول تحديث
      // بدلاً من أن يبقى نافذاً حتى انتهاء صلاحية الرمز.
      const { roles, permissions, capabilities } = await this.getRolesAndPermissions(account.id, payload.orgId);
      const org = await this.prisma.organization.findUnique({
        where: { id: payload.orgId }, select: { nameAr: true },
      });
      this.assertContextHasRoles(roles, org?.nameAr ?? 'الجهة');
      const tokens = await this.generateTokens(account.id, account.personId, payload.orgId, account.email, roles, permissions, capabilities);
      const newRefreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);

      await this.prisma.userAccount.update({
        where: { id: account.id },
        data: { refreshTokenHash: newRefreshTokenHash },
      });

      return tokens;
    } catch {
      throw new UnauthorizedException('رمز التحديث غير صالح أو منتهي الصلاحية');
    }
  }

  async changePassword(user: IAuthenticatedUser, dto: ChangePasswordDto) {
    const account = await this.prisma.userAccount.findUnique({
      where: { id: user.accountId },
    });

    if (!account || !account.passwordHash) {
      throw new UnauthorizedException('الحساب غير موجود');
    }

    const isMatch = await bcrypt.compare(dto.currentPassword, account.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('كلمة المرور الحالية غير صحيحة');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.userAccount.update({
      where: { id: account.id },
      data: { passwordHash: newHash },
    });

    return { message: 'تم تغيير كلمة المرور بنجاح' };
  }

  async getProfile(user: IAuthenticatedUser) {
    const account = await this.prisma.userAccount.findUnique({
      where: { id: user.accountId },
      include: { person: true },
    });

    if (!account) {
      throw new UnauthorizedException('الحساب غير موجود');
    }

    const activeOrgId = user.organizationId;
    const { roles, permissions, capabilities } = await this.getRolesAndPermissions(account.id, activeOrgId);

    // Historical memberships included, matching the legacy unfiltered join.
    const orgContext = await this.orgAssignments.resolveOrgContext(account.id, { activeOnly: false });

    const activeEntry =
      orgContext.available.find((e) => e.organization.id === activeOrgId) ?? orgContext.available[0];

    const availableOrganizations = orgContext.available.map((entry) => ({
      id: entry.organization.id,
      code: entry.organization.code,
      nameAr: entry.organization.nameAr,
      nameEn: entry.organization.nameEn,
      type: entry.organization.organizationType?.code || 'hospital',
      logoUrl: entry.organization.logoUrl,
    }));

    return {
      user: {
        id: account.id,
        personId: account.personId,
        email: account.email,
        nameAr: account.person.nameAr,
        nameEn: account.person.nameEn,
        nationalId: account.person?.nationalId || null,
        phone: account.person?.phone || null,
        isActive: account.isActive,
        primaryRole: roles[0] || 'trainee',
        roles,
        permissions,
        // القدرات هي ما تبني عليه الواجهة قوائمها — لا مصفوفات أدوار مشفّرة.
        capabilities,
        activeOrganization: activeEntry ? {
          id: activeEntry.organization.id,
          code: activeEntry.organization.code,
          nameAr: activeEntry.organization.nameAr,
          nameEn: activeEntry.organization.nameEn,
          type: activeEntry.organization.organizationType?.code || 'hospital',
          logoUrl: activeEntry.organization.logoUrl,
          parentId: activeEntry.organization.parentId,
          parentNameAr: activeEntry.organization.parent?.nameAr || null,
        } : null,
        availableOrganizations,
      },
    };
  }

  async activateAccount(dto: ActivateAccountDto) {
    const account = await this.prisma.userAccount.findFirst({
      where: { activationToken: dto.token },
    });

    if (!account) {
      throw new BadRequestException('رمز التفعيل غير صحيح أو تم استخدامه مسبقاً');
    }

    if (account.activationTokenExpiresAt && account.activationTokenExpiresAt < new Date()) {
      throw new BadRequestException('انتهت صلاحية رمز التفعيل. يرجى طلب رمز جديد.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.prisma.userAccount.update({
      where: { id: account.id },
      data: {
        passwordHash,
        isActive: true,
        isEmailVerified: true,
        activationToken: null,
        activationTokenExpiresAt: null,
        activatedAt: new Date(),
      },
    });

    return { success: true, message: 'تم تفعيل الحساب وتعيين كلمة المرور بنجاح' };
  }

  private async generateTokens(
    accountId: string,
    personId: string,
    orgId: string,
    email: string,
    roles: string[],
    permissions: string[],
    capabilities: string[] = [],
  ) {
    // ─── roles + permissions + capabilities مدمجة في JWT لتجنب DB query في كل request ───
    const payload = { sub: accountId, personId, orgId, email, roles, permissions, capabilities };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET') || 'miran-access-secret-change-in-production-2024',
      expiresIn: (this.configService.get<string>('JWT_ACCESS_EXPIRATION') || '15m') as any,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'miran-refresh-secret-change-in-production-2024',
      expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d') as any,
    });

    return { accessToken, refreshToken, expiresIn: '15m' };
  }
}
