/**
 * Account management — POST /org-members across the required 5-role
 * hierarchy (University → Cluster → Hospital Training → Trainer → Trainee).
 * Reuses the existing endpoint/scope machinery entirely
 * (role-scope.ts + org-members.controller.ts); the only change this pass
 * adds is that organisation-scoped roles (university_administrator,
 * training_director/cluster_administrator) now have their organisation TYPE
 * validated too, matching what hospital-scoped roles already got.
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
  // These accounts hold roles (hospital_training_admin, trainer,
  // university_administrator) the shared reset's TraineeProfile-driven
  // cleanup never sees — clean them up explicitly so a rerun doesn't collide
  // on unique email/nationalId.
  const orphan = await prisma.userAccount.findMany({ where: { email: { startsWith: 'acct_' } }, select: { id: true, personId: true } });
  const orphanIds = orphan.map((a) => a.id);
  if (orphanIds.length) {
    await prisma.trainerProfile.deleteMany({ where: { personId: { in: orphan.map((a) => a.personId) } } });
    await prisma.userRole.deleteMany({ where: { userAccountId: { in: orphanIds } } });
    await prisma.userOrganization.deleteMany({ where: { userAccountId: { in: orphanIds } } });
    await prisma.organizationAssignment.deleteMany({ where: { userAccountId: { in: orphanIds } } });
    await prisma.userAccount.deleteMany({ where: { id: { in: orphanIds } } });
    await prisma.person.deleteMany({ where: { id: { in: orphan.map((a) => a.personId) } } });
  }
  await resetE2EScenario();
  await prisma.$disconnect();
  await app?.close();
});

describe('Account creation for the required role hierarchy', () => {
  it('cluster creates a hospital_training_admin account scoped to its own hospital 1', async () => {
    const clusterToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    const res = await http.post('/org-members').set(auth(clusterToken)).send({
      email: 'acct_h1_admin@miran.test', nationalId: '9990000001', nameAr: 'مدير تدريب جديد',
      roleCode: 'hospital_training_admin', hospitalId: s.hospital1.id,
    });
    expect([200, 201]).toContain(res.status);

    const account = await prisma.userAccount.findFirstOrThrow({ where: { email: 'acct_h1_admin@miran.test' } });
    const role = await prisma.userRole.findFirstOrThrow({ where: { userAccountId: account.id }, include: { role: true } });
    expect(role.role.code).toBe('hospital_training_admin');
    expect(role.organizationId).toBe(s.hospital1.id);
  });

  it('hospital 1 creates a trainer account scoped to hospital 1 + department, with a TrainerProfile', async () => {
    const h1Token = await login(SCENARIO.accounts.hospital1TrainingAdmin);
    const res = await http.post('/org-members').set(auth(h1Token)).send({
      email: 'acct_trainer_new@miran.test', nationalId: '9990000002', nameAr: 'مدرب جديد',
      roleCode: 'trainer', departmentId: s.departments.h1Internal.id,
    });
    expect([200, 201]).toContain(res.status);

    const account = await prisma.userAccount.findFirstOrThrow({ where: { email: 'acct_trainer_new@miran.test' } });
    const role = await prisma.userRole.findFirstOrThrow({ where: { userAccountId: account.id }, include: { role: true } });
    expect(role.role.code).toBe('trainer');
    expect(role.organizationId).toBe(s.hospital1.id);

    const profile = await prisma.trainerProfile.findFirstOrThrow({ where: { person: { userAccounts: { some: { id: account.id } } } } });
    expect(profile.organizationId).toBe(s.hospital1.id);
    expect(profile.departmentId).toBe(s.departments.h1Internal.id);
  });

  it('trainee accounts cannot be created directly — only through the training-request/allocation pipeline', async () => {
    const h1Token = await login(SCENARIO.accounts.hospital1TrainingAdmin);
    const res = await http.post('/org-members').set(auth(h1Token)).send({
      email: 'acct_illegal_trainee@miran.test', nationalId: '9990000003', nameAr: 'متدرب مباشر',
      roleCode: 'trainee',
    });
    expect(res.status).toBe(400);
    const account = await prisma.userAccount.findFirst({ where: { email: 'acct_illegal_trainee@miran.test' } });
    expect(account).toBeNull();
  });
});

describe('Cross-hospital / cross-scope creation is rejected', () => {
  it('hospital 1 cannot create a hospital_training_admin account scoped to hospital 2', async () => {
    const h1Token = await login(SCENARIO.accounts.hospital1TrainingAdmin);
    const res = await http.post('/org-members').set(auth(h1Token)).send({
      email: 'acct_cross_hospital@miran.test', nationalId: '9990000004', nameAr: 'اختراق نطاق',
      roleCode: 'hospital_training_admin', hospitalId: s.hospital2.id,
    });
    expect(res.status).toBe(400);
    const account = await prisma.userAccount.findFirst({ where: { email: 'acct_cross_hospital@miran.test' } });
    expect(account).toBeNull();
  });

  it('an invalid/nonexistent organizationId is rejected, not silently accepted', async () => {
    const clusterToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    const res = await http.post('/org-members').set(auth(clusterToken)).send({
      email: 'acct_fake_org@miran.test', nationalId: '9990000005', nameAr: 'جهة وهمية',
      roleCode: 'hospital_training_admin', hospitalId: '00000000-0000-0000-0000-000000000000',
    });
    // The endpoint returns 400 (BadRequestException) for this today, not 403 —
    // documented as-is rather than changed, per "no redesign".
    expect(res.status).toBe(400);
  });
});

describe('Invalid Role/Scope combinations are rejected', () => {
  it('university_administrator cannot be created against a hospital organisation', async () => {
    const clusterToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    const res = await http.post('/org-members').set(auth(clusterToken)).send({
      email: 'acct_uni_on_hospital@miran.test', nationalId: '9990000006', nameAr: 'خلط أدوار',
      roleCode: 'university_administrator', organizationId: s.hospital1.id,
    });
    expect(res.status).toBe(400);
  });

  it('training_director cannot be created against a university organisation', async () => {
    const clusterToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    const res = await http.post('/org-members').set(auth(clusterToken)).send({
      email: 'acct_director_on_uni@miran.test', nationalId: '9990000007', nameAr: 'خلط أدوار 2',
      roleCode: 'training_director', organizationId: s.university.id,
    });
    expect(res.status).toBe(400);
  });

  it('hospital_training_admin still requires a hospital-type organisation (pre-existing rule, unchanged)', async () => {
    const clusterToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    const res = await http.post('/org-members').set(auth(clusterToken)).send({
      email: 'acct_hta_on_cluster@miran.test', nationalId: '9990000008', nameAr: 'خلط أدوار 3',
      roleCode: 'hospital_training_admin', hospitalId: s.cluster.id,
    });
    expect(res.status).toBe(400);
  });
});
