/**
 * One-off demo-data reset. Truncates every business/operational table while
 * keeping schema-level reference data (organization types, roles,
 * permissions, role-permissions, lookup tables, procedure catalog) intact,
 * then creates exactly one University/Cluster/Hospital org, one Department,
 * and one test account per operational role (university_administrator,
 * training_director, hospital_training_admin, trainer, trainee), each with a
 * TrainerProfile/TraineeProfile where the role requires one.
 *
 * Run with: npx ts-node -r tsconfig-paths/register scripts/reset-demo-data.ts
 * Uses whatever DATABASE_URL is in the process environment — no .env.test
 * override — so it targets the same database the app's own .env points to.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Every @@map table name in schema.prisma except the reference/config tables
// we keep: organization_types, roles, permissions, role_permissions,
// lookup_tables, procedure_catalogs.
const TABLES_TO_TRUNCATE = [
  'organizations', 'organization_hierarchy', 'organization_affiliations', 'feature_flags',
  'organization_licenses', 'persons', 'user_accounts', 'user_organizations',
  'organization_assignments', 'user_roles', 'user_permissions', 'policies',
  'workflow_definitions', 'workflow_instances', 'workflow_actions', 'outbox_events',
  'departments', 'programs', 'training_plans', 'training_plan_versions',
  'training_plan_rotations', 'academic_intakes', 'training_requests',
  'training_request_trainees', 'trainee_profiles', 'graduation_approvals',
  'trainer_profiles', 'rotations', 'shifts', 'attendance', 'trainer_calls',
  'call_participants', 'evaluation_forms', 'evaluations', 'documents', 'stored_files',
  'integration_configs', 'integration_sync_logs', 'webhook_subscriptions',
  'webhook_delivery_logs', 'report_definitions', 'generated_reports', 'notifications',
  'audit_logs', 'settings', 'capacity_allocations', 'trainee_allocations',
  'trainer_programs', 'objectives', 'objective_progress', 'improvement_plans',
  'clinical_privileges', 'department_common_mistakes', 'dashboard_snapshots', 'tasks',
  'incidents', 'declarations', 'declaration_acceptances', 'clinical_case_logs',
  'competency_progress', 'logbook_signoffs', 'trainer_leaves', 'trainer_reassignments',
  'trainer_reassignment_trainees',
];

const TEST_PASSWORD = process.env.DEMO_RESET_PASSWORD;

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`Connected to: ${(process.env.DATABASE_URL ?? '').replace(/:[^:@]+@/, ':***@')}`);
  const before = await prisma.organization.count();
  console.log(`Organizations before: ${before}`);

  if (dryRun) {
    console.log('--dry-run: no changes made. Would truncate', TABLES_TO_TRUNCATE.length, 'tables.');
    return;
  }

  if (!TEST_PASSWORD) {
    throw new Error('Set DEMO_RESET_PASSWORD env var before running for real (used for the 5 new test accounts).');
  }

  // Production's applied migrations can lag schema.prisma (found: this DB has
  // no trainee_allocations table yet). Truncate only tables that actually
  // exist rather than assuming the full model list is deployed.
  const existing = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const existingSet = new Set(existing.map((r) => r.tablename));
  const tablesPresent = TABLES_TO_TRUNCATE.filter((t) => existingSet.has(t));
  const tablesMissing = TABLES_TO_TRUNCATE.filter((t) => !existingSet.has(t));
  if (tablesMissing.length) {
    console.log('Skipping tables not present in this database (not yet migrated):', tablesMissing);
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${tablesPresent.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`);
  });
  console.log('Truncated', tablesPresent.length, 'tables.');

  const universityType = await prisma.organizationType.findFirstOrThrow({ where: { code: 'university' } });
  const clusterType = await prisma.organizationType.findFirstOrThrow({ where: { code: 'cluster' } });
  const hospitalType = await prisma.organizationType.findFirstOrThrow({ where: { code: 'hospital' } });

  const university = await prisma.organization.create({
    data: { code: 'UNIV-TEST', nameAr: 'جامعة اختبار', nameEn: 'Test University', organizationTypeId: universityType.id, status: 'active' },
  });
  const cluster = await prisma.organization.create({
    data: { code: 'CLUSTER-TEST', nameAr: 'تجمع صحي اختبار', nameEn: 'Test Cluster', organizationTypeId: clusterType.id, status: 'active' },
  });
  const hospital = await prisma.organization.create({
    data: { code: 'HOSP-TEST', nameAr: 'مستشفى اختبار', nameEn: 'Test Hospital', organizationTypeId: hospitalType.id, parentId: cluster.id, status: 'active' },
  });
  const department = await prisma.department.create({
    data: { organizationId: hospital.id, nameAr: 'قسم اختبار', code: 'DEPT-TEST', capacity: 10 },
  });

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  let testSeq = 0;
  async function makeAccount(opts: {
    email: string; nameAr: string; roleCode: string; organizationId: string;
  }) {
    testSeq += 1;
    const role = await prisma.role.findFirstOrThrow({ where: { code: opts.roleCode } });
    const person = await prisma.person.create({
      data: { nationalId: `TEST-${testSeq}`, nameAr: opts.nameAr, nameEn: opts.nameAr, dateOfBirth: new Date('1990-01-01'), gender: 'male', nationality: 'SA' },
    });
    const account = await prisma.userAccount.create({
      data: { personId: person.id, email: opts.email, passwordHash, isActive: true },
    });
    await prisma.userRole.create({ data: { userAccountId: account.id, roleId: role.id, organizationId: opts.organizationId } });
    await prisma.userOrganization.create({ data: { userAccountId: account.id, organizationId: opts.organizationId, isPrimary: true, isActive: true } });
    return { person, account };
  }

  const universityAccount = await makeAccount({ email: 'university.test@miran.test', nameAr: 'حساب الجامعة', roleCode: 'university_administrator', organizationId: university.id });
  const clusterAccount = await makeAccount({ email: 'cluster.test@miran.test', nameAr: 'حساب التجمع', roleCode: 'training_director', organizationId: cluster.id });
  const hospitalAccount = await makeAccount({ email: 'hospital.test@miran.test', nameAr: 'حساب إدارة التدريب بالمستشفى', roleCode: 'hospital_training_admin', organizationId: hospital.id });
  const trainerAccount = await makeAccount({ email: 'trainer.test@miran.test', nameAr: 'حساب المدرب', roleCode: 'trainer', organizationId: hospital.id });
  const traineeAccount = await makeAccount({ email: 'trainee.test@miran.test', nameAr: 'حساب المتدرب', roleCode: 'trainee', organizationId: hospital.id });

  await prisma.trainerProfile.create({
    data: { personId: trainerAccount.person.id, organizationId: hospital.id, departmentId: department.id, maxTrainees: 5, isActive: true },
  });
  await prisma.traineeProfile.create({
    data: { personId: traineeAccount.person.id, organizationId: hospital.id, traineeNumber: 'TRAINEE-TEST', level: 'intern', applicationStatus: 'active' },
  });

  console.log('Created: university, cluster, hospital, department, and 5 role accounts.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
