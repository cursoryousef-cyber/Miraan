// ============================================================================
// Authorisation decorators — the controller-facing half of the capability model.
// ============================================================================

import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Capability } from './capabilities';
import { ScopeContext } from './scope-context.service';

export type CapabilityMode = 'any' | 'all';

export const CAPABILITIES_KEY = 'authz:capabilities';
export const CAPABILITY_MODE_KEY = 'authz:capabilityMode';
export const SCOPED_RESOURCE_KEY = 'authz:scopedResource';

/**
 * Route requires at least one of the listed capabilities, exercised from a
 * context in which that capability is valid.
 *
 *   @RequireCapability(CAPABILITIES.TRAINING_REQUEST_REVIEW)
 */
export const RequireCapability = (...capabilities: Capability[]) =>
  SetMetadata(CAPABILITIES_KEY, capabilities);

/** Route requires every listed capability. */
export const RequireAllCapabilities = (...capabilities: Capability[]) => {
  const set = SetMetadata(CAPABILITIES_KEY, capabilities);
  const mode = SetMetadata(CAPABILITY_MODE_KEY, 'all');
  return (
    target: object,
    key?: string | symbol,
    descriptor?: PropertyDescriptor,
  ) => {
    set(target, key as string, descriptor as PropertyDescriptor);
    mode(target, key as string, descriptor as PropertyDescriptor);
  };
};

export type ScopedResourceKind =
  | 'trainingRequest'
  | 'trainingRequestTrainee'
  | 'organization'
  | 'department'
  | 'academicIntake'
  | 'traineeAllocation'
  | 'trainerProfile'
  | 'rotation'
  | 'attendance'
  | 'task';

export interface ScopedResourceSpec {
  kind: ScopedResourceKind;
  /** Route param holding the resource id. */
  param: string;
}

/**
 * Declares that a route addresses a specific record, so ScopeGuard can load it
 * and refuse ids belonging to organisations outside the session's scope. This is
 * what closes the IDOR on GET /training-requests/:id and its siblings.
 */
export const ScopedResource = (kind: ScopedResourceKind, param = 'id') =>
  SetMetadata(SCOPED_RESOURCE_KEY, {
    kind,
    param,
  } satisfies ScopedResourceSpec);

/**
 * Injects the resolved ScopeContext. Prefer this over @CurrentUser in training
 * services — it carries the scope, not just the identity.
 */
export const Scope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ScopeContext | undefined => {
    return ctx.switchToHttp().getRequest<{ scope?: ScopeContext }>().scope;
  },
);
