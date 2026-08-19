// ============================================================================
// مِران (Miran) — Production-like System Seed Script (v3.5)
// Real-world demo data centered on:
// 1. تجمع الحدود الشمالية الصحي (Northern Borders Health Cluster)
// 2. جامعة الحدود الشمالية (Northern Border University)
// 3. مستشفى برج الشمال الطبي (North Tower Medical Complex)
// ============================================================================

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { devSeedPassword } from './dev-password';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Miran Platform Production-like Seed...');

  // --------------------------------------------------------------------------
  // 1. ORGANIZATION TYPES (أنواع الجهات)
  // --------------------------------------------------------------------------
  console.log('📦 Seeding OrganizationTypes...');

  const orgTypes = [
    { code: 'holding', nameAr: 'شركة الصحة القابضة', nameEn: 'Health Holding Company', icon: 'domain', sortOrder: 1, canHaveChildren: true, allowedChildTypes: ['cluster', 'university'], autoCreateRole: 'holding_administrator' },
    { code: 'cluster', nameAr: 'تجمع صحي', nameEn: 'Health Cluster', icon: 'account_tree', sortOrder: 2, canHaveChildren: true, allowedChildTypes: ['hospital', 'specialty_center', 'phc'], autoCreateRole: 'cluster_administrator' },
    { code: 'hospital', nameAr: 'مستشفى / مجمع طبي', nameEn: 'Hospital / Medical Complex', icon: 'local_hospital', sortOrder: 3, canHaveChildren: true, allowedChildTypes: ['department'], autoCreateRole: 'hospital_administrator' },
    { code: 'university', nameAr: 'جامعة', nameEn: 'University', icon: 'school', sortOrder: 4, canHaveChildren: true, allowedChildTypes: ['college'], autoCreateRole: 'university_administrator' },
    { code: 'college', nameAr: 'كلية صحية', nameEn: 'Health College', icon: 'menu_book', sortOrder: 5, canHaveChildren: true, allowedChildTypes: ['department'], autoCreateRole: 'academic_affairs' },
    { code: 'specialty_center', nameAr: 'مركز تخصصي', nameEn: 'Specialty Center', icon: 'medical_services', sortOrder: 6, canHaveChildren: true, allowedChildTypes: ['department'], autoCreateRole: 'hospital_administrator' },
    { code: 'department', nameAr: 'قسم سريري / إداري', nameEn: 'Department', icon: 'corporate_fare', sortOrder: 9, canHaveChildren: false, allowedChildTypes: [] },
  ];

  const createdTypes: Record<string, string> = {};
  for (const ot of orgTypes) {
    const record = await prisma.organizationType.upsert({
      where: { code: ot.code },
      create: ot,
      update: ot,
    });
    createdTypes[ot.code] = record.id;
  }

  // --------------------------------------------------------------------------
  // 2. ROLES (الأدوار الموحدة بالنظام)
  // --------------------------------------------------------------------------
  console.log('🎭 Seeding Roles...');

  const roles = [
    { code: 'platform_owner', nameAr: 'مدير المنصة الإلكترونية', nameEn: 'Platform Owner', hierarchyLevel: 100, isSystem: true },
    { code: 'system_admin', nameAr: 'مدير النظام التنفيذي', nameEn: 'System Administrator', hierarchyLevel: 95, isSystem: true },
    { code: 'holding_administrator', nameAr: 'مدير الصحة القابضة', nameEn: 'Holding Administrator', hierarchyLevel: 90, isSystem: true },
    { code: 'cluster_administrator', nameAr: 'مدير التجمع الصحي', nameEn: 'Cluster Administrator', hierarchyLevel: 80, isSystem: true },
    { code: 'hospital_administrator', nameAr: 'مدير المستشفى / المركز', nameEn: 'Hospital Administrator', hierarchyLevel: 70, isSystem: true },
    { code: 'university_administrator', nameAr: 'مدير الجامعة', nameEn: 'University Administrator', hierarchyLevel: 70, isSystem: true },
    { code: 'academic_affairs', nameAr: 'مشرف الشؤون الأكاديمية', nameEn: 'Academic Affairs Supervisor', hierarchyLevel: 60, isSystem: true },
    { code: 'training_director', nameAr: 'مدير الشؤون التدريبية', nameEn: 'Training Director', hierarchyLevel: 60, isSystem: true },
    { code: 'hospital_training_admin', nameAr: 'مدير تدريب المستشفى', nameEn: 'Hospital Training Manager', hierarchyLevel: 65, isSystem: true },
    { code: 'academic_supervisor', nameAr: 'مشرف أكاديمي', nameEn: 'Academic Supervisor', hierarchyLevel: 40, isSystem: true },
    { code: 'trainer', nameAr: 'مدرب ميداني', nameEn: 'Trainer', hierarchyLevel: 30, isSystem: true },
    { code: 'trainee', nameAr: 'متدرب / طبيب امتياز', nameEn: 'Trainee / Intern', hierarchyLevel: 10, isSystem: true },
    { code: 'org_manager', nameAr: 'مدير الجهة', nameEn: 'Organization Manager', hierarchyLevel: 75, isSystem: true },
  ];

  const createdRoles: Record<string, string> = {};
  for (const r of roles) {
    const record = await prisma.role.upsert({
      where: { code: r.code },
      create: r,
      update: r,
    });
    createdRoles[r.code] = record.id;
  }

  const devPassword = devSeedPassword();
  const defaultPasswordHash = await bcrypt.hash(devPassword, 10);

  // --------------------------------------------------------------------------
  // 3. ORGANIZATIONS (تجمع الحدود الشمالية + جامعة الحدود الشمالية + برج الشمال)
  // --------------------------------------------------------------------------
  console.log('🏰 Seeding Real Organizations...');

  // Health Holding Company
  const holdingOrg = await prisma.organization.upsert({
    where: { code: 'HEALTH-HOLDING' },
    create: {
      organizationTypeId: createdTypes['holding'],
      code: 'HEALTH-HOLDING',
      nameAr: 'شركة الصحة القابضة',
      nameEn: 'Health Holding Company',
      status: 'active',
      cityAr: 'الرياض',
      regionAr: 'الرياض',
      contactEmail: 'info@healthholding.sa',
    },
    update: {},
  });

  // Northern Borders Health Cluster (تجمع الحدود الشمالية الصحي)
  const clusterOrg = await prisma.organization.upsert({
    where: { code: 'NB-CLUSTER' },
    create: {
      organizationTypeId: createdTypes['cluster'],
      parentId: holdingOrg.id,
      code: 'NB-CLUSTER',
      nameAr: 'تجمع الحدود الشمالية الصحي',
      nameEn: 'Northern Borders Health Cluster',
      status: 'active',
      cityAr: 'عرعر',
      regionAr: 'الحدود الشمالية',
      contactEmail: 'contact@nbhc.health.sa',
      contactPhone: '+966146620000',
    },
    update: {},
  });

  // North Tower Medical Complex (مستشفى برج الشمال الطبي)
  const northTowerHosp = await prisma.organization.upsert({
    where: { code: 'HOSP-NORTH-TOWER' },
    create: {
      organizationTypeId: createdTypes['hospital'],
      parentId: clusterOrg.id,
      code: 'HOSP-NORTH-TOWER',
      nameAr: 'مستشفى برج الشمال الطبي',
      nameEn: 'North Tower Medical Complex',
      status: 'active',
      cityAr: 'عرعر',
      regionAr: 'الحدود الشمالية',
      contactEmail: 'northtower@nbhc.health.sa',
      contactPhone: '+966146621111',
    },
    update: {},
  });

  // Northern Border University (جامعة الحدود الشمالية)
  const uniOrg = await prisma.organization.upsert({
    where: { code: 'NBU-UNIVERSITY' },
    create: {
      organizationTypeId: createdTypes['university'],
      code: 'NBU-UNIVERSITY',
      nameAr: 'جامعة الحدود الشمالية',
      nameEn: 'Northern Border University',
      status: 'active',
      cityAr: 'عرعر',
      regionAr: 'الحدود الشمالية',
      contactEmail: 'info@nbu.edu.sa',
      contactPhone: '+966146614444',
    },
    update: {},
  });

  // --------------------------------------------------------------------------
  // 4. CLINICAL DEPARTMENTS (الأقسام السريرية بمستشفى برج الشمال الطبي)
  // --------------------------------------------------------------------------
  console.log('🩺 Seeding Clinical Departments at North Tower Complex...');

  const deptInternal = await prisma.department.upsert({
    where: { id: 'a0000000-0000-0000-0000-000000000001' },
    create: {
      id: 'a0000000-0000-0000-0000-000000000001',
      organizationId: northTowerHosp.id,
      nameAr: 'قسم الباطنة العامة — برج الشمال',
      nameEn: 'General Internal Medicine Department',
      code: 'NT-INT-MED',
      capacity: 25,
      roundLocation: 'برج الشمال — البرج الطبي الدور الرابع',
      roundTime: '08:00',
      meetingRoom: 'قاعة الأطباء المقيمين ٤٠١',
      isActive: true,
    },
    update: {
      nameAr: 'قسم الباطنة العامة — برج الشمال',
      organizationId: northTowerHosp.id,
    },
  });

  const deptPediatrics = await prisma.department.upsert({
    where: { id: 'a0000000-0000-0000-0000-000000000002' },
    create: {
      id: 'a0000000-0000-0000-0000-000000000002',
      organizationId: northTowerHosp.id,
      nameAr: 'قسم طب الأطفال الحديث — برج الشمال',
      nameEn: 'Pediatric Department',
      code: 'NT-PED-MED',
      capacity: 20,
      roundLocation: 'برج الشمال — جناح الأطفال الدور الثالث',
      roundTime: '08:30',
      meetingRoom: 'قاعة الأطفال ٣٠٥',
      isActive: true,
    },
    update: {
      nameAr: 'قسم طب الأطفال الحديث — برج الشمال',
      organizationId: northTowerHosp.id,
    },
  });

  const deptSurgery = await prisma.department.upsert({
    where: { id: 'a0000000-0000-0000-0000-000000000003' },
    create: {
      id: 'a0000000-0000-0000-0000-000000000003',
      organizationId: northTowerHosp.id,
      nameAr: 'قسم الجراحة العامة وجراحة اليوم الواحد',
      nameEn: 'General Surgery & Day Surgery Department',
      code: 'NT-SURGERY',
      capacity: 20,
      roundLocation: 'برج الشمال — جناح الجراحة الدور الخامس',
      roundTime: '06:30',
      meetingRoom: 'غرفة مناقشة الحالات الجراحية',
    },
    update: {},
  });

  const deptER = await prisma.department.upsert({
    where: { id: 'a0000000-0000-0000-0000-000000000004' },
    create: {
      id: 'a0000000-0000-0000-0000-000000000004',
      organizationId: northTowerHosp.id,
      nameAr: 'قسم الطوارئ والحوادث المتقدمة',
      nameEn: 'Advanced Emergency & Trauma Department',
      code: 'NT-ER',
      capacity: 30,
      roundLocation: 'برج الشمال — الدور الأرضي مدخل الطوارئ',
      roundTime: '07:00',
      meetingRoom: 'غرفة تسليم الشيفتات العاجلة',
      isActive: true,
    },
    update: {
      nameAr: 'قسم الطوارئ والحوادث المتقدمة',
      organizationId: northTowerHosp.id,
    },
  });

  // --------------------------------------------------------------------------
  // 5. USER ACCOUNTS FOR ALL 6 PRIMARY ROLES
  // --------------------------------------------------------------------------
  console.log('👥 Seeding Comprehensive User Accounts for All Roles...');

  const accountsSeedConfig = [
    // 1. Platform Owner
    {
      natId: '1000000000',
      nameAr: 'مدير المنصة الإلكترونية',
      email: 'platform@miran.health',
      username: 'platform',
      roleCode: 'platform_owner',
      orgId: holdingOrg.id,
    },
    // 2. Holding Administrator
    {
      natId: '1000000010',
      nameAr: 'مدير شركة الصحة القابضة',
      email: 'holding@miran.health',
      username: 'holdingadmin',
      roleCode: 'holding_administrator',
      orgId: holdingOrg.id,
    },
    // 3. Cluster Administrator
    {
      natId: '1000000001',
      nameAr: 'مدير التدريب بالتجمع الصحي',
      email: 'cluster@miran.health',
      username: 'clusteradmin',
      roleCode: 'cluster_administrator',
      orgId: clusterOrg.id,
    },
    // 4. University Administrator
    {
      natId: '1000000099',
      nameAr: 'مدير جامعة الحدود الشمالية',
      email: 'uni.admin@nbu.edu.sa',
      username: 'uniadmin',
      roleCode: 'university_administrator',
      orgId: uniOrg.id,
    },
    // 5. Hospital Director
    {
      natId: '1000000097',
      nameAr: 'مدير مستشفى برج الشمال',
      email: 'hospital.director@miran.health',
      username: 'hospitaldirector',
      roleCode: 'hospital_administrator',
      orgId: northTowerHosp.id,
    },
    // 6. Hospital Supervisor (Training Supervisor)
    {
      natId: '1000000003',
      nameAr: 'د. فهد المطيري — مدير تدريب مستشفى برج الشمال',
      email: 'hospital.supervisor@miran.health',
      username: 'hospitalsupervisor',
      roleCode: 'hospital_training_admin',
      orgId: northTowerHosp.id,
    },
    // 7. Trainer
    {
      natId: '1011111111',
      nameAr: 'د. سالم العتيبي — استشاري الباطنية',
      email: 'salem@miran.health',
      username: 'drsalem',
      roleCode: 'trainer',
      orgId: northTowerHosp.id,
    },
    // 8. Trainee
    {
      natId: '1022222222',
      nameAr: 'طبيب امتياز عبدالله المطيري',
      email: 'abdullah@miran.health',
      username: 'abdullah',
      roleCode: 'trainee',
      orgId: northTowerHosp.id,
    },
    // 9. Academic Supervisor
    {
      natId: '1000000002',
      nameAr: 'د. خالد الأكاديمي — مشرف أكاديمي',
      email: 'academic@nbu.edu.sa',
      username: 'academicsupervisor',
      roleCode: 'academic_supervisor',
      orgId: uniOrg.id,
    },
  ];

  const createdUserMap: Record<string, any> = {};

  for (const cfg of accountsSeedConfig) {
    const person = await prisma.person.upsert({
      where: { nationalId: cfg.natId },
      create: {
        nationalId: cfg.natId,
        nameAr: cfg.nameAr,
        email: cfg.email,
        phone: `+9665${cfg.natId.slice(2, 9)}`,
      },
      update: {
        nameAr: cfg.nameAr,
        email: cfg.email,
      },
    });

    const userAccount = await prisma.userAccount.upsert({
      where: { email: cfg.email },
      create: {
        personId: person.id,
        email: cfg.email,
        username: cfg.username,
        passwordHash: defaultPasswordHash,
        isEmailVerified: true,
        isActive: true,
      },
      update: {
        personId: person.id,
        passwordHash: defaultPasswordHash,
        isActive: true,
      },
    });

    // Reset previous organizations and roles to guarantee 100% clean isolation
    await prisma.userOrganization.deleteMany({ where: { userAccountId: userAccount.id } });
    await prisma.userRole.deleteMany({ where: { userAccountId: userAccount.id } });

    await prisma.userOrganization.create({
      data: {
        userAccountId: userAccount.id,
        organizationId: cfg.orgId,
        isPrimary: true,
        isActive: true,
      },
    });

    await prisma.userRole.create({
      data: {
        userAccountId: userAccount.id,
        roleId: createdRoles[cfg.roleCode],
        organizationId: cfg.orgId,
      },
    });

    createdUserMap[cfg.roleCode] = { person, userAccount };
  }

  // --------------------------------------------------------------------------
  // 6. PROFILES (TRAINER & TRAINEE PROFILES)
  // --------------------------------------------------------------------------
  console.log('🩺 Seeding Trainer & Trainee Profiles...');

  const trainerProfile = await prisma.trainerProfile.upsert({
    where: { personId: createdUserMap['trainer'].person.id },
    create: {
      personId: createdUserMap['trainer'].person.id,
      organizationId: northTowerHosp.id,
      departmentId: deptInternal.id,
      titleAr: 'استشاري ورئيس قسم الباطنية — برج الشمال',
      titleEn: 'Consultant & Head of Internal Medicine',
      extensionNumber: '7011',
      maxTrainees: 8,
      specialization: 'Internal Medicine & Critical Care',
    },
    update: {},
  });

  const traineeProfile = await prisma.traineeProfile.upsert({
    where: { personId: createdUserMap['trainee'].person.id },
    create: {
      personId: createdUserMap['trainee'].person.id,
      organizationId: northTowerHosp.id,
      traineeNumber: 'NBU-INT-2026-091',
      level: 'intern',
      specialtyAr: 'طبيب امتياز — طب وجراحة عامة',
      specialtyEn: 'MBBS Medical Intern',
      applicationStatus: 'approved',
      cardStatus: 'active',
      cardUuid: 'CARD-NBU-NT-9901',
      photoApproved: true,
    },
    update: {},
  });

  // Date Helper
  const now = new Date();
  const startDate = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
  const endDate = new Date(now.getTime() + 40 * 24 * 60 * 60 * 1000);

  // --------------------------------------------------------------------------
  // 7. ACADEMIC PROGRAM & BATCH (جامعة الحدود الشمالية — دفعة 2027)
  // --------------------------------------------------------------------------
  console.log('🎓 Seeding NBU Academic Program & 2027 Internship Batch...');

  const nbuProgram = await prisma.program.upsert({
    where: { id: 'b0000000-0000-0000-0000-000000000001' },
    create: {
      id: 'b0000000-0000-0000-0000-000000000001',
      organizationId: uniOrg.id,
      code: 'MBBS-INT-2027',
      nameAr: 'برنامج امتياز الطب والجراحة العامة 2027',
      nameEn: 'MBBS Medical Internship Program 2027',
      programType: 'internship',
      durationMonths: 12,
    },
    update: {},
  });

  await prisma.academicIntake.upsert({
    where: { id: 'c0000000-0000-0000-0000-000000000001' },
    create: {
      id: 'c0000000-0000-0000-0000-000000000001',
      organizationId: uniOrg.id,
      programId: nbuProgram.id,
      code: 'INTAKE-NBU-2027',
      nameAr: 'دفعة أطباء الامتياز — 2026/2027',
      nameEn: 'Medical Intern Batch 2026/2027',
      academicYear: '2026/2027',
      capacity: 50,
      startDate: startDate,
      endDate: endDate,
      status: 'active',
    },
    update: {},
  });

  // Additional Hospitals under Northern Borders Health Cluster
  const rafhaHosp = await prisma.organization.upsert({
    where: { code: 'HOSP-RAFHA' },
    create: {
      organizationTypeId: createdTypes['hospital'],
      parentId: clusterOrg.id,
      code: 'HOSP-RAFHA',
      nameAr: 'مستشفى رفحاء المركزي',
      nameEn: 'Rafha General Hospital',
      status: 'active',
      cityAr: 'رفحاء',
      regionAr: 'الحدود الشمالية',
    },
    update: {},
  });

  const turaifHosp = await prisma.organization.upsert({
    where: { code: 'HOSP-TURAIF' },
    create: {
      organizationTypeId: createdTypes['hospital'],
      parentId: clusterOrg.id,
      code: 'HOSP-TURAIF',
      nameAr: 'مستشفى طريف العام',
      nameEn: 'Turaif General Hospital',
      status: 'active',
      cityAr: 'طريف',
      regionAr: 'الحدود الشمالية',
    },
    update: {},
  });

  // --------------------------------------------------------------------------
  // 8. ROTATIONS & SCHEDULES
  // --------------------------------------------------------------------------
  console.log('🔄 Seeding Active Rotations...');

  const activeRotation = await prisma.rotation.upsert({
    where: { id: 'e0000000-0000-0000-0000-000000000001' },
    create: {
      id: 'e0000000-0000-0000-0000-000000000001',
      organizationId: northTowerHosp.id,
      traineeProfileId: traineeProfile.id,
      departmentId: deptInternal.id,
      trainerProfileId: trainerProfile.id,
      startDate: startDate,
      endDate: endDate,
      status: 'active',
      midpointMeetingDone: true,
    },
    update: {
      organizationId: northTowerHosp.id,
      traineeProfileId: traineeProfile.id,
      departmentId: deptInternal.id,
      trainerProfileId: trainerProfile.id,
      startDate,
      endDate,
      status: 'active',
    },
  });

  // --------------------------------------------------------------------------
  // 9. ATTENDANCE RECORD (Check-In / Check-Out with GPS & QR Code)
  // --------------------------------------------------------------------------
  console.log('📍 Seeding Attendance Check-in Record with GPS/QR...');

  await prisma.attendance.deleteMany({ where: { traineeProfileId: traineeProfile.id } });
  await prisma.attendance.createMany({
    data: Array.from({ length: 7 }).map((_, i) => {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      return {
        organizationId: northTowerHosp.id,
        traineeProfileId: traineeProfile.id,
        date,
        checkIn: new Date(date.getTime() + 7 * 60 * 60 * 1000 + (i === 2 ? 20 * 60 * 1000 : 0)),
        checkOut: new Date(date.getTime() + 15 * 60 * 60 * 1000),
        method: i % 2 ? 'gps' : 'qr',
        geoLat: 30.9753,
        geoLng: 41.0381,
        isLate: i === 2,
        lateMinutes: i === 2 ? 20 : null,
        status: i === 5 ? 'correction_requested' : 'present',
        excuseReason: i === 5 ? 'طلب تعديل وقت الانصراف بعد اعتماد المشرف' : null,
      };
    }),
  });

  // --------------------------------------------------------------------------
  // 10. EMERGENCY CALLS & CLINICAL CASE LOG
  // --------------------------------------------------------------------------
  console.log('🚨 Seeding M-CALL Field Emergency Call & Clinical Case Log...');

  const emergencyCall = await prisma.trainerCall.create({
    data: {
      organizationId: northTowerHosp.id,
      departmentId: deptInternal.id,
      trainerProfileId: trainerProfile.id,
      callType: 'cardiac_arrest',
      customTitle: 'نداء طوارئ سريري حرج — توقف قلب في العناية المركزة',
      note: 'حالة Cardiac Arrest في العناية المركزة غرفة ٤٠٢ — يرجى الاستجابة فوراً',
      location: 'مستشفى برج الشمال — الدور الرابع غرفة ٤٠٢',
      expectedMinutes: 10,
      launchedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      status: 'active',
    },
  });

  await prisma.callParticipant.create({
    data: {
      callId: emergencyCall.id,
      traineeProfileId: traineeProfile.id,
      state: 'confirmed_arrived',
      notifiedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      ackAt: new Date(now.getTime() - 118 * 60 * 1000),
      selfArrivedAt: new Date(now.getTime() - 114 * 60 * 1000),
      confirmedAt: new Date(now.getTime() - 110 * 60 * 1000),
    },
  });

  // Clinical Case Log linked to Trainee, Trainer, Dept
  const procedures = [
    ['PROC-MINICEX', 'Mini-CEX: عرض حالة سريرية مركزة', 'Mini-CEX Case Presentation', 'Evaluation', 3],
    ['PROC-DOPS', 'DOPS: إجراء وريدي وتوثيق سلامة المريض', 'DOPS IV Procedure', 'National Procedures', 5],
    ['PROC-CBD', 'CBD: مناقشة حالة سريرية', 'Case Based Discussion', 'Evaluation', 3],
    ['PROC-CPR', 'الإنعاش القلبي الرئوي المتقدم', 'Advanced CPR', 'Emergency', 2],
  ];
  const createdProcedures: any[] = [];
  for (const [code, titleAr, titleEn, category, minRequired] of procedures) {
    createdProcedures.push(await prisma.procedureCatalog.upsert({
      where: { code: String(code) },
      create: { code: String(code), titleAr: String(titleAr), titleEn: String(titleEn), category: String(category), minRequired: Number(minRequired) },
      update: { titleAr: String(titleAr), titleEn: String(titleEn), category: String(category), minRequired: Number(minRequired), isActive: true },
    }));
  }

  await prisma.clinicalCaseLog.deleteMany({ where: { traineeProfileId: traineeProfile.id } });
  const caseLog = await prisma.clinicalCaseLog.create({
    data: {
      organizationId: northTowerHosp.id,
      traineeProfileId: traineeProfile.id,
      trainerProfileId: trainerProfile.id,
      rotationId: activeRotation.id,
      departmentId: deptInternal.id,
      procedureId: createdProcedures[3].id,
      diagnosis: 'Acute Cardiac Arrest & CPR Resuscitation',
      notes: 'تم إجراء إنعاش قلبي رئوي متقدم وتوثيق الحالة في السجل السريري.',
      evidenceUrls: ['stored-files://qa/cpr-note.pdf', 'stored-files://qa/ecg-image.png'],
      status: 'submitted',
    },
  });
  await prisma.logbookSignoff.create({
    data: {
      caseLogId: caseLog.id,
      signerId: createdUserMap['trainer'].userAccount.id,
      signerRole: 'trainer',
      feedback: 'جاهز للمراجعة النهائية بعد إرفاق تقرير ECG.',
      signatureUrl: 'stored-files://signatures/trainer-salem.png',
    },
  });
  for (const proc of createdProcedures) {
    await prisma.competencyProgress.upsert({
      where: { traineeProfileId_procedureId: { traineeProfileId: traineeProfile.id, procedureId: proc.id } },
      create: { traineeProfileId: traineeProfile.id, procedureId: proc.id, requiredCount: proc.minRequired, completedCount: proc.code === 'PROC-CPR' ? 1 : 0, status: proc.code === 'PROC-CPR' ? 'in_progress' : 'pending' },
      update: { requiredCount: proc.minRequired, completedCount: proc.code === 'PROC-CPR' ? 1 : 0, status: proc.code === 'PROC-CPR' ? 'in_progress' : 'pending' },
    });
  }

  // --------------------------------------------------------------------------
  // 11. EVALUATIONS & AUDIT LOGS
  // --------------------------------------------------------------------------
  console.log('📝 Seeding Clinical Evaluation & System Audit Trail...');

  const evaluationTypes = [
    ['mini_cex', 'Mini-CEX'],
    ['dops', 'DOPS'],
    ['cbd', 'CBD'],
    ['360', '360 Feedback'],
    ['mid_rotation', 'Mid Rotation'],
    ['end_rotation', 'End Rotation'],
  ];
  const evalForms: any[] = [];
  for (let i = 0; i < evaluationTypes.length; i++) {
    const [formType, nameEn] = evaluationTypes[i];
    evalForms.push(await prisma.evaluationForm.upsert({
      where: { id: `d0000000-0000-0000-0000-00000000000${i + 1}` },
      create: {
        id: `d0000000-0000-0000-0000-00000000000${i + 1}`,
        organizationId: northTowerHosp.id,
        nameAr: `استمارة ${nameEn}`,
        nameEn,
        formType,
        items: [{ code: 'clinical_reasoning', max: 5 }, { code: 'professionalism', max: 5 }],
      },
      update: { organizationId: northTowerHosp.id, nameAr: `استمارة ${nameEn}`, nameEn, formType, isActive: true },
    }));
  }

  await prisma.evaluation.deleteMany({ where: { evaluateeId: createdUserMap['trainee'].userAccount.id } });
  await prisma.evaluation.create({
    data: {
      organizationId: northTowerHosp.id,
      formId: evalForms[0].id,
      rotationId: activeRotation.id,
      evaluatorId: createdUserMap['trainer'].userAccount.id,
      evaluateeId: createdUserMap['trainee'].userAccount.id,
      evaluationType: 'mini_cex',
      scores: {
        professionalism: 5,
        communication: 5,
        clinicalJudgment: 4.8,
        patientSafety: 5,
        leadership: 4.9,
        decisionMaking: 4.8,
      },
      totalScore: 4.92,
      comments: 'طبيب امتياز متميز جداً، ملتزم وسريع الاستجابة للنداءات ودقيق في التعامل السريري.',
      submittedAt: new Date(),
    },
  });

  await prisma.task.deleteMany({ where: { organizationId: northTowerHosp.id } });
  await prisma.task.createMany({
    data: [
      { organizationId: northTowerHosp.id, assignedToId: createdUserMap['trainee'].userAccount.id, assignedById: createdUserMap['trainer'].userAccount.id, titleAr: 'إكمال مرفق ECG للحالة السريرية', description: 'رفع صورة ECG وتقرير PDF للحالة المسجلة', dueDate: endDate, priority: 'high', referenceType: 'ClinicalCaseLog', referenceId: caseLog.id },
      { organizationId: northTowerHosp.id, assignedToId: createdUserMap['trainer'].userAccount.id, assignedById: createdUserMap['hospital_training_admin'].userAccount.id, titleAr: 'مراجعة طلب تصحيح الحضور', description: 'اعتماد أو رفض طلب التصحيح المرسل من المتدرب', dueDate: endDate, priority: 'normal', referenceType: 'Attendance' },
    ],
  });

  await prisma.notification.deleteMany({ where: { organizationId: northTowerHosp.id } });
  await prisma.notification.createMany({
    data: [
      { organizationId: northTowerHosp.id, userId: createdUserMap['trainee'].userAccount.id, titleAr: 'تم تعيين مهمة تدريبية', bodyAr: 'يرجى رفع مرفقات الحالة السريرية.', type: 'task', referenceType: 'Task', sentVia: 'in_app' },
      { organizationId: northTowerHosp.id, userId: createdUserMap['trainer'].userAccount.id, titleAr: 'طلب تصحيح حضور بانتظارك', bodyAr: 'يوجد طلب تصحيح حضور يحتاج مراجعة.', type: 'attendance', referenceType: 'Attendance', sentVia: 'in_app' },
      { organizationId: northTowerHosp.id, userId: createdUserMap['hospital_administrator'].userAccount.id, titleAr: 'تقرير شهري جاهز للمراجعة', bodyAr: 'تم تحديث مؤشرات الحضور والتقييمات.', type: 'report', referenceType: 'GeneratedReport', sentVia: 'in_app' },
    ],
  });

  const reportDefs = [
    ['attendance_monthly', 'تقرير الحضور الشهري', 'Monthly Attendance', 'attendance', 'xlsx'],
    ['competencies_progress', 'تقرير الكفاءات', 'Competencies Progress', 'competencies', 'xlsx'],
    ['evaluations_summary', 'تقرير التقييمات', 'Evaluations Summary', 'evaluations', 'pdf'],
    ['logbook_weekly', 'تقرير السجل السريري', 'Clinical Logbook', 'logbook', 'pdf'],
    ['procedures_required', 'تقرير الإجراءات المطلوبة', 'Required Procedures', 'procedures', 'xlsx'],
  ];
  for (const [code, nameAr, nameEn, reportType, defaultFormat] of reportDefs) {
    await prisma.reportDefinition.upsert({
      where: { code },
      create: { organizationId: northTowerHosp.id, code, nameAr, nameEn, reportType, defaultFormat, queryTemplate: {}, isSystem: true, isActive: true },
      update: { organizationId: northTowerHosp.id, nameAr, nameEn, reportType, defaultFormat, isActive: true },
    });
  }

  // --------------------------------------------------------------------------
  // LOOKUP TABLES — controlled specialty list (used by validation + capacity)
  // --------------------------------------------------------------------------
  console.log('📚 Seeding Specialty Lookup...');

  const specialties = [
    ['internal_medicine', 'الباطنية', 'Internal Medicine'],
    ['emergency_medicine', 'طب الطوارئ', 'Emergency Medicine'],
    ['pediatrics', 'الأطفال', 'Pediatrics'],
    ['surgery', 'الجراحة', 'Surgery'],
    ['orthopedics', 'جراحة العظام', 'Orthopedics'],
    ['icu', 'العناية المركزة', 'Intensive Care Unit'],
    ['obgyn', 'النساء والولادة', 'Obstetrics & Gynecology'],
    ['dentistry', 'طب الأسنان', 'Dentistry'],
    ['pharmacy', 'الصيدلة', 'Pharmacy'],
    ['nursing', 'التمريض', 'Nursing'],
    ['laboratory', 'المختبرات', 'Laboratory Medicine'],
    ['radiology', 'الأشعة', 'Radiology'],
    ['physiotherapy', 'العلاج الطبيعي', 'Physiotherapy'],
  ];
  for (const [index, [code, nameAr, nameEn]] of specialties.entries()) {
    await prisma.lookupTable.upsert({
      where: { category_code: { category: 'specialty', code } },
      create: { category: 'specialty', code, nameAr, nameEn, sortOrder: index + 1, isActive: true },
      update: { nameAr, nameEn, sortOrder: index + 1, isActive: true },
    });
  }

  // Document types required for internship submission (Stages 1/2/6)
  const documentTypes = [
    ['national_id', 'الهوية الوطنية', 'National ID'],
    ['internship_letter', 'خطاب الامتياز', 'Internship Letter'],
    ['academic_transcript', 'السجل الأكاديمي', 'Academic Transcript'],
    ['medical_examination', 'الفحص الطبي', 'Medical Examination'],
    ['vaccination_record', 'سجل التطعيمات', 'Vaccination Record'],
    ['cpr_certificate', 'شهادة الإنعاش القلبي CPR', 'CPR Certificate'],
    ['bls', 'شهادة BLS', 'Basic Life Support'],
    ['acls', 'شهادة ACLS', 'Advanced Cardiac Life Support'],
    ['license', 'الرخصة المهنية', 'Professional License'],
    ['additional', 'مرفقات إضافية', 'Additional Documents'],
  ];
  for (const [index, [code, nameAr, nameEn]] of documentTypes.entries()) {
    await prisma.lookupTable.upsert({
      where: { category_code: { category: 'document_type', code } },
      create: { category: 'document_type', code, nameAr, nameEn, sortOrder: index + 1, isActive: true },
      update: { nameAr, nameEn, sortOrder: index + 1, isActive: true },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: northTowerHosp.id,
      actorId: createdUserMap['platform_owner'].userAccount.id,
      action: 'WORKFLOW_V5_SEED_COMPLETE',
      entityType: 'PLATFORM',
      entityId: holdingOrg.id,
      newValues: { message: 'تم تجهيز الدورة الكاملة لتدريب الامتياز من الجامعة وحتى الاعتماد النهائي بنجاح.' },
    },
  });

  // --------------------------------------------------------------------------
  // Hierarchy closure backfill
  // --------------------------------------------------------------------------
  // OrganizationHierarchyService.addNode() is only invoked when organizations
  // are created through the provisioning service. Orgs inserted directly by the
  // seed bypass it, which leaves the closure table empty and silently breaks
  // every getDescendantIds() consumer — including the cluster dashboard's
  // capacity/occupancy statistics (hospitals resolve to zero). Rebuild the
  // full transitive closure from parent_id chains so seeded orgs behave like
  // API-created ones.
  const orgsForClosure = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, parentId: true },
  });
  const byId = new Map(orgsForClosure.map((o) => [o.id, o.parentId]));
  const closureRows: Array<{ ancestorId: string; descendantId: string; depth: number }> = [];
  for (const org of orgsForClosure) {
    closureRows.push({ ancestorId: org.id, descendantId: org.id, depth: 0 });
    let ancestor: string | null = org.parentId;
    let depth = 1;
    while (ancestor && byId.has(ancestor)) {
      closureRows.push({ ancestorId: ancestor, descendantId: org.id, depth });
      const next = byId.get(ancestor);
      if (!next) break;
      ancestor = next;
      depth += 1;
    }
  }
  await prisma.$transaction([
    prisma.organizationHierarchy.deleteMany(),
    prisma.organizationHierarchy.createMany({ data: closureRows }),
  ]);
  console.log(`🏛️  Hierarchy closure rebuilt: ${closureRows.length} rows`);

  console.log('✅ Production-like Seed successfully completed!');
  console.log('========================================================================');
  console.log('📌 1. Platform Owner:       platform@miran.health');
  console.log('📌 2. Holding Admin:        holding@miran.health');
  console.log('📌 3. Cluster Admin:        cluster@miran.health');
  console.log('📌 4. University Admin:     uni.admin@nbu.edu.sa');
  console.log('📌 5. Hospital Director:    hospital.director@miran.health');
  console.log('📌 6. Hospital Training Mgr: hospital.supervisor@miran.health');
  console.log('📌 7. Trainer:              salem@miran.health');
  console.log('📌 8. Trainee:              abdullah@miran.health');
  console.log('📌 9. Academic Supervisor:  academic@nbu.edu.sa');
  console.log('🔑 Password for ALL:        (see DEV_SEED_PASSWORD note printed above)');
  console.log('========================================================================');
}

main()
  .catch((e) => {
    console.error('❌ Seed execution failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
