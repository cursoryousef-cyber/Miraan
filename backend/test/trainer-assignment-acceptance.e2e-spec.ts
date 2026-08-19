/**
 * Trainer Assignment Acceptance.
 *
 * Hospital Training assigns department+trainer → Rotation opens as
 * 'pending_acceptance' (not 'active') → trainer sees it in
 * GET /operations/trainer/assignment-requests → accept flips it to 'active'
 * (now visible everywhere Rotation.status='active' is the scope filter);
 * reject requires a reason, marks it 'rejected', and clears the still-open
 * TraineeAllocation's trainer/department so hospital training can reassign
 * through the existing /allocations/department call.
 *
 * No new model: this reuses Rotation.status (a free varchar, no DB check
 * constraint) and TraineeAllocation exactly as before.
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
  await resetE2EScenario();
  await prisma.$disconnect();
  await app?.close();
});

describe('Trainer assignment acceptance', () => {
  let uniToken: string;
  let directorToken: string;
  let h1TrainingToken: string;
  let requestId: string;
  let rowId: string;
  let profileId: string;

  it('setup: request, roster, approval and hospital allocation reach the department-assignment step', async () => {
    uniToken = await login(SCENARIO.accounts.universityAdmin);
    directorToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    h1TrainingToken = await login(SCENARIO.accounts.hospital1TrainingAdmin);

    const res = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id, programId: s.program.id, specialty: 'internal_medicine',
      trainingStartDate: '2027-01-01', trainingEndDate: '2027-12-31', studentCount: 1,
      rotations: [{ departmentNameAr: 'الباطنة', durationWeeks: 52 }],
    });
    if (res.status !== 201) throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    requestId = res.body.data.id;

    const importRes = await http.post(`/training-requests/${requestId}/trainees/import`).set(auth(uniToken)).send({
      rows: [{
        academicNumber: 'ACC-1', nationalId: '9940000001', nameAr: 'متدرب قبول',
        specialty: 'internal_medicine', startDate: '2027-01-01', endDate: '2027-12-31',
        gender: 'male', mobile: '0500000001', email: 'acc1_unique@miran.test',
      }],
    });
    if (importRes.status !== 201) throw new Error(`import failed: ${importRes.status} ${JSON.stringify(importRes.body)}`);
    rowId = (await prisma.trainingRequestTrainee.findFirstOrThrow({ where: { trainingRequestId: requestId } })).id;

    for (const documentType of ['national_id', 'internship_letter', 'academic_transcript', 'medical_examination']) {
      await prisma.document.create({
        data: { organizationId: s.cluster.id, trainingRequestTraineeId: rowId, documentType, titleAr: documentType, storageKey: `test/${rowId}/${documentType}`, isMandatory: true, status: 'approved' },
      });
    }
    const submit = await http.post(`/training-requests/${requestId}/trainees/submit`).set(auth(uniToken));
    expect([200, 201]).toContain(submit.status);
    const approve = await http.post(`/training-requests/trainees/${rowId}/approve`).set(auth(directorToken));
    if (![200, 201].includes(approve.status)) throw new Error(`approve failed: ${approve.status} ${JSON.stringify(approve.body)}`);
    profileId = (await prisma.trainingRequestTrainee.findUniqueOrThrow({ where: { id: rowId } })).traineeProfileId!;
    expect(profileId).toBeTruthy();

    const allocHospital = await http.post(`/training-requests/trainees/${rowId}/allocations/hospital`).set(auth(directorToken)).send({ hospitalId: s.hospital1.id, reason: 'test' });
    if (![200, 201].includes(allocHospital.status)) throw new Error(`allocate hospital failed: ${allocHospital.status} ${JSON.stringify(allocHospital.body)}`);
  });

  it('1. department+trainer assignment opens the Rotation as pending, not active', async () => {
    const res = await http.post(`/training-requests/trainees/${rowId}/allocations/department`).set(auth(h1TrainingToken)).send({
      departmentId: s.departments.h1Internal.id, trainerProfileId: s.trainers.h1Internal.id,
    });
    if (![200, 201].includes(res.status)) throw new Error(`assign department failed: ${res.status} ${JSON.stringify(res.body)}`);

    const rotation = await prisma.rotation.findFirstOrThrow({ where: { traineeProfileId: profileId } });
    expect(rotation.status).toBe('pending_acceptance');

    // Not yet visible in trainer scope surfaces that filter on status='active'.
    const trainerToken = await login(SCENARIO.accounts.hospital1Trainer);
    const dash = await http.get('/operations/trainer/dashboard').set(auth(trainerToken));
    expect(dash.body.data.assignedTrainees).toBe(0);
  });

  it('2. the correct trainer sees the pending request, with the expected fields', async () => {
    const trainerToken = await login(SCENARIO.accounts.hospital1Trainer);
    const res = await http.get('/operations/trainer/assignment-requests').set(auth(trainerToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const req = res.body.data[0];
    expect(req.traineeProfile.id).toBe(profileId);
    expect(req.department.id).toBe(s.departments.h1Internal.id);
    expect(req.organization.id).toBe(s.hospital1.id);
    expect(req.startDate).toBeTruthy();
    expect(req.endDate).toBeTruthy();
  });

  it('3. a different trainer at the same hospital sees nothing', async () => {
    const otherTrainerToken = await login(SCENARIO.accounts.hospital1Trainer2);
    const res = await http.get('/operations/trainer/assignment-requests').set(auth(otherTrainerToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('9. a trainer at a different hospital sees nothing and cannot act by tampering with the rotation id', async () => {
    const rotation = await prisma.rotation.findFirstOrThrow({ where: { traineeProfileId: profileId } });
    const otherHospitalTrainerToken = await login(SCENARIO.accounts.hospital2Trainer);

    const list = await http.get('/operations/trainer/assignment-requests').set(auth(otherHospitalTrainerToken));
    expect(list.body.data).toHaveLength(0);

    const accept = await http.post(`/operations/trainer/assignment-requests/${rotation.id}/accept`).set(auth(otherHospitalTrainerToken));
    expect(accept.status).toBe(400);
    const after = await prisma.rotation.findUniqueOrThrow({ where: { id: rotation.id } });
    expect(after.status).toBe('pending_acceptance');
  });

  it('8. ID tampering — a well-formed but foreign rotation id is rejected, not silently accepted', async () => {
    const otherHospitalTrainerToken = await login(SCENARIO.accounts.hospital2Trainer);
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await http.post(`/operations/trainer/assignment-requests/${fakeId}/accept`).set(auth(otherHospitalTrainerToken));
    expect(res.status).toBe(400);
  });

  it('6. reject requires a non-empty reason', async () => {
    const trainerToken = await login(SCENARIO.accounts.hospital1Trainer);
    const res = await http.post(`/operations/trainer/assignment-requests/${(await prisma.rotation.findFirstOrThrow({ where: { traineeProfileId: profileId } })).id}/reject`).set(auth(trainerToken)).send({});
    expect(res.status).toBe(400);
  });

  it('7. reject stores the reason, marks not-active, and frees the allocation for reassignment', async () => {
    const trainerToken = await login(SCENARIO.accounts.hospital1Trainer);
    const rotation = await prisma.rotation.findFirstOrThrow({ where: { traineeProfileId: profileId } });
    const res = await http.post(`/operations/trainer/assignment-requests/${rotation.id}/reject`).set(auth(trainerToken)).send({ reason: 'التخصص لا يطابق' });
    expect([200, 201]).toContain(res.status);

    const after = await prisma.rotation.findUniqueOrThrow({ where: { id: rotation.id } });
    expect(after.status).toBe('rejected');
    expect(after.completionNotes).toBe('التخصص لا يطابق');
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(rotation.updatedAt.getTime());

    // Trainer no longer sees it as active/pending.
    const dash = await http.get('/operations/trainer/dashboard').set(auth(trainerToken));
    expect(dash.body.data.assignedTrainees).toBe(0);
    const pending = await http.get('/operations/trainer/assignment-requests').set(auth(trainerToken));
    expect(pending.body.data).toHaveLength(0);

    // Allocation returned to the hospital for reassignment through the same
    // existing endpoint — trainer/department cleared, allocation still open.
    const allocation = await prisma.traineeAllocation.findFirstOrThrow({ where: { traineeProfileId: profileId, status: 'open' } });
    expect(allocation.trainerProfileId).toBeNull();
    expect(allocation.departmentId).toBeNull();

    // Hospital training reassigns to a different trainer — new pending rotation opens.
    const h1Token = await login(SCENARIO.accounts.hospital1TrainingAdmin);
    const reassign = await http.post(`/training-requests/trainees/${rowId}/allocations/department`).set(auth(h1Token)).send({
      departmentId: s.departments.h1Internal.id, trainerProfileId: s.trainers.h1Internal.id,
    });
    expect([200, 201]).toContain(reassign.status);
  });

  it('4 & 5. accept flips the new pending rotation to active, and the trainee appears in the trainer dashboard', async () => {
    const trainerToken = await login(SCENARIO.accounts.hospital1Trainer);
    const rotation = await prisma.rotation.findFirstOrThrow({ where: { traineeProfileId: profileId, status: 'pending_acceptance' } });

    const accept = await http.post(`/operations/trainer/assignment-requests/${rotation.id}/accept`).set(auth(trainerToken));
    expect([200, 201]).toContain(accept.status);

    const after = await prisma.rotation.findUniqueOrThrow({ where: { id: rotation.id } });
    expect(after.status).toBe('active');

    const dash = await http.get('/operations/trainer/dashboard').set(auth(trainerToken));
    expect(dash.body.data.assignedTrainees).toBe(1);
    const interns = await http.get('/operations/trainer/assigned-interns').set(auth(trainerToken));
    expect(interns.body.data.map((t: any) => t.id)).toContain(profileId);

    // Hospital training administration — whoever performed the reassignment
    // that just accepted (test 7, via h1TrainingToken) — receives exactly one
    // acceptance notification, scoped to the hospital, unread.
    const hospitalAdmin = await prisma.userAccount.findFirstOrThrow({ where: { email: SCENARIO.accounts.hospital1TrainingAdmin } });
    const notifications = await prisma.notification.findMany({
      where: { userId: hospitalAdmin.id, type: 'trainee_assignment_accepted', referenceId: rotation.id },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].bodyAr).toBe('تم قبول إسناد المتدرب من قبل المدرب.');
    expect(notifications[0].organizationId).toBe(s.hospital1.id);
    expect(notifications[0].isRead).toBe(false);
  });
});
