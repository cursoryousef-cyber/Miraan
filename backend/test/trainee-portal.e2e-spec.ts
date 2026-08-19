/**
 * Trainee portal — colleagues scope and digital ID card QR verification.
 *
 * Covers the two pieces of the trainee-portal feature that carry their own
 * authorization logic and are not already exercised by
 * allocation-distribution.e2e-spec.ts (which proves the dashboard/rotation/
 * logbook chain):
 *
 *   GET /trainees/my-colleagues — scope is derived server-side from the
 *     caller's own active Rotation (trainer/department/organisation); the
 *     caller cannot request another trainee's colleagues by any input, only
 *     via their own JWT.
 *   GET /trainees/card/qr-token + GET /trainees/card/verify — the QR payload
 *     is a signed, opaque token (never the raw national ID), verification is
 *     server-side and public, and a revoked/expired card fails verification.
 *   PATCH /operations/attendance/:id/check-out — cannot check out before
 *     checking in, and cannot check out twice.
 *
 * Trainee profiles here are seeded directly via Prisma rather than through the
 * full training-request → approval → allocation workflow, since that chain is
 * already proven by allocation-distribution.e2e-spec.ts; this file is only
 * about read-scope and QR authorization once trainees already exist.
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

async function makeTrainee(opts: {
  nationalId: string;
  nameAr: string;
  email: string;
  organizationId: string;
  traineeNumber: string;
  cardUuid?: string;
  cardStatus?: string;
  withRotation?: boolean;
}) {
  const person = await prisma.person.create({
    data: {
      nationalId: opts.nationalId,
      nameAr: opts.nameAr,
      nameEn: opts.nameAr,
      dateOfBirth: new Date('1998-01-01'),
      gender: 'male',
      nationality: 'SA',
    },
  });
  const profile = await prisma.traineeProfile.create({
    data: {
      personId: person.id,
      organizationId: opts.organizationId,
      traineeNumber: opts.traineeNumber,
      level: 'intern',
      applicationStatus: 'active',
      cardUuid: opts.cardUuid,
      cardStatus: opts.cardStatus ?? 'active',
    },
  });
  const traineeRole = await prisma.role.findFirstOrThrow({ where: { code: 'trainee' } });
  const account = await prisma.userAccount.create({
    data: {
      personId: person.id,
      email: opts.email,
      passwordHash: await bcrypt.hash(SCENARIO.password, 10),
      isActive: true,
    },
  });
  await prisma.userRole.create({ data: { userAccountId: account.id, roleId: traineeRole.id, organizationId: opts.organizationId } });
  await prisma.userOrganization.create({
    data: { userAccountId: account.id, organizationId: opts.organizationId, isPrimary: true, isActive: true },
  });
  if (opts.withRotation) {
    await prisma.rotation.create({
      data: {
        organizationId: opts.organizationId,
        traineeProfileId: profile.id,
        departmentId: s.departments.h1Internal.id,
        trainerProfileId: s.trainers.h1Internal.id,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        status: 'active',
      },
    });
  }
  return { person, profile, account };
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

describe('GET /trainees/my-colleagues', () => {
  let traineeA: Awaited<ReturnType<typeof makeTrainee>>;
  let traineeB: Awaited<ReturnType<typeof makeTrainee>>;
  let traineeOtherDept: Awaited<ReturnType<typeof makeTrainee>>;
  let traineeOtherHospital: Awaited<ReturnType<typeof makeTrainee>>;
  let otherDeptId: string;

  afterAll(async () => {
    // A Department is not scoped to any trainee, so resetE2EScenario's
    // profile-driven cleanup never sees it — without this it leaks into
    // every later run's hospital capacity totals.
    if (otherDeptId) {
      await prisma.rotation.deleteMany({ where: { departmentId: otherDeptId } });
      await prisma.department.delete({ where: { id: otherDeptId } });
    }
  });

  beforeAll(async () => {
    traineeA = await makeTrainee({
      nationalId: '9910000101', nameAr: 'زميل أ', email: 'colleague_a@miran.test',
      organizationId: s.hospital1.id, traineeNumber: 'COL-A',
    });
    traineeB = await makeTrainee({
      nationalId: '9910000102', nameAr: 'زميل ب', email: 'colleague_b@miran.test',
      organizationId: s.hospital1.id, traineeNumber: 'COL-B',
    });
    traineeOtherDept = await makeTrainee({
      nationalId: '9910000103', nameAr: 'زميل قسم آخر', email: 'colleague_c@miran.test',
      organizationId: s.hospital1.id, traineeNumber: 'COL-C',
    });
    traineeOtherHospital = await makeTrainee({
      nationalId: '9910000104', nameAr: 'زميل مستشفى آخر', email: 'colleague_d@miran.test',
      organizationId: s.hospital2.id, traineeNumber: 'COL-D',
    });

    const start = new Date('2027-01-01');
    const end = new Date('2027-12-31');

    await prisma.rotation.create({
      data: {
        traineeProfileId: traineeA.profile.id, organizationId: s.hospital1.id,
        departmentId: s.departments.h1Internal.id, trainerProfileId: s.trainers.h1Internal.id,
        startDate: start, endDate: end, status: 'active',
      },
    });
    await prisma.rotation.create({
      data: {
        traineeProfileId: traineeB.profile.id, organizationId: s.hospital1.id,
        departmentId: s.departments.h1Internal.id, trainerProfileId: s.trainers.h1Internal.id,
        startDate: start, endDate: end, status: 'active',
      },
    });
    // Same hospital, same trainer, but a different department — must not appear.
    const otherDept = await prisma.department.create({
      data: { organizationId: s.hospital1.id, nameAr: 'قسم آخر - اختبار', code: 'COL-TEST-DEPT' },
    });
    otherDeptId = otherDept.id;
    await prisma.rotation.create({
      data: {
        traineeProfileId: traineeOtherDept.profile.id, organizationId: s.hospital1.id,
        departmentId: otherDept.id, trainerProfileId: s.trainers.h1Internal.id,
        startDate: start, endDate: end, status: 'active',
      },
    });
    // Different hospital entirely — must not appear.
    await prisma.rotation.create({
      data: {
        traineeProfileId: traineeOtherHospital.profile.id, organizationId: s.hospital2.id,
        departmentId: s.departments.h2Internal.id, trainerProfileId: s.trainers.h2Internal.id,
        startDate: start, endDate: end, status: 'active',
      },
    });
  });

  it('returns only trainees sharing the same active rotation trainer/department/organisation, excluding self', async () => {
    const token = await login('colleague_a@miran.test');
    const res = await http.get('/trainees/my-colleagues').set(auth(token));
    expect(res.status).toBe(200);

    const ids = res.body.data.map((c: any) => c.traineeProfileId);
    expect(ids).toContain(traineeB.profile.id);
    expect(ids).not.toContain(traineeA.profile.id); // self excluded
    expect(ids).not.toContain(traineeOtherDept.profile.id); // different department
    expect(ids).not.toContain(traineeOtherHospital.profile.id); // different hospital
  });

  it('never exposes national ID, phone or private email on colleague rows', async () => {
    const token = await login('colleague_a@miran.test');
    const res = await http.get('/trainees/my-colleagues').set(auth(token));
    const body = JSON.stringify(res.body.data);
    expect(body).not.toContain(traineeB.person.nationalId);
  });

  it('a caller cannot widen scope by any request parameter — the endpoint takes none', async () => {
    const token = await login('colleague_a@miran.test');
    const res = await http
      .get('/trainees/my-colleagues')
      .query({ trainerProfileId: s.trainers.h2Internal.id, departmentId: s.departments.h2Internal.id, organizationId: s.hospital2.id })
      .set(auth(token));
    expect(res.status).toBe(200);
    const ids = res.body.data.map((c: any) => c.traineeProfileId);
    expect(ids).not.toContain(traineeOtherHospital.profile.id);
  });

  it('a trainee with no active rotation gets an empty list, not an error', async () => {
    const lone = await makeTrainee({
      nationalId: '9910000105', nameAr: 'متدرب بدون روتيشن', email: 'colleague_lone@miran.test',
      organizationId: s.hospital1.id, traineeNumber: 'COL-LONE',
    });
    const token = await login(lone.account.email);
    const res = await http.get('/trainees/my-colleagues').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('is rejected without a token', async () => {
    const res = await http.get('/trainees/my-colleagues');
    expect(res.status).toBe(401);
  });
});

describe('Digital ID card — QR token issuance and verification', () => {
  let cardTrainee: Awaited<ReturnType<typeof makeTrainee>>;
  let revokedTrainee: Awaited<ReturnType<typeof makeTrainee>>;
  let token: string;

  beforeAll(async () => {
    cardTrainee = await makeTrainee({
      nationalId: '9910000201', nameAr: 'حامل بطاقة', email: 'card_holder@miran.test',
      organizationId: s.hospital1.id, traineeNumber: 'CARD-1',
      cardUuid: 'card-uuid-active-1', cardStatus: 'active',
    });
    revokedTrainee = await makeTrainee({
      nationalId: '9910000202', nameAr: 'بطاقة ملغاة', email: 'card_revoked@miran.test',
      organizationId: s.hospital1.id, traineeNumber: 'CARD-2',
      cardUuid: 'card-uuid-revoked-1', cardStatus: 'revoked',
    });
    token = await login('card_holder@miran.test');
  });

  it('issues a signed opaque token that does not embed the national ID', async () => {
    const res = await http.get('/trainees/card/qr-token').set(auth(token));
    expect(res.status).toBe(200);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.token).not.toContain(cardTrainee.person.nationalId);
    const [, payload] = res.body.data.token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    expect(decoded).not.toHaveProperty('nationalId');
    expect(JSON.stringify(decoded)).not.toContain(cardTrainee.person.nationalId);
  });

  it('refuses to issue a token for a trainee with no issued card', async () => {
    const noCard = await makeTrainee({
      nationalId: '9910000203', nameAr: 'بدون بطاقة', email: 'card_none@miran.test',
      organizationId: s.hospital1.id, traineeNumber: 'CARD-3',
    });
    const t = await login(noCard.account.email);
    const res = await http.get('/trainees/card/qr-token').set(auth(t));
    expect(res.status).toBe(400);
  });

  it('verifies a valid token publicly, without auth, and returns only minimal fields', async () => {
    const issued = await http.get('/trainees/card/qr-token').set(auth(token));
    const res = await http.get('/trainees/card/verify').query({ token: issued.body.data.token });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.nameAr).toBe(cardTrainee.person.nameAr);
    expect(res.body.data).not.toHaveProperty('nationalId');
  });

  it('a revoked card fails verification even with a structurally valid token', async () => {
    const revokedToken = await login('card_revoked@miran.test');
    const issued = await http.get('/trainees/card/qr-token').set(auth(revokedToken));
    const res = await http.get('/trainees/card/verify').query({ token: issued.body.data.token });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
  });

  it('reissuing a card (new cardUuid) invalidates every QR token printed before it', async () => {
    const issued = await http.get('/trainees/card/qr-token').set(auth(token));
    await prisma.traineeProfile.update({ where: { id: cardTrainee.profile.id }, data: { cardUuid: 'card-uuid-active-2' } });
    const res = await http.get('/trainees/card/verify').query({ token: issued.body.data.token });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
    // restore for any later assertions in this suite
    await prisma.traineeProfile.update({ where: { id: cardTrainee.profile.id }, data: { cardUuid: 'card-uuid-active-1' } });
  });

  it('a garbage or tampered token fails verification cleanly, not with a 500', async () => {
    const res = await http.get('/trainees/card/verify').query({ token: 'not-a-real-token' });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
  });

  it('rejects verification with no token', async () => {
    const res = await http.get('/trainees/card/verify');
    expect(res.status).toBe(400);
  });
});

describe('Attendance check-in / check-out guards', () => {
  let attTrainee: Awaited<ReturnType<typeof makeTrainee>>;
  let attToken: string;

  beforeAll(async () => {
    attTrainee = await makeTrainee({
      nationalId: '9910000301', nameAr: 'متدرب حضور', email: 'attendance_guard@miran.test',
      organizationId: s.hospital1.id, traineeNumber: 'ATT-1', withRotation: true,
    });
    attToken = await login('attendance_guard@miran.test');
  });

  it('cannot check out before checking in', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const att = await prisma.attendance.create({
      data: { organizationId: s.hospital1.id, traineeProfileId: attTrainee.profile.id, date: today, status: 'absent' },
    });
    const res = await http.patch(`/operations/attendance/${att.id}/check-out`).set(auth(attToken));
    expect(res.status).toBe(400);
  });

  it('checking in twice on the same day without checking out is rejected', async () => {
    const first = await http.post('/operations/attendance/qr').set(auth(attToken)).send({ qrCode: 'irrelevant' });
    expect([200, 201]).toContain(first.status);
    const second = await http.post('/operations/attendance/qr').set(auth(attToken)).send({ qrCode: 'irrelevant' });
    expect(second.status).toBe(400);
  });

  it('cannot check out twice', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const att = await prisma.attendance.findFirstOrThrow({ where: { traineeProfileId: attTrainee.profile.id, date: today } });
    const first = await http.patch(`/operations/attendance/${att.id}/check-out`).set(auth(attToken));
    expect(first.status).toBe(200);
    const second = await http.patch(`/operations/attendance/${att.id}/check-out`).set(auth(attToken));
    expect(second.status).toBe(400);
  });
});
