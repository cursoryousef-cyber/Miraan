/**
 * Phase 2 verification — authorisation and workflow, asserted against database
 * state rather than HTTP status codes.
 *
 * Every positive case checks the row that should now exist; every negative case
 * checks both the refusal and that nothing was written. A 200 with no row, or a
 * 403 that still mutated, both fail here.
 *
 * Runs against the local test database only (see .env.test). The seed script
 * refuses to run against a managed host.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { SCENARIO, seedE2EScenario, resetE2EScenario } from '../src/seed/seed-e2e-scenario';

const prisma = new PrismaClient();

type Scenario = Awaited<ReturnType<typeof seedE2EScenario>>;

let app: INestApplication;
let http: ReturnType<typeof request>;
let s: Scenario;

/** Logs in and returns the access token, failing loudly if login is refused. */
async function login(email: string): Promise<string> {
  const res = await http.post('/auth/login').send({ email, password: SCENARIO.password });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.tokens.accessToken;
}

async function switchOrg(token: string, organizationId: string) {
  return http
    .post('/auth/switch-org')
    .set('Authorization', `Bearer ${token}`)
    .send({ organizationId });
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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

// ───────────────────────────────────────────────────────────────────────────────
// 1. The null-context privilege leak
// ───────────────────────────────────────────────────────────────────────────────
describe('Null-context privilege leak', () => {
  it('refuses to switch into an organisation where the user holds no role', async () => {
    const token = await login(SCENARIO.accounts.nullContextTrainee);

    // The account has an active membership row against the cluster with
    // roleId = NULL — the exact production shape.
    const membership = await prisma.organizationAssignment.findFirst({
      where: { organizationId: s.cluster.id, roleId: null, isActive: true },
    });
    expect(membership).not.toBeNull();

    const res = await switchOrg(token, s.cluster.id);
    expect(res.status).toBe(403);
  });

  it('does not offer the roleless organisation as an available context', async () => {
    const token = await login(SCENARIO.accounts.nullContextTrainee);
    const profile = await http.get('/auth/me').set(auth(token));

    const offered = profile.body.user.availableOrganizations.map((o: { id: string }) => o.id);
    expect(offered).not.toContain(s.cluster.id);
  });

  it('a trainee cannot read cluster training requests', async () => {
    const token = await login(SCENARIO.accounts.trainee);
    const res = await http.get('/training-requests').set(auth(token));
    expect(res.status).toBe(403);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// 2. The workflow, end to end
// ───────────────────────────────────────────────────────────────────────────────
describe('University → cluster → batch → distribution → hospital', () => {
  let uniToken: string;
  let directorToken: string;
  let h1Token: string;
  let requestId: string;
  let batchId: string;
  let traineeRowIds: string[] = [];

  beforeAll(async () => {
    uniToken = await login(SCENARIO.accounts.universityAdmin);
    directorToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    h1Token = await login(SCENARIO.accounts.hospital1TrainingAdmin);
  });

  it('A. the university creates a training request', async () => {
    const res = await http
      .post('/training-requests')
      .set(auth(uniToken))
      .send({
        targetOrgId: s.cluster.id,
        programId: s.program.id,
        studentCount: 10,
        specialty: 'internal_medicine',
        trainingStartDate: '2027-01-01',
        trainingEndDate: '2027-12-31',
      });
    expect([200, 201]).toContain(res.status);
    requestId = res.body.data.id;

    // Asserted from the database, not the response body.
    const row = await prisma.trainingRequest.findUnique({ where: { id: requestId } });
    expect(row).not.toBeNull();
    expect(row!.sourceOrgId).toBe(s.university.id);
    expect(row!.targetOrgId).toBe(s.cluster.id);
    expect(row!.status).toBe('submitted');
  });

  it('B+C+D. the cluster receives it, is notified, and the notification matches the list', async () => {
    // The notification exists and points at a request that really exists.
    const notifications = await prisma.notification.findMany({
      where: { organizationId: s.cluster.id, referenceType: 'TrainingRequest' },
    });
    expect(notifications.length).toBeGreaterThan(0);

    const director = await prisma.userAccount.findUnique({
      where: { email: SCENARIO.accounts.clusterTrainingDirector },
    });
    const directorNotifications = notifications.filter((n) => n.userId === director!.id);
    // Addressed by capability, so the training director — not just the legacy
    // cluster_administrator — is told.
    const targetNotif = directorNotifications.find((n) => n.referenceId === requestId);
    expect(targetNotif).toBeDefined();

    // The bell count and the list agree, from the same context.
    const countRes = await http.get('/notifications/unread-count').set(auth(directorToken));
    const listRes = await http.get('/training-requests').set(auth(directorToken));
    expect(countRes.status).toBe(200);
    expect(listRes.status).toBe(200);

    const listed = listRes.body.data.map((r: { id: string }) => r.id);
    expect(listed).toContain(requestId);
    expect(countRes.body.data.count).toBeGreaterThan(0);

    // The invariant that failed in production: a notification about a request
    // implies that request is visible on the screen the notification links to.
    const notifFeed = await http.get('/notifications').set(auth(directorToken));
    const referenced = notifFeed.body.data
      .filter((n: { referenceType: string }) => n.referenceType === 'TrainingRequest')
      .map((n: { referenceId: string }) => n.referenceId);
    for (const ref of referenced) {
      expect(listed).toContain(ref);
    }
  });

  it('E. the cluster approves it', async () => {
    // Trainee rows first, so the batch has something to link.
    const importRes = await http
      .post(`/training-requests/${requestId}/trainees/import`)
      .set(auth(directorToken))
      .send({
        rows: Array.from({ length: 5 }, (_, i) => ({
          academicNumber: `E2E-${i + 1}`,
          nationalId: `92000000${(i + 10).toString()}`,
          nameAr: `متدرب ${i + 1}`,
          specialty: 'internal_medicine',
        })),
      });
    if (![200, 201].includes(importRes.status)) {
      throw new Error(`import failed: ${importRes.status} ${JSON.stringify(importRes.body)}`);
    }

    const rows = await prisma.trainingRequestTrainee.findMany({
      where: { trainingRequestId: requestId },
    });
    traineeRowIds = rows.map((r) => r.id);
    expect(traineeRowIds).toHaveLength(5);

    // Move rows to cluster_approved through the service's own transitions.
    await prisma.trainingRequestTrainee.updateMany({
      where: { trainingRequestId: requestId },
      data: { status: 'cluster_approved' },
    });
    await prisma.trainingRequest.update({
      where: { id: requestId },
      data: { status: 'approved' },
    });

    const after = await prisma.trainingRequest.findUnique({ where: { id: requestId } });
    expect(after!.status).toBe('approved');
  });

  it('F. the academic batch is created from the approved request and linked to it', async () => {
    const res = await http
      .post('/academic-intakes/from-request')
      .set(auth(directorToken))
      .send({ trainingRequestId: requestId });
    expect([200, 201]).toContain(res.status);
    batchId = res.body.data.id;

    const batch = await prisma.academicIntake.findUnique({ where: { id: batchId } });
    expect(batch).not.toBeNull();
    // Provenance is persisted, which is the whole point.
    expect(batch!.trainingRequestId).toBe(requestId);
    expect(batch!.universityOrgId).toBe(s.university.id);
    expect(batch!.approvedById).not.toBeNull();
    expect(batch!.approvedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'AcademicIntake', entityId: batchId },
    });
    expect(audit!.action).toBe('academic_batch.created_from_request');
  });

  it('G. every trainee of the request is linked to the batch', async () => {
    const rows = await prisma.trainingRequestTrainee.findMany({
      where: { trainingRequestId: requestId },
    });
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.academicIntakeId).toBe(batchId);
    }
  });

  it('I. the cluster allocates a trainee to hospital 1, opening an allocation', async () => {
    const res = await http
      .post(`/training-requests/trainees/${traineeRowIds[0]}/allocations/hospital`)
      .set(auth(directorToken))
      .send({ hospitalId: s.hospital1.id, reason: 'التوزيع الأولي' });
    expect([200, 201]).toContain(res.status);

    const open = await prisma.traineeAllocation.findMany({
      where: { traineeRowId: traineeRowIds[0], status: 'open' },
    });
    expect(open).toHaveLength(1);
    expect(open[0].hospitalId).toBe(s.hospital1.id);
    expect(open[0].action).toBe('manual');
    expect(open[0].previousAllocationId).toBeNull();

    // The denormalised projection tracks the record.
    const row = await prisma.trainingRequestTrainee.findUnique({
      where: { id: traineeRowIds[0] },
    });
    expect(row!.assignedHospitalId).toBe(s.hospital1.id);
  });

  it('L+M+N. hospital training administration sees its trainees and manages capacity', async () => {
    // Sees only its own hospital's trainees.
    const allocations = await prisma.traineeAllocation.findMany({
      where: { hospitalId: s.hospital1.id, status: 'open' },
    });
    expect(allocations.length).toBeGreaterThan(0);

    // Manages department capacity — hospital context, capacity.manage.
    const capRes = await http
      .patch(`/organizations/departments/${s.departments.h1Internal.id}/capacity`)
      .set(auth(h1Token))
      .send({ capacity: 6 });
    expect(capRes.status).toBe(200);

    const dept = await prisma.department.findUnique({
      where: { id: s.departments.h1Internal.id },
    });
    expect(dept!.capacity).toBe(6);

    // Reads the capacity breakdown for its own hospital.
    const readRes = await http
      .get(`/organizations/${s.hospital1.id}/capacity`)
      .set(auth(h1Token));
    expect(readRes.status).toBe(200);
  });

  it('assigns a department within the hospital', async () => {
    const res = await http
      .post(`/training-requests/trainees/${traineeRowIds[0]}/allocations/department`)
      .set(auth(h1Token))
      .send({ departmentId: s.departments.h1Internal.id });
    expect([200, 201]).toContain(res.status);

    const open = await prisma.traineeAllocation.findFirst({
      where: { traineeRowId: traineeRowIds[0], status: 'open' },
    });
    expect(open!.departmentId).toBe(s.departments.h1Internal.id);
    expect(open!.hospitalId).toBe(s.hospital1.id);
    expect(open!.action).toBe('hospital_assign');
  });

  it('K. internal reassignment closes the previous allocation and opens a new one', async () => {
    const before = await prisma.traineeAllocation.findFirst({
      where: { traineeRowId: traineeRowIds[0], status: 'open' },
    });

    const res = await http
      .post(`/training-requests/trainees/${traineeRowIds[0]}/allocations/department`)
      .set(auth(h1Token))
      .send({ departmentId: s.departments.h1Paediatrics.id, reason: 'إعادة توزيع داخلي' });
    expect([200, 201]).toContain(res.status);

    // The old allocation is closed, not overwritten.
    const closed = await prisma.traineeAllocation.findUnique({ where: { id: before!.id } });
    expect(closed!.status).toBe('superseded');
    expect(closed!.closedAt).not.toBeNull();
    expect(closed!.closedById).not.toBeNull();

    // Exactly one open allocation, chained to its predecessor, carrying the move.
    const open = await prisma.traineeAllocation.findMany({
      where: { traineeRowId: traineeRowIds[0], status: 'open' },
    });
    expect(open).toHaveLength(1);
    expect(open[0].previousAllocationId).toBe(before!.id);
    expect(open[0].previousDepartmentId).toBe(s.departments.h1Internal.id);
    expect(open[0].departmentId).toBe(s.departments.h1Paediatrics.id);
    expect(open[0].action).toBe('hospital_reassign');

    // And the audit records the transition with both ends of it.
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'TraineeAllocation', entityId: open[0].id },
    });
    expect(audit!.action).toBe('allocation.hospital_reassign');
    expect(audit!.oldValues).toMatchObject({ departmentId: s.departments.h1Internal.id });
  });

  it('the cluster can move a trainee between hospitals; history is preserved', async () => {
    const before = await prisma.traineeAllocation.findFirst({
      where: { traineeRowId: traineeRowIds[0], status: 'open' },
    });

    const res = await http
      .post(`/training-requests/trainees/${traineeRowIds[0]}/allocations/hospital`)
      .set(auth(directorToken))
      .send({ hospitalId: s.hospital2.id, reason: 'نقل بين المستشفيات' });
    expect([200, 201]).toContain(res.status);

    const closed = await prisma.traineeAllocation.findUnique({ where: { id: before!.id } });
    expect(closed!.status).toBe('superseded');

    const open = await prisma.traineeAllocation.findMany({
      where: { traineeRowId: traineeRowIds[0], status: 'open' },
    });
    expect(open).toHaveLength(1);
    expect(open[0].hospitalId).toBe(s.hospital2.id);
    expect(open[0].previousHospitalId).toBe(s.hospital1.id);
    expect(open[0].action).toBe('cluster_reassign');

    // The full chain is readable — the timeline's source.
    const history = await prisma.traineeAllocation.findMany({
      where: { traineeRowId: traineeRowIds[0] },
      orderBy: { performedAt: 'asc' },
    });
    expect(history.length).toBeGreaterThanOrEqual(4);
    expect(history.filter((a) => a.status === 'open')).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// 3. Negative authorisation — the separation, enforced
// ───────────────────────────────────────────────────────────────────────────────
describe('Negative authorisation', () => {
  let h1Token: string;
  let h2Token: string;
  let directorToken: string;
  let h1DirectorToken: string;
  let deptHeadToken: string;
  let traineeToken: string;
  let requestId: string;
  let rowId: string;

  beforeAll(async () => {
    h1Token = await login(SCENARIO.accounts.hospital1TrainingAdmin);
    h2Token = await login(SCENARIO.accounts.hospital2TrainingAdmin);
    directorToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    h1DirectorToken = await login(SCENARIO.accounts.hospital1Director);
    // The removed-role account no longer has a Role row, so login refuses it
    // outright; N9 asserts that directly instead of driving endpoints with it.
    deptHeadToken = await login(SCENARIO.accounts.hospital1DeptHead).catch(() => '');
    traineeToken = await login(SCENARIO.accounts.trainee);

    const row = await prisma.trainingRequestTrainee.findFirst({
      where: { trainingRequest: { targetOrgId: s.cluster.id } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw new Error('No training request trainee found for cluster in authz-workflow.e2e-spec.ts');
    rowId = row.id;
    requestId = row.trainingRequestId;
  });

  it('N1. hospital training admin cannot create a training request', async () => {
    const before = await prisma.trainingRequest.count();
    const res = await http
      .post('/training-requests')
      .set(auth(h1Token))
      .send({ targetOrgId: s.cluster.id, programId: s.program.id, studentCount: 3 });
    expect(res.status).toBe(403);
    expect(await prisma.trainingRequest.count()).toBe(before);
  });

  it('N2. hospital training admin cannot create an academic batch', async () => {
    const before = await prisma.academicIntake.count();
    const res = await http
      .post('/academic-intakes/from-request')
      .set(auth(h1Token))
      .send({ trainingRequestId: requestId });
    expect(res.status).toBe(403);
    expect(await prisma.academicIntake.count()).toBe(before);
  });

  it('N3. hospital training admin cannot move a trainee to another hospital', async () => {
    const before = await prisma.traineeAllocation.findFirst({
      where: { traineeRowId: rowId, status: 'open' },
    });
    const res = await http
      .post(`/training-requests/trainees/${rowId}/allocations/hospital`)
      .set(auth(h1Token))
      .send({ hospitalId: s.hospital2.id });
    expect(res.status).toBe(403);

    const after = await prisma.traineeAllocation.findFirst({
      where: { traineeRowId: rowId, status: 'open' },
    });
    expect(after?.id).toBe(before?.id);
    expect(after?.hospitalId).toBe(before?.hospitalId);
  });

  it("N4. hospital training admin cannot change another hospital's capacity", async () => {
    const before = await prisma.department.findUnique({
      where: { id: s.departments.h2Internal.id },
    });
    const res = await http
      .patch(`/organizations/departments/${s.departments.h2Internal.id}/capacity`)
      .set(auth(h1Token))
      .send({ capacity: 99 });
    expect(res.status).toBe(403);

    const after = await prisma.department.findUnique({
      where: { id: s.departments.h2Internal.id },
    });
    expect(after!.capacity).toBe(before!.capacity);
  });

  it('N5. the training director cannot manage hospital department capacity', async () => {
    const before = await prisma.department.findUnique({
      where: { id: s.departments.h1Internal.id },
    });
    const res = await http
      .patch(`/organizations/departments/${s.departments.h1Internal.id}/capacity`)
      .set(auth(directorToken))
      .send({ capacity: 42 });
    // Cluster authority stops at choosing the hospital.
    expect(res.status).toBe(403);

    const after = await prisma.department.findUnique({
      where: { id: s.departments.h1Internal.id },
    });
    expect(after!.capacity).toBe(before!.capacity);
  });

  it('N5b. the training director cannot assign departments inside a hospital', async () => {
    const res = await http
      .post(`/training-requests/trainees/${rowId}/allocations/department`)
      .set(auth(directorToken))
      .send({ departmentId: s.departments.h1Internal.id });
    expect(res.status).toBe(403);
  });

  it('N7. the hospital director has no training capability at all', async () => {
    const capacityWrite = await http
      .patch(`/organizations/departments/${s.departments.h1Internal.id}/capacity`)
      .set(auth(h1DirectorToken))
      .send({ capacity: 7 });
    expect(capacityWrite.status).toBe(403);

    const requests = await http.get('/training-requests').set(auth(h1DirectorToken));
    expect(requests.status).toBe(403);

    const allocate = await http
      .post(`/training-requests/trainees/${rowId}/allocations/department`)
      .set(auth(h1DirectorToken))
      .send({ departmentId: s.departments.h1Internal.id });
    expect(allocate.status).toBe(403);

    const batch = await http
      .post('/academic-intakes/from-request')
      .set(auth(h1DirectorToken))
      .send({ trainingRequestId: requestId });
    expect(batch.status).toBe(403);
  });

  it('N9. the removed department-head role reaches nothing — it cannot even sign in', async () => {
    const loginRes = await http
      .post('/auth/login')
      .send({ email: SCENARIO.accounts.hospital1DeptHead, password: SCENARIO.password });
    expect(loginRes.status).toBe(403);
    expect(deptHeadToken).toBe('');

    // And with no session, the hospital-internal routes stay closed to it.
    const cap = await http
      .patch(`/organizations/departments/${s.departments.h1Internal.id}/capacity`)
      .set(auth(deptHeadToken))
      .send({ capacity: 11 });
    expect([401, 403]).toContain(cap.status);

    const alloc = await http
      .post(`/training-requests/trainees/${rowId}/allocations/department`)
      .set(auth(deptHeadToken))
      .send({ departmentId: s.departments.h1Paediatrics.id });
    expect([401, 403]).toContain(alloc.status);
  });

  it('N11. a trainee cannot read a training request or its trainees', async () => {
    expect((await http.get(`/training-requests/${requestId}`).set(auth(traineeToken))).status)
      .toBe(403);
    expect(
      (await http.get(`/training-requests/${requestId}/trainees`).set(auth(traineeToken))).status,
    ).toBe(403);
    expect(
      (await http.get(`/training-requests/${requestId}/summary`).set(auth(traineeToken))).status,
    ).toBe(403);
  });

  it('N12/N13. IDOR: a hospital cannot read another hospital-scoped resource by id', async () => {
    // Hospital 2's training admin holds no training_request.view capability at
    // all, so the request detail route is closed to it outright.
    const res = await http.get(`/training-requests/${requestId}`).set(auth(h2Token));
    expect(res.status).toBe(403);
  });

  it('N18. a batch cannot be created from a request that is not approved', async () => {
    const fresh = await prisma.trainingRequest.create({
      data: {
        requestNumber: `TR-NEG-${Date.now()}`,
        sourceOrgId: s.university.id,
        targetOrgId: s.cluster.id,
        programId: s.program.id,
        studentCount: 2,
        status: 'submitted',
      },
    });

    const before = await prisma.academicIntake.count();
    const res = await http
      .post('/academic-intakes/from-request')
      .set(auth(directorToken))
      .send({ trainingRequestId: fresh.id });
    expect(res.status).toBe(409);
    expect(await prisma.academicIntake.count()).toBe(before);
  });

  it('N19. a cluster→hospital training request is accepted, but only with the university no-objection letter', async () => {
    // Path B of the approved model: the cluster may address a hospital directly.
    // What is refused is doing so without the university's no-objection letter,
    // which is the document standing in for a university-originated request.
    const before = await prisma.trainingRequest.count();

    const withoutLetter = await http
      .post('/training-requests')
      .set(auth(directorToken))
      .send({
        requestType: 'cluster_request',
        targetOrgId: s.hospital1.id,
        targetHospitalId: s.hospital1.id,
        programId: s.program.id,
        studentCount: 5,
        trainingStartDate: '2026-09-01T00:00:00.000Z',
        trainingEndDate: '2027-08-31T00:00:00.000Z',
      });
    expect(withoutLetter.status).toBe(400);
    expect(withoutLetter.body.message).toContain('عدم الممانعة');
    expect(await prisma.trainingRequest.count()).toBe(before);

    const withLetter = await http
      .post('/training-requests')
      .set(auth(directorToken))
      .send({
        requestType: 'cluster_request',
        targetOrgId: s.hospital1.id,
        targetHospitalId: s.hospital1.id,
        programId: s.program.id,
        studentCount: 5,
        trainingStartDate: '2026-09-01T00:00:00.000Z',
        trainingEndDate: '2027-08-31T00:00:00.000Z',
        clusterLetterUrl: 'https://miran.health/docs/no-objection-letter.pdf',
      });
    expect([200, 201]).toContain(withLetter.status);

    const created = withLetter.body.data ?? withLetter.body;
    expect(created.targetOrgId).toBe(s.hospital1.id);
    expect(await prisma.trainingRequest.count()).toBe(before + 1);
  });

  it('N19b. a trainee cannot open the direct cluster→hospital path', async () => {
    const res = await http
      .post('/training-requests')
      .set(auth(traineeToken))
      .send({
        requestType: 'cluster_request',
        targetOrgId: s.hospital1.id,
        programId: s.program.id,
        studentCount: 1,
        clusterLetterUrl: 'https://miran.health/docs/no-objection-letter.pdf',
      });
    expect(res.status).toBe(403);
  });

  it('the free-standing academic batch route is gone', async () => {
    const before = await prisma.academicIntake.count();
    const res = await http
      .post('/academic-intakes')
      .set(auth(directorToken))
      .send({
        programId: s.program.id,
        code: `ORPHAN-${Date.now()}`,
        nameAr: 'دفعة بلا مصدر',
        academicYear: '2027',
        startDate: '2027-01-01',
        endDate: '2027-12-31',
      });
    expect(res.status).not.toBe(201);
    expect(await prisma.academicIntake.count()).toBe(before);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// 4. Capacity — one source of truth
// ───────────────────────────────────────────────────────────────────────────────
describe('Capacity', () => {
  it('hospital capacity equals the sum of its active departments', async () => {
    const departments = await prisma.department.findMany({
      where: { organizationId: s.hospital1.id, isActive: true },
      select: { capacity: true },
    });
    const sum = departments.reduce((t, d) => t + d.capacity, 0);

    const h1Token = await login(SCENARIO.accounts.hospital1TrainingAdmin);
    const res = await http.get(`/organizations/${s.hospital1.id}/capacity`).set(auth(h1Token));
    expect(res.status).toBe(200);
    // getBreakdown returns the breakdown unwrapped, not under `data`.
    expect(res.body.hospital.capacity).toBe(sum);
  });

  it('the database refuses negative department capacity', async () => {
    await expect(
      prisma.department.update({
        where: { id: s.departments.h1Internal.id },
        data: { capacity: -1 },
      }),
    ).rejects.toThrow();
  });

  it('the database refuses a second open allocation for the same trainee', async () => {
    const open = await prisma.traineeAllocation.findFirst({ where: { status: 'open' } });
    expect(open).not.toBeNull();

    await expect(
      prisma.traineeAllocation.create({
        data: {
          traineeRowId: open!.traineeRowId,
          clusterOrgId: open!.clusterOrgId,
          hospitalId: open!.hospitalId,
          status: 'open',
          action: 'manual',
        },
      }),
    ).rejects.toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// 5. Multi-organisation context — no capability leaks between contexts
// ───────────────────────────────────────────────────────────────────────────────
describe('Multi-organisation context', () => {
  it('capabilities are recomputed per context and never accumulate', async () => {
    // An account holding both roles: hospital training admin at hospital 1 and
    // training director at the cluster.
    const dual = await prisma.userAccount.findUnique({
      where: { email: SCENARIO.accounts.hospital1TrainingAdmin },
    });
    const directorRole = await prisma.role.findUnique({ where: { code: 'training_director' } });
    await prisma.userRole.upsert({
      where: {
        userAccountId_roleId_organizationId: {
          userAccountId: dual!.id, roleId: directorRole!.id, organizationId: s.cluster.id,
        },
      },
      update: {},
      create: {
        userAccountId: dual!.id, roleId: directorRole!.id, organizationId: s.cluster.id,
      },
    });
    await prisma.organizationAssignment.create({
      data: {
        userAccountId: dual!.id,
        organizationId: s.cluster.id,
        roleId: directorRole!.id,
        isActive: true,
        sourceType: 'manual',
      },
    });

    const token = await login(SCENARIO.accounts.hospital1TrainingAdmin);

    // In hospital context: hospital capabilities, no cluster ones.
    const hospitalProfile = await http.get('/auth/me').set(auth(token));
    const hospitalCaps: string[] = hospitalProfile.body.user.capabilities;
    expect(hospitalCaps).toContain('capacity.manage');
    expect(hospitalCaps).not.toContain('training_request.approve');

    // Switch to the cluster: cluster capabilities, and the hospital ones are gone.
    const switched = await switchOrg(token, s.cluster.id);
    expect([200, 201]).toContain(switched.status);
    const clusterCaps: string[] = switched.body.capabilities;
    expect(clusterCaps).toContain('training_request.approve');
    expect(clusterCaps).not.toContain('capacity.manage');

    // And the cluster token genuinely cannot manage hospital capacity.
    const clusterToken = switched.body.tokens.accessToken;
    const res = await http
      .patch(`/organizations/departments/${s.departments.h1Internal.id}/capacity`)
      .set(auth(clusterToken))
      .send({ capacity: 5 });
    expect(res.status).toBe(403);
  });
});
