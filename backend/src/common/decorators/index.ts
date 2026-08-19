// ============================================================================
// Custom Decorators
// ============================================================================

import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { IAuthenticatedUser } from '../interfaces';

/**
 * @CurrentUser() — Extracts the authenticated user from the request.
 * Usage: @CurrentUser() user: IAuthenticatedUser
 * Usage: @CurrentUser('accountId') accountId: string
 */
export const CurrentUser = createParamDecorator(
  (data: keyof IAuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as IAuthenticatedUser;
    return data ? user?.[data] : user;
  },
);

/**
 * @OrgContext() — Extracts the current organization ID from the request.
 * Equivalent to @CurrentUser('organizationId') but more semantic.
 */
export const OrgContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.organizationId;
  },
);

/**
 * @RequirePermissions(...permissions) — Marks endpoint as requiring specific permissions.
 * Used with PermissionsGuard.
 * Usage: @RequirePermissions('manage_users', 'manage_organizations')
 */
export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * @RequireRoles(...roles) — Marks endpoint as requiring specific roles.
 * Usage: @RequireRoles('platform_owner', 'cluster_administrator')
 */
export const ROLES_KEY = 'roles';
export const RequireRoles = (...roles: string[]) =>
  SetMetadata(ROLES_KEY, roles);

/**
 * @Public() — Marks endpoint as publicly accessible (no JWT required).
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * @AuditAction(action) — Marks endpoint for audit logging.
 * Usage: @AuditAction('organization.created')
 */
export const AUDIT_ACTION_KEY = 'auditAction';
export const AuditAction = (action: string) =>
  SetMetadata(AUDIT_ACTION_KEY, action);
