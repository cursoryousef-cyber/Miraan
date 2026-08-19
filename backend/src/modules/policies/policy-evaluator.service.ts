import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../../common/interfaces';

export interface IPolicyEvaluationRequest {
  user: IAuthenticatedUser;
  resource: string;
  action: string;
  context?: Record<string, unknown>;
}

export interface IPolicyDecision {
  allowed: boolean;
  policyCode?: string;
  reason?: string;
}

@Injectable()
export class PolicyEvaluatorService {
  constructor(private prisma: PrismaService) {}

  async evaluate(req: IPolicyEvaluationRequest): Promise<IPolicyDecision> {
    const { user, resource, action, context = {} } = req;

    // Platform Owner bypasses policy checks
    if (user.roles.includes('platform_owner')) {
      return { allowed: true, reason: 'Platform Owner bypass' };
    }

    // Fetch applicable policies for this resource & action (global + org-specific)
    const policies = await this.prisma.policy.findMany({
      where: {
        resource,
        action,
        isActive: true,
        OR: [
          { organizationId: null },
          { organizationId: user.organizationId },
        ],
      },
      orderBy: { priority: 'desc' },
    });

    if (policies.length === 0) {
      // Fallback to permission check if no policies defined
      const hasPermission = user.permissions.includes(`${action}_${resource}`) || user.permissions.includes(`manage_${resource}`);
      return {
        allowed: hasPermission,
        reason: hasPermission ? 'Permission match' : 'No explicit policy found',
      };
    }

    // Check DENY policies first
    for (const policy of policies.filter((p) => p.effect === 'deny')) {
      if (this.matchesConditions(policy.conditions as Record<string, unknown>, user, context)) {
        return {
          allowed: false,
          policyCode: policy.code,
          reason: `Denied by policy: ${policy.nameAr}`,
        };
      }
    }

    // Check ALLOW policies
    for (const policy of policies.filter((p) => p.effect === 'allow')) {
      if (this.matchesConditions(policy.conditions as Record<string, unknown>, user, context)) {
        return {
          allowed: true,
          policyCode: policy.code,
          reason: `Allowed by policy: ${policy.nameAr}`,
        };
      }
    }

    return { allowed: false, reason: 'No matching ALLOW policy found' };
  }

  private matchesConditions(
    conditions: Record<string, unknown>,
    user: IAuthenticatedUser,
    context: Record<string, unknown>,
  ): boolean {
    if (!conditions || Object.keys(conditions).length === 0) return true;

    // Evaluate role requirement
    if (conditions.roles && Array.isArray(conditions.roles)) {
      const hasRole = (conditions.roles as string[]).some((r) => user.roles.includes(r));
      if (!hasRole) return false;
    }

    // Evaluate ownership requirement (e.g. subject is the creator/owner)
    if (conditions.isOwner === true) {
      if (context.ownerId !== user.accountId && context.personId !== user.personId) {
        return false;
      }
    }

    // Evaluate org match
    if (conditions.sameOrg === true) {
      if (context.organizationId && context.organizationId !== user.organizationId) {
        return false;
      }
    }

    return true;
  }
}
