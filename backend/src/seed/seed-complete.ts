// Complete remaining seed data: trainees, rotations, calls, notifications
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { devSeedPassword } from './dev-password';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Completing remaining seed data...');

  const rootPasswordHash = await bcrypt.hash(devSeedPassword(), 10);

  // Find existing data
  const hosp1 = await prisma.organization.findUnique({ where: { code: 'HOSP-PABMH' } });
  if (!hosp1) { console.error('❌ Hospital not found'); return; }

  const traineeRole = await prisma.role.findUnique({ where: { code: 'trainee' } });
  if (!traineeRole) { console.error('❌ Trainee role not found'); return; }

  const dept1 = await prisma.department.findFirst({ where: { code: 'INT-MED' } });
  if (!dept1) { console.error('❌ Department not found'); return; }

  const trainerProfile = await prisma.trainerProfile.findFirst();
  if (!trainerProfile) { console.error('❌ Trainer not found'); return; }

  console.log(`✅ Found: Hospital=${hosp1.nameAr}, Dept=${dept1.nameAr}, Trainer=${trainerProfile.id}`);

  // Remaining trainees to create
  const traineeData = [
    { natId: '1044444444', nameAr: 'خالد سعود العنزي', nameEn: 'Khalid S. Alanazi', email: 'khalid@miran.health', num: '11025', level: 'intern', spec: 'طب بشري' },
    { natId: '1055555555', nameAr: 'سارة محمد الرشيد', nameEn: 'Sara M. Alrashid', email: 'sara@miran.health', num: '11026', level: 'intern', spec: 'طب بشري' },
    { natId: '1066666666', nameAr: 'فيصل عبدالرحمن الحميد', nameEn: 'Faisal A. Alhumaid', email: 'faisal@miran.health', num: '11027', level: 'resident', spec: 'باطنية — سنة ٢' },
  ];

  for (const t of traineeData) {
    console.log(`  Creating trainee: ${t.nameAr}...`);
    const existing = await prisma.person.findUnique({ where: { nationalId: t.natId } });
    if (existing) {
      console.log(`    Already exists, skipping person creation.`);
      // Check trainee profile
      const tp = await prisma.traineeProfile.findUnique({ where: { personId: existing.id } });
      if (tp) { console.log(`    Trainee profile exists.`); continue; }
    }

    const p = await prisma.person.upsert({
      where: { nationalId: t.natId },
      create: { nationalId: t.natId, nameAr: t.nameAr, nameEn: t.nameEn, email: t.email, phone: `+9665${t.num}00` },
      update: {},
    });

    const acc = await prisma.userAccount.upsert({
      where: { email: t.email },
      create: { personId: p.id, email: t.email, username: t.email.split('@')[0], passwordHash: rootPasswordHash, isEmailVerified: true, isActive: true },
      update: {},
    });

    await prisma.userOrganization.upsert({
      where: { userAccountId_organizationId: { userAccountId: acc.id, organizationId: hosp1.id } },
      create: { userAccountId: acc.id, organizationId: hosp1.id, isPrimary: true },
      update: {},
    });

    await prisma.userRole.upsert({
      where: { userAccountId_roleId_organizationId: { userAccountId: acc.id, roleId: traineeRole.id, organizationId: hosp1.id } },
      create: { userAccountId: acc.id, roleId: traineeRole.id, organizationId: hosp1.id },
      update: {},
    });

    await prisma.traineeProfile.upsert({
      where: { personId: p.id },
      create: { personId: p.id, organizationId: hosp1.id, traineeNumber: t.num, level: t.level, specialtyAr: t.spec, specialtyEn: t.spec, applicationStatus: 'approved', cardStatus: 'active', cardUuid: `CARD-${t.num}`, photoApproved: true },
      update: {},
    });
    console.log(`    ✅ Done`);
  }

  // Create rotations for ALL trainees
  console.log('🔄 Seeding Rotations...');
  const allTrainees = await prisma.traineeProfile.findMany();
  const today = new Date();
  const startDate = new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000);
  const endDate = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000);

  for (const tp of allTrainees) {
    const existing = await prisma.rotation.findFirst({ where: { traineeProfileId: tp.id, departmentId: dept1.id } });
    if (!existing) {
      await prisma.rotation.create({
        data: { organizationId: hosp1.id, traineeProfileId: tp.id, departmentId: dept1.id, trainerProfileId: trainerProfile.id, startDate, endDate, status: 'active', midpointMeetingDone: true },
      });
      console.log(`  ✅ Rotation for ${tp.traineeNumber}`);
    } else {
      console.log(`  ⏭ Rotation exists for ${tp.traineeNumber}`);
    }
  }

  // Create calls
  console.log('🚨 Seeding Emergency Call...');
  let call1 = await prisma.trainerCall.findFirst({ where: { callType: 'urgent' } });
  if (!call1) {
    call1 = await prisma.trainerCall.create({
      data: {
        organizationId: hosp1.id, departmentId: dept1.id, trainerProfileId: trainerProfile.id,
        callType: 'urgent', customTitle: 'استدعاء عاجل — حالة حرجة بالطوارئ',
        note: 'يرجى التواجد فوراً بإنعاش باطنية', location: 'الدور الثالث — غرفة الإنعاش ٣٠٢',
        expectedMinutes: 20, launchedAt: new Date(), status: 'active',
      },
    });
    console.log('  ✅ Call created');
  } else {
    console.log('  ⏭ Call exists');
  }

  // Add participants
  for (const tp of allTrainees) {
    const existing = await prisma.callParticipant.findFirst({ where: { callId: call1.id, traineeProfileId: tp.id } });
    if (!existing) {
      await prisma.callParticipant.create({
        data: { callId: call1.id, traineeProfileId: tp.id, state: 'notified', notifiedAt: new Date() },
      });
      console.log(`  ✅ Participant ${tp.traineeNumber}`);
    }
  }

  // Create notifications
  console.log('🔔 Seeding Notifications...');
  for (const tp of allTrainees) {
    const acc = await prisma.userAccount.findFirst({ where: { personId: tp.personId } });
    if (!acc) continue;
    const count = await prisma.notification.count({ where: { userId: acc.id } });
    if (count === 0) {
      await prisma.notification.create({
        data: { organizationId: hosp1.id, userId: acc.id, titleAr: 'تم إطلاق نداء عاجل جديد', bodyAr: 'استدعاء عاجل من د. سالم العتيبي في جناح الباطنية', type: 'call_alert', isRead: false },
      });
      await prisma.notification.create({
        data: { organizationId: hosp1.id, userId: acc.id, titleAr: 'مرحباً بك في منصة مِران', bodyAr: 'تم اعتماد حسابك وإصدار بطاقة التدريب الذكية بنجاح', type: 'general', isRead: true },
      });
      console.log(`  ✅ Notifications for ${tp.traineeNumber}`);
    }
  }

  // Also create notifications for the admin
  const admin = await prisma.userAccount.findUnique({ where: { email: 'admin@miran.health' } });
  if (admin) {
    const count = await prisma.notification.count({ where: { userId: admin.id } });
    if (count === 0) {
      await prisma.notification.create({
        data: { organizationId: hosp1.id, userId: admin.id, titleAr: 'مرحباً بك في منصة مِران', bodyAr: 'تم تفعيل حسابك كمدير للمنصة الوطنية', type: 'general', isRead: false },
      });
      console.log(`  ✅ Notifications for admin`);
    }
  }

  // Final count
  console.log('\n📊 Final Database Counts:');
  console.log(`  Accounts: ${await prisma.userAccount.count()}`);
  console.log(`  Trainers: ${await prisma.trainerProfile.count()}`);
  console.log(`  Trainees: ${await prisma.traineeProfile.count()}`);
  console.log(`  Rotations: ${await prisma.rotation.count()}`);
  console.log(`  Calls: ${await prisma.trainerCall.count()}`);
  console.log(`  Participants: ${await prisma.callParticipant.count()}`);
  console.log(`  Notifications: ${await prisma.notification.count()}`);
  console.log(`  Organizations: ${await prisma.organization.count()}`);
  console.log(`  Departments: ${await prisma.department.count()}`);
  console.log(`  Roles: ${await prisma.role.count()}`);
  console.log(`  Permissions: ${await prisma.permission.count()}`);
  console.log('\n✅ All seed data completed!');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
