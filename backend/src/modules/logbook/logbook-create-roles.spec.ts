import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../common/guards';
import { ROLES_KEY } from '../../common/decorators';
import { LogbookController } from './logbook.controller';

/**
 * Business rule: a trainee records their own clinical case and a trainer approves
 * it. The capability model states this directly — LOGBOOK_SUBMIT is granted to
 * `trainee` and to no other role, while `trainer` holds LOGBOOK_APPROVE.
 *
 * Both doors into `createLogEntry` must therefore admit the trainee, and both
 * must keep admitting the supervising roles who file on an assigned trainee's
 * behalf. `/logbook/cases` is only an alias whose body calls straight into
 * `createLogEntry`, so a gate that disagrees between the two leaves one door
 * open or, as happened here, shuts the role that owns the capability out of both.
 *
 * These tests read the role metadata off the decorated handlers themselves and
 * drive the real RolesGuard with it, so they fail if either endpoint's gate
 * drifts apart from the other.
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
    it('admits the trainee — the role that holds logbook.submit', () => {
      expect(ENTRY_ROLES).toContain('trainee');
      expect(canActivate(ENTRY_ROLES, ['trainee'])).toBe(true);
    });

    it('refuses a role holding no logbook capability at all', () => {
      expect(ENTRY_ROLES).not.toContain('hospital_administrator');
      expect(() => canActivate(ENTRY_ROLES, ['hospital_administrator'])).toThrow(ForbiddenException);
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
    it('admits the trainee too, so both doors into createLogEntry agree', () => {
      expect(CASE_ROLES).toContain('trainee');
      expect(canActivate(CASE_ROLES, ['trainee'])).toBe(true);
    });

    it('agrees with /entries on the trainee, which is the alias contract', () => {
      expect(CASE_ROLES.includes('trainee')).toBe(ENTRY_ROLES.includes('trainee'));
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
