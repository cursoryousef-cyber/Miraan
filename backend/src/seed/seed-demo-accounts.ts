import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { devSeedPassword } from './dev-password';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Seeding Production Demo Accounts (Linked Supervisor, Trainer, Trainee)...');

  // Demo fixture credentials come from DEV_SEED_PASSWORD (or a random per-run
  // value), not from committed literals. See dev-password.ts.
  const demoPasswordHash = await bcrypt.hash(devSeedPassword(), 10);
  const passwordSupervisor = demoPasswordHash;
  const passwordTrainer = demoPasswordHash;
  const passwordTrainee = demoPasswordHash;

  // 1. Fetch main hospital organization
  let hospital = await prisma.organization.findFirst({
    where: { code: 'HOSP-NORTH-TOWER' },
  });

  if (!hospital) {
    hospital = await prisma.organization.findFirst({
      where: { organizationType: { code: 'hospital' } },
    });
  }

  if (!hospital) {
    throw new Error('No hospital organization found in database!');
  }

  // 2. Fetch or create Departments
  let internalMedDept = await prisma.department.findFirst({
    where: { organizationId: hospital.id, code: 'INTERNAL_MED' },
  });

  if (!internalMedDept) {
    internalMedDept = await prisma.department.create({
      data: {
        organizationId: hospital.id,
        code: 'INTERNAL_MED',
        nameAr: 'قسم الباطنية العام',
        nameEn: 'Internal Medicine Department',
        capacity: 25,
      },
    });
  }

  let academicDept = await prisma.department.findFirst({
    where: { organizationId: hospital.id, code: 'ACADEMIC_AFF' },
  });

  if (!academicDept) {
    academicDept = await prisma.department.create({
      data: {
        organizationId: hospital.id,
        code: 'ACADEMIC_AFF',
        nameAr: 'إدارة الشؤون الأكاديمية والتدريب',
        nameEn: 'Academic Affairs & Training',
        capacity: 50,
      },
    });
  }

  // 3. Ensure Roles exist
  const supervisorRole = await prisma.role.upsert({
    where: { code: 'hospital_training_admin' },
    create: { code: 'hospital_training_admin', nameAr: 'مدير تدريب المستشفى', nameEn: 'Hospital Training Manager', hierarchyLevel: 6, isSystem: true },
    update: { nameAr: 'مدير تدريب المستشفى', nameEn: 'Hospital Training Manager' },
  });

  const trainerRole = await prisma.role.upsert({
    where: { code: 'trainer' },
    create: { code: 'trainer', nameAr: 'مدرب سريري', nameEn: 'Clinical Trainer', hierarchyLevel: 5, isSystem: true },
    update: {},
  });

  const traineeRole = await prisma.role.upsert({
    where: { code: 'trainee' },
    create: { code: 'trainee', nameAr: 'متدرب / طبيب امتياز', nameEn: 'Trainee', hierarchyLevel: 1, isSystem: true },
    update: {},
  });

  // 4. Create Account 1: Hospital Training Supervisor
  console.log('📌 Creating Supervisor Account...');
  const supervisorPerson = await prisma.person.upsert({
    where: { nationalId: '1088888881' },
    create: {
      nationalId: '1088888881',
      nameAr: 'د. فهد محمد المطيري',
      nameEn: 'Dr. Fahd Mohammad Al-Mutairi',
      email: 'supervisor.demo@miran.health',
      phone: '+966508888881',
    },
    update: {
      nameAr: 'د. فهد محمد المطيري',
      nameEn: 'Dr. Fahd Mohammad Al-Mutairi',
      email: 'supervisor.demo@miran.health',
    },
  });

  const supervisorAccount = await prisma.userAccount.upsert({
    where: { email: 'supervisor.demo@miran.health' },
    create: {
      personId: supervisorPerson.id,
      email: 'supervisor.demo@miran.health',
      username: 'supervisor.demo',
      passwordHash: passwordSupervisor,
      isEmailVerified: true,
      isActive: true,
    },
    update: { isActive: true, passwordHash: passwordSupervisor },
  });

  await prisma.userOrganization.upsert({
    where: { userAccountId_organizationId: { userAccountId: supervisorAccount.id, organizationId: hospital.id } },
    create: { userAccountId: supervisorAccount.id, organizationId: hospital.id, isPrimary: true, isActive: true },
    update: { isActive: true },
  });

  await prisma.userRole.upsert({
    where: { userAccountId_roleId_organizationId: { userAccountId: supervisorAccount.id, roleId: supervisorRole.id, organizationId: hospital.id } },
    create: { userAccountId: supervisorAccount.id, roleId: supervisorRole.id, organizationId: hospital.id },
    update: {},
  });

  // 5. Create Account 2: Clinical Trainer
  console.log('📌 Creating Trainer Account...');
  const trainerPerson = await prisma.person.upsert({
    where: { nationalId: '1088888882' },
    create: {
      nationalId: '1088888882',
      nameAr: 'د. خليل إبراهيم الغامدي',
      nameEn: 'Dr. Khalil Ibrahim Al-Ghamdi',
      email: 'trainer.demo@miran.health',
      phone: '+966508888882',
    },
    update: {
      nameAr: 'د. خليل إبراهيم الغامدي',
      nameEn: 'Dr. Khalil Ibrahim Al-Ghamdi',
      email: 'trainer.demo@miran.health',
    },
  });

  const trainerAccount = await prisma.userAccount.upsert({
    where: { email: 'trainer.demo@miran.health' },
    create: {
      personId: trainerPerson.id,
      email: 'trainer.demo@miran.health',
      username: 'trainer.demo',
      passwordHash: passwordTrainer,
      isEmailVerified: true,
      isActive: true,
    },
    update: { isActive: true, passwordHash: passwordTrainer },
  });

  await prisma.userOrganization.upsert({
    where: { userAccountId_organizationId: { userAccountId: trainerAccount.id, organizationId: hospital.id } },
    create: { userAccountId: trainerAccount.id, organizationId: hospital.id, isPrimary: true, isActive: true },
    update: { isActive: true },
  });

  await prisma.userRole.upsert({
    where: { userAccountId_roleId_organizationId: { userAccountId: trainerAccount.id, roleId: trainerRole.id, organizationId: hospital.id } },
    create: { userAccountId: trainerAccount.id, roleId: trainerRole.id, organizationId: hospital.id },
    update: {},
  });

  const trainerProfile = await prisma.trainerProfile.upsert({
    where: { personId: trainerPerson.id },
    create: {
      personId: trainerPerson.id,
      organizationId: hospital.id,
      departmentId: internalMedDept.id,
      titleAr: 'استشاري ومدرب سريري في الباطنية',
      titleEn: 'Consultant & Clinical Trainer',
      maxTrainees: 10,
    },
    update: {
      departmentId: internalMedDept.id,
    },
  });

  // 6. Create Account 3: Trainee (Intern)
  console.log('📌 Creating Trainee Account...');
  const traineePerson = await prisma.person.upsert({
    where: { nationalId: '1088888883' },
    create: {
      nationalId: '1088888883',
      nameAr: 'د. طارق زياد الشمري',
      nameEn: 'Dr. Tariq Ziyad Al-Shammari',
      email: 'trainee.demo@miran.health',
      phone: '+966508888883',
    },
    update: {
      nameAr: 'د. طارق زياد الشمري',
      nameEn: 'Dr. Tariq Ziyad Al-Shammari',
      email: 'trainee.demo@miran.health',
    },
  });

  const traineeAccount = await prisma.userAccount.upsert({
    where: { email: 'trainee.demo@miran.health' },
    create: {
      personId: traineePerson.id,
      email: 'trainee.demo@miran.health',
      username: 'trainee.demo',
      passwordHash: passwordTrainee,
      isEmailVerified: true,
      isActive: true,
    },
    update: { isActive: true, passwordHash: passwordTrainee },
  });

  await prisma.userOrganization.upsert({
    where: { userAccountId_organizationId: { userAccountId: traineeAccount.id, organizationId: hospital.id } },
    create: { userAccountId: traineeAccount.id, organizationId: hospital.id, isPrimary: true, isActive: true },
    update: { isActive: true },
  });

  await prisma.userRole.upsert({
    where: { userAccountId_roleId_organizationId: { userAccountId: traineeAccount.id, roleId: traineeRole.id, organizationId: hospital.id } },
    create: { userAccountId: traineeAccount.id, roleId: traineeRole.id, organizationId: hospital.id },
    update: {},
  });

  const traineeProfile = await prisma.traineeProfile.upsert({
    where: { personId: traineePerson.id },
    create: {
      personId: traineePerson.id,
      organizationId: hospital.id,
      traineeNumber: 'DEMO-2026-01',
      level: 'intern',
      specialtyAr: 'طب وجراحة البشرية (طبيب امتياز)',
      specialtyEn: 'MBBS Intern',
      applicationStatus: 'approved',
      cardStatus: 'active',
      cardUuid: 'CARD-DEMO-2026-01',
      photoApproved: true,
    },
    update: {
      organizationId: hospital.id,
      applicationStatus: 'approved',
      cardStatus: 'active',
    },
  });

  // 7. Link Trainer & Trainee via Active Rotation
  console.log('📌 Linking Trainee to Rotation & Clinical Trainer...');
  const startDate = new Date('2026-07-01');
  const endDate = new Date('2026-09-30');

  let activeRotation = await prisma.rotation.findFirst({
    where: { traineeProfileId: traineeProfile.id, departmentId: internalMedDept.id },
  });

  if (!activeRotation) {
    activeRotation = await prisma.rotation.create({
      data: {
        organizationId: hospital.id,
        traineeProfileId: traineeProfile.id,
        departmentId: internalMedDept.id,
        trainerProfileId: trainerProfile.id,
        startDate,
        endDate,
        status: 'active',
        completionNotes: 'روتيشن الباطنية العامة — تحت إشراف د. خليل الغامدي والمشرف د. فهد المطيري',
      },
    });
  } else {
    activeRotation = await prisma.rotation.update({
      where: { id: activeRotation.id },
      data: {
        trainerProfileId: trainerProfile.id,
        status: 'active',
        startDate,
        endDate,
      },
    });
  }

  // 8. Seed sample Clinical Case Log for the trainee
  console.log('📌 Seeding linked Clinical Case Log...');
  let caseLog = await prisma.clinicalCaseLog.findFirst({
    where: { traineeProfileId: traineeProfile.id },
  });

  if (!caseLog) {
    caseLog = await prisma.clinicalCaseLog.create({
      data: {
        organizationId: hospital.id,
        traineeProfileId: traineeProfile.id,
        trainerProfileId: trainerProfile.id,
        rotationId: activeRotation.id,
        departmentId: internalMedDept.id,
        diagnosis: 'Acute Coronary Syndrome — Chest Pain Evaluation',
        patientAge: 54,
        patientGender: 'ذكر',
        specialtyAr: 'قسم الباطنية العام والطوارئ',
        complexity: 'high',
        participationLevel: 'performed',
        notes: 'تم فحص الحالة وإجراء تخطيط القلب وعرض النتائج على الاستشاري د. خليل الغامدي',
        status: 'submitted',
        performedAt: new Date(),
      },
    });
  }

  console.log('✅ Demo Accounts Successfully Seeded and Linked!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding demo accounts:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
