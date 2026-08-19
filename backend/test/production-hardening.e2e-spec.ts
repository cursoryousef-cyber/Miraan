/**
 * Regression guard for the pilot-release security hardening.
 *
 * Two classes of check:
 *
 *  1. Behavioural — a member created through POST /org-members without an
 *     explicit password must NOT end up with the old shared fallback
 *     ('Miran@Admin2024!'), which was also the published Swagger example for
 *     POST /auth/login. That combination meant a publicly documented credential
 *     opened any such account. The account must be unusable until a password is
 *     set deliberately.
 *
 *  2. Source-level — invariants that cannot be observed through HTTP: the
 *     production seed carries no shared password and covers the full pilot role
 *     set, and Swagger is off by default in production. These are asserted
 *     against the source so the guarantees cannot be silently reverted.
 *
 * Isolated test database only.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { SCENARIO, seedE2EScenario, resetE2EScenario } from '../src/seed/seed-e2e-scenario';

const prisma = new PrismaClient();
let app: INestApplication;
let http: ReturnType<typeof request>;
let s: Awaited<ReturnType<typeof seedE2EScenario>>;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

/** The credential that used to be hardcoded across the app and its docs. */
const RETIRED_PASSWORD = 'Miran@Admin2024!';
const src = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

async function login(email: string): Promise<string> {
  const res = await http.post('/auth/login').send({ email, password: SCENARIO.password });
  if (![200, 201].includes(res.status)) throw new Error(`login ${email}: ${res.status}`);
  return res.body.tokens.accessToken;
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
  const created = await prisma.userAccount.findMany({
    where: { email: { startsWith: 'harden_' } },
    select: { id: true, personId: true },
  });
  if (created.length) {
    const ids = created.map((a) => a.id);
    const personIds = created.map((a) => a.personId);
    await prisma.trainerProfile.deleteMany({ where: { personId: { in: personIds } } });
    await prisma.userRole.deleteMany({ where: { userAccountId: { in: ids } } });
    await prisma.userOrganization.deleteMany({ where: { userAccountId: { in: ids } } });
    await prisma.organizationAssignment.deleteMany({ where: { userAccountId: { in: ids } } });
    await prisma.userAccount.deleteMany({ where: { id: { in: ids } } });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  }
  await resetE2EScenario();
  await prisma.$disconnect();
  await app?.close();
});

describe('org-members: no shared fallback password', () => {
  it('a member created without a password does not get the retired shared credential', async () => {
    const clusterToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    const res = await http.post('/org-members').set(auth(clusterToken)).send({
      email: 'harden_nopass@miran.test',
      nationalId: '9995000001',
      nameAr: 'عضو بدون كلمة مرور',
      roleCode: 'hospital_training_admin',
      hospitalId: s.hospital1.id,
    });
    expect([200, 201]).toContain(res.status);

    const account = await prisma.userAccount.findFirstOrThrow({
      where: { email: 'harden_nopass@miran.test' },
    });
    await expect(bcrypt.compare(RETIRED_PASSWORD, account.passwordHash)).resolves.toBe(false);
  });

  it('that account cannot be logged into with the retired credential', async () => {
    const res = await http
      .post('/auth/login')
      .send({ email: 'harden_nopass@miran.test', password: RETIRED_PASSWORD });
    expect([200, 201]).not.toContain(res.status);
  });

  it('two password-less members get different hashes (random, not a constant)', async () => {
    const clusterToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    const res = await http.post('/org-members').set(auth(clusterToken)).send({
      email: 'harden_nopass2@miran.test',
      nationalId: '9995000002',
      nameAr: 'عضو ثانٍ بدون كلمة مرور',
      roleCode: 'hospital_training_admin',
      hospitalId: s.hospital1.id,
    });
    expect([200, 201]).toContain(res.status);

    const [a, b] = await Promise.all([
      prisma.userAccount.findFirstOrThrow({ where: { email: 'harden_nopass@miran.test' } }),
      prisma.userAccount.findFirstOrThrow({ where: { email: 'harden_nopass2@miran.test' } }),
    ]);
    expect(a.passwordHash).not.toBe(b.passwordHash);
  });

  it('an explicitly supplied password still works', async () => {
    const clusterToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    const chosen = 'Chosen@Password123';
    const res = await http.post('/org-members').set(auth(clusterToken)).send({
      email: 'harden_withpass@miran.test',
      nationalId: '9995000003',
      nameAr: 'عضو بكلمة مرور صريحة',
      roleCode: 'hospital_training_admin',
      hospitalId: s.hospital1.id,
      password: chosen,
    });
    expect([200, 201]).toContain(res.status);

    const login2 = await http
      .post('/auth/login')
      .send({ email: 'harden_withpass@miran.test', password: chosen });
    expect([200, 201]).toContain(login2.status);
  });
});

describe('no credential is published through Swagger', () => {
  it('the login DTO example is not a real credential', () => {
    expect(src('src/modules/auth/dto/auth.dto.ts')).not.toContain(RETIRED_PASSWORD);
  });

  it('Swagger is off in production unless explicitly enabled', () => {
    const main = src('src/main.ts');
    expect(main).toContain("process.env.SWAGGER_ENABLED === 'true'");
    expect(main).toMatch(/isProduction[\s\S]{0,200}SWAGGER_ENABLED === 'true'/);
  });
});

describe('production seed: pilot roles without shared passwords', () => {
  const seed = () => src('src/seed/seed-production.ts');

  it('carries no hardcoded password literal', () => {
    expect(seed()).not.toContain(RETIRED_PASSWORD);
    expect(seed()).not.toMatch(/bcrypt\.hash\(\s*['"][^'"]+['"]/);
  });

  it('covers every required pilot role', () => {
    for (const role of [
      'university_administrator',
      'cluster_manager',
      'hospital_training_admin',
      'trainer',
      'trainee',
      'hospital_administrator',
    ]) {
      expect(seed()).toContain(role);
    }
  });

  it('sources every account password from its own environment variable', () => {
    const text = seed();
    const passwordEnvRefs = text.match(/passwordEnv: '([A-Z_]+)'/g) ?? [];
    expect(passwordEnvRefs.length).toBeGreaterThanOrEqual(9);
    expect(new Set(passwordEnvRefs).size).toBe(passwordEnvRefs.length); // no variable reused
    expect(text).toContain('assertPasswordEnvPresent');
    expect(text).toContain('SEED_OVERWRITE_PASSWORDS');
  });

  it('performs no destructive operation', () => {
    expect(seed()).not.toMatch(/deleteMany|\.delete\(|TRUNCATE|DROP TABLE|migrate reset|db push/);
  });
});

describe('development seeds carry no committed credential', () => {
  const devSeeds = [
    'src/seed/seed.ts',
    'src/seed/seed-rbac.ts',
    'src/seed/seed-complete.ts',
    'src/seed/seed-demo-accounts.ts',
  ];

  it.each(devSeeds)('%s has no hardcoded password literal', (file) => {
    const text = src(file);
    expect(text).not.toContain(RETIRED_PASSWORD);
    expect(text).not.toMatch(/bcrypt\.hash\(\s*['"][^'"]+['"]/);
  });

  it.each(devSeeds)('%s sources its password from the dev helper', (file) => {
    expect(src(file)).toContain('devSeedPassword');
  });

  it('the dev helper reads DEV_SEED_PASSWORD and otherwise generates one', () => {
    const helper = src('src/seed/dev-password.ts');
    expect(helper).toContain('DEV_SEED_PASSWORD');
    expect(helper).toContain('randomBytes');
    expect(helper).not.toContain(RETIRED_PASSWORD);
  });

  it('the dev helper is not used by the production seed', () => {
    expect(src('src/seed/seed-production.ts')).not.toContain('devSeedPassword');
  });
});
