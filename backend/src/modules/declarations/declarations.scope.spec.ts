import { DeclarationsController } from './declarations.controller';

/**
 * `DeclarationsController` used to take `organizationId` from the
 * `X-Organization-Id` request header — a value the caller supplies, not one the
 * server derives. Any authenticated account could read or write another
 * hospital's declarations by sending a different header, regardless of which
 * organisation their session actually belonged to.
 *
 * The fix removes the header entirely: every method now resolves scope from
 * the JWT via ScopeContextService, the same source every other hospital-scoped
 * resource uses, so the organisation a request touches is exactly the one the
 * caller's own session carries — never a value found only in the client's
 * request.
 */
describe('DeclarationsController scope', () => {
  const HOSPITAL_BORJ = 'hospital-borj';
  const HOSPITAL_AMEER = 'hospital-ameer';

  function makeController(activeOrgId: string) {
    const service = {
      createDeclaration: jest.fn().mockResolvedValue({ id: 'dec-1' }),
      getDeclarationsByOrg: jest.fn().mockResolvedValue([{ id: 'dec-1', organizationId: activeOrgId }]),
      getPendingDeclarationsForUser: jest.fn().mockResolvedValue([]),
      acceptDeclaration: jest.fn().mockResolvedValue({ id: 'acc-1' }),
      getAcceptanceStatistics: jest.fn().mockResolvedValue({ totalDeclarations: 0 }),
    } as any;
    const scopeContext = {
      resolve: jest.fn().mockResolvedValue({ organizationId: activeOrgId }),
    } as any;
    const controller = new DeclarationsController(service, scopeContext);
    return { controller, service, scopeContext };
  }

  const userBorj = { accountId: 'acct-borj', organizationId: HOSPITAL_BORJ, roles: ['hospital_training_admin'] } as any;

  it('resolves the organisation from the session, never from client input', async () => {
    const { controller, service, scopeContext } = makeController(HOSPITAL_BORJ);

    await controller.getByOrg(userBorj);

    // Only the account passed to ScopeContextService could have influenced the
    // result — there is no organisationId argument left for a client to forge.
    expect(scopeContext.resolve).toHaveBeenCalledWith(userBorj);
    expect(service.getDeclarationsByOrg).toHaveBeenCalledWith(HOSPITAL_BORJ);
  });

  it('a hospital-البرج session can never be resolved to hospital-الأمير data', async () => {
    const { controller, service } = makeController(HOSPITAL_BORJ);

    await controller.getByOrg(userBorj);

    // The call to the service never carries HOSPITAL_AMEER — there is no
    // parameter through which it could, now that the header is gone.
    expect(service.getDeclarationsByOrg).not.toHaveBeenCalledWith(HOSPITAL_AMEER);
    expect(service.getDeclarationsByOrg).toHaveBeenCalledWith(HOSPITAL_BORJ);
  });

  it('a session active in hospital-الأمير resolves to its own organisation only', async () => {
    const userAmeer = { accountId: 'acct-ameer', organizationId: HOSPITAL_AMEER, roles: ['hospital_training_admin'] } as any;
    const { controller, service } = makeController(HOSPITAL_AMEER);

    await controller.getByOrg(userAmeer);

    expect(service.getDeclarationsByOrg).toHaveBeenCalledWith(HOSPITAL_AMEER);
    expect(service.getDeclarationsByOrg).not.toHaveBeenCalledWith(HOSPITAL_BORJ);
  });

  it('create, accept, pending and statistics all derive organisationId from scope, not from the caller', async () => {
    const { controller, service, scopeContext } = makeController(HOSPITAL_BORJ);

    await controller.create({ type: 'ethics', titleAr: 't', contentAr: 'c' } as any, userBorj);
    expect(service.createDeclaration).toHaveBeenCalledWith(HOSPITAL_BORJ, expect.anything(), userBorj.accountId);

    await controller.getPending(userBorj);
    expect(service.getPendingDeclarationsForUser).toHaveBeenCalledWith(userBorj.accountId, HOSPITAL_BORJ);

    await controller.accept({ declarationId: 'dec-1', version: 1 } as any, userBorj, { headers: {} } as any);
    expect(service.acceptDeclaration).toHaveBeenCalledWith(userBorj.accountId, HOSPITAL_BORJ, expect.anything(), expect.anything());

    await controller.getStatistics(userBorj);
    expect(service.getAcceptanceStatistics).toHaveBeenCalledWith(HOSPITAL_BORJ);

    expect(scopeContext.resolve).toHaveBeenCalledTimes(4);
  });
});
