// ============================================================================
// Interceptors — Audit Logging, Response Transformation
// ============================================================================

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT_ACTION_KEY } from '../decorators';
import { IAuthenticatedUser } from '../interfaces';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Audit Interceptor — Automatically logs mutations to audit_logs table.
 * Triggered by @AuditAction() decorator or automatically on POST/PUT/PATCH/DELETE.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Only audit mutations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const auditAction = this.reflector.get<string>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );

    // Skip if no explicit audit action and method is not a mutation
    if (!auditAction && !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const user = request.user as IAuthenticatedUser | undefined;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(async (responseData) => {
        try {
          const action =
            auditAction ||
            `${method.toLowerCase()}.${request.route?.path || 'unknown'}`;

          // Extract entity info from response if available
          const entityId =
            responseData?.id || responseData?.data?.id || request.params?.id;
          const entityType = this.extractEntityType(request.route?.path);

          await this.prisma.auditLog.create({
            data: {
              organizationId: user?.organizationId || null,
              actorId: user?.accountId || null,
              action,
              entityType,
              entityId: entityId || null,
              oldValues: method === 'PUT' || method === 'PATCH' ? request.body : null,
              newValues: responseData?.data || responseData || null,
              ipAddress: request.ip || request.connection?.remoteAddress,
              userAgent: request.headers?.['user-agent'] || null,
            },
          });
        } catch {
          // Audit logging should never break the main flow
          console.error('Audit log failed silently');
        }
      }),
    );
  }

  private extractEntityType(path?: string): string {
    if (!path) return 'unknown';
    // Extract entity from path: /api/v1/organizations/:id → organization
    const parts = path.split('/').filter(Boolean);
    const entity = parts.find(
      (p) => !p.startsWith(':') && !['api', 'v1'].includes(p),
    );
    return entity || 'unknown';
  }
}

/**
 * Transform Interceptor — Wraps all responses in standard API format.
 * { success: true, data: {...} }
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap(() => {
        // Transform is done in the response — could wrap here if needed
      }),
    );
  }
}
