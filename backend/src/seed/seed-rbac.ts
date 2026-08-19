// seed-rbac.ts — Seed الأدوار الأربعة وصلاحياتها وحسابات اختبار لكل دور
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { devSeedPassword } from './dev-password';

const prisma = new PrismaClient();

async function main() {
  console.log('🎭 Seeding RBAC — 4 Roles + Permissions + Test Accounts...\n');

  const passwordHash = await bcrypt.hash(devSeedPassword(), 10);

  // ── 1. الصلاحيات الكاملة ──────────────────────────────────────────────────
  const allPermissions = [
    // إدارة الحسابات
    { code: 'manage_accounts',       nameAr: 'إدارة الحسابات',          nameEn: 'Manage Accounts',         module: 'users' },
    { code: 'manage_supervisors',    nameAr: 'إدارة المشرفين',          nameEn: 'Manage Supervisors',       module: 'users' },
    { code: 'manage_trainers',       nameAr: 'إدارة المدربين',          nameEn: 'Manage Trainers',          module: 'users' },
    { code: 'manage_trainees',       nameAr: 'إدارة المتدربين',         nameEn: 'Manage Trainees',          module: 'trainees' },
    // الروتيشنات
    { code: 'approve_rotations',     nameAr: 'اعتماد الروتيشنات',       nameEn: 'Approve Rotations',        module: 'rotations' },
    { code: 'assign_rotations',      nameAr: 'توزيع الروتيشنات',        nameEn: 'Assign Rotations',         module: 'rotations' },
    { code: 'view_rotations',        nameAr: 'عرض الروتيشنات',          nameEn: 'View Rotations',           module: 'rotations' },
    // التقارير
    { code: 'view_reports',          nameAr: 'عرض التقارير',            nameEn: 'View Reports',             module: 'reports' },
    // الإقرارات
    { code: 'approve_declarations',  nameAr: 'اعتماد الإقرارات',        nameEn: 'Approve Declarations',     module: 'declarations' },
    // الحضور
    { code: 'track_attendance',      nameAr: 'متابعة الحضور',           nameEn: 'Track Attendance',         module: 'attendance' },
    // الإشعارات
    { code: 'send_notifications',    nameAr: 'إرسال الإشعارات',         nameEn: 'Send Notifications',       module: 'notifications' },
    { code: 'receive_notifications', nameAr: 'استقبال الإشعارات',       nameEn: 'Receive Notifications',    module: 'notifications' },
    // التقييمات
    { code: 'submit_evaluations',    nameAr: 'إرسال التقييمات',         nameEn: 'Submit Evaluations',       module: 'evaluations' },
    { code: 'view_evaluations',      nameAr: 'عرض التقييمات',           nameEn: 'View Evaluations',         module: 'evaluations' },
    // النداءات
    { code: 'launch_calls',          nameAr: 'إطلاق النداءات',          nameEn: 'Launch Calls',             module: 'calls' },
    { code: 'view_active_calls',     nameAr: 'عرض النداءات النشطة',      nameEn: 'View Active Calls',        module: 'calls' },
    { code: 'track_call_responses',  nameAr: 'متابعة استجابات النداء',   nameEn: 'Track Call Responses',     module: 'calls' },
    { code: 'respond_to_calls',      nameAr: 'الرد على النداءات',        nameEn: 'Respond to Calls',         module: 'calls' },
    // البيانات الشخصية
    { code: 'view_own_data',         nameAr: 'عرض بياناتي الشخصية',     nameEn: 'View Own Data',            module: 'profile' },
    { code: 'view_own_trainees',     nameAr: 'عرض متدربيّ فقط',         nameEn: 'View Own Trainees',        module: 'trainees' },
    // Codes the PermissionsGuard actually checks via @RequirePermissions.
    // They were being enforced without ever existing in the catalogue, so every
    // role except platform_owner/system_admin (which bypass) was denied.
    { code: 'view_users',            nameAr: 'عرض المستخدمين',          nameEn: 'View Users',               module: 'users' },
    { code: 'manage_users',          nameAr: 'إدارة المستخدمين',        nameEn: 'Manage Users',             module: 'users' },
    { code: 'view_organizations',    nameAr: 'عرض الجهات',              nameEn: 'View Organizations',       module: 'organizations' },
    { code: 'manage_organizations',  nameAr: 'إدارة الجهات',            nameEn: 'Manage Organizations',     module: 'organizations' },
    { code: 'manage_roles',          nameAr: 'إدارة الأدوار',           nameEn: 'Manage Roles',             module: 'rbac' },
    { code: 'view_trainees',         nameAr: 'عرض المتدربين',           nameEn: 'View Trainees',            module: 'trainees' },
  ];

  console.log('📋 Seeding Permissions...');
  for (const perm of allPermissions) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      create: { code: perm.code, nameAr: perm.nameAr, nameEn: perm.nameEn, module: perm.module },
      update: { nameAr: perm.nameAr, nameEn: perm.nameEn },
    });
  }
  console.log(`  ✅ ${allPermissions.length} permissions seeded\n`);

  // ── 2. الأدوار وصلاحياتها ─────────────────────────────────────────
  const rolesDefinition = [
    {
      code: 'platform_owner',
      nameAr: 'مدير المنصة الإلكترونية',
      nameEn: 'Platform Owner',
      descriptionAr: 'إدارة جميع الجهات، المستخدمين، الأدوار، الصلاحيات، التقارير والإعدادات',
      hierarchyLevel: 100,
      permissions: allPermissions.map((p) => p.code),
    },
    {
      code: 'org_manager',
      nameAr: 'مدير الجهة',
      nameEn: 'Organization Manager',
      descriptionAr: 'يدير جميع الحسابات والعمليات داخل الجهة',
      hierarchyLevel: 10,
      permissions: [
        'manage_accounts', 'manage_supervisors', 'manage_trainers', 'manage_trainees',
        'approve_rotations', 'assign_rotations', 'view_rotations',
        'view_reports', 'approve_declarations', 'track_attendance',
        'send_notifications', 'receive_notifications',
        'submit_evaluations', 'view_evaluations',
        'view_active_calls', 'track_call_responses',
      ],
    },
    {
      code: 'academic_supervisor',
      nameAr: 'مشرف أكاديمي',
      nameEn: 'Academic Supervisor',
      descriptionAr: 'يشرف على المتدربين ويوزع الروتيشنات واعتماد الإقرارات',
      hierarchyLevel: 7,
      permissions: [
        'manage_trainees', 'assign_rotations', 'view_rotations',
        'approve_declarations', 'track_attendance',
        'send_notifications', 'receive_notifications',
        'view_evaluations', 'view_reports',
      ],
    },
    {
      code: 'trainer',
      nameAr: 'مدرب',
      nameEn: 'Trainer',
      descriptionAr: 'مدرب سريري يشرف على متدربيه ويطلق النداءات',
      hierarchyLevel: 5,
      permissions: [
        'view_own_trainees', 'view_rotations',
        'submit_evaluations', 'view_evaluations',
        'send_notifications', 'receive_notifications',
        'launch_calls', 'view_active_calls', 'track_call_responses',
      ],
    },
    {
      code: 'hospital_training_admin',
      nameAr: 'مدير إدارة التدريب بالمستشفى',
      nameEn: 'Hospital Training Administrator',
      descriptionAr: 'يدير جميع عمليات التدريب والروتيشنات والمدربين داخل مستشفى محدد',
      hierarchyLevel: 8,
      permissions: [
        'manage_accounts', 'manage_trainers', 'manage_trainees',
        'approve_rotations', 'assign_rotations', 'view_rotations',
        'view_reports', 'track_attendance', 'send_notifications',
        'submit_evaluations', 'view_evaluations',
        'view_active_calls', 'track_call_responses',
      ],
    },
    {
      code: 'system_admin',
      nameAr: 'مدير النظام',
      nameEn: 'System Administrator',
      descriptionAr: 'إدارة تشغيلية كاملة للمنصة',
      hierarchyLevel: 95,
      permissions: allPermissions.map((p) => p.code),
    },
    {
      code: 'holding_administrator',
      nameAr: 'مدير الصحة القابضة',
      nameEn: 'Holding Administrator',
      descriptionAr: 'إشراف وطني على الجهات والتقارير',
      hierarchyLevel: 90,
      permissions: [
        'view_users', 'view_organizations', 'view_trainees', 'view_rotations',
        'view_reports', 'view_evaluations', 'receive_notifications',
      ],
    },
    {
      code: 'cluster_administrator',
      nameAr: 'مدير التجمع الصحي',
      nameEn: 'Cluster Administrator',
      descriptionAr: 'يدير مستشفيات التجمع وتوزيع المتدربين عليها',
      hierarchyLevel: 30,
      permissions: [
        'view_users', 'manage_users', 'view_organizations', 'manage_organizations',
        'view_trainees', 'manage_trainees', 'manage_trainers', 'manage_supervisors',
        'approve_rotations', 'assign_rotations', 'view_rotations',
        'view_reports', 'track_attendance', 'send_notifications', 'receive_notifications',
        'view_evaluations', 'view_active_calls',
      ],
    },
    {
      code: 'cluster_manager',
      nameAr: 'مدير التجمع',
      nameEn: 'Cluster Manager',
      descriptionAr: 'متابعة تشغيلية لمستشفيات التجمع',
      hierarchyLevel: 28,
      permissions: [
        'view_users', 'view_organizations', 'view_trainees', 'manage_trainees',
        'assign_rotations', 'view_rotations', 'view_reports',
        'track_attendance', 'send_notifications', 'receive_notifications', 'view_evaluations',
      ],
    },
    {
      code: 'training_director',
      nameAr: 'مدير التدريب بالتجمع',
      nameEn: 'Training Director',
      descriptionAr: 'يقود التخطيط التدريبي على مستوى التجمع',
      hierarchyLevel: 26,
      permissions: [
        'view_users', 'view_organizations', 'view_trainees', 'manage_trainees',
        'approve_rotations', 'assign_rotations', 'view_rotations',
        'view_reports', 'view_evaluations', 'send_notifications', 'receive_notifications',
      ],
    },
    {
      code: 'university_administrator',
      nameAr: 'مدير الجامعة',
      nameEn: 'University Administrator',
      descriptionAr: 'يوفد الطلاب ويتابع مسارهم التدريبي',
      hierarchyLevel: 25,
      permissions: [
        'view_users', 'manage_users', 'view_organizations',
        'view_trainees', 'manage_trainees', 'view_rotations',
        'view_reports', 'approve_declarations', 'send_notifications', 'receive_notifications',
      ],
    },
    {
      code: 'academic_affairs',
      nameAr: 'الشؤون الأكاديمية',
      nameEn: 'Academic Affairs',
      descriptionAr: 'متابعة الشؤون الأكاديمية للطلاب الموفدين',
      hierarchyLevel: 22,
      permissions: [
        'view_users', 'view_trainees', 'view_rotations', 'view_reports',
        'view_evaluations', 'approve_declarations', 'receive_notifications',
      ],
    },
    {
      code: 'hospital_administrator',
      nameAr: 'مدير المستشفى',
      nameEn: 'Hospital Administrator',
      descriptionAr: 'يدير عمليات التدريب والسعة داخل مستشفاه',
      hierarchyLevel: 20,
      permissions: [
        'view_users', 'manage_users', 'view_organizations',
        'manage_trainers', 'manage_supervisors', 'view_trainees', 'manage_trainees',
        'approve_rotations', 'assign_rotations', 'view_rotations',
        'view_reports', 'track_attendance', 'send_notifications', 'receive_notifications',
        'submit_evaluations', 'view_evaluations',
        'launch_calls', 'view_active_calls', 'track_call_responses',
      ],
    },
    {
      code: 'auditor',
      nameAr: 'مدقق',
      nameEn: 'Auditor',
      descriptionAr: 'اطلاع للقراءة فقط لأغراض التدقيق',
      hierarchyLevel: 5,
      permissions: [
        'view_users', 'view_organizations', 'view_trainees',
        'view_rotations', 'view_reports', 'view_evaluations',
      ],
    },
    {
      code: 'reviewer',
      nameAr: 'مراجع',
      nameEn: 'Reviewer',
      descriptionAr: 'مراجعة الملفات والتقييمات دون تعديل',
      hierarchyLevel: 5,
      permissions: [
        'view_trainees', 'view_rotations', 'view_evaluations', 'view_reports',
      ],
    },
    {
      code: 'external_system',
      nameAr: 'نظام خارجي',
      nameEn: 'External System',
      descriptionAr: 'تكامل آلي محدود الصلاحية',
      hierarchyLevel: 1,
      permissions: ['view_rotations', 'receive_notifications'],
    },
    {
      code: 'trainee',
      nameAr: 'متدرب',
      nameEn: 'Trainee',
      descriptionAr: 'يرى بياناته الخاصة فقط ويستقبل النداءات',
      hierarchyLevel: 1,
      permissions: [
        'view_own_data', 'view_rotations', 'view_evaluations',
        'receive_notifications', 'respond_to_calls',
      ],
    },
  ];

  console.log('🎭 Seeding Roles with Permissions...');
  for (const roleDef of rolesDefinition) {
    const role = await prisma.role.upsert({
      where: { code: roleDef.code },
      create: {
        code: roleDef.code,
        nameAr: roleDef.nameAr,
        nameEn: roleDef.nameEn,
        descriptionAr: roleDef.descriptionAr,
        hierarchyLevel: roleDef.hierarchyLevel,
        isSystem: true,
      },
      update: {
        nameAr: roleDef.nameAr,
        nameEn: roleDef.nameEn,
        hierarchyLevel: roleDef.hierarchyLevel,
      },
    });

    // ربط الصلاحيات بالدور
    for (const permCode of roleDef.permissions) {
      const perm = await prisma.permission.findUnique({ where: { code: permCode } });
      if (!perm) { console.error(`  ⚠️ Permission not found: ${permCode}`); continue; }

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
    }
    console.log(`  ✅ Role ${roleDef.nameAr}: ${roleDef.permissions.length} permissions`);
  }
  console.log();

  // ── 3. ربط الحسابات وتوفير حساب platform@miran.health ──────────────────────
  console.log('🔗 Assigning Roles to Existing Accounts...');

  const hosp1 = await prisma.organization.findUnique({ where: { code: 'HOSP-PABMH' } });
  if (!hosp1) { console.error('❌ Hospital not found!'); return; }

  const platformOwnerRole = await prisma.role.findUnique({ where: { code: 'platform_owner' } });
  const orgManagerRole = await prisma.role.findUnique({ where: { code: 'org_manager' } });
  const academicRole   = await prisma.role.findUnique({ where: { code: 'academic_supervisor' } });
  const trainerRole    = await prisma.role.findUnique({ where: { code: 'trainer' } });
  const traineeRole    = await prisma.role.findUnique({ where: { code: 'trainee' } });

  if (!platformOwnerRole || !orgManagerRole || !academicRole || !trainerRole || !traineeRole) {
    console.error('❌ Roles not found after upsert!');
    return;
  }

  // 1) Create / Upsert Platform Owner: platform@miran.health
  let platformAccount = await prisma.userAccount.findUnique({ where: { email: 'platform@miran.health' } });
  if (!platformAccount) {
    const platformPerson = await prisma.person.upsert({
      where: { nationalId: '1099999999' },
      create: { nationalId: '1099999999', nameAr: 'مدير المنصة', nameEn: 'Platform Owner', email: 'platform@miran.health', phone: '+966500999888' },
      update: {},
    });
    platformAccount = await prisma.userAccount.create({
      data: {
        personId: platformPerson.id,
        email: 'platform@miran.health',
        username: 'platform_owner',
        passwordHash,
        isEmailVerified: true,
        isActive: true,
      },
    });
    console.log('  ✅ platform@miran.health → created');
  }

  await prisma.userOrganization.upsert({
    where: { userAccountId_organizationId: { userAccountId: platformAccount.id, organizationId: hosp1.id } },
    create: { userAccountId: platformAccount.id, organizationId: hosp1.id, isPrimary: true },
    update: {},
  });

  await prisma.userRole.upsert({
    where: { userAccountId_roleId_organizationId: { userAccountId: platformAccount.id, roleId: platformOwnerRole.id, organizationId: hosp1.id } },
    create: { userAccountId: platformAccount.id, roleId: platformOwnerRole.id, organizationId: hosp1.id },
    update: {},
  });
  console.log('  ✅ platform@miran.health → platform_owner');

  // Admin → org_manager
  const adminAccount = await prisma.userAccount.findUnique({ where: { email: 'admin@miran.health' } });
  if (adminAccount) {
    await prisma.userRole.upsert({
      where: { userAccountId_roleId_organizationId: { userAccountId: adminAccount.id, roleId: orgManagerRole.id, organizationId: hosp1.id } },
      create: { userAccountId: adminAccount.id, roleId: orgManagerRole.id, organizationId: hosp1.id },
      update: {},
    });
    await prisma.userOrganization.upsert({
      where: { userAccountId_organizationId: { userAccountId: adminAccount.id, organizationId: hosp1.id } },
      create: { userAccountId: adminAccount.id, organizationId: hosp1.id, isPrimary: false },
      update: {},
    });
    console.log('  ✅ admin@miran.health → org_manager');
  }

  // Salem (trainer account)
  const salemAccount = await prisma.userAccount.findUnique({ where: { email: 'salem@miran.health' } });
  if (salemAccount) {
    await prisma.userRole.deleteMany({ where: { userAccountId: salemAccount.id, organizationId: hosp1.id } });
    await prisma.userRole.create({ data: { userAccountId: salemAccount.id, roleId: trainerRole.id, organizationId: hosp1.id } });
    console.log('  ✅ salem@miran.health → trainer');
  }

  // Academic Supervisor
  let academicAccount = await prisma.userAccount.findUnique({ where: { email: 'academic@miran.health' } });
  if (!academicAccount) {
    const academicPerson = await prisma.person.upsert({
      where: { nationalId: '1077777777' },
      create: { nationalId: '1077777777', nameAr: 'د. نورة العمري', nameEn: 'Dr. Noura Alamri', email: 'academic@miran.health', phone: '+966555001' },
      update: {},
    });
    academicAccount = await prisma.userAccount.create({
      data: {
        personId: academicPerson.id, email: 'academic@miran.health',
        username: 'academic', passwordHash, isEmailVerified: true, isActive: true,
      },
    });
    await prisma.userOrganization.create({ data: { userAccountId: academicAccount.id, organizationId: hosp1.id, isPrimary: true } });
    console.log('  ✅ academic@miran.health → created');
  }
  await prisma.userRole.upsert({
    where: { userAccountId_roleId_organizationId: { userAccountId: academicAccount.id, roleId: academicRole.id, organizationId: hosp1.id } },
    create: { userAccountId: academicAccount.id, roleId: academicRole.id, organizationId: hosp1.id },
    update: {},
  });
  console.log('  ✅ academic@miran.health → academic_supervisor');

  // Trainees
  const traineeAccounts = [
    'abdullah@miran.health', 'fatima@miran.health', 'khalid@miran.health',
    'sara@miran.health', 'faisal@miran.health',
  ];
  for (const email of traineeAccounts) {
    const acc = await prisma.userAccount.findUnique({ where: { email } });
    if (!acc) continue;
    await prisma.userRole.deleteMany({ where: { userAccountId: acc.id, organizationId: hosp1.id } });
    await prisma.userRole.create({ data: { userAccountId: acc.id, roleId: traineeRole.id, organizationId: hosp1.id } });
    console.log(`  ✅ ${email} → trainee`);
  }

  // ── 4. ملخص نهائي ────────────────────────────────────────────────────────
  console.log('\n📊 Final RBAC Summary:');
  const roleSummary = await prisma.role.findMany({
    include: { _count: { select: { userRoles: true, rolePermissions: true } } },
    where: { code: { in: ['platform_owner', 'org_manager', 'academic_supervisor', 'trainer', 'trainee'] } },
  });
  for (const r of roleSummary) {
    console.log(`  ${r.nameAr}: ${r._count.userRoles} users, ${r._count.rolePermissions} permissions`);
  }

  console.log('\n✅ RBAC Seed Completed!\n');
  console.log('Test Accounts:');
  console.log('  platform@miran.health → platform_owner');
  console.log('  admin@miran.health    → org_manager');
  console.log('  academic@miran.health → academic_supervisor');
  console.log('  salem@miran.health    → trainer');
  console.log('  abdullah@miran.health → trainee');
}

main()
  .catch((e) => { console.error('❌ RBAC Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
