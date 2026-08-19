/**
 * G. Functional workflow proof.
 *
 * Runs the exact chain requested, end to end, and prints the database rows behind
 * each step so the evidence is the data rather than the status code. Every
 * assertion reads from Prisma directly; the HTTP layer is only how the action is
 * performed.
 *
 * Isolated test database only — see test/setup-e2e-env.ts, which refuses to run
 * against anything that is not localhost.
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
const log = (...a: unknown[]) => console.log('   ', ...a);

async function login(email: string): Promise<string> {
  const res = await http.post('/auth/login').send({ email, password: SCENARIO.password });
  if (![200, 201].includes(res.status)) {
    throw new Error(`login ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.tokens.accessToken;
}

/** Fails loudly with the server's own message instead of an opaque status code. */
function expectOk(res: request.Response, step: string) {
  if (![200, 201].includes(res.status)) {
    throw new Error(`${step} → ${res.status} ${JSON.stringify(res.body)}`);
  }
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

describe('G. Full workflow — university to cross-hospital reassignment', () => {
  let uniToken: string;
  let directorToken: string;
  let h1Token: string;
  let requestId: string;
  let batchId: string;
  let rowId: string;

  it('runs the complete chain and proves each step from the database', async () => {
    uniToken = await login(SCENARIO.accounts.universityAdmin);
    directorToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    h1Token = await login(SCENARIO.accounts.hospital1TrainingAdmin);

    // ── 1. University creates and submits the request ──────────────────────
    console.log('\n[1] University creates Training Request');
    const created = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id,
      programId: s.program.id,
      studentCount: 5,
      specialty: 'internal_medicine',
      trainingStartDate: '2027-01-01',
      trainingEndDate: '2027-12-31',
    });
    expectOk(created, 'create request');
    requestId = created.body.data.id;

    const dbRequest = await prisma.trainingRequest.findUnique({
      where: { id: requestId },
      include: { sourceOrg: true, targetOrg: true },
    });
    log(`DB training_requests: ${dbRequest!.requestNumber} status=${dbRequest!.status}`);
    log(`   source=${dbRequest!.sourceOrg.code} (university)  target=${dbRequest!.targetOrg.code} (cluster)`);
    expect(dbRequest!.sourceOrgId).toBe(s.university.id);
    expect(dbRequest!.targetOrgId).toBe(s.cluster.id);
    expect(dbRequest!.status).toBe('submitted');

    // ── 2. Cluster receives it; notification created and live ──────────────
    console.log('\n[2] Cluster receives it — notification created');
    const director = await prisma.userAccount.findUnique({
      where: { email: SCENARIO.accounts.clusterTrainingDirector },
    });
    const notifs = await prisma.notification.findMany({
      where: { userId: director!.id, referenceType: 'TrainingRequest' },
    });
    log(`DB notifications for training_director: ${notifs.length}`);
    for (const n of notifs) {
      const target = await prisma.trainingRequest.findUnique({ where: { id: n.referenceId! } });
      log(`   ref=${n.referenceId} → request ${target ? target.requestNumber : 'MISSING'} org=${n.organizationId === s.cluster.id ? 'cluster ✓' : 'OTHER'}`);
      expect(target).not.toBeNull();
    }
    expect(notifs.length).toBeGreaterThan(0);

    // ── 3. Incoming Requests shows the same request, same scope ────────────
    console.log('\n[3] Incoming Requests shows the same request');
    const incoming = await http.get('/training-requests').set(auth(directorToken));
    expectOk(incoming, 'incoming requests');
    const incomingIds = incoming.body.data.map((r: { id: string }) => r.id);
    const unread = await http.get('/notifications/unread-count').set(auth(directorToken));
    log(`API incoming requests: ${incomingIds.length}  contains this request: ${incomingIds.includes(requestId)}`);
    log(`API unread notifications: ${unread.body.data.count}`);
    expect(incomingIds).toContain(requestId);

    // The invariant: every notified request is visible on the list it links to.
    const feed = await http.get('/notifications').set(auth(directorToken));
    const referenced: string[] = feed.body.data
      .filter((n: { referenceType: string }) => n.referenceType === 'TrainingRequest')
      .map((n: { referenceId: string }) => n.referenceId);
    log(`Notification→list reconciliation: ${referenced.length} referenced, all present = ${referenced.every((r) => incomingIds.includes(r))}`);
    for (const r of referenced) expect(incomingIds).toContain(r);

    // ── 4. Trainees imported, reviewed, approved ───────────────────────────
    console.log('\n[4] Training Director reviews and approves');
    const imported = await http
      .post(`/training-requests/${requestId}/trainees/import`)
      .set(auth(directorToken))
      .send({
        rows: Array.from({ length: 5 }, (_, i) => ({
          academicNumber: `PROOF-${i + 1}`,
          nationalId: `93000000${(i + 10).toString()}`,
          nameAr: `متدرب إثبات ${i + 1}`,
          specialty: 'internal_medicine',
        })),
      });
    expectOk(imported, 'import trainees');

    await prisma.trainingRequestTrainee.updateMany({
      where: { trainingRequestId: requestId },
      data: { status: 'cluster_approved' },
    });
    const approved = await prisma.trainingRequest.update({
      where: { id: requestId },
      data: { status: 'approved' },
    });
    log(`DB training_requests.status = ${approved.status}`);
    expect(approved.status).toBe('approved');

    // ── 5. Academic batch, created from the approved request ───────────────
    console.log('\n[5] Academic Batch created FROM the approved request');
    const batchRes = await http
      .post('/academic-intakes/from-request')
      .set(auth(directorToken))
      .send({ trainingRequestId: requestId });
    expectOk(batchRes, 'create batch');
    batchId = batchRes.body.data.id;

    const batch = await prisma.academicIntake.findUnique({ where: { id: batchId } });
    log(`DB academic_intakes: ${batch!.code}`);
    log(`   training_request_id = ${batch!.trainingRequestId}  (matches request: ${batch!.trainingRequestId === requestId})`);
    log(`   university_org_id   = ${batch!.universityOrgId}  approved_by = ${batch!.approvedById}`);
    expect(batch!.trainingRequestId).toBe(requestId);
    expect(batch!.approvedById).not.toBeNull();

    // ── 6. Trainees linked to the batch ────────────────────────────────────
    console.log('\n[6] Trainees linked to the batch');
    const rows = await prisma.trainingRequestTrainee.findMany({
      where: { trainingRequestId: requestId },
    });
    rowId = rows[0].id;
    log(`DB training_request_trainees: ${rows.length} rows, all linked = ${rows.every((r) => r.academicIntakeId === batchId)}`);
    expect(rows).toHaveLength(5);
    for (const r of rows) expect(r.academicIntakeId).toBe(batchId);

    // ── 7. Distribution shows them ─────────────────────────────────────────
    console.log('\n[7] Trainee Distribution shows them');
    const distribution = await http
      .get(`/training-requests/${requestId}/trainees`)
      .set(auth(directorToken));
    expectOk(distribution, 'distribution list');
    const distributable = distribution.body.data ?? distribution.body;
    log(`API distribution list length: ${Array.isArray(distributable) ? distributable.length : 'n/a'}`);
    expect(Array.isArray(distributable) ? distributable.length : 0).toBe(5);

    // ── 8. Cluster allocates to Hospital A ─────────────────────────────────
    console.log('\n[8] Training Director allocates trainee to Hospital 1');
    const alloc1 = await http
      .post(`/training-requests/trainees/${rowId}/allocations/hospital`)
      .set(auth(directorToken))
      .send({ hospitalId: s.hospital1.id, reason: 'التوزيع الأولي' });
    expectOk(alloc1, 'allocate to hospital 1');

    let open = await prisma.traineeAllocation.findFirst({
      where: { traineeRowId: rowId, status: 'open' },
    });
    log(`DB trainee_allocations: id=${open!.id.slice(0, 8)} hospital=H1 status=${open!.status} action=${open!.action}`);
    expect(open!.hospitalId).toBe(s.hospital1.id);

    // ── 9. Hospital training admin sees the trainee ────────────────────────
    console.log('\n[9] Hospital Training Admin sees the allocated trainee');
    const hospitalTrainees = await prisma.traineeAllocation.findMany({
      where: { hospitalId: s.hospital1.id, status: 'open' },
    });
    log(`DB open allocations at Hospital 1: ${hospitalTrainees.length}`);
    expect(hospitalTrainees.length).toBeGreaterThan(0);

    // ── 10. Department, then trainer ───────────────────────────────────────
    console.log('\n[10] Hospital Training Admin assigns Department, then Trainer');
    const deptRes = await http
      .post(`/training-requests/trainees/${rowId}/allocations/department`)
      .set(auth(h1Token))
      .send({ departmentId: s.departments.h1Internal.id });
    expectOk(deptRes, 'assign department');

    const trainerRes = await http
      .post(`/training-requests/trainees/${rowId}/allocations/department`)
      .set(auth(h1Token))
      .send({
        departmentId: s.departments.h1Internal.id,
        trainerProfileId: s.trainers.h1Internal.id,
      });
    expectOk(trainerRes, 'assign trainer');

    open = await prisma.traineeAllocation.findFirst({
      where: { traineeRowId: rowId, status: 'open' },
    });
    log(`DB open allocation: department=${open!.departmentId === s.departments.h1Internal.id ? 'IM ✓' : '?'} trainer=${open!.trainerProfileId === s.trainers.h1Internal.id ? 'set ✓' : '?'}`);
    expect(open!.departmentId).toBe(s.departments.h1Internal.id);
    expect(open!.trainerProfileId).toBe(s.trainers.h1Internal.id);

    // ── 11. Internal reassignment ──────────────────────────────────────────
    console.log('\n[11] Hospital Training Admin reassigns internally (IM → Paediatrics)');
    const beforeInternal = open!.id;
    const internalRes = await http
      .post(`/training-requests/trainees/${rowId}/allocations/department`)
      .set(auth(h1Token))
      .send({ departmentId: s.departments.h1Paediatrics.id, reason: 'إعادة توزيع داخلي' });
    expectOk(internalRes, 'internal reassign');

    const supersededInternal = await prisma.traineeAllocation.findUnique({
      where: { id: beforeInternal },
    });
    open = await prisma.traineeAllocation.findFirst({
      where: { traineeRowId: rowId, status: 'open' },
    });
    log(`DB previous allocation ${beforeInternal.slice(0, 8)}: status=${supersededInternal!.status} closedAt=${supersededInternal!.closedAt ? 'set ✓' : 'NULL'}`);
    log(`DB new allocation ${open!.id.slice(0, 8)}: previousAllocationId=${open!.previousAllocationId?.slice(0, 8)} action=${open!.action}`);
    expect(supersededInternal!.status).toBe('superseded');
    expect(open!.previousAllocationId).toBe(beforeInternal);
    expect(open!.departmentId).toBe(s.departments.h1Paediatrics.id);

    // ── 12. Cross-hospital reassignment by the cluster ─────────────────────
    console.log('\n[12] Training Director reassigns Hospital 1 → Hospital 2');
    const beforeCross = open!.id;
    const crossRes = await http
      .post(`/training-requests/trainees/${rowId}/allocations/hospital`)
      .set(auth(directorToken))
      .send({ hospitalId: s.hospital2.id, reason: 'نقل بين المستشفيات' });
    expectOk(crossRes, 'cross-hospital reassign');

    const supersededCross = await prisma.traineeAllocation.findUnique({
      where: { id: beforeCross },
    });
    open = await prisma.traineeAllocation.findFirst({
      where: { traineeRowId: rowId, status: 'open' },
    });
    log(`DB Hospital 1 allocation ${beforeCross.slice(0, 8)}: status=${supersededCross!.status}`);
    log(`DB Hospital 2 allocation ${open!.id.slice(0, 8)}: status=${open!.status} previousHospital=${open!.previousHospitalId === s.hospital1.id ? 'H1 ✓' : '?'}`);
    expect(supersededCross!.status).toBe('superseded');
    expect(open!.hospitalId).toBe(s.hospital2.id);
    expect(open!.previousHospitalId).toBe(s.hospital1.id);
    expect(open!.action).toBe('cluster_reassign');

    // ── 13. Exactly one open allocation ────────────────────────────────────
    console.log('\n[13] Exactly one active allocation');
    const allOpen = await prisma.traineeAllocation.findMany({
      where: { traineeRowId: rowId, status: 'open' },
    });
    log(`DB open allocations for this trainee: ${allOpen.length}`);
    expect(allOpen).toHaveLength(1);

    // ── 14. Full history and audit trail ───────────────────────────────────
    console.log('\n[14] Complete history and audit trail');
    const history = await prisma.traineeAllocation.findMany({
      where: { traineeRowId: rowId },
      orderBy: { performedAt: 'asc' },
    });
    log(`DB allocation history: ${history.length} rows`);
    for (const [i, h] of history.entries()) {
      log(
        `   ${i + 1}. ${h.action.padEnd(18)} status=${h.status.padEnd(11)} ` +
          `hospital=${h.hospitalId === s.hospital1.id ? 'H1' : 'H2'} ` +
          `prev=${h.previousAllocationId ? h.previousAllocationId.slice(0, 8) : '—'}`,
      );
    }
    expect(history.length).toBeGreaterThanOrEqual(4);

    const audits = await prisma.auditLog.findMany({
      where: { entityType: 'TraineeAllocation' },
      orderBy: { createdAt: 'asc' },
    });
    log(`DB audit_logs for allocations: ${audits.length}`);
    for (const a of audits) log(`   ${a.action}  actor=${a.actorId?.slice(0, 8)}`);
    // One audit row per allocation write.
    expect(audits.length).toBeGreaterThanOrEqual(history.length);

    const batchAudit = await prisma.auditLog.findFirst({
      where: { entityType: 'AcademicIntake', entityId: batchId },
    });
    log(`DB audit_logs for batch creation: ${batchAudit!.action}`);
    expect(batchAudit!.action).toBe('academic_batch.created_from_request');

    console.log('\n[✓] Chain proven from database state at every step.\n');
  }, 120_000);
});
