/**
 * Phase 2.6 regression — the bypass matrix.
 *
 * Two things are proven here.
 *
 * 1. `hospital_administrator` is refused on EVERY training operation, including
 *    the legacy routes that used to accept it. Each case checks the refusal AND
 *    that the database is unchanged, because a 403 that still wrote would be the
 *    worst of both.
 *
 * 2. There is exactly one way to change where a trainee is placed. Every path
 *    that moves a trainee now produces an allocation row; the retired ones refuse.
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
  if (![200, 201].includes(res.status)) {
    throw new Error(`login ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.tokens.accessToken;
}

/** Snapshot of everything a training operation could plausibly change. */
async function placementSnapshot() {
  const [allocations, openAllocations, rows, departments, trainers, profiles, rotations, intakes, requests] =
    await Promise.all([
      prisma.traineeAllocation.count(),
      prisma.traineeAllocation.count({ where: { status: 'open' } }),
      prisma.trainingRequestTrainee.findMany({
        select: { id: true, assignedHospitalId: true, assignedDepartmentId: true, assignedTrainerProfileId: true },
        orderBy: { id: 'asc' },
      }),
      prisma.department.findMany({ select: { id: true, capacity: true, isActive: true }, orderBy: { id: 'asc' } }),
      prisma.trainerProfile.findMany({ select: { id: true, isActive: true, departmentId: true }, orderBy: { id: 'asc' } }),
      prisma.traineeProfile.findMany({ select: { id: true, organizationId: true }, orderBy: { id: 'asc' } }),
      prisma.rotation.count(),
      prisma.academicIntake.count(),
      prisma.trainingRequest.count(),
    ]);
  return JSON.stringify({ allocations, openAllocations, rows, departments, trainers, profiles, rotations, intakes, requests });
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

describe('A. hospital_administrator — refused on every training operation', () => {
  let token: string;
  let rowId: string;
  let profileId: string;
  let requestId: string;

  beforeAll(async () => {
    token = await login(SCENARIO.accounts.hospital1Director);
    const directorToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    const uniToken = await login(SCENARIO.accounts.universityAdmin);

    // Build a real trainee sitting in Hospital 1, so every attempt below targets
    // something that genuinely exists — a 404 would prove nothing.
    const req = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id,
      programId: s.program.id,
      studentCount: 2,
      specialty: 'internal_medicine',
      trainingStartDate: '2027-01-01',
      trainingEndDate: '2027-12-31',
    });
    requestId = req.body.data.id;

    await http.post(`/training-requests/${requestId}/trainees/import`).set(auth(directorToken)).send({
      rows: [{
        academicNumber: 'BYPASS-1', nationalId: '9400000010',
        nameAr: 'متدرب اختبار الالتفاف', specialty: 'internal_medicine',
      }],
    });
    await prisma.trainingRequestTrainee.updateMany({
      where: { trainingRequestId: requestId }, data: { status: 'cluster_approved' },
    });
    await prisma.trainingRequest.update({ where: { id: requestId }, data: { status: 'approved' } });

    const row = await prisma.trainingRequestTrainee.findFirst({ where: { trainingRequestId: requestId } });
    rowId = row!.id;

    await http.post(`/training-requests/trainees/${rowId}/allocations/hospital`)
      .set(auth(directorToken)).send({ hospitalId: s.hospital1.id });

    // Promote to a profile so profile-addressed routes have a real target.
    const person = await prisma.person.create({
      data: {
        nationalId: '9400000099', nameAr: 'متدرب ملف', nameEn: 'Profile Trainee',
        dateOfBirth: new Date('1998-01-01'), gender: 'male', nationality: 'SA',
      },
    });
    const profile = await prisma.traineeProfile.create({
      data: {
        personId: person.id, organizationId: s.hospital1.id,
        traineeNumber: 'BYPASS-PROFILE-1', level: 'intern',
      },
    });
    profileId = profile.id;
    await prisma.trainingRequestTrainee.update({
      where: { id: rowId }, data: { traineeProfileId: profileId },
    });
  }, 120_000);

  /** Every training operation reachable over HTTP, with its expected refusal. */
  const attempts: Array<[string, () => request.Test]> = [];

  it('is refused on all of them, and changes nothing', async () => {
    const cases: Array<{ name: string; run: () => Promise<request.Response> }> = [
      { name: 'create training request', run: () => http.post('/training-requests').set(auth(token)).send({ targetOrgId: s.cluster.id, programId: s.program.id, studentCount: 1 }) },
      { name: 'list training requests', run: () => http.get('/training-requests').set(auth(token)) },
      { name: 'read training request', run: () => http.get(`/training-requests/${requestId}`).set(auth(token)) },
      { name: 'read request trainees', run: () => http.get(`/training-requests/${requestId}/trainees`).set(auth(token)) },
      { name: 'approve request', run: () => http.post(`/training-requests/${requestId}/approve`).set(auth(token)).send({}) },
      { name: 'auto-allocate', run: () => http.post(`/training-requests/${requestId}/auto-allocate`).set(auth(token)).send({}) },
      { name: 'return to university', run: () => http.post(`/training-requests/${requestId}/return-to-university`).set(auth(token)).send({}) },
      { name: 'create academic batch', run: () => http.post('/academic-intakes/from-request').set(auth(token)).send({ trainingRequestId: requestId }) },
      { name: 'cluster allocate to hospital', run: () => http.post(`/training-requests/trainees/${rowId}/allocations/hospital`).set(auth(token)).send({ hospitalId: s.hospital2.id }) },
      { name: 'hospital assign department', run: () => http.post(`/training-requests/trainees/${rowId}/allocations/department`).set(auth(token)).send({ departmentId: s.departments.h1Internal.id }) },
      { name: 'legacy row allocation', run: () => http.patch(`/training-requests/trainees/${rowId}/allocation`).set(auth(token)).send({ hospitalId: s.hospital2.id }) },
      { name: 'hospital-review assignment', run: () => http.patch(`/training-requests/trainees/${rowId}/hospital-review/assignment`).set(auth(token)).send({ departmentId: s.departments.h1Internal.id }) },
      { name: 'LEGACY /trainees/reallocate', run: () => http.post('/trainees/reallocate').set(auth(token)).send({ traineeProfileId: profileId, targetHospitalId: s.hospital2.id }) },
      { name: 'LEGACY /trainees/bulk-import', run: () => http.post('/trainees/bulk-import').set(auth(token)).send({ trainees: [{ academicId: 'X1', nationalId: '9400000077', email: 'x1@miran.test' }] }) },
      { name: 'manage department capacity', run: () => http.patch(`/organizations/departments/${s.departments.h1Internal.id}/capacity`).set(auth(token)).send({ capacity: 99 }) },
      { name: 'manage hospital total capacity', run: () => http.put(`/organizations/${s.hospital1.id}/capacity/hospital`).set(auth(token)).send({ capacity: 99 }) },
      { name: 'upsert capacity allocation', run: () => http.put(`/organizations/${s.hospital1.id}/capacity/allocations`).set(auth(token)).send({ scopeType: 'department', scopeId: s.departments.h1Internal.id, totalCapacity: 99 }) },
      { name: 'list trainers (roster)', run: () => http.get('/trainers').set(auth(token)) },
      { name: 'trainer workspace cards', run: () => http.get('/trainers/workspace-cards').set(auth(token)) },
      { name: 'trainer qualification create', run: () => http.post(`/trainers/${s.trainers.h1Internal.id}/qualifications`).set(auth(token)).send({ programId: s.program.id }) },
      { name: 'trainer reassign', run: () => http.post('/trainers/reassign').set(auth(token)).send({ traineeProfileId: profileId, newTrainerId: s.trainers.h1Paediatrics.id }) },
      { name: 'trainer reassign-trainer', run: () => http.post('/trainers/reassign-trainer').set(auth(token)).send({ previousTrainerId: s.trainers.h1Internal.id, newTrainerId: s.trainers.h1Paediatrics.id }) },
      { name: 'trainer reassign-department', run: () => http.post('/trainers/reassign-department').set(auth(token)).send({ departmentId: s.departments.h1Internal.id, newTrainerId: s.trainers.h1Paediatrics.id }) },
      { name: 'trainer leave approve', run: () => http.patch(`/trainers/leaves/${'00000000-0000-4000-8000-000000000000'}/approve`).set(auth(token)).send({}) },
    ];

    const before = await placementSnapshot();
    const failures: string[] = [];

    for (const c of cases) {
      const res = await c.run();
      // 403 is the expected refusal. 410 is accepted for the retired bulk-import,
      // which refuses everyone including authorised roles.
      const refused = res.status === 403 || res.status === 410;
      if (!refused) failures.push(`${c.name} → ${res.status} ${JSON.stringify(res.body).slice(0, 120)}`);
      console.log(`    ${refused ? '✅' : '❌'} ${c.name.padEnd(38)} ${res.status}`);
    }

    const after = await placementSnapshot();

    if (failures.length > 0) {
      throw new Error(`hospital_administrator reached ${failures.length} training operation(s):\n  ${failures.join('\n  ')}`);
    }
    expect(after).toBe(before);
  }, 120_000);
});

describe('B. Legacy allocation paths are closed or canonical', () => {
  it('/trainees/bulk-import is retired for everyone, including the cluster', async () => {
    const directorToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    const before = await prisma.traineeProfile.count();

    const res = await http.post('/trainees/bulk-import').set(auth(directorToken)).send({
      trainees: [{ academicId: 'LEG-1', nationalId: '9400000055', email: 'leg1@miran.test' }],
    });

    expect(res.status).toBe(410);
    expect(await prisma.traineeProfile.count()).toBe(before);
  });

  it('/trainees/reallocate now writes an allocation row instead of mutating placement', async () => {
    const directorToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    const uniToken = await login(SCENARIO.accounts.universityAdmin);

    const req = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id, programId: s.program.id, studentCount: 1,
      specialty: 'internal_medicine',
      trainingStartDate: '2027-01-01', trainingEndDate: '2027-12-31',
    });
    const requestId = req.body.data.id;
    await http.post(`/training-requests/${requestId}/trainees/import`).set(auth(directorToken)).send({
      rows: [{ academicNumber: 'LEG-2', nationalId: '9400000066', nameAr: 'متدرب', specialty: 'internal_medicine' }],
    });
    await prisma.trainingRequestTrainee.updateMany({
      where: { trainingRequestId: requestId }, data: { status: 'cluster_approved' },
    });
    const row = await prisma.trainingRequestTrainee.findFirst({ where: { trainingRequestId: requestId } });

    await http.post(`/training-requests/trainees/${row!.id}/allocations/hospital`)
      .set(auth(directorToken)).send({ hospitalId: s.hospital1.id });

    const person = await prisma.person.create({
      data: {
        nationalId: '9400000088', nameAr: 'متدرب نقل', nameEn: 'Move Trainee',
        dateOfBirth: new Date('1998-01-01'), gender: 'male', nationality: 'SA',
      },
    });
    const profile = await prisma.traineeProfile.create({
      data: {
        personId: person.id, organizationId: s.hospital1.id,
        traineeNumber: 'LEG-PROFILE-2', level: 'intern',
      },
    });
    await prisma.trainingRequestTrainee.update({
      where: { id: row!.id }, data: { traineeProfileId: profile.id },
    });

    const beforeOpen = await prisma.traineeAllocation.findFirst({
      where: { traineeRowId: row!.id, status: 'open' },
    });

    const res = await http.post('/trainees/reallocate').set(auth(directorToken)).send({
      traineeProfileId: profile.id,
      targetHospitalId: s.hospital2.id,
      reason: 'اختبار المسار القديم',
    });
    expect([200, 201]).toContain(res.status);

    // The legacy route produced a proper allocation transition.
    const superseded = await prisma.traineeAllocation.findUnique({ where: { id: beforeOpen!.id } });
    const open = await prisma.traineeAllocation.findMany({
      where: { traineeRowId: row!.id, status: 'open' },
    });
    expect(superseded!.status).toBe('superseded');
    expect(superseded!.closedAt).not.toBeNull();
    expect(open).toHaveLength(1);
    expect(open[0].hospitalId).toBe(s.hospital2.id);
    expect(open[0].previousHospitalId).toBe(s.hospital1.id);
    expect(open[0].action).toBe('cluster_reassign');

    // And the operational records moved with the trainee.
    const movedProfile = await prisma.traineeProfile.findUnique({ where: { id: profile.id } });
    expect(movedProfile!.organizationId).toBe(s.hospital2.id);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'TraineeAllocation', entityId: open[0].id },
    });
    expect(audit!.action).toBe('allocation.cluster_reassign');
  }, 120_000);

  it('auto-allocation writes allocation rows, not just denormalised columns', async () => {
    const directorToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    const uniToken = await login(SCENARIO.accounts.universityAdmin);

    const req = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id, programId: s.program.id, studentCount: 2,
      specialty: 'internal_medicine',
      trainingStartDate: '2027-01-01', trainingEndDate: '2027-12-31',
    });
    const requestId = req.body.data.id;
    await http.post(`/training-requests/${requestId}/trainees/import`).set(auth(directorToken)).send({
      rows: [
        { academicNumber: 'AUTO-1', nationalId: '9400000101', nameAr: 'آلي ١', specialty: 'internal_medicine' },
        { academicNumber: 'AUTO-2', nationalId: '9400000102', nameAr: 'آلي ٢', specialty: 'internal_medicine' },
      ],
    });
    await prisma.trainingRequestTrainee.updateMany({
      where: { trainingRequestId: requestId }, data: { status: 'cluster_approved' },
    });

    const before = await prisma.traineeAllocation.count();
    const res = await http.post(`/training-requests/${requestId}/auto-allocate`)
      .set(auth(directorToken)).send({});
    expect([200, 201]).toContain(res.status);

    const rows = await prisma.trainingRequestTrainee.findMany({
      where: { trainingRequestId: requestId, assignedHospitalId: { not: null } },
    });
    const after = await prisma.traineeAllocation.count();

    // Every row the engine placed has an allocation row behind it.
    expect(after - before).toBe(rows.length);
    for (const r of rows) {
      const open = await prisma.traineeAllocation.findMany({
        where: { traineeRowId: r.id, status: 'open' },
      });
      expect(open).toHaveLength(1);
      expect(open[0].action).toBe('auto');
      expect(open[0].hospitalId).toBe(r.assignedHospitalId);
    }
  }, 120_000);
});

describe('C. Positive authorisation still works', () => {
  it('hospital_training_admin can run hospital training operations', async () => {
    const token = await login(SCENARIO.accounts.hospital1TrainingAdmin);

    const capacity = await http
      .patch(`/organizations/departments/${s.departments.h1Internal.id}/capacity`)
      .set(auth(token)).send({ capacity: 7 });
    expect(capacity.status).toBe(200);
    const dept = await prisma.department.findUnique({ where: { id: s.departments.h1Internal.id } });
    expect(dept!.capacity).toBe(7);

    const trainers = await http.get('/trainers').set(auth(token));
    expect(trainers.status).toBe(200);

    const breakdown = await http.get(`/organizations/${s.hospital1.id}/capacity`).set(auth(token));
    expect(breakdown.status).toBe(200);
  });

  it('training_director can run cluster training operations', async () => {
    const token = await login(SCENARIO.accounts.clusterTrainingDirector);
    expect((await http.get('/training-requests').set(auth(token))).status).toBe(200);
    expect((await http.get(`/organizations/${s.hospital1.id}/capacity`).set(auth(token))).status).toBe(200);
  });

  it('training_director still cannot manage a hospital internally', async () => {
    const token = await login(SCENARIO.accounts.clusterTrainingDirector);
    const before = await prisma.department.findUnique({ where: { id: s.departments.h1Internal.id } });

    expect((await http.patch(`/organizations/departments/${s.departments.h1Internal.id}/capacity`)
      .set(auth(token)).send({ capacity: 40 })).status).toBe(403);
    expect((await http.post('/trainers/reassign').set(auth(token))
      .send({ traineeProfileId: 'x', newTrainerId: s.trainers.h1Internal.id })).status).toBe(403);

    const after = await prisma.department.findUnique({ where: { id: s.departments.h1Internal.id } });
    expect(after!.capacity).toBe(before!.capacity);
  });

  it('trainee and the removed department_head identity stay inside their scope', async () => {
    const traineeToken = await login(SCENARIO.accounts.trainee);
    // department_head is no longer a role in the model, so its account has no
    // session to act with at all.
    const deptToken = await login(SCENARIO.accounts.hospital1DeptHead).catch(() => '');
    expect(deptToken).toBe('');

    expect((await http.get('/training-requests').set(auth(traineeToken))).status).toBe(403);
    expect((await http.post('/trainees/reallocate').set(auth(traineeToken))
      .send({ traineeProfileId: 'x', targetHospitalId: s.hospital2.id })).status).toBe(403);

    expect([401, 403]).toContain((await http.patch(`/organizations/departments/${s.departments.h1Internal.id}/capacity`)
      .set(auth(deptToken)).send({ capacity: 3 })).status);
    expect([401, 403]).toContain((await http.post('/trainers/reassign').set(auth(deptToken))
      .send({ traineeProfileId: 'x', newTrainerId: s.trainers.h1Internal.id })).status);
  });
});

describe('D. Phase 2.6.1 P1 Concurrency & P2 Trainee Bypass Regression', () => {
  // P1 needs a department whose only free seat is the one being raced for.
  // The shared scenario department cannot provide that: earlier tests in this
  // file place trainees into it, and the capacity endpoint (correctly) refuses
  // to lower a department below its current occupancy — so the "capacity = 1"
  // setup silently failed and both racers fitted. This suite therefore races on
  // its own department and its own trainer, created empty at capacity 1.
  let raceDepartmentId: string;
  let raceTrainerProfileId: string;

  beforeAll(async () => {
    const department = await prisma.department.create({
      data: {
        organizationId: s.hospital1.id,
        code: `RACE-${Date.now().toString().slice(-6)}`,
        nameAr: 'قسم اختبار التزامن',
        capacity: 1,
        isActive: true,
      },
    });
    raceDepartmentId = department.id;

    const person = await prisma.person.create({
      data: {
        nationalId: `9970${Date.now().toString().slice(-6)}`,
        nameAr: 'مدرب اختبار التزامن',
        dateOfBirth: new Date('1985-01-01'),
        gender: 'male',
        nationality: 'SA',
      },
    });
    const trainer = await prisma.trainerProfile.create({
      data: {
        personId: person.id,
        organizationId: s.hospital1.id,
        departmentId: department.id,
        titleAr: 'مدرب اختبار التزامن',
        maxTrainees: 5,
      },
    });
    raceTrainerProfileId = trainer.id;
  });

  afterAll(async () => {
    await prisma.traineeAllocation.deleteMany({ where: { departmentId: raceDepartmentId } });
    await prisma.rotation.deleteMany({ where: { departmentId: raceDepartmentId } });
    await prisma.trainerProfile.deleteMany({ where: { id: raceTrainerProfileId } });
    await prisma.department.deleteMany({ where: { id: raceDepartmentId } });
  });

  it('P1: Concurrent allocation requests for a single remaining seat result in exactly 1 success and 1 capacity rejection', async () => {
    const directorToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    const adminToken = await login(SCENARIO.accounts.hospital1TrainingAdmin);

    // The race department starts empty with exactly one seat; assert that
    // precondition rather than assuming it, so a broken fixture fails loudly
    // instead of quietly turning the race into a non-race.
    const beforeOccupancy = await prisma.traineeAllocation.count({
      where: { departmentId: raceDepartmentId, status: 'open' },
    });
    expect(beforeOccupancy).toBe(0);
    const raceDepartment = await prisma.department.findUniqueOrThrow({ where: { id: raceDepartmentId } });
    expect(raceDepartment.capacity).toBe(1);

    // Create 2 candidate rows in a training request
    const uniToken = await login(SCENARIO.accounts.universityAdmin);
    const req = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id,
      programId: s.program.id,
      studentCount: 2,
      specialty: 'internal_medicine',
      trainingStartDate: '2027-01-01',
      trainingEndDate: '2027-12-31',
    });
    const requestId = req.body.data.id;

    await http.post(`/training-requests/${requestId}/trainees/import`).set(auth(directorToken)).send({
      rows: [
        { academicNumber: 'CONC-001', nationalId: '1099887766', nameAr: 'متدرب سباق 1' },
        { academicNumber: 'CONC-002', nationalId: '1099887767', nameAr: 'متدرب سباق 2' },
      ],
    });

    await http.patch(`/training-requests/${requestId}/status`).set(auth(directorToken)).send({ status: 'approved' });
    await http.post('/academic-intakes/from-request').set(auth(directorToken)).send({ trainingRequestId: requestId });

    // Allocate both trainees to Hospital 1
    const traineesRes = await http.get(`/training-requests/${requestId}/trainees`).set(auth(directorToken));
    const rows = traineesRes.body.data || traineesRes.body;
    const [row1, row2] = rows;

    await http.post(`/training-requests/trainees/${row1.id}/allocations/hospital`).set(auth(directorToken)).send({ hospitalId: s.hospital1.id });
    await http.post(`/training-requests/trainees/${row2.id}/allocations/hospital`).set(auth(directorToken)).send({ hospitalId: s.hospital1.id });

    // Concurrent departmental allocation requests targeting the same single-seat department
    const [res1, res2] = await Promise.all([
      http
        .post(`/training-requests/trainees/${row1.id}/allocations/department`)
        .set(auth(adminToken))
        .send({ departmentId: raceDepartmentId, trainerProfileId: raceTrainerProfileId }),
      http
        .post(`/training-requests/trainees/${row2.id}/allocations/department`)
        .set(auth(adminToken))
        .send({ departmentId: raceDepartmentId, trainerProfileId: raceTrainerProfileId }),
    ]);

    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(201);
    expect(statuses).toContain(409);

    // Verify database state: exactly 1 active allocation in the department
    const activeAllocations = await prisma.traineeAllocation.count({
      where: { departmentId: raceDepartmentId, status: 'open' },
    });
    expect(activeAllocations).toBe(1);
  }, 120_000);

  it('P2: POST /org-members rejects roleCode === "trainee" with 400 Bad Request', async () => {
    const directorToken = await login(SCENARIO.accounts.hospital1Director);

    const res = await http
      .post('/org-members')
      .set(auth(directorToken))
      .send({
        email: 'direct_trainee_test@miran.health',
        nationalId: '9998887771',
        roleCode: 'trainee',
        traineeNumber: 'TRN-DIR-001',
        nameAr: 'متدرب غير شرعي',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('لا يمكن إنشاء حساب متدرب مباشرة عبر أعضاء الجهة');

    // Confirm no TraineeProfile was created
    const createdProfile = await prisma.traineeProfile.findFirst({
      where: { traineeNumber: 'TRN-DIR-001' },
    });
    expect(createdProfile).toBeNull();
  });

  it('P2: POST /org-members permits legitimate non-trainee staff onboarding', async () => {
    const directorToken = await login(SCENARIO.accounts.hospital1Director);

    // Accounts created through the API are outside the scenario's person set, so
    // resetE2EScenario does not remove them; a fixed address made the second run
    // of this suite fail on a duplicate rather than on the behaviour under test.
    const staffEmail = `staff_doctor_${Date.now()}@miran.health`;
    const staffNationalId = `9998${String(Date.now()).slice(-6)}`;

    const res = await http
      .post('/org-members')
      .set(auth(directorToken))
      .send({
        email: staffEmail,
        nationalId: staffNationalId,
        roleCode: 'trainer',
        nameAr: 'طبيب مدرب جديد',
      });

    expect([200, 201]).toContain(res.status);

    const createdProfile = await prisma.trainerProfile.findFirst({
      where: { person: { email: staffEmail } },
    });
    expect(createdProfile).not.toBeNull();
  });
});

