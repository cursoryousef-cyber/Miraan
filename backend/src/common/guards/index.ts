// ============================================================================
// Guards — Authentication, RBAC, Permission, Tenant Isolation
// ============================================================================

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import {
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  ROLES_KEY,
} from '../decorators';
import { IAuthenticatedUser } from '../interfaces';

/**
 * JWT Auth Guard — Validates JWT token on every request.
 * Skips validation if @Public() decorator is present.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser = IAuthenticatedUser>(
    err: Error | null,
    user: TUser | false,
  ): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('غير مصرّح بالدخول');
    }
    return user;
  }
}

/**
 * Roles Guard — Checks if user has required roles.
 * Used with @RequireRoles() decorator.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as IAuthenticatedUser;
    if (!user) throw new UnauthorizedException();

    const hasRole = requiredRoles.some((role) => user.roles?.includes(role));
    if (!hasRole) {
      console.warn('[AUTH_DEBUG] RolesGuard Forbidden', {
        userId: user?.accountId,
        organizationId: user?.organizationId,
        userRoles: user?.roles,
        requiredRoles,
        endpoint: request.url,
        method: request.method,
        reason: 'User roles do not match required roles',
      });
      throw new ForbiddenException('ليس لديك الدور المطلوب لهذا الإجراء');
    }
    return true;
  }
}

/**
 * Permissions Guard — Checks if user has required permissions.
 * Used with @RequirePermissions() decorator.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as IAuthenticatedUser;
    if (!user) throw new UnauthorizedException();

    // Master Bypass for Platform Owner and System Admin
    if (user.roles.includes('platform_owner') || user.roles.includes('system_admin')) {
      return true;
    }

    const hasPermission = requiredPermissions.every((perm) =>
      user.permissions.includes(perm),
    );
    if (!hasPermission) {
      throw new ForbiddenException('ليس لديك الصلاحية المطلوبة لهذا الإجراء');
    }
    return true;
  }
}

/**
 * Org Context Guard — Ensures organization context is set.
 * Prevents access without an active organization.
 */
@Injectable()
export class OrgContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const isPublic = context
      .switchToHttp()
      .getRequest()
      ?.route?.path?.includes?.('auth');
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as IAuthenticatedUser;

    if (!user?.organizationId) {
      throw new ForbiddenException(
        'يجب اختيار جهة قبل الوصول لهذا المورد',
      );
    }
    return true;
  }
}
