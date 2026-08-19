/**
 * University training request — trainee + program plan.
 *
 * Proves, from database rows, that:
 *  - a request can carry an inline rotation breakdown (WHAT/WHEN) reusing the
 *    existing TrainingPlan/TrainingPlanVersion/TrainingPlanRotation models,
 *  - the plan is request-scoped (organizationId = the sending university), not
 *    written into the shared national catalog,
 *  - program duration, rotation totals and the training window must agree,
 *  - each trainee row carries academic number, national ID, name, specialty and
 *    dates, and a batch is refused if any row fails validation,
 *  - duplicate identity/academic number is refused both within one import and
 *    across two imports into the same request,
 *  - WHAT/WHEN (the plan) stays distinct from WHERE/WHO (allocation) — creating
 *    the plan never touches hospital/department/trainer assignment.
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
let uniToken: string;

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function login(email: string): Promise<string> {
  const res = await http.post('/auth/login').send({ email, password: SCENARIO.password });
  if (![200, 201].includes(res.status)) {
    throw new Error(`login ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.tokens.accessToken;
}

// The seeded program (E2E-PROG-INTERN) declares durationMonths = 12, which the
// service converts to weeks as round(12 × 4.345) = 52. The window below
// (2027-01-01 → 2027-12-31) is exactly 52 weeks, and these six rotations —
// modelling the brief's "six 2-month rotations" in the model's native unit of
// weeks — sum to exactly 52 as well, so both consistency checks pass cleanly.
const STANDARD_ROTATIONS = [
  { departmentNameAr: 'الباطنة', durationWeeks: 9 },
  { departmentNameAr: 'الأطفال', durationWeeks: 9 },
  { departmentNameAr: 'الجراحة', durationWeeks: 9 },
  { departmentNameAr: 'الطوارئ', durationWeeks: 9 },
  { departmentNameAr: 'طب الأسرة', durationWeeks: 8 },
  { departmentNameAr: 'اختياري', durationWeeks: 8 },
]; // 9+9+9+9+8+8 = 52 weeks.

const WINDOW = { trainingStartDate: '2027-01-01', trainingEndDate: '2027-12-31' }; // 52 weeks.

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  http = request(app.getHttpServer());
  await resetE2EScenario();
  s = await seedE2EScenario();
  uniToken = await login(SCENARIO.accounts.universityAdmin);
}, 120_000);

afterAll(async () => {
  await resetE2EScenario();
  await prisma.$disconnect();
  await app?.close();
});

describe('Program plan composition', () => {
  it('preview reports the rotation breakdown and its total, without writing anything', async () => {
    const before = await prisma.trainingPlan.count();

    const res = await http.post('/training-requests/preview').set(auth(uniToken)).send({
      programId: s.program.id,
      specialty: 'internal_medicine',
      ...WINDOW,
      studentCount: 6,
      rotations: STANDARD_ROTATIONS,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.rotationCount).toBe(6);
    expect(res.body.data.totalWeeks).toBe(52);
    expect(res.body.data.rotations).toHaveLength(6);

    expect(await prisma.trainingPlan.count()).toBe(before);
  });

  it('creates a request-scoped plan from the proposed rotations, reusing the existing models', async () => {
    const res = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id,
      programId: s.program.id,
      specialty: 'internal_medicine',
      ...WINDOW,
      studentCount: 6,
      rotations: STANDARD_ROTATIONS,
    });
    expect(res.status).toBe(201);
    const requestId = res.body.data.id;

    const dbRequest = await prisma.trainingRequest.findUnique({ where: { id: requestId } });
    expect(dbRequest!.trainingPlanId).not.toBeNull();
    expect(dbRequest!.trainingPlanVersionId).not.toBeNull();

    const plan = await prisma.trainingPlan.findUnique({
      where: { id: dbRequest!.trainingPlanId! },
      include: { versions: { include: { rotations: { orderBy: { sequenceOrder: 'asc' } } } } },
    });
    // Request-scoped, not national: organizationId is the sending university, and
    // this plan is not reachable through the shared catalog for any other request.
    expect(plan!.organizationId).toBe(s.university.id);

    const version = plan!.versions[0];
    expect(version.status).toBe('active');
    expect(version.totalWeeks).toBe(52);
    expect(version.rotations).toHaveLength(6);
    expect(version.rotations.map((r) => r.departmentNameAr)).toEqual(
      STANDARD_ROTATIONS.map((r) => r.departmentNameAr),
    );
    expect(version.rotations.map((r) => r.durationWeeks)).toEqual(
      STANDARD_ROTATIONS.map((r) => r.durationWeeks),
    );
    expect(version.rotations.map((r) => r.sequenceOrder)).toEqual([1, 2, 3, 4, 5, 6]);

    // WHAT/WHEN only — nothing about where a trainee trains or who supervises
    // them exists yet. That is TraineeAllocation's job, untouched by this call.
    expect(await prisma.traineeAllocation.count({ where: { trainingRequestId: requestId } })).toBe(0);
  });

  it('refuses a rotation total that does not match the requested window', async () => {
    const before = await prisma.trainingRequest.count();
    const beforePlans = await prisma.trainingPlan.count();

    const res = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id,
      programId: s.program.id,
      ...WINDOW, // 52-week window
      studentCount: 2,
      rotations: [{ departmentNameAr: 'الباطنة', durationWeeks: 4 }], // 4 weeks only
    });
    expect(res.status).toBe(400);
    expect(await prisma.trainingRequest.count()).toBe(before);
    expect(await prisma.trainingPlan.count()).toBe(beforePlans);
  });

  it('refuses a training window that does not match the program duration', async () => {
    const before = await prisma.trainingRequest.count();

    const res = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id,
      programId: s.program.id, // 12-month program
      trainingStartDate: '2027-01-01',
      trainingEndDate: '2027-04-01', // 3-month window
      studentCount: 2,
    });
    expect(res.status).toBe(400);
    expect(await prisma.trainingRequest.count()).toBe(before);
  });

  it('refuses custom rotations submitted together with a catalog plan', async () => {
    // Clean up any previous test catalog plan to prevent unique constraint conflict
    await prisma.trainingPlan.deleteMany({ where: { code: { startsWith: 'CATALOG-TEST-' } } });

    const catalogPlan = await prisma.trainingPlan.create({
      data: {
        programId: s.program.id,
        organizationId: null, // national catalog
        code: `CATALOG-TEST-${Date.now()}`,
        nameAr: 'خطة الكتالوج الوطني',
        status: 'active',
        versions: {
          create: {
            versionNumber: 1,
            status: 'active',
            totalWeeks: 8,
            publishedAt: new Date(),
            rotations: {
              create: [{ sequenceOrder: 1, departmentCode: 'IM', departmentNameAr: 'الباطنة', durationWeeks: 8 }],
            },
          },
        },
      },
    });

    const before = await prisma.trainingRequest.count();
    const res = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id,
      programId: s.program.id,
      trainingPlanId: catalogPlan.id,
      trainingStartDate: '2027-01-01',
      trainingEndDate: '2027-03-01',
      studentCount: 2,
      rotations: STANDARD_ROTATIONS,
    });
    expect(res.status).toBe(400);
    expect(await prisma.trainingRequest.count()).toBe(before);
  });
});

describe('Trainee rows — required fields and duplicate prevention', () => {
  let requestId: string;

  beforeAll(async () => {
    const res = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id,
      programId: s.program.id,
      specialty: 'internal_medicine',
      ...WINDOW,
      studentCount: 3,
      rotations: STANDARD_ROTATIONS,
    });
    if (res.status !== 201) {
      throw new Error(`setup request failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    requestId = res.body.data.id;
  });

  it('accepts a fully specified trainee row and persists every required field', async () => {
    const res = await http.post(`/training-requests/${requestId}/trainees/import`).set(auth(uniToken)).send({
      rows: [{
        academicNumber: 'PLAN-1',
        nationalId: '9500000001',
        nameAr: 'متدرب الخطة الأول',
        specialty: 'internal_medicine',
        startDate: '2027-01-01',
        endDate: '2027-12-31',
      }],
    });
    expect(res.status).toBe(201);

    const row = await prisma.trainingRequestTrainee.findFirst({
      where: { trainingRequestId: requestId, academicNumber: 'PLAN-1' },
    });
    expect(row).not.toBeNull();
    expect(row!.nationalId).toBe('9500000001');
    expect(row!.nameAr).toBe('متدرب الخطة الأول');
    expect(row!.specialty).toBe('internal_medicine');
    expect(row!.startDate?.toISOString().slice(0, 10)).toBe('2027-01-01');
    expect(row!.endDate?.toISOString().slice(0, 10)).toBe('2027-12-31');
  });

  it('refuses a row missing academic number, national ID or name', async () => {
    // Empty strings are caught by the DTO's own @IsNotEmpty() at the framework's
    // validation layer, before the request ever reaches the composed row
    // validator — a different response shape than the aggregated rowErrors
    // format, but the same outcome: nothing is written.
    const before = await prisma.trainingRequestTrainee.count({ where: { trainingRequestId: requestId } });
    const res = await http.post(`/training-requests/${requestId}/trainees/import`).set(auth(uniToken)).send({
      rows: [{ academicNumber: '', nationalId: '', nameAr: '', specialty: 'internal_medicine' }],
    });
    expect(res.status).toBe(400);
    expect(await prisma.trainingRequestTrainee.count({ where: { trainingRequestId: requestId } })).toBe(before);

    // The composed validator's own message for the same problem, reached when a
    // field is omitted entirely rather than sent as an empty string (still
    // triggering @IsNotEmpty at the DTO layer for academicNumber/nationalId/
    // nameAr since they are required there too) — checked directly against the
    // service logic via a row that clears the DTO layer but fails a field the
    // DTO does not itself enforce (a bad national ID format).
    const badFormat = await http.post(`/training-requests/${requestId}/trainees/import`).set(auth(uniToken)).send({
      rows: [{
        academicNumber: 'FMT-1', nationalId: '123', nameAr: 'رقم هوية غير صالح',
        specialty: 'internal_medicine', startDate: '2027-01-01', endDate: '2027-12-31',
      }],
    });
    expect(badFormat.status).toBe(400);
    expect(badFormat.body.rowErrors[0].errors).toContain('رقم الهوية يجب أن يكون 10 أرقام');
    expect(await prisma.trainingRequestTrainee.count({ where: { trainingRequestId: requestId } })).toBe(before);
  });

  it('refuses a row with no specialty and no request-level default', async () => {
    // A fresh request with no batch-level specialty, so the row must supply one.
    const bare = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id,
      programId: s.program.id,
      ...WINDOW,
      studentCount: 1,
      rotations: STANDARD_ROTATIONS,
    });
    const bareRequestId = bare.body.data.id;

    const res = await http.post(`/training-requests/${bareRequestId}/trainees/import`).set(auth(uniToken)).send({
      rows: [{
        academicNumber: 'NOSPEC-1', nationalId: '9500000099', nameAr: 'بلا تخصص',
        startDate: '2027-01-01', endDate: '2027-12-31',
      }],
    });
    expect(res.status).toBe(400);
    expect(res.body.rowErrors[0].errors).toContain('التخصص مطلوب — حدده لكل متدرب أو على مستوى الطلب بالكامل');
  });

  it('refuses a row with no dates and no request-level default', async () => {
    const bare = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id,
      programId: s.program.id,
      specialty: 'internal_medicine',
      studentCount: 1,
      // No window on the request either, so the row is the only possible source.
    });
    const bareRequestId = bare.body.data.id;

    const res = await http.post(`/training-requests/${bareRequestId}/trainees/import`).set(auth(uniToken)).send({
      rows: [{ academicNumber: 'NODATE-1', nationalId: '9500000098', nameAr: 'بلا تاريخ' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.rowErrors[0].errors).toEqual(
      expect.arrayContaining(['تاريخ البداية مطلوب — حدده لكل متدرب أو على مستوى الطلب بالكامل']),
    );
  });

  it('refuses duplicate academic number / national ID within one file', async () => {
    const res = await http.post(`/training-requests/${requestId}/trainees/import`).set(auth(uniToken)).send({
      rows: [
        { academicNumber: 'DUP-1', nationalId: '9500000002', nameAr: 'م1', specialty: 'internal_medicine', startDate: '2027-01-01', endDate: '2027-12-31' },
        { academicNumber: 'DUP-1', nationalId: '9500000003', nameAr: 'م2', specialty: 'internal_medicine', startDate: '2027-01-01', endDate: '2027-12-31' },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.rowErrors.some((e: any) => e.errors.some((m: string) => m.includes('مكرر داخل الملف')))).toBe(true);
  });

  it('refuses a duplicate academic number / national ID across two separate imports into the same request', async () => {
    // PLAN-1 / 9500000001 already exists in this request from an earlier test.
    const res = await http.post(`/training-requests/${requestId}/trainees/import`).set(auth(uniToken)).send({
      rows: [{
        academicNumber: 'PLAN-1', nationalId: '9500000050', nameAr: 'تكرار رقم أكاديمي',
        specialty: 'internal_medicine', startDate: '2027-01-01', endDate: '2027-12-31',
      }],
    });
    expect(res.status).toBe(400);
    expect(res.body.rowErrors[0].errors).toContain('الرقم الأكاديمي موجود مسبقاً ضمن هذا الطلب');

    const resNid = await http.post(`/training-requests/${requestId}/trainees/import`).set(auth(uniToken)).send({
      rows: [{
        academicNumber: 'PLAN-2', nationalId: '9500000001', nameAr: 'تكرار هوية',
        specialty: 'internal_medicine', startDate: '2027-01-01', endDate: '2027-12-31',
      }],
    });
    expect(resNid.status).toBe(400);
    expect(resNid.body.rowErrors[0].errors).toContain('رقم الهوية موجود مسبقاً ضمن هذا الطلب');
  });
});

describe('Summary reflects the composed plan end to end', () => {
  it('GET /training-requests/:id/summary reports the same rotations and total weeks', async () => {
    const res = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id,
      programId: s.program.id,
      specialty: 'internal_medicine',
      ...WINDOW,
      studentCount: 6,
      rotations: STANDARD_ROTATIONS,
    });
    const requestId = res.body.data.id;

    const summary = await http.get(`/training-requests/${requestId}/summary`).set(auth(uniToken));
    expect(summary.status).toBe(200);
    expect(summary.body.data.rotationCount).toBe(6);
    expect(summary.body.data.totalWeeks).toBe(52);
    expect(summary.body.data.rotations).toHaveLength(6);
    expect(summary.body.data.isLegacyRequest).toBe(false);
  });
});

describe('One-call submission — request, plan and roster together', () => {
  // This is the shape the university's "إرسال طلب تدريب جديد" dialog actually
  // sends: everything in a single POST /training-requests, roster included.
  // `dto.trainees` is not a second, looser way to create trainee rows — see
  // TrainingRequestsService.create(), which hands them to the exact same
  // TrainingRequestTraineesService.importTrainees() the two-step flow above uses.

  it('creates the request, its plan and every trainee row in one call', async () => {
    const before = { requests: await prisma.trainingRequest.count(), plans: await prisma.trainingPlan.count() };

    const res = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id,
      programId: s.program.id,
      specialty: 'internal_medicine',
      ...WINDOW,
      studentCount: 2,
      rotations: STANDARD_ROTATIONS,
      trainees: [
        { academicNumber: 'ONECALL-1', nationalId: '9600000001', nameAr: 'متدرب دفعة واحدة 1' },
        { academicNumber: 'ONECALL-2', nationalId: '9600000002', nameAr: 'متدرب دفعة واحدة 2' },
      ],
    });
    expect(res.status).toBe(201);
    const requestId = res.body.data.id;

    expect(await prisma.trainingRequest.count()).toBe(before.requests + 1);
    expect(await prisma.trainingPlan.count()).toBe(before.plans + 1);

    const rows = await prisma.trainingRequestTrainee.findMany({
      where: { trainingRequestId: requestId },
      orderBy: { academicNumber: 'asc' },
    });
    expect(rows).toHaveLength(2);
    // Each row inherited the request's specialty and window, exactly as the
    // standalone import endpoint does for rows that omit them.
    for (const row of rows) {
      expect(row.specialty).toBe('internal_medicine');
      expect(row.startDate?.toISOString().slice(0, 10)).toBe('2027-01-01');
      expect(row.endDate?.toISOString().slice(0, 10)).toBe('2027-12-31');
    }

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'import_training_request_trainees', entityId: requestId },
    });
    expect(audit).not.toBeNull();
  });

  it('leaves nothing behind when the attached roster fails validation', async () => {
    const before = { requests: await prisma.trainingRequest.count(), plans: await prisma.trainingPlan.count() };

    const res = await http.post('/training-requests').set(auth(uniToken)).send({
      targetOrgId: s.cluster.id,
      programId: s.program.id,
      specialty: 'internal_medicine',
      ...WINDOW,
      studentCount: 2,
      rotations: STANDARD_ROTATIONS,
      trainees: [
        // Duplicate academic number inside the same roster — invalid.
        { academicNumber: 'BAD-DUP', nationalId: '9600000010', nameAr: 'م1' },
        { academicNumber: 'BAD-DUP', nationalId: '9600000011', nameAr: 'م2' },
      ],
    });
    expect(res.status).toBe(400);

    // Neither the request nor the plan composed for it survives a roster that
    // does not pass validation — nothing is left half-created.
    expect(await prisma.trainingRequest.count()).toBe(before.requests);
    expect(await prisma.trainingPlan.count()).toBe(before.plans);
  });

  describe('Parsed roster validation & duplicate prevention for inline request trainees', () => {
    it('accepts a valid parsed roster inline and persists all trainee rows', async () => {
      const res = await http.post('/training-requests').set(auth(uniToken)).send({
        targetOrgId: s.cluster.id,
        programId: s.program.id,
        specialty: 'internal_medicine',
        ...WINDOW,
        studentCount: 2,
        rotations: STANDARD_ROTATIONS,
        trainees: [
          { academicNumber: 'EXCEL-801', nationalId: '9880000001', nameAr: 'متدرب إكسل 1', specialty: 'internal_medicine' },
          { academicNumber: 'EXCEL-802', nationalId: '9880000002', nameAr: 'متدرب إكسل 2', specialty: 'internal_medicine' },
        ],
      });
      expect(res.status).toBe(201);
      const requestId = res.body.data.id;
      const trainees = await prisma.trainingRequestTrainee.findMany({ where: { trainingRequestId: requestId } });
      expect(trainees).toHaveLength(2);
    });

    it('refuses inline roster with missing required fields (academic number, national ID, name)', async () => {
      const before = await prisma.trainingRequest.count();
      const res = await http.post('/training-requests').set(auth(uniToken)).send({
        targetOrgId: s.cluster.id,
        programId: s.program.id,
        specialty: 'internal_medicine',
        ...WINDOW,
        studentCount: 1,
        rotations: STANDARD_ROTATIONS,
        trainees: [
          { academicNumber: '', nationalId: '9880000003', nameAr: 'بدون رقم أكاديمي' },
        ],
      });
      expect(res.status).toBe(400);
      expect(await prisma.trainingRequest.count()).toBe(before);
    });

    it('refuses inline roster with duplicate academic number within the roster', async () => {
      const before = await prisma.trainingRequest.count();
      const res = await http.post('/training-requests').set(auth(uniToken)).send({
        targetOrgId: s.cluster.id,
        programId: s.program.id,
        specialty: 'internal_medicine',
        ...WINDOW,
        studentCount: 2,
        rotations: STANDARD_ROTATIONS,
        trainees: [
          { academicNumber: 'DUP-ACAD-8X', nationalId: '9880000004', nameAr: 'أحمد' },
          { academicNumber: 'DUP-ACAD-8X', nationalId: '9880000005', nameAr: 'سارة' },
        ],
      });
      expect(res.status).toBe(400);
      expect(await prisma.trainingRequest.count()).toBe(before);
    });

    it('refuses inline roster with duplicate national ID within the roster', async () => {
      const before = await prisma.trainingRequest.count();
      const res = await http.post('/training-requests').set(auth(uniToken)).send({
        targetOrgId: s.cluster.id,
        programId: s.program.id,
        specialty: 'internal_medicine',
        ...WINDOW,
        studentCount: 2,
        rotations: STANDARD_ROTATIONS,
        trainees: [
          { academicNumber: 'EXCEL-811', nationalId: '9880000099', nameAr: 'خالد' },
          { academicNumber: 'EXCEL-812', nationalId: '9880000099', nameAr: 'علي' },
        ],
      });
      expect(res.status).toBe(400);
      expect(await prisma.trainingRequest.count()).toBe(before);
    });

    it('refuses inline roster with duplicate national ID or academic number against existing request roster', async () => {
      const createdReq = await http.post('/training-requests').set(auth(uniToken)).send({
        targetOrgId: s.cluster.id,
        programId: s.program.id,
        specialty: 'internal_medicine',
        ...WINDOW,
        studentCount: 1,
        rotations: STANDARD_ROTATIONS,
        trainees: [
          { academicNumber: 'EXISTING-801', nationalId: '9880000888', nameAr: 'متدرب موجود' },
        ],
      });
      expect(createdReq.status).toBe(201);
      const requestId = createdReq.body.data.id;

      const dupImport = await http.post(`/training-requests/${requestId}/trainees/import`).set(auth(uniToken)).send({
        rows: [
          { academicNumber: 'NEW-802', nationalId: '9880000888', nameAr: 'تكرار هوية' },
        ],
      });
      expect(dupImport.status).toBe(400);
      expect(dupImport.body.rowErrors[0].errors).toContain('رقم الهوية موجود مسبقاً ضمن هذا الطلب');
    });
  });
});
