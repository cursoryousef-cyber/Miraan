/**
 * Cross-hospital transfer — history preservation.
 *
 * Exercises the existing POST /trainees/reallocate endpoint (delegates to
 * TraineeAllocationService.allocateToHospital → transferOperationalRecords)
 * and proves that accepting a transfer does not erase the trainee's prior
 * record: the old rotation is closed (status: 'transferred'), not deleted;
 * a new rotation opens at the target hospital; the old TraineeAllocation is
 * superseded, not deleted; and clinical logs/attendance/competencies survive
 * under the same TraineeProfile id.
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

describe('Trainee transfer preserves history', () => {
  it('transferring hospital 1 → hospital 2 closes the old rotation and opens a new one without losing the profile, logs, or competencies', async () => {
    const start = new Date('2027-01-01');
    const end = new Date('2027-12-31');

    const person = await prisma.person.create({
      data: { nationalId: '9930000001', nameAr: 'متدرب نقل', nameEn: 'Transfer Trainee', dateOfBirth: new Date('1998-01-01'), gender: 'male', nationality: 'SA' },
    });
    const profile = await prisma.traineeProfile.create({
      data: { personId: person.id, organizationId: s.hospital1.id, traineeNumber: 'XFER-1', level: 'intern', applicationStatus: 'active' },
    });
    const row = await prisma.trainingRequestTrainee.findFirst({ where: { traineeProfileId: null } });
    // Link this profile to a real request row so /trainees/reallocate accepts it —
    // the endpoint requires provenance (see the endpoint's own guard comment).
    let requestId: string;
    if (row) {
      await prisma.trainingRequestTrainee.update({ where: { id: row.id }, data: { traineeProfileId: profile.id } });
      requestId = row.trainingRequestId;
    } else {
      const req = await prisma.trainingRequest.create({
        data: { requestNumber: `XFER-REQ-${Date.now()}`, sourceOrgId: s.university.id, targetOrgId: s.cluster.id, programId: s.program.id, specialty: 'internal_medicine', trainingStartDate: start, trainingEndDate: end, studentCount: 1, status: 'cluster_approved' },
      });
      requestId = req.id;
      await prisma.trainingRequestTrainee.create({
        data: { trainingRequestId: req.id, academicNumber: 'XFER-1', nationalId: '9930000001', nameAr: 'متدرب نقل', traineeProfileId: profile.id, status: 'cluster_approved' },
      });
    }

    const oldRotation = await prisma.rotation.create({
      data: { traineeProfileId: profile.id, organizationId: s.hospital1.id, departmentId: s.departments.h1Internal.id, trainerProfileId: s.trainers.h1Internal.id, startDate: start, endDate: end, status: 'active' },
    });
    const oldAllocation = await prisma.traineeAllocation.create({
      data: { trainingRequestId: requestId, traineeRowId: (await prisma.trainingRequestTrainee.findFirstOrThrow({ where: { traineeProfileId: profile.id } })).id, traineeProfileId: profile.id, clusterOrgId: s.cluster.id, hospitalId: s.hospital1.id, departmentId: s.departments.h1Internal.id, trainerProfileId: s.trainers.h1Internal.id, status: 'open', action: 'hospital_assign' },
    });
    const log = await prisma.clinicalCaseLog.create({
      data: { traineeProfileId: profile.id, organizationId: s.hospital1.id, departmentId: s.departments.h1Internal.id, trainerProfileId: s.trainers.h1Internal.id, diagnosis: 'حالة قبل النقل', performedAt: new Date(), status: 'submitted' },
    });
    const procedure = await prisma.procedureCatalog.upsert({
      where: { code: 'XFER-TEST-PROC' },
      update: {},
      create: { code: 'XFER-TEST-PROC', titleAr: 'إجراء اختبار النقل', titleEn: 'Transfer test procedure', category: 'general', minRequired: 5 },
    });
    const competency = await prisma.competencyProgress.create({
      data: { traineeProfileId: profile.id, procedureId: procedure.id, requiredCount: 5, completedCount: 2, status: 'in_progress' },
    });

    const directorToken = await login(SCENARIO.accounts.clusterTrainingDirector);
    const res = await http.post('/trainees/reallocate').set(auth(directorToken)).send({
      traineeProfileId: profile.id,
      targetHospitalId: s.hospital2.id,
      departmentId: s.departments.h2Internal.id,
      trainerProfileId: s.trainers.h2Internal.id,
      reason: 'اختبار نقل',
    });
    if (![200, 201].includes(res.status)) throw new Error(`transfer failed: ${res.status} ${JSON.stringify(res.body)}`);

    // Old rotation closed, not deleted.
    const oldRotationAfter = await prisma.rotation.findUniqueOrThrow({ where: { id: oldRotation.id } });
    expect(oldRotationAfter.status).toBe('transferred');

    // New rotation opened at the target hospital, pending the new trainer's
    // acceptance — the same accept/reject gate every fresh trainer assignment
    // goes through. Accept it to confirm the trainee reaches active status.
    const pendingRotation = await prisma.rotation.findFirstOrThrow({ where: { traineeProfileId: profile.id, status: 'pending_acceptance' } });
    const h2TrainerToken = await login(SCENARIO.accounts.hospital2Trainer);
    const accept = await http.post(`/operations/trainer/assignment-requests/${pendingRotation.id}/accept`).set(auth(h2TrainerToken));
    expect([200, 201]).toContain(accept.status);

    const newRotation = await prisma.rotation.findFirstOrThrow({ where: { traineeProfileId: profile.id, status: 'active' } });
    expect(newRotation.organizationId).toBe(s.hospital2.id);
    expect(newRotation.departmentId).toBe(s.departments.h2Internal.id);
    expect(newRotation.trainerProfileId).toBe(s.trainers.h2Internal.id);

    // Old allocation superseded, not deleted; a new open one exists.
    const oldAllocationAfter = await prisma.traineeAllocation.findUniqueOrThrow({ where: { id: oldAllocation.id } });
    expect(oldAllocationAfter.status).toBe('superseded');
    const newAllocation = await prisma.traineeAllocation.findFirstOrThrow({ where: { traineeProfileId: profile.id, status: 'open' } });
    expect(newAllocation.hospitalId).toBe(s.hospital2.id);
    expect(newAllocation.previousAllocationId).toBe(oldAllocation.id);

    // Same TraineeProfile id — no new profile was created — and the historical
    // clinical log and competency progress are still attached to it.
    const profileAfter = await prisma.traineeProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(profileAfter.id).toBe(profile.id);
    expect(profileAfter.organizationId).toBe(s.hospital2.id);
    const logAfter = await prisma.clinicalCaseLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(logAfter.traineeProfileId).toBe(profile.id);
    const competencyAfter = await prisma.competencyProgress.findUniqueOrThrow({ where: { id: competency.id } });
    expect(competencyAfter.traineeProfileId).toBe(profile.id);
    expect(competencyAfter.completedCount).toBe(2);
  });
});
