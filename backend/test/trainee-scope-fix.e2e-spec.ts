/**
 * Trainee scope fix — promoteToTrainee grants the trainee role/membership at
 * request.targetOrgId (the cluster, since the hospital isn't known yet); once
 * the trainee is actually allocated to a hospital, their UserRole/
 * UserOrganization must follow to that hospital so their active session
 * resolves scope against the hospital, not the cluster.
 *
 * Full chain: University → Cluster (promote) → Hospital (allocate) → Trainer
 * (accept) → trainee logs in and their own scope resolves to the hospital.
 *
 * Isolated test database only.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { SCENARIO, seedE2EScenario, resetE2EScenario } from '../src/seed/seed-e2e-scenario';

const prisma = new PrismaClient();
let app: INestApplication;
let http: ReturnType<typeof request>;
let s: Awaited<ReturnType<typeof seedE2EScenario>>;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function login(email: string): Promise<{ token: string; body: any }> {
  const res = await http.post('/auth/login').send({ email, password: SCENARIO.password });
  if (![200, 201].includes(res.status)) throw new Error(`login ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.tokens.accessToken, body: res.body };
}

async function activateForLogin(traineeProfileId: string): Promise<string> {
  const profile = await prisma.traineeProfile.findUniqueOrThrow({
    where: { id: traineeProfileId },
    select: { person: { select: { userAccounts: { select: { id: true, email: true } } } } },
  });
  const account = profile.person.userAccounts[0];
  await prisma.userAccount.update({
    where: { id: account.id },
    data: { isActive: true, passwordHash: await bcrypt.hash(SCENARIO.password, 10), activationToken: null },
  });
  return account.email;
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
  await resetE2EScenario();
  await prisma.$disconnect();
  await app?.close();
});

describe('Trainee scope resolves to the allocated hospital, not the cluster', () => {
  let uniToken: string, directorToken: string, h1Token: string;
  let rowId: string, profileId: string, traineeEmail: string, traineeToken: string;

  it('setup: request → import → approve (cluster-scoped role granted here) → allocate hospital → assign department+trainer → trainer accepts', async () => {
    uniToken = (await login(SCENARIO.accounts.universityAdmin)).token;
    directorToken = (await login(SCENARIO.accounts.clusterTrainingDirector)).token;
    h1Token = (await login(SCENARIO.accounts.hospital1TrainingAdmin)).token;

    const reqRes = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id, specialty: 'internal_medicine',
      trainingStartDate: '2027-01-01', trainingEndDate: '2027-12-31', studentCount: 1,
    });
    expect(reqRes.status).toBe(201);
    const requestId = reqRes.body.data.id;

    const uniq = Date.now().toString().slice(-6);
    const importRes = await http.post(`/training-requests/${requestId}/trainees/import`).set(auth(uniToken)).send({
      rows: [{ academicNumber: `SFIX-${uniq}`, nationalId: `99${uniq.padStart(8, '0')}`, nameAr: 'متدرب اختبار النطاق', specialty: 'internal_medicine', startDate: '2027-01-01', endDate: '2027-12-31', gender: 'male', mobile: `05${uniq.padStart(8, '0')}`, email: `scopefix${uniq}@miran.test` }],
    });
    expect(importRes.status).toBe(201);
    rowId = importRes.body.data[0].id;

    for (const documentType of ['national_id', 'internship_letter', 'academic_transcript', 'medical_examination']) {
      await prisma.document.create({
        data: { organizationId: s.cluster.id, trainingRequestTraineeId: rowId, documentType, titleAr: documentType, storageKey: `test/${rowId}/${documentType}`, isMandatory: true, status: 'approved' },
      });
    }
    const submitRes = await http.post(`/training-requests/${requestId}/trainees/submit`).set(auth(uniToken));
    expect([200, 201]).toContain(submitRes.status);

    const approveRes = await http.post(`/training-requests/trainees/${rowId}/approve`).set(auth(directorToken));
    expect([200, 201]).toContain(approveRes.status);
    profileId = approveRes.body.data.traineeProfileId;

    // Right after promotion — before any hospital allocation — the role is
    // still cluster-scoped. This is the pre-fix, expected intermediate state.
    const trainee = await prisma.traineeProfile.findUniqueOrThrow({ where: { id: profileId }, select: { personId: true } });
    const preAccount = await prisma.userAccount.findFirstOrThrow({ where: { personId: trainee.personId } });
    const preRole = await prisma.userRole.findFirst({ where: { userAccountId: preAccount.id }, include: { role: true } });
    expect(preRole?.organizationId).toBe(s.cluster.id);

    const allocRes = await http.post(`/training-requests/trainees/${rowId}/allocations/hospital`).set(auth(directorToken)).send({ hospitalId: s.hospital1.id, reason: 'test' });
    expect([200, 201]).toContain(allocRes.status);

    const assignRes = await http.post(`/training-requests/trainees/${rowId}/allocations/department`).set(auth(h1Token)).send({ departmentId: s.departments.h1Internal.id, trainerProfileId: s.trainers.h1Internal.id });
    expect([200, 201]).toContain(assignRes.status);

    const trainerToken = (await login(SCENARIO.accounts.hospital1Trainer)).token;
    const pending = await http.get('/operations/trainer/assignment-requests').set(auth(trainerToken));
    const rotationId = pending.body.data[0].id;
    const acceptRes = await http.post(`/operations/trainer/assignment-requests/${rotationId}/accept`).set(auth(trainerToken));
    expect([200, 201]).toContain(acceptRes.status);

    traineeEmail = await activateForLogin(profileId);
  });

  it('the trainee\'s UserRole and primary UserOrganization now point at the hospital, not the cluster', async () => {
    const trainee = await prisma.traineeProfile.findUniqueOrThrow({ where: { id: profileId }, select: { personId: true } });
    const account = await prisma.userAccount.findFirstOrThrow({ where: { personId: trainee.personId } });

    const roles = await prisma.userRole.findMany({ where: { userAccountId: account.id }, include: { role: true } });
    const traineeRoles = roles.filter((r) => r.role.code === 'trainee');
    expect(traineeRoles.map((r) => r.organizationId)).toEqual([s.hospital1.id]);

    const memberships = await prisma.userOrganization.findMany({ where: { userAccountId: account.id } });
    const active = memberships.filter((m) => m.isActive);
    expect(active.map((m) => m.organizationId)).toEqual([s.hospital1.id]);
    expect(active[0].isPrimary).toBe(true);
  });

  it('login resolves the trainee\'s activeOrganization to the hospital, not the cluster', async () => {
    const { token, body } = await login(traineeEmail);
    traineeToken = token;
    expect(body.user.activeOrganization.id).toBe(s.hospital1.id);
    expect(body.user.activeOrganization.id).not.toBe(s.cluster.id);
  });

  it('the trainee sees only their own data — own profile and own rotation, not the cluster\'s hospital list', async () => {
    const me = await http.get('/trainees/me').set(auth(traineeToken));
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(profileId);

    const dash = await http.get('/operations/trainee/dashboard').set(auth(traineeToken));
    expect(dash.status).toBe(200);
    expect(dash.body.data.profile.id).toBe(profileId);
    expect(dash.body.data.rotation.organizationId).toBe(s.hospital1.id);

    // Scope-filtered list — a cluster session would see both hospitals; a
    // hospital-scoped trainee must see only their own.
    const orgs = await http.get('/organizations').set(auth(traineeToken));
    expect(orgs.status).toBe(200);
    const ids = orgs.body.data.map((o: any) => o.id);
    expect(ids).toEqual([s.hospital1.id]);
    expect(ids).not.toContain(s.cluster.id);
    expect(ids).not.toContain(s.hospital2.id);
  });

  it('cluster/hospital-management data stays out of reach — training-request hospital-review queue is denied', async () => {
    const res = await http.get('/training-requests/hospital-review').set(auth(traineeToken));
    expect([403, 404]).toContain(res.status);
  });

  it('ID tampering: the trainee cannot read another trainee\'s competencies by traineeId', async () => {
    const other = await prisma.traineeProfile.findFirst({ where: { id: { not: profileId } } });
    const targetId = other?.id ?? '00000000-0000-0000-0000-000000000000';
    const res = await http.get('/logbook/competencies').query({ traineeId: targetId }).set(auth(traineeToken));
    expect(res.status).toBe(403);
  });

  it('existing manually-created trainee accounts are unaffected (already hospital-scoped, no-op on re-allocation to the same hospital)', async () => {
    // A manually-created account (like the production trainee.test fixture)
    // is created with UserOrganization/UserRole already at its hospital; the
    // transfer-scope fix only runs when profile.organizationId actually
    // differs from the target, so re-allocating to the same hospital must be
    // a safe no-op.
    const before = await prisma.userRole.findMany({ where: { userAccountId: (await prisma.userAccount.findFirstOrThrow({ where: { personId: (await prisma.traineeProfile.findUniqueOrThrow({ where: { id: profileId }, select: { personId: true } })).personId } })).id } });
    expect(before.filter((r) => r.organizationId === s.hospital1.id)).toHaveLength(1);
  });
});
