import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { roleScope } from '../common/role-scope';

/**
 * A clean, internally consistent demo dataset.
 *
 * The existing demo data had drifted: hospitals parented to a soft-deleted
 * cluster, rotations whose trainer belonged to a different hospital, accounts
 * carrying a hospital role with no hospital, and trainers with no profile. This
 * seed repairs those relationships and then guarantees one valid account per
 * role, each satisfying the scope contract in `common/role-scope.ts`.
 *
 * Idempotent: every write is an upsert or a guarded create, so it can be run
 * repeatedly without duplicating anything.
 */
const prisma = new PrismaClient();
const PASSWORD = 'Miran@123';

/** One account per role, each scoped exactly as its role requires. */
const DEMO_ACCOUNTS = [
  { email: 'owner@miran.health',      nameAr: 'سلطان العتيبي',    role: 'platform_owner',          nationalId: '2000000001' },
  { email: 'orgmanager@miran.health', nameAr: 'منيرة الشهراني',   role: 'org_manager',             nationalId: '2000000002' },
  { email: 'cluster@miran.health',    nameAr: 'بدر القحطاني',     role: 'cluster_manager',         nationalId: '2000000003' },
  // `site` pairs hospital-scoped accounts onto the same hospital so trainers,
  // trainees and their rotations actually line up. Sites are resolved to real
  // hospitals that have at least one active department.
  { email: 'hospadmin@miran.health',  nameAr: 'هيفاء الدوسري',    role: 'hospital_administrator',  nationalId: '2000000004', site: 0 },
  { email: 'trainingadmin@miran.health', nameAr: 'ماجد الحربي',   role: 'hospital_training_admin', nationalId: '2000000005', site: 1 },
  { email: 'supervisor@miran.health', nameAr: 'لطيفة الزهراني',   role: 'hospital_training_admin', nationalId: '2000000006', site: 0 },
  { email: 'trainer1@miran.health',   nameAr: 'د. عمر الغامدي',   role: 'trainer',                 nationalId: '2000000007', site: 0 },
  { email: 'trainer2@miran.health',   nameAr: 'د. نوف المالكي',   role: 'trainer',                 nationalId: '2000000008', site: 1 },
  { email: 'trainee1@miran.health',   nameAr: 'أحمد السبيعي',     role: 'trainee',                 nationalId: '2000000009', site: 0 },
  { email: 'trainee2@miran.health',   nameAr: 'دانة الرشيد',      role: 'trainee',                 nationalId: '2000000010', site: 1 },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  console.log('🧹 Repairing demo data relationships…\n');

  // ── 1. Re-parent hospitals orphaned under a soft-deleted cluster ───────────
  const liveCluster = await prisma.organization.findFirst({
    where: { organizationType: { code: 'cluster' }, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!liveCluster) throw new Error('لا يوجد تجمع صحي فعّال — شغّل seed الأساسي أولاً');

  const orphaned = await prisma.organization.findMany({
    where: {
      organizationType: { code: 'hospital' },
      deletedAt: null,
      parent: { deletedAt: { not: null } },
    },
    select: { id: true, nameAr: true },
  });
  for (const h of orphaned) {
    await prisma.organization.update({ where: { id: h.id }, data: { parentId: liveCluster.id } });
    console.log(`  ↪ أُعيد ربط ${h.nameAr} بالتجمع الفعّال`);
  }

  const hospitals = await prisma.organization.findMany({
    where: { organizationType: { code: 'hospital' }, deletedAt: null, parentId: liveCluster.id },
    orderBy: { nameAr: 'asc' },
    include: { _count: { select: { departments: true } } },
  });
  if (hospitals.length === 0) throw new Error('لا توجد مستشفيات تحت التجمع');
  // Only hospitals with departments can host a rotation, so those are the sites
  // hospital-scoped demo accounts are placed in.
  const sites = hospitals.filter((h) => h._count.departments > 0);
  if (sites.length === 0) throw new Error('لا يوجد مستشفى لديه أقسام فعّالة');
  const primaryHospital = sites[0];
  console.log(`  ✓ التجمع: ${liveCluster.nameAr} — ${hospitals.length} مستشفى\n`);

  // ── 2. Every trainer profile must sit in a real hospital ──────────────────
  const strayProfiles = await prisma.trainerProfile.findMany({
    where: { organization: { organizationType: { code: { not: 'hospital' } } } },
    select: { id: true },
  });
  for (const t of strayProfiles) {
    await prisma.trainerProfile.update({ where: { id: t.id }, data: { organizationId: primaryHospital.id } });
  }
  if (strayProfiles.length) console.log(`  ↪ نُقل ${strayProfiles.length} ملف مدرب إلى مستشفى صحيح`);

  // ── 3. Drop rotations whose relationships are inconsistent ────────────────
  // These are demo rows where the rotation's hospital, its trainer's hospital
  // and its department's hospital disagree. Repairing them in place trips the
  // capacity trigger (one legacy trainer carries 16 rotations against a cap of
  // 5), and the data is disposable, so they are removed and re-created cleanly.
  const rotations = await prisma.rotation.findMany({
    select: {
      id: true, organizationId: true,
      trainerProfile: { select: { organizationId: true } },
      department: { select: { organizationId: true } },
      traineeProfile: { select: { organizationId: true } },
    },
  });
  const inconsistent = rotations
    .filter((r) =>
      (r.trainerProfile && r.trainerProfile.organizationId !== r.organizationId) ||
      (r.department && r.department.organizationId !== r.organizationId) ||
      (r.traineeProfile && r.traineeProfile.organizationId !== r.organizationId))
    .map((r) => r.id);

  if (inconsistent.length) {
    // Children first — evaluations and progress rows reference the rotation.
    await prisma.evaluation.deleteMany({ where: { rotationId: { in: inconsistent } } });
    await prisma.objectiveProgress.deleteMany({ where: { rotationId: { in: inconsistent } } });
    await prisma.clinicalCaseLog.updateMany({
      where: { rotationId: { in: inconsistent } },
      data: { rotationId: null },
    });
    await prisma.trainerReassignmentTrainee.deleteMany({ where: { rotationId: { in: inconsistent } } });
    await prisma.rotation.deleteMany({ where: { id: { in: inconsistent } } });
    console.log(`  ↪ حُذف ${inconsistent.length} روتيشن غير متسق (مستشفى/مدرب/قسم متعارضة)`);
  }

  // Trainer capacity must be at least what the trainer already holds, otherwise
  // the capacity trigger blocks every later write.
  const overloaded = await prisma.trainerProfile.findMany({
    select: { id: true, maxTrainees: true, _count: { select: { rotations: { where: { status: 'active' } } } } },
  });
  for (const t of overloaded) {
    if (t._count.rotations > t.maxTrainees) {
      await prisma.trainerProfile.update({
        where: { id: t.id },
        data: { maxTrainees: Math.max(t._count.rotations + 2, 6) },
      });
      console.log(`  ↪ رُفعت سعة مدرب من ${t.maxTrainees} إلى ${Math.max(t._count.rotations + 2, 6)}`);
    }
  }

  // ── 4. One valid account per role ─────────────────────────────────────────
  console.log('\n👥 Seeding demo accounts…\n');
  const roleCache = new Map<string, string>();
  const getRoleId = async (code: string) => {
    if (roleCache.has(code)) return roleCache.get(code)!;
    const role = await prisma.role.findUnique({ where: { code }, select: { id: true } });
    if (!role) throw new Error(`الدور ${code} غير موجود — شغّل seed-rbac أولاً`);
    roleCache.set(code, role.id);
    return role.id;
  };

  const resolvedHome = new Map<string, { id: string; nameAr: string }>();
  for (const acc of DEMO_ACCOUNTS) {
    const rule = roleScope(acc.role);
    const hospital = rule.requiresHospital
      ? sites[(acc as any).site % sites.length]
      : null;
    const homeOrgId = hospital?.id ?? liveCluster.id;
    resolvedHome.set(acc.email, { id: homeOrgId, nameAr: hospital?.nameAr ?? liveCluster.nameAr });

    const person = await prisma.person.upsert({
      where: { nationalId: acc.nationalId },
      create: { nationalId: acc.nationalId, nameAr: acc.nameAr, email: acc.email, isActive: true },
      update: { nameAr: acc.nameAr, email: acc.email },
    });

    const account = await prisma.userAccount.upsert({
      where: { email: acc.email },
      create: {
        personId: person.id, email: acc.email, username: acc.email.split('@')[0],
        passwordHash, isEmailVerified: true, isActive: true,
      },
      update: { passwordHash, isActive: true, isEmailVerified: true, deletedAt: null },
    });

    // Home assignment (the hospital for hospital roles, the cluster otherwise).
    // Drop memberships from earlier runs so a demo account is never attached to
    // more than its own hospital and the parent cluster. Leaving them made the
    // account look like it belonged to several hospitals at once.
    const keep = [homeOrgId, liveCluster.id];
    await prisma.userRole.deleteMany({
      where: { userAccountId: account.id, organizationId: { notIn: keep } },
    });
    await prisma.organizationAssignment.deleteMany({
      where: { userAccountId: account.id, organizationId: { notIn: keep } },
    });
    await prisma.userOrganization.deleteMany({
      where: { userAccountId: account.id, organizationId: { notIn: keep } },
    });
    await prisma.userOrganization.updateMany({
      where: { userAccountId: account.id, organizationId: { not: homeOrgId } },
      data: { isPrimary: false },
    });
    await prisma.organizationAssignment.updateMany({
      where: { userAccountId: account.id, organizationId: { not: homeOrgId } },
      data: { isPrimary: false },
    });
    await prisma.userOrganization.upsert({
      where: { userAccountId_organizationId: { userAccountId: account.id, organizationId: homeOrgId } },
      create: { userAccountId: account.id, organizationId: homeOrgId, isPrimary: true },
      update: { isPrimary: true, isActive: true },
    });
    // OrganizationAssignment carries no unique key, so this is a find-then-write
    // rather than an upsert.
    const roleId = await getRoleId(acc.role);
    const homeAssignment = await prisma.organizationAssignment.findFirst({
      where: { userAccountId: account.id, organizationId: homeOrgId },
    });
    if (homeAssignment) {
      await prisma.organizationAssignment.update({
        where: { id: homeAssignment.id },
        data: { isPrimary: true, isActive: true, roleId },
      });
    } else {
      await prisma.organizationAssignment.create({
        data: {
          userAccountId: account.id, organizationId: homeOrgId, roleId,
          isPrimary: true, isActive: true, assignmentType: 'permanent', sourceType: 'manual',
        },
      });
    }

    // Hospital roles also belong to the parent cluster, so cluster screens see them.
    if (hospital) {
      await prisma.userOrganization.upsert({
        where: { userAccountId_organizationId: { userAccountId: account.id, organizationId: liveCluster.id } },
        create: { userAccountId: account.id, organizationId: liveCluster.id, isPrimary: false },
        update: { isActive: true },
      });
      const secondary = await prisma.organizationAssignment.findFirst({
        where: { userAccountId: account.id, organizationId: liveCluster.id },
      });
      if (!secondary) {
        await prisma.organizationAssignment.create({
          data: {
            userAccountId: account.id, organizationId: liveCluster.id,
            isPrimary: false, isActive: true, assignmentType: 'permanent', sourceType: 'manual',
          },
        });
      }
    }

    await prisma.userRole.upsert({
      where: { userAccountId_roleId_organizationId: { userAccountId: account.id, roleId, organizationId: homeOrgId } },
      create: { userAccountId: account.id, roleId, organizationId: homeOrgId },
      update: {},
    });

    console.log(`  ✓ ${acc.email.padEnd(30)} ${acc.role.padEnd(24)} → ${hospital?.nameAr ?? liveCluster.nameAr}`);
  }

  // ── 5. Trainer profiles for the trainer accounts ──────────────────────────
  console.log('\n🩺 Trainer & trainee profiles…\n');
  for (const acc of DEMO_ACCOUNTS.filter((a) => a.role === 'trainer')) {
    const person = await prisma.person.findUnique({ where: { nationalId: acc.nationalId } });
    if (!person) continue;
    const home = resolvedHome.get(acc.email)!;
    const hospId = home.id;
    const dept = await prisma.department.findFirst({
      where: { organizationId: hospId, isActive: true, deletedAt: null },
      select: { id: true, nameAr: true },
    });
    const existing = await prisma.trainerProfile.findFirst({ where: { personId: person.id } });
    if (existing) {
      await prisma.trainerProfile.update({
        where: { id: existing.id },
        data: { organizationId: hospId, departmentId: dept?.id ?? null, isActive: true, maxTrainees: 6 },
      });
    } else {
      await prisma.trainerProfile.create({
        data: {
          personId: person.id, organizationId: hospId, departmentId: dept?.id ?? null,
          titleAr: 'استشاري', maxTrainees: 6, isActive: true,
        },
      });
    }
    console.log(`  ✓ ملف مدرب: ${acc.nameAr} → ${home.nameAr} / ${dept?.nameAr ?? 'بلا قسم'}`);
  }

  // ── 6. Trainee profiles ───────────────────────────────────────────────────
  const program = await prisma.program.findFirst({ where: { code: 'MEDICAL_INTERNSHIP', deletedAt: null } });
  for (const [i, acc] of DEMO_ACCOUNTS.filter((a) => a.role === 'trainee').entries()) {
    const person = await prisma.person.findUnique({ where: { nationalId: acc.nationalId } });
    if (!person) continue;
    const home = resolvedHome.get(acc.email)!;
    const hospId = home.id;
    const existing = await prisma.traineeProfile.findFirst({ where: { personId: person.id } });
    if (existing) {
      await prisma.traineeProfile.update({
        where: { id: existing.id },
        data: { organizationId: hospId, applicationStatus: 'active', programId: program?.id ?? null },
      });
    } else {
      await prisma.traineeProfile.create({
        data: {
          personId: person.id, organizationId: hospId,
          traineeNumber: `DEMO-${acc.nationalId.slice(-4)}`,
          level: 'intern', specialtyAr: 'طب وجراحة عامة',
          applicationStatus: 'active', programId: program?.id ?? null,
        },
      });
    }
    console.log(`  ✓ ملف متدرب: ${acc.nameAr} → ${home.nameAr}`);
  }

  // ── 7. Rotations linking hospital → trainer → trainee ─────────────────────
  console.log('\n🔄 Rotations…\n');
  for (const acc of DEMO_ACCOUNTS.filter((a) => a.role === 'trainee')) {
    const person = await prisma.person.findUnique({ where: { nationalId: acc.nationalId } });
    const trainee = await prisma.traineeProfile.findFirst({ where: { personId: person!.id } });
    if (!trainee) continue;

    // The trainer must belong to the same hospital as the trainee — this is the
    // relationship that was broken in the old data — and must still have a free
    // seat, since the database enforces trainer capacity on active rotations.
    const candidates = await prisma.trainerProfile.findMany({
      where: { organizationId: trainee.organizationId, isActive: true },
      include: {
        department: true, person: true,
        _count: { select: { rotations: { where: { status: 'active' } } } },
      },
    });
    const trainer = candidates.find((t) => t._count.rotations < t.maxTrainees);
    if (!trainer) {
      console.log(`  ⚠ لا يوجد مدرب بسعة متاحة في مستشفى ${acc.nameAr}`);
      continue;
    }

    const dept = trainer.departmentId
      ? await prisma.department.findUnique({ where: { id: trainer.departmentId } })
      : await prisma.department.findFirst({ where: { organizationId: trainee.organizationId, isActive: true } });
    if (!dept) { console.log(`  ⚠ لا يوجد قسم في مستشفى ${acc.nameAr}`); continue; }

    const existing = await prisma.rotation.findFirst({
      where: { traineeProfileId: trainee.id, trainerProfileId: trainer.id },
    });
    if (existing) {
      await prisma.rotation.update({
        where: { id: existing.id },
        data: { organizationId: trainee.organizationId, departmentId: dept.id, status: 'active' },
      });
    } else {
      const start = new Date(); start.setMonth(start.getMonth() - 1);
      const end = new Date(start); end.setMonth(end.getMonth() + 3);
      await prisma.rotation.create({
        data: {
          organizationId: trainee.organizationId,
          traineeProfileId: trainee.id,
          trainerProfileId: trainer.id,
          departmentId: dept.id,
          programId: program?.id ?? null,
          startDate: start, endDate: end, status: 'active',
        },
      });
    }
    console.log(`  ✓ ${acc.nameAr} → ${trainer.person.nameAr} (${dept.nameAr})`);
  }

  // ── 8. Summary ────────────────────────────────────────────────────────────
  console.log('\n📊 Dataset summary');
  console.log(`  organizations : ${await prisma.organization.count({ where: { deletedAt: null } })}`);
  console.log(`  hospitals     : ${await prisma.organization.count({ where: { deletedAt: null, organizationType: { code: 'hospital' } } })}`);
  console.log(`  accounts      : ${await prisma.userAccount.count({ where: { deletedAt: null } })}`);
  console.log(`  trainers      : ${await prisma.trainerProfile.count()}`);
  console.log(`  trainees      : ${await prisma.traineeProfile.count({ where: { deletedAt: null } })}`);
  console.log(`  rotations     : ${await prisma.rotation.count()}`);
  console.log(`\n  كلمة المرور لكل الحسابات التجريبية: ${PASSWORD}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
