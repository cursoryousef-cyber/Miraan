/**
 * WHERE/WHO distribution — training request → allocation → trainer/trainee
 * visibility.
 *
 * Traces and proves, from database rows and real dashboard endpoints, the full
 * chain the previous turn's report left untested:
 *
 *   TrainingRequest → TrainingPlan/Rotation (WHAT/WHEN)
 *   → TrainingRequestTrainee roster (candidates)
 *   → approval (promotion to a real TraineeProfile)
 *   → TraineeAllocation (WHERE/WHO: hospital → department → trainer)
 *   → activation (Rotation instance, TraineeProfile.applicationStatus = active)
 *   → Trainer Dashboard ("المتدربين المسندين إليك اليوم")
 *   → Trainee Dashboard (assigned rotation/department/trainer/tasks)
 *   → Logbook scope (a trainer sees only their own trainees' logs)
 *
 * The root cause this proves fixed: `assignWithinHospital` (the
 * .../allocations/department call) updated the TraineeAllocation and the
 * denormalised TrainingRequestTrainee columns, but never created a Rotation —
 * that only ever happened through the legacy acceptance chain, which requires a
 * hospital_administrator to accept a step that role has held no training
 * capability to act on since Phase 2.6. The trainer/trainee dashboards read
 * `Rotation`, not `TraineeAllocation`, so they stayed at zero no matter how many
 * trainees were correctly allocated. See ActivationService.activateSingleRow
 * and TraineeAllocationService.writeAllocation's post-commit hook for the fix.
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

async function login(email: string): Promise<string> {
  const res = await http.post('/auth/login').send({ email, password: SCENARIO.password });
  if (![200, 201].includes(res.status)) {
    throw new Error(`login ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.tokens.accessToken;
}

/**
 * Promotion creates the account inactive with a random, unknown password (a
 * real activation link would set it). Activating it directly here is the test
 * equivalent of the trainee following that link, so the account can log in
 * through the normal endpoint like anyone else's.
 */
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

describe('University → Request → Plan → Roster → Allocation → Trainer/Trainee visibility', () => {
  let uniToken: string;
  let directorToken: string;
  let h1TrainingToken: string;
  let requestId: string;
  let rowIds: string[] = [];
  let profileIds: string[] = [];

  it('1. the university submits a request with one rotation and a two-trainee roster', async () => {
    uniToken = await login(SCENARIO.accounts.universityAdmin);
    directorToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    h1TrainingToken = await login(SCENARIO.accounts.hospital1TrainingAdmin);

    const before = await prisma.trainingRequest.count();

    // One rotation spanning the whole window — the simplest possible WHAT/WHEN,
    // deliberately not the six-rotation breakdown the plan-composition suite
    // already covers, so this test is about allocation, not plan composition.
    const res = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id,
      programId: s.program.id,
      specialty: 'internal_medicine',
      trainingStartDate: '2027-01-01',
      trainingEndDate: '2027-12-31', // 52 weeks, matching the 12-month program.
      studentCount: 2,
      rotations: [{ departmentNameAr: 'الباطنة', durationWeeks: 52 }],
    });
    if (res.status !== 201) throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    requestId = res.body.data.id;

    expect(await prisma.trainingRequest.count()).toBe(before + 1);

    const dbRequest = await prisma.trainingRequest.findUniqueOrThrow({ where: { id: requestId } });
    const version = await prisma.trainingPlanVersion.findUniqueOrThrow({
      where: { id: dbRequest.trainingPlanVersionId! },
      include: { rotations: true },
    });
    // "Rotation = 1" — the plan's own WHAT/WHEN, distinct from the operational
    // Rotation rows created later once trainees actually start.
    expect(version.rotations).toHaveLength(1);

    const importRes = await http.post(`/training-requests/${requestId}/trainees/import`).set(auth(uniToken)).send({
      rows: [
        {
          academicNumber: 'DIST-1', nationalId: '9910000001', nameAr: 'متدرب توزيع 1',
          specialty: 'internal_medicine', startDate: '2027-01-01', endDate: '2027-12-31',
          gender: 'male', mobile: '0500000001', email: 'dist1_unique@miran.test',
        },
        {
          academicNumber: 'DIST-2', nationalId: '9910000002', nameAr: 'متدرب توزيع 2',
          specialty: 'internal_medicine', startDate: '2027-01-01', endDate: '2027-12-31',
          gender: 'male', mobile: '0500000002', email: 'dist2_unique@miran.test',
        },
      ],
    });
    if (importRes.status !== 201) throw new Error(`import failed: ${importRes.status} ${JSON.stringify(importRes.body)}`);

    const rows = await prisma.trainingRequestTrainee.findMany({
      where: { trainingRequestId: requestId },
      orderBy: { academicNumber: 'asc' },
    });
    expect(rows).toHaveLength(2);
    rowIds = rows.map((r) => r.id);
  });

  it('2. roster ≠ allocation: no TraineeAllocation exists yet, and no profile is promoted yet', async () => {
    // A roster is "these trainees are participating in this request" — not yet
    // "this trainee has been placed anywhere". Confirmed before any approval or
    // allocation call has been made.
    expect(await prisma.traineeAllocation.count({ where: { trainingRequestId: requestId } })).toBe(0);
    const rows = await prisma.trainingRequestTrainee.findMany({ where: { id: { in: rowIds } } });
    expect(rows.every((r) => r.traineeProfileId === null)).toBe(true);
    expect(rows.every((r) => r.status === 'draft')).toBe(true);
  });

  it('3. the cluster submits and approves both trainees — promoted to real profiles', async () => {
    // Approval is gated on the cluster's own document checklist — orthogonal to
    // the allocation flow this test exists to prove, so the four mandatory
    // documents are attached directly rather than exercised through the upload
    // endpoint. This has to happen BEFORE submit: submit runs the validation
    // engine once and stores its result on the row, and approval reads that
    // stored result rather than re-checking documents live — attaching them
    // afterwards would not retroactively clear an already-recorded error.
    const MANDATORY_DOCS = ['national_id', 'internship_letter', 'academic_transcript', 'medical_examination'];
    for (const rowId of rowIds) {
      for (const documentType of MANDATORY_DOCS) {
        await prisma.document.create({
          data: {
            organizationId: s.cluster.id,
            trainingRequestTraineeId: rowId,
            documentType,
            titleAr: documentType,
            storageKey: `test/${rowId}/${documentType}`,
            isMandatory: true,
            status: 'approved',
          },
        });
      }
    }

    const submit = await http.post(`/training-requests/${requestId}/trainees/submit`).set(auth(uniToken));
    expect([200, 201]).toContain(submit.status);

    for (const rowId of rowIds) {
      const approve = await http.post(`/training-requests/trainees/${rowId}/approve`).set(auth(directorToken));
      if (![200, 201].includes(approve.status)) {
        throw new Error(`approve failed: ${approve.status} ${JSON.stringify(approve.body)}`);
      }
    }

    const rows = await prisma.trainingRequestTrainee.findMany({ where: { id: { in: rowIds } } });
    profileIds = rows.map((r) => r.traineeProfileId).filter((p): p is string => !!p);

    expect(profileIds).toHaveLength(2);
    expect(new Set(profileIds).size).toBe(2);
    expect(rows.every((r) => r.status === 'cluster_approved')).toBe(true);
    expect(rows.every((r) => r.traineeProfileId !== null)).toBe(true);

    // Still no allocation — approval promotes identity, it does not place anyone.
    expect(await prisma.traineeAllocation.count({ where: { trainingRequestId: requestId } })).toBe(0);
  });

  it('4. the cluster allocates both trainees to Hospital 1 — TraineeAllocation created, not auto-guessed', async () => {
    for (const rowId of rowIds) {
      const res = await http
        .post(`/training-requests/trainees/${rowId}/allocations/hospital`)
        .set(auth(directorToken))
        .send({ hospitalId: s.hospital1.id, reason: 'توزيع اختبار القبول' });
      if (![200, 201].includes(res.status)) {
        throw new Error(`allocate failed: ${res.status} ${JSON.stringify(res.body)}`);
      }
    }

    const allocations = await prisma.traineeAllocation.findMany({
      where: { trainingRequestId: requestId, status: 'open' },
    });
    expect(allocations).toHaveLength(2);
    for (const a of allocations) {
      expect(a.hospitalId).toBe(s.hospital1.id);
      expect(a.clusterOrgId).toBe(s.cluster.id);
      expect(a.traineeProfileId).not.toBeNull();
      expect(a.traineeRowId).toEqual(expect.any(String));
      // No department/trainer yet — this call only ever answers "which hospital".
      expect(a.departmentId).toBeNull();
      expect(a.trainerProfileId).toBeNull();
    }

    // Hospital-only allocation does not yet make the trainee visible to any
    // trainer — there is no department, no trainer, nothing to instantiate.
    expect(await prisma.rotation.count({ where: { traineeProfileId: { in: profileIds } } })).toBe(0);
  });

  it('5. hospital training administration assigns department and trainer — this is where activation triggers', async () => {
    for (const rowId of rowIds) {
      const res = await http
        .post(`/training-requests/trainees/${rowId}/allocations/department`)
        .set(auth(h1TrainingToken))
        .send({ departmentId: s.departments.h1Internal.id, trainerProfileId: s.trainers.h1Internal.id });
      if (![200, 201].includes(res.status)) {
        throw new Error(`assign department failed: ${res.status} ${JSON.stringify(res.body)}`);
      }
    }

    const allocations = await prisma.traineeAllocation.findMany({
      where: { trainingRequestId: requestId, status: 'open' },
    });
    expect(allocations).toHaveLength(2);
    for (const a of allocations) {
      expect(a.departmentId).toBe(s.departments.h1Internal.id);
      expect(a.trainerProfileId).toBe(s.trainers.h1Internal.id);
    }
  });

  it('5b. the trainer accepts both pending assignments — required before Rotation counts as active', async () => {
    const trainerToken = await login(SCENARIO.accounts.hospital1Trainer);
    const pending = await http.get('/operations/trainer/assignment-requests').set(auth(trainerToken));
    expect(pending.body.data).toHaveLength(2);
    for (const req of pending.body.data) {
      const res = await http.post(`/operations/trainer/assignment-requests/${req.id}/accept`).set(auth(trainerToken));
      expect([200, 201]).toContain(res.status);
    }
  });

  it('6. exactly the expected canonical rows exist: request 1, roster 2, allocations 2', async () => {
    expect(await prisma.trainingRequest.count({ where: { id: requestId } })).toBe(1);
    expect(await prisma.trainingRequestTrainee.count({ where: { trainingRequestId: requestId } })).toBe(2);
    expect(await prisma.traineeAllocation.count({ where: { trainingRequestId: requestId, status: 'open' } })).toBe(2);
  });

  it('7. THE FIX: department+trainer assignment activated both trainees — Rotation now exists for each', async () => {
    const rotations = await prisma.rotation.findMany({
      where: { traineeProfileId: { in: profileIds }, status: 'active' },
    });
    expect(rotations).toHaveLength(2);
    for (const r of rotations) {
      expect(r.organizationId).toBe(s.hospital1.id);
      expect(r.departmentId).toBe(s.departments.h1Internal.id);
      expect(r.trainerProfileId).toBe(s.trainers.h1Internal.id);
    }

    const profiles = await prisma.traineeProfile.findMany({ where: { id: { in: profileIds } } });
    expect(profiles.every((p) => p.applicationStatus === 'active')).toBe(true);
    expect(profiles.every((p) => p.organizationId === s.hospital1.id)).toBe(true);

    const rows = await prisma.trainingRequestTrainee.findMany({ where: { id: { in: rowIds } } });
    expect(rows.every((r) => r.status === 'active')).toBe(true);

    const audit = await prisma.auditLog.findMany({
      where: { entityId: { in: profileIds }, action: 'internship_activated' },
    });
    expect(audit).toHaveLength(2);
  });

  it('8. the trainer dashboard now shows both trainees, not zero', async () => {
    const trainerToken = await login(SCENARIO.accounts.hospital1Trainer);

    const dashboard = await http.get('/operations/trainer/dashboard').set(auth(trainerToken));
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.assignedTrainees).toBe(2);
    expect(dashboard.body.data.activeRotations).toBe(2);

    const interns = await http.get('/operations/trainer/assigned-interns').set(auth(trainerToken));
    expect(interns.status).toBe(200);
    const returnedIds = interns.body.data.map((t: any) => t.id);
    expect(new Set(returnedIds)).toEqual(new Set(profileIds));
    for (const intern of interns.body.data) {
      expect(intern.rotations[0].department.id).toBe(s.departments.h1Internal.id);
      expect(intern.rotations[0].trainerProfile.id).toBe(s.trainers.h1Internal.id);
    }
  });

  it('9. trainee #1 sees their assigned rotation, hospital, department, trainer and tasks', async () => {
    const email = await activateForLogin(profileIds[0]);
    const traineeToken = await login(email);

    const dashboard = await http.get('/operations/trainee/dashboard').set(auth(traineeToken));
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data).not.toBeNull();

    const { profile, rotation, tasks } = dashboard.body.data;
    expect(profile.organizationId).toBe(s.hospital1.id);
    expect(rotation).not.toBeNull();
    expect(rotation.departmentId).toBe(s.departments.h1Internal.id);
    expect(rotation.trainerProfileId).toBe(s.trainers.h1Internal.id);
    expect(rotation.department.id).toBe(s.departments.h1Internal.id);
    expect(rotation.trainerProfile.id).toBe(s.trainers.h1Internal.id);
    // No tasks were created in this scenario — an empty, successfully-returned
    // list is the correct state, not a bug to paper over with fabricated tasks.
    expect(Array.isArray(tasks)).toBe(true);
  });

  it('10. logbook scope: the trainer sees only clinical logs of trainees allocated to them', async () => {
    // A log that legitimately belongs to this trainer's assigned trainee.
    const ownLog = await prisma.clinicalCaseLog.create({
      data: {
        traineeProfileId: profileIds[0],
        organizationId: s.hospital1.id,
        departmentId: s.departments.h1Internal.id,
        trainerProfileId: s.trainers.h1Internal.id,
        diagnosis: 'حالة اختبار — تابعة للمدرب',
        performedAt: new Date(),
        status: 'submitted',
      },
    });

    // A log from a completely different hospital/trainer, which must never
    // appear in this trainer's scope regardless of what the trainee roster
    // elsewhere contains.
    const strayProfilePerson = await prisma.person.create({
      data: {
        nationalId: '9700000099', nameAr: 'متدرب مستشفى آخر', nameEn: 'Other Hospital Trainee',
        dateOfBirth: new Date('1998-01-01'), gender: 'male', nationality: 'SA',
      },
    });
    const strayProfile = await prisma.traineeProfile.create({
      data: {
        personId: strayProfilePerson.id, organizationId: s.hospital2.id,
        traineeNumber: 'DIST-STRAY-1', level: 'intern',
      },
    });
    const strayLog = await prisma.clinicalCaseLog.create({
      data: {
        traineeProfileId: strayProfile.id,
        organizationId: s.hospital2.id,
        trainerProfileId: s.trainers.h2Internal.id,
        diagnosis: 'حالة اختبار — مستشفى آخر',
        performedAt: new Date(),
        status: 'submitted',
      },
    });

    const trainerToken = await login(SCENARIO.accounts.hospital1Trainer);
    const res = await http.get('/logbook/my-logs').set(auth(trainerToken));
    expect(res.status).toBe(200);

    const ids = res.body.data.map((l: any) => l.id);
    expect(ids).toContain(ownLog.id);
    expect(ids).not.toContain(strayLog.id);
  });
});
