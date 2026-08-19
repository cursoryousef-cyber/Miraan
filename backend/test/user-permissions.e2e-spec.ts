/**
 * User permission overrides — GET/PATCH /org-members/:id/permissions.
 *
 * Proves the resolution rule the whole feature rests on:
 *
 *     effective = rolePermissions + userGrants − userDenies
 *
 * The subtraction half is the part that did not exist before: a
 * UserPermission(granted:false) row was written and audited but never applied,
 * so a "revoked" permission still authorised. These tests assert the rule at the
 * two places it has to hold — the resolver that mints a token, and the screen
 * that reports it — plus the scope and RBAC boundaries around editing it.
 *
 * Isolated test database only.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { SCENARIO, seedE2EScenario, resetE2EScenario } from '../src/seed/seed-e2e-scenario';

const prisma = new PrismaClient();
let app: INestApplication;
let http: ReturnType<typeof request>;
let s: Awaited<ReturnType<typeof seedE2EScenario>>;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function login(email: string): Promise<string> {
  const res = await http.post('/auth/login').send({ email, password: SCENARIO.password });
  if (![200, 201].includes(res.status)) throw new Error(`login ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.tokens.accessToken;
}

/** Permissions the token actually carries — what authorisation sees. */
async function permissionsInToken(email: string): Promise<string[]> {
  const res = await http.post('/auth/login').send({ email, password: SCENARIO.password });
  return res.body.user.permissions as string[];
}

async function accountIdOf(email: string): Promise<string> {
  const a = await prisma.userAccount.findUnique({ where: { email } });
  if (!a) throw new Error(`no account ${email}`);
  return a.id;
}

async function setOverride(
  token: string, accountId: string, permissionCode: string, mode: 'grant' | 'deny' | 'inherit',
) {
  return http
    .patch(`/org-members/${accountId}/permissions`)
    .set(auth(token))
    .send({ permissionCode, mode });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  http = request(app.getHttpServer());
  await resetE2EScenario();
  s = await seedE2EScenario();
}, 120_000);

afterAll(async () => {
  // Overrides are the only rows these tests create; the shared reset does not
  // know about them, so clear them explicitly to keep reruns clean.
  await prisma.userPermission.deleteMany({});
  await resetE2EScenario();
  await prisma.$disconnect();
  await app?.close();
});

describe('User permission overrides', () => {
  // A permission the trainer role genuinely inherits, and one it genuinely does
  // not — both resolved from the seeded data rather than assumed, so the tests
  // stay true if the role catalogue changes.
  let inheritedCode: string;
  let notInheritedCode: string;
  let trainerAccountId: string;
  let trainer2AccountId: string;
  let hospitalAdminToken: string;

  beforeAll(async () => {
    hospitalAdminToken = await login(SCENARIO.accounts.hospital1TrainingAdmin);
    trainerAccountId = await accountIdOf(SCENARIO.accounts.hospital1Trainer);
    trainer2AccountId = await accountIdOf(SCENARIO.accounts.hospital1Trainer2);

    const res = await http
      .get(`/org-members/${trainerAccountId}/permissions`)
      .set(auth(hospitalAdminToken));
    expect(res.status).toBe(200);

    const rows = res.body.data.permissions as Array<{ code: string; inherited: boolean }>;
    inheritedCode = rows.find((p) => p.inherited)!.code;
    notInheritedCode = rows.find((p) => !p.inherited)!.code;
    expect(inheritedCode).toBeTruthy();
    expect(notInheritedCode).toBeTruthy();
  });

  it('1. a role permission authorises, and is reported with source "role"', async () => {
    const tokenPerms = await permissionsInToken(SCENARIO.accounts.hospital1Trainer);
    expect(tokenPerms).toContain(inheritedCode);

    const res = await http
      .get(`/org-members/${trainerAccountId}/permissions`)
      .set(auth(hospitalAdminToken));
    const row = res.body.data.permissions.find((p: any) => p.code === inheritedCode);
    expect(row).toMatchObject({ inherited: true, granted: false, denied: false, effective: true, source: 'role' });
  });

  it('2. a user grant authorises a permission the role does not carry', async () => {
    const before = await permissionsInToken(SCENARIO.accounts.hospital1Trainer);
    expect(before).not.toContain(notInheritedCode);

    const res = await setOverride(hospitalAdminToken, trainerAccountId, notInheritedCode, 'grant');
    expect([200, 201]).toContain(res.status);

    const after = await permissionsInToken(SCENARIO.accounts.hospital1Trainer);
    expect(after).toContain(notInheritedCode);

    const view = await http.get(`/org-members/${trainerAccountId}/permissions`).set(auth(hospitalAdminToken));
    const row = view.body.data.permissions.find((p: any) => p.code === notInheritedCode);
    expect(row).toMatchObject({ inherited: false, granted: true, effective: true, source: 'user_grant' });

    await setOverride(hospitalAdminToken, trainerAccountId, notInheritedCode, 'inherit');
  });

  it('3. a user deny withdraws a permission inherited from the role', async () => {
    const before = await permissionsInToken(SCENARIO.accounts.hospital1Trainer);
    expect(before).toContain(inheritedCode);

    const res = await setOverride(hospitalAdminToken, trainerAccountId, inheritedCode, 'deny');
    expect([200, 201]).toContain(res.status);

    // The token — i.e. what every guard reads — no longer carries it.
    const after = await permissionsInToken(SCENARIO.accounts.hospital1Trainer);
    expect(after).not.toContain(inheritedCode);

    const view = await http.get(`/org-members/${trainerAccountId}/permissions`).set(auth(hospitalAdminToken));
    const row = view.body.data.permissions.find((p: any) => p.code === inheritedCode);
    expect(row).toMatchObject({ inherited: true, denied: true, effective: false, source: 'user_deny' });
  });

  it('4. a deny on one member does not affect another member of the same role', async () => {
    // Trainer 1 is still denied from the previous test.
    const denied = await permissionsInToken(SCENARIO.accounts.hospital1Trainer);
    expect(denied).not.toContain(inheritedCode);

    const other = await permissionsInToken(SCENARIO.accounts.hospital1Trainer2);
    expect(other).toContain(inheritedCode);

    const view = await http.get(`/org-members/${trainer2AccountId}/permissions`).set(auth(hospitalAdminToken));
    const row = view.body.data.permissions.find((p: any) => p.code === inheritedCode);
    expect(row).toMatchObject({ denied: false, effective: true, source: 'role' });
  });

  it('restoring to inherit brings the role permission back', async () => {
    const res = await setOverride(hospitalAdminToken, trainerAccountId, inheritedCode, 'inherit');
    expect([200, 201]).toContain(res.status);

    const after = await permissionsInToken(SCENARIO.accounts.hospital1Trainer);
    expect(after).toContain(inheritedCode);
  });

  it('5. permission edits cannot cross an organisation boundary', async () => {
    const hospital2Admin = await login(SCENARIO.accounts.hospital2TrainingAdmin);

    // Hospital 2 knows hospital 1's trainer account id but holds no membership
    // for them, so neither reading nor writing their overrides is possible.
    const read = await http.get(`/org-members/${trainerAccountId}/permissions`).set(auth(hospital2Admin));
    expect([400, 403, 404]).toContain(read.status);

    const write = await setOverride(hospital2Admin, trainerAccountId, inheritedCode, 'deny');
    expect([400, 403, 404]).toContain(write.status);

    // And the cross-org attempt changed nothing.
    const perms = await permissionsInToken(SCENARIO.accounts.hospital1Trainer);
    expect(perms).toContain(inheritedCode);
  });

  it('6. an unauthorised role cannot edit permissions through the API', async () => {
    const trainerToken = await login(SCENARIO.accounts.hospital1Trainer);

    const write = await setOverride(trainerToken, trainer2AccountId, inheritedCode, 'deny');
    expect([401, 403]).toContain(write.status);

    const read = await http.get(`/org-members/${trainer2AccountId}/permissions`).set(auth(trainerToken));
    expect([401, 403]).toContain(read.status);

    const perms = await permissionsInToken(SCENARIO.accounts.hospital1Trainer2);
    expect(perms).toContain(inheritedCode);
  });

  it('rejects an unknown permission code and an invalid mode', async () => {
    const bad = await setOverride(hospitalAdminToken, trainerAccountId, 'no_such_permission_code', 'grant');
    expect(bad.status).toBe(400);

    const badMode = await http
      .patch(`/org-members/${trainerAccountId}/permissions`)
      .set(auth(hospitalAdminToken))
      .send({ permissionCode: inheritedCode, mode: 'sideways' });
    expect(badMode.status).toBe(400);
  });

  it('writes an audit log entry for an override', async () => {
    await setOverride(hospitalAdminToken, trainerAccountId, notInheritedCode, 'grant');
    const entry = await prisma.auditLog.findFirst({
      where: { action: 'org_member.permission_override', entityId: trainerAccountId },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry).toBeTruthy();
    expect((entry!.newValues as any).permission).toBe(notInheritedCode);
    await setOverride(hospitalAdminToken, trainerAccountId, notInheritedCode, 'inherit');
  });
});
