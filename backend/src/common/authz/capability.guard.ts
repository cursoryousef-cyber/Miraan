// ============================================================================
// CapabilityGuard — enforces `capability ∧ active context` on a route.
//
// Deliberately stricter than the old RolesGuard in two ways:
//   1. It resolves a ScopeContext and attaches it to the request, so services
//      never have to re-derive scope from the raw JWT.
//   2. It refuses a capability held from the wrong vantage point. A cluster
//      training manager holding capacity.view cannot use it to reach into a
//      hospital's internals, because capacity.manage is hospital-context only
//      and they do not hold it at all.
//
// There is no platform bypass here. Platform roles are granted every capability
// explicitly in ROLE_CAPABILITIES, which keeps "what may this role do" answerable
// by reading one table rather than by remembering that a guard has an escape
// hatch in it.
// ============================================================================

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators';
import { IAuthenticatedUser } from '../interfaces';
import { Capability } from './capabilities';
import { ScopeContext, ScopeContextService } from './scope-context.service';
import {
  CAPABILITIES_KEY,
  CAPABILITY_MODE_KEY,
  CapabilityMode,
} from './authz.decorators';

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private scopeContext: ScopeContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Capability[]>(
      CAPABILITIES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context
      .switchToHttp()
      .getRequest<{ user?: IAuthenticatedUser; scope?: ScopeContext }>();
    const user = request.user;
    if (!user) throw new UnauthorizedException();

    // Resolve scope even for unannotated routes: services downstream rely on
    // request.scope existing, and an unannotated route is still scope-filtered.
    const ctx = await this.scopeContext.resolve(user);
    request.scope = ctx;

    if (!required || required.length === 0) return true;

    const mode =
      this.reflector.getAllAndOverride<CapabilityMode>(CAPABILITY_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'any';

    const satisfied =
      mode === 'all'
        ? required.every((cap) => this.scopeContext.hasCapability(ctx, cap))
        : required.some((cap) => this.scopeContext.hasCapability(ctx, cap));

    if (!satisfied) {
      console.warn('[AUTH_DEBUG] CapabilityGuard Forbidden', {
        userId: user?.accountId,
        organizationId: user?.organizationId,
        userRoles: user?.roles,
        requiredCapabilities: required,
        contextType: ctx.contextType,
        reason: 'User lacks required capability or active context type',
      });
      const held = required.filter((cap) => ctx.capabilities.has(cap));
      if (held.length > 0) {
        throw new ForbiddenException(
          `هذا الإجراء غير متاح من سياق العمل الحالي (${ctx.contextType}) — بدّل إلى السياق المناسب`,
        );
      }
      throw new ForbiddenException('ليس لديك الصلاحية المطلوبة لهذا الإجراء');
    }

    return true;
  }
}
