import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../common/guards';
import { ROLES_KEY } from '../../common/decorators';
import { LogbookController } from './logbook.controller';

/**
 * Business rule: a trainee does not author their own clinical log — a trainer
 * records it for them.
 *
 * That rule was previously enforced in two places that did not agree. The UI
 * hid the "record a case" button from trainees, and `POST /logbook/cases` was
 * gated correctly — but `/cases` is only an alias whose body calls straight
 * into `createLogEntry`, and `POST /logbook/entries`, the real endpoint behind
 * that method, still listed `trainee` in @RequireRoles. A trainee calling the
 * API directly was therefore accepted, hidden button or not.
 *
 * These tests read the role metadata off the decorated handlers themselves and
 * drive the real RolesGuard with it, so they fail if either endpoint's gate
 * drifts back.
 */
describe('LogbookController — clinical log creation role gate', () => {
  function canActivate(requiredRoles: string[], userRoles: string[]): boolean {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { accountId: 'acct-1', roles: userRoles },
          url: '/logbook/entries',
          method: 'POST',
        }),
      }),
    } as any;
    return guard.canActivate(context);
  }

  // Pulled live off the decorated methods — not a copy of the role list — so a
  // change to the controller is what these assertions actually measure.
  const ENTRY_ROLES: string[] = Reflect.getMetadata(
    ROLES_KEY,
    LogbookController.prototype.createLogEntry,
  );
  const CASE_ROLES: string[] = Reflect.getMetadata(
    ROLES_KEY,
    LogbookController.prototype.createCaseAlias,
  );

  describe('POST /logbook/entries', () => {
    it('refuses trainee — the rule is enforced on the server, not by hiding a button', () => {
      expect(ENTRY_ROLES).not.toContain('trainee');
      expect(() => canActivate(ENTRY_ROLES, ['trainee'])).toThrow(ForbiddenException);
    });

    it('does not refuse trainer on the basis of role', () => {
      expect(ENTRY_ROLES).toContain('trainer');
      expect(canActivate(ENTRY_ROLES, ['trainer'])).toBe(true);
    });

    it('leaves the other authoring roles untouched', () => {
      for (const role of [
        'hospital_training_admin',
        'cluster_administrator',
        'cluster_manager',
        'training_director',
        'platform_owner',
        'org_manager',
      ]) {
        expect(ENTRY_ROLES).toContain(role);
        expect(canActivate(ENTRY_ROLES, [role])).toBe(true);
      }
    });
  });

  describe('POST /logbook/cases (alias onto the same handler)', () => {
    it('also refuses trainee, so neither door into createLogEntry is open to them', () => {
      expect(CASE_ROLES).not.toContain('trainee');
      expect(() => canActivate(CASE_ROLES, ['trainee'])).toThrow(ForbiddenException);
    });

    it('does not refuse trainer on the basis of role', () => {
      expect(CASE_ROLES).toContain('trainer');
      expect(canActivate(CASE_ROLES, ['trainer'])).toBe(true);
    });
  });

  it('rejects an unauthenticated request outright', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['trainer']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: undefined }) }),
    } as any;
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
