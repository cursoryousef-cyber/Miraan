import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { IAuthenticatedUser } from '../../../common/interfaces';

export interface JwtPayload {
  sub: string;       // userAccountId
  personId: string;
  orgId: string;     // active organizationId
  email: string;
  roles: string[];         // كودات الأدوار (مضمنة في JWT)
  permissions: string[];   // كودات الصلاحيات (مضمنة في JWT)
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET') || 'miran-access-secret-change-in-production-2024',
    });
  }

  async validate(payload: JwtPayload): Promise<IAuthenticatedUser> {
    // تحقق سريع من نشاط الحساب (بدون جلب كامل البيانات)
    const userAccount = await this.prisma.userAccount.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, personId: true, email: true, person: { select: { nameAr: true, nameEn: true } } },
    });

    if (!userAccount || !userAccount.isActive) {
      throw new UnauthorizedException('الحساب غير موجود أو معطل');
    }

    // ─── الأدوار والصلاحيات مُضمَّنة في JWT — لا DB query إضافية ───
    // fallback: إذا كان الـ JWT قديماً (قبل إضافة roles)، يُجلب من DB
    let roles: string[] = payload.roles || [];
    let permissions: string[] = payload.permissions || [];

    if (roles.length === 0) {
      // JWT قديم — جلب من DB مرة واحدة (Fallback للتوافق)
      const userRoles = await this.prisma.userRole.findMany({
        where: { userAccountId: payload.sub, organizationId: payload.orgId },
        include: {
          role: { include: { rolePermissions: { include: { permission: true } } } },
        },
      });
      roles = userRoles.map((ur) => ur.role.code);
      const permSet = new Set<string>();
      userRoles.forEach((ur) =>
        ur.role.rolePermissions.forEach((rp) => permSet.add(rp.permission.code)),
      );
      permissions = Array.from(permSet);
    }

    return {
      accountId: userAccount.id,
      personId: userAccount.personId,
      organizationId: payload.orgId,
      email: userAccount.email,
      nameAr: userAccount.person.nameAr,
      nameEn: userAccount.person.nameEn || undefined,
      roles,
      permissions,
    };
  }
}
