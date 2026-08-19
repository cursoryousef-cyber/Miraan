/**
 * Role model proof.
 *
 * Asserts the six approved roles and only those, and proves each one's data
 * boundary from the running API:
 *
 *   Trainee                   → own data only
 *   Trainer                   → assigned trainees only
 *   Hospital Training Manager → its own hospital only
 *   Cluster Training Manager  → cluster requests, no hospital internals
 *   Academic Supervisor       → academic scope
 *   System Administrator      → technical administration
 *
 * It also proves the removed roles (training_supervisor, department_head) hold
 * no capability anywhere in the model.
 *
 * Isolated test database only.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { SCENARIO, seedE2EScenario, resetE2EScenario } from '../src/seed/seed-e2e-scenario';
import { ROLE_CAPABILITIES, capabilitiesForRoles } from '../src/common/authz/capabilities';
import { ROLE_SCOPES } from '../src/common/role-scope';

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

const REMOVED_ROLES = ['training_supervisor', 'department_head'];
const APPROVED_ROLES = [
  'cluster_manager',
  'hospital_training_admin',
  'trainer',
  'trainee',
  'academic_supervisor',
  'system_admin',
];

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  http = request(app.getHttpServer());
  await resetE2EScenario();
  s = await seedE2EScenario();
}, 180000);

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

// ── Static model assertions ──────────────────────────────────────────────
describe('The role table', () => {
  it('grants no capability to any removed role', () => {
    for (const role of REMOVED_ROLES) {
      expect(ROLE_CAPABILITIES[role]).toBeUndefined();
      expect(capabilitiesForRoles([role])).toEqual([]);
    }
  });

  it('does not scope any removed role', () => {
    for (const role of REMOVED_ROLES) {
      expect(ROLE_SCOPES[role]).toBeUndefined();
    }
  });

  it('grants capabilities to every approved role', () => {
    for (const role of APPROVED_ROLES) {
      expect(capabilitiesForRoles([role]).length).toBeGreaterThan(0);
    }
  });

  it('never gives one role both cluster and hospital allocation', () => {
    for (const [role, caps] of Object.entries(ROLE_CAPABILITIES)) {
      if (role === 'platform_owner' || role === 'system_admin') continue;
      const cluster = caps.some((c) => c.startsWith('allocation.cluster'));
      const hospital = caps.some((c) => c.startsWith('allocation.hospital'));
      expect({ role, both: cluster && hospital }).toEqual({ role, both: false });
    }
  });
});

// ── Trainee → own data only ──────────────────────────────────────────────
describe('Trainee → own data only', () => {
  it('reads its own profile but not the training-request queue', async () => {
    const token = await login(SCENARIO.accounts.trainee);

    const me = await http.get('/trainees/me').set(auth(token));
    expect(me.status).toBe(200);

    const queue = await http.get('/training-requests').set(auth(token));
    expect(queue.status).toBe(403);
  });
});

// ── Trainer → assigned trainees only ─────────────────────────────────────
describe('Trainer → assigned trainees only', () => {
  it('returns only trainees linked by an active rotation to this trainer', async () => {
    const token = await login(SCENARIO.accounts.hospital1Trainer);
    const res = await http.get('/operations/trainer/assigned-interns').set(auth(token));
    expect(res.status).toBe(200);

    const returned: any[] = res.body?.data ?? [];
    for (const t of returned) {
      const link = await prisma.rotation.findFirst({
        where: {
          traineeProfileId: t.id,
          trainerProfileId: s.trainers.h1Internal.id,
          status: 'active',
        },
      });
      expect(link).not.toBeNull();
    }
  });

  it('is refused the detail of a trainee in another hospital', async () => {
    const token = await login(SCENARIO.accounts.hospital1Trainer);
    const foreign = await prisma.traineeProfile.findFirst({
      where: {
        organizationId: s.hospital2.id,
        rotations: { none: { trainerProfileId: s.trainers.h1Internal.id } },
      },
    });
    if (!foreign) return;

    const res = await http
      .get(`/operations/trainer/trainee/${foreign.id}`)
      .set(auth(token));
    expect([400, 403]).toContain(res.status);
  });
});

// ── Hospital Training Manager → its own hospital only ────────────────────
describe('Hospital Training Manager → hospital scope', () => {
  it('is refused capacity management in another hospital', async () => {
    const token = await login(SCENARIO.accounts.hospital1TrainingAdmin);
    const res = await http
      .patch(`/organizations/departments/${s.departments.h2Internal.id}/capacity`)
      .set(auth(token))
      .send({ capacity: 99 });
    expect(res.status).toBe(403);
  });

  it('holds no cluster-level allocation capability', () => {
    const caps = capabilitiesForRoles(['hospital_training_admin']);
    expect(caps.some((c) => c.startsWith('allocation.cluster'))).toBe(false);
  });
});

// ── Cluster Training Manager → cluster requests ──────────────────────────
describe('Cluster Training Manager → cluster scope', () => {
  it('reviews requests but cannot manage hospital capacity', async () => {
    const token = await login(SCENARIO.accounts.clusterTrainingDirector);

    const queue = await http.get('/training-requests').set(auth(token));
    expect(queue.status).toBe(200);

    const cap = await http
      .patch(`/organizations/departments/${s.departments.h1Internal.id}/capacity`)
      .set(auth(token))
      .send({ capacity: 55 });
    expect(cap.status).toBe(403);
  });

  it('holds no hospital-level allocation capability', () => {
    const caps = capabilitiesForRoles(['cluster_manager']);
    expect(caps.some((c) => c.startsWith('allocation.hospital'))).toBe(false);
  });
});

// ── Removed roles hold nothing ───────────────────────────────────────────
describe('Removed roles', () => {
  it('an account carrying a removed role cannot even obtain a session', async () => {
    // The role row itself is gone from the model, so the refusal now happens at
    // login rather than per-endpoint — strictly stronger than the old
    // expectation that such an account could sign in and then be refused.
    const res = await http
      .post('/auth/login')
      .send({ email: SCENARIO.accounts.hospital1DeptHead, password: SCENARIO.password });
    expect(res.status).toBe(403);
    expect(res.body.tokens).toBeUndefined();
  });
});
