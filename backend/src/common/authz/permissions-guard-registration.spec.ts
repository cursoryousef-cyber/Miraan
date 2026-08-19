import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../guards';
import { PERMISSIONS_KEY } from '../decorators';
import { CAPABILITIES_KEY } from './authz.decorators';
import { CAPABILITIES, ROLE_CAPABILITIES } from './capabilities';

import { PersonsController } from '../../modules/persons/persons.controller';
import { OrganizationsController } from '../../modules/organizations/organizations.controller';
import { IntegrationsController } from '../../modules/integrations/integrations.controller';
import { FeatureFlagsController } from '../../modules/feature-flags/feature-flags.controller';
import { PoliciesController } from '../../modules/policies/policies.controller';
import { SettingsController } from '../../modules/settings/settings.controller';
import { LicensesController } from '../../modules/licenses/licenses.controller';
import { WorkflowsController } from '../../modules/workflows/workflows.controller';

/**
 * `@RequirePermissions` is inert unless PermissionsGuard is actually registered
 * in the controller's `@UseGuards`. Eight controllers declared the decorator but
 * never registered the guard, so every route on them was reachable by any
 * authenticated session — a trainee included. Proven live before the fix:
 * GET /persons returned 200 with 20 person records (national IDs, dates of
 * birth, phone numbers, emergency contacts), and /organizations, /policies,
 * /integrations and /feature-flags answered a trainee too.
 *
 * These tests assert both halves of the contract:
 *   1. the guard is registered on the controller class, and
 *   2. driving the real guard with the route's real metadata refuses the roles
 *      that hold no permissions and admits the ones that do.
 *
 * Everything runs against decorator metadata and the guard itself — no Nest
 * bootstrap, no database, no writes.
 */
describe('PermissionsGuard registration and enforcement', () => {
  // Permission sets taken from real production JWTs (see audit): trainee and
  // trainer carry none of these; the admin roles carry the read/write ones.
  const TRAINEE: string[] = [];
  const TRAINER: string[] = [];
  const PLATFORM_OWNER = ['view_organizations', 'manage_organizations', 'view_users', 'manage_users', 'manage_roles'];
  const HOSPITAL_TRAINING_ADMIN = ['view_organizations', 'view_users', 'manage_users', 'manage_roles'];

  function guardAllows(requiredPermissions: string[], roles: string[], permissions: string[]): boolean {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredPermissions),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { accountId: 'acct-1', roles, permissions }, url: '/x', method: 'GET' }),
      }),
    } as any;
    return guard.canActivate(context);
  }

  /** The permissions a route really demands, read off its own decorator. */
  const permsOf = (proto: any, method: string): string[] | undefined =>
    Reflect.getMetadata(PERMISSIONS_KEY, proto[method]);

  /** Guard list registered on the controller class, as Nest resolves it. */
  const guardsOf = (ctrl: any): any[] => Reflect.getMetadata('__guards__', ctrl) ?? [];

  const CONTROLLERS: Array<[string, any]> = [
    ['PersonsController', PersonsController],
    ['OrganizationsController', OrganizationsController],
    ['IntegrationsController', IntegrationsController],
    ['FeatureFlagsController', FeatureFlagsController],
    ['PoliciesController', PoliciesController],
    ['SettingsController', SettingsController],
    ['LicensesController', LicensesController],
    ['WorkflowsController', WorkflowsController],
  ];

  describe('every controller that declares @RequirePermissions registers the guard', () => {
    it.each(CONTROLLERS)('%s', (_name, ctrl) => {
      expect(guardsOf(ctrl)).toContain(PermissionsGuard);
    });
  });

  /**
   * Route-level checks. Each entry is a route that carries @RequirePermissions
   * and no other effective decorator — exactly the set that was open.
   */
  const ROUTES: Array<[string, any, string]> = [
    ['GET /persons', PersonsController, 'findAll'],
    ['GET /integrations/configs', IntegrationsController, 'findAllConfigs'],
    ['GET /integrations/webhooks', IntegrationsController, 'findAllWebhooks'],
    ['GET /policies', PoliciesController, 'findAll'],
  ];

  describe('a trainee is refused on every previously-open read route', () => {
    it.each(ROUTES)('%s → 403 for trainee', (_label, ctrl, method) => {
      const required = permsOf(ctrl.prototype, method);
      expect(required).toBeDefined();
      expect(() => guardAllows(required!, ['trainee'], TRAINEE)).toThrow(ForbiddenException);
    });

    it.each(ROUTES)('%s → 403 for trainer', (_label, ctrl, method) => {
      const required = permsOf(ctrl.prototype, method);
      expect(() => guardAllows(required!, ['trainer'], TRAINER)).toThrow(ForbiddenException);
    });
  });

  /**
   * Write and delete routes. Asserted through the guard rather than by calling
   * the handlers, so nothing is ever written or deleted.
   */
  const WRITE_ROUTES: Array<[string, any, string]> = [
    ['POST /persons', PersonsController, 'create'],
    ['PATCH /persons/:id', PersonsController, 'update'],
    ['DELETE /persons/:id', PersonsController, 'remove'],
    ['POST /organizations', OrganizationsController, 'create'],
    ['PATCH /organizations/:id', OrganizationsController, 'update'],
    ['DELETE /organizations/:id', OrganizationsController, 'remove'],
    ['POST /settings', SettingsController, 'updateSetting'],
    ['POST /workflows/definitions', WorkflowsController, 'createDefinition'],
    ['POST /integrations/configs', IntegrationsController, 'createConfig'],
    ['DELETE /integrations/webhooks/:id', IntegrationsController, 'removeWebhook'],
    ['POST /policies', PoliciesController, 'create'],
    ['DELETE /policies/:id', PoliciesController, 'remove'],
  ];

  describe('write and delete routes are unreachable for trainee and trainer', () => {
    it.each(WRITE_ROUTES)('%s → 403 for trainee', (_label, ctrl, method) => {
      const required = permsOf(ctrl.prototype, method);
      expect(required).toBeDefined();
      expect(() => guardAllows(required!, ['trainee'], TRAINEE)).toThrow(ForbiddenException);
    });

    it.each(WRITE_ROUTES)('%s → 403 for trainer', (_label, ctrl, method) => {
      const required = permsOf(ctrl.prototype, method);
      expect(() => guardAllows(required!, ['trainer'], TRAINER)).toThrow(ForbiddenException);
    });
  });

  describe('authorised roles keep working — the fix narrows, it does not lock out', () => {
    it('platform_owner passes every one of these routes', () => {
      for (const [, ctrl, method] of [...ROUTES, ...WRITE_ROUTES]) {
        const required = permsOf(ctrl.prototype, method)!;
        expect(guardAllows(required, ['platform_owner'], PLATFORM_OWNER)).toBe(true);
      }
    });

    it('system_admin is admitted by the guard bypass even with no permission rows', () => {
      const required = permsOf(PersonsController.prototype, 'findAll')!;
      expect(guardAllows(required, ['system_admin'], [])).toBe(true);
    });
  });

  /**
   * Reading the organisation directory is gated on the ORG_VIEW *capability*,
   * not the legacy 'view_organizations' permission.
   *
   * Registering PermissionsGuard exposed a mismatch: org_manager and
   * academic_supervisor hold ORG_VIEW in ROLE_CAPABILITIES but were never given
   * the matching RBAC permission row, so a permission gate refused roles the
   * capability model says may read. Moving these three read routes onto the
   * capability — the same one hospitals-cards/statistics/hospitals next to them
   * already use — resolves that without granting anything new, because trainer
   * and trainee hold no ORG_VIEW and stay refused.
   */
  describe('organisation reads are capability-gated, not permission-gated', () => {
    const ORG_READ_ROUTES = ['findAll', 'getTree', 'findOne'] as const;

    it.each(ORG_READ_ROUTES)('%s no longer carries @RequirePermissions', (method) => {
      expect(permsOf(OrganizationsController.prototype, method)).toBeUndefined();
    });

    it.each(ORG_READ_ROUTES)('%s requires the ORG_VIEW capability', (method) => {
      const caps = Reflect.getMetadata(
        CAPABILITIES_KEY,
        (OrganizationsController.prototype as any)[method],
      );
      expect(caps).toContain(CAPABILITIES.ORG_VIEW);
    });

    it('roles the capability model grants ORG_VIEW can read; trainer and trainee cannot', () => {
      // Read straight from the capability table so this tracks the source of
      // truth rather than a copy of it.
      const holds = (role: string) =>
        (ROLE_CAPABILITIES[role] ?? []).includes(CAPABILITIES.ORG_VIEW);

      for (const role of [
        'org_manager',
        'academic_supervisor',
        'hospital_training_admin',
        'hospital_administrator',
        'cluster_manager',
        'university_administrator',
      ]) {
        expect(holds(role)).toBe(true);
      }
      // The security fix must survive the change.
      expect(holds('trainer')).toBe(false);
      expect(holds('trainee')).toBe(false);
    });

    it('authoring organisations stays restricted to manage_organizations', () => {
      for (const method of ['create', 'update', 'remove']) {
        expect(permsOf(OrganizationsController.prototype, method)).toEqual(['manage_organizations']);
      }
    });
  });

  it('rejects an unauthenticated request', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['view_users']) } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: undefined }) }),
    } as any;
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
