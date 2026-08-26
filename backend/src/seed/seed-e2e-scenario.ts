// ============================================================================
// End-to-end demo scenario — a relationally connected dataset for the test
// database. Every number any screen shows is derivable from these rows; nothing
// here is a standalone figure invented to fill a card.
//
// Shape:
//   University A ──request(10)──► Cluster A
//                                   ├── Hospital 1: Internal Medicine 5, Paediatrics 3
//                                   └── Hospital 2: Internal Medicine 4
//   Trainers attached to real departments; capacity is the sum of departments.
//
// Accounts, one per role under test, so authorisation can be exercised from each
// vantage point rather than asserted about in the abstract.
//
// TEST DATABASE ONLY. Guarded below against pointing at a managed host.
// ============================================================================

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { devSeedPassword } from './dev-password';

const prisma = new PrismaClient();

export const SCENARIO = {
  // Same rule as every other fixture: the password comes from the environment,
  // and is generated per run when unset. Nothing guessable is committed.
  password: devSeedPassword(),
  accounts: {
    platform: 'e2e.platform@miran.test',
    universityAdmin: 'e2e.uni@miran.test',
    clusterTrainingDirector: 'e2e.director@miran.test',
    hospital1TrainingAdmin: 'e2e.h1.training@miran.test',
    hospital2TrainingAdmin: 'e2e.h2.training@miran.test',
    hospital1Director: 'e2e.h1.director@miran.test',
    hospital1DeptHead: 'e2e.h1.depthead@miran.test',
    hospital1Trainer: 'e2e.h1.trainer@miran.test',
    hospital1Trainer2: 'e2e.h1.trainer2@miran.test',
    hospital2Trainer: 'e2e.h2.trainer@miran.test',
    trainee: 'e2e.trainee@miran.test',
    // The two trainees that carry the rotation, attendance and logbook data the
    // trainee screens read. They existed only as hand-made rows, so their
    // password was not reproducible from the repository and nobody could sign in
    // as them; they are seeded here against their existing national ids so the
    // profiles and rotations already attached to them are adopted, not duplicated.
    student1: 'e2e.stu1@miran.test',
    student2: 'e2e.stu2@miran.test',
    // Reproduces the production shape behind the privilege leak: a hospital
    // account carrying a roleless membership row against the cluster.
    nullContextTrainee: 'e2e.nullctx@miran.test',
  },
  codes: {
    university: 'E2E-UNIV-A',
    cluster: 'E2E-CLUSTER-A',
    hospital1: 'E2E-HOSP-1',
    hospital2: 'E2E-HOSP-2',
    program: 'E2E-PROG-INTERN',
  },
} as const;

function assertTestDatabase() {
  const url = process.env.DATABASE_URL ?? '';
  const managedHostMarkers = ['neon.tech', 'render.com', 'amazonaws.com', 'supabase'];
  const marker = managedHostMarkers.find((m) => url.includes(m));
  if (marker) {
    throw new Error(
      `Refusing to seed: DATABASE_URL points at a managed host (${marker}). ` +
        'This scenario is for the local test database only.',
    );
  }
  if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
    throw new Error(`Refusing to seed: DATABASE_URL is not local (${url.slice(0, 40)}…)`);
  }
}

async function orgType(code: string, nameAr: string) {
  const existing = await prisma.organizationType.findFirst({ where: { code } });
  if (existing) return existing;
  return prisma.organizationType.create({
    data: { code, nameAr, nameEn: code, allowedChildTypes: [] },
  });
}

async function org(params: {
  code: string; nameAr: string; typeId: string; parentId?: string;
}) {
  return prisma.organization.upsert({
    where: { code: params.code },
    update: { parentId: params.parentId, status: 'active' },
    create: {
      code: params.code,
      nameAr: params.nameAr,
      nameEn: params.code,
      organizationTypeId: params.typeId,
      parentId: params.parentId,
      status: 'active',
    },
  });
}

async function account(params: {
  email: string; nameAr: string; nationalId: string;
  roleCode: string; organizationId: string; departmentId?: string;
}) {
  const person = await prisma.person.upsert({
    where: { nationalId: params.nationalId },
    update: { nameAr: params.nameAr },
    create: {
      nationalId: params.nationalId,
      nameAr: params.nameAr,
      nameEn: params.email.split('@')[0],
      dateOfBirth: new Date('1995-01-01'),
      gender: 'male',
      nationality: 'SA',
    },
  });

  const passwordHash = await bcrypt.hash(SCENARIO.password, 10);
  const acct = await prisma.userAccount.upsert({
    where: { email: params.email },
    // Re-seeding an account must leave it signable-in. Failed attempts latch a
    // lockout on the row, and without clearing it here the seed would hand back an
    // account with a known password that still refuses the password.
    update: { passwordHash, isActive: true, loginAttempts: 0, lockedUntil: null },
    create: {
      email: params.email,
      passwordHash,
      personId: person.id,
      isActive: true,
      isEmailVerified: true,
    },
  });

  // A role code with no Role row is exactly the state a removed legacy identity
  // leaves behind (department_head and friends are gone from the model, and are
  // deliberately NOT recreated here). The account is still seeded, roleless, so
  // the authorisation tests can prove it reaches nothing.
  const role = await prisma.role.findUnique({ where: { code: params.roleCode } });
  if (role) {
    await prisma.userRole.upsert({
      where: {
        userAccountId_roleId_organizationId: {
          userAccountId: acct.id, roleId: role.id, organizationId: params.organizationId,
        },
      },
      update: {},
      create: {
        userAccountId: acct.id, roleId: role.id, organizationId: params.organizationId,
      },
    });
  }

  // Seeding an account into a second organisation used to mark that membership
  // primary as well, leaving the account primary in two places at once — which is
  // how the trainees ended up primary in a hospital and in its cluster, making the
  // active organisation depend on row order. Only the first membership becomes
  // primary; a later one joins as secondary unless it is the same row being
  // re-seeded. A partial unique index enforces this at the database level, so
  // without it the second upsert here would now fail outright.
  const existingPrimaryOrg = await prisma.userOrganization.findFirst({
    where: { userAccountId: acct.id, isPrimary: true, isActive: true },
    select: { organizationId: true },
  });
  const isPrimaryOrg =
    !existingPrimaryOrg || existingPrimaryOrg.organizationId === params.organizationId;

  await prisma.userOrganization.upsert({
    where: {
      userAccountId_organizationId: {
        userAccountId: acct.id, organizationId: params.organizationId,
      },
    },
    update: { isActive: true, isPrimary: isPrimaryOrg },
    create: {
      userAccountId: acct.id, organizationId: params.organizationId,
      isPrimary: isPrimaryOrg, isActive: true,
    },
  });

  const existingAssignment = role
    ? await prisma.organizationAssignment.findFirst({
        where: { userAccountId: acct.id, organizationId: params.organizationId, roleId: role.id },
      })
    : null;
  if (role && !existingAssignment) {
    // Same one-primary rule as the membership row above.
    const existingPrimaryAssignment = await prisma.organizationAssignment.findFirst({
      where: { userAccountId: acct.id, isPrimary: true, isActive: true },
      select: { id: true },
    });
    await prisma.organizationAssignment.create({
      data: {
        userAccountId: acct.id,
        organizationId: params.organizationId,
        roleId: role.id,
        departmentId: params.departmentId,
        isPrimary: !existingPrimaryAssignment,
        isActive: true,
        sourceType: 'manual',
      },
    });
  } else if (existingAssignment && params.departmentId && !existingAssignment.departmentId) {
    await prisma.organizationAssignment.update({
      where: { id: existingAssignment.id },
      data: { departmentId: params.departmentId },
    });
  }

  return { account: acct, person };
}

export async function seedE2EScenario() {
  assertTestDatabase();

  const [universityType, clusterType, hospitalType] = await Promise.all([
    orgType('university', 'جامعة'),
    orgType('cluster', 'تجمع صحي'),
    orgType('hospital', 'مستشفى'),
  ]);

  const cluster = await org({
    code: SCENARIO.codes.cluster,
    nameAr: 'إدارة التدريب بالتجمع الصحي أ',
    typeId: clusterType.id,
  });
  const university = await org({
    code: SCENARIO.codes.university,
    nameAr: 'جامعة أ',
    typeId: universityType.id,
  });
  const hospital1 = await org({
    code: SCENARIO.codes.hospital1,
    nameAr: 'مستشفى 1',
    typeId: hospitalType.id,
    parentId: cluster.id,
  });
  const hospital2 = await org({
    code: SCENARIO.codes.hospital2,
    nameAr: 'مستشفى 2',
    typeId: hospitalType.id,
    parentId: cluster.id,
  });

  // A hospital's own capacity column is not the source of truth — the department
  // sum is. Tests that exercise the capacity endpoints write to it, so it is
  // reset here; otherwise a later run inherits the previous run's number and the
  // "capacity equals the sum of its departments" invariant reads as broken.
  await prisma.organization.updateMany({
    where: { id: { in: [hospital1.id, hospital2.id] } },
    data: { capacity: 0 },
  });

  // ── Departments: hospital capacity is their sum, so these are the only
  //    place capacity is declared. H1 = 5 + 3 = 8, H2 = 4.
  const departments = {
    h1Internal: await upsertDepartment(hospital1.id, 'IM', 'الباطنة', 5),
    h1Paediatrics: await upsertDepartment(hospital1.id, 'PAED', 'الأطفال', 3),
    h2Internal: await upsertDepartment(hospital2.id, 'IM', 'الباطنة', 4),
  };

  // Evaluation forms belong to the hospital that grades with them. Without at
  // least one, a trainer has no form to attach a score to and the clinical
  // grading path cannot run at all.
  for (const [i, form] of [
    { formType: 'mid_rotation', nameAr: 'استمارة تقييم منتصف الروتيشن', nameEn: 'Mid Rotation' },
    { formType: 'end_rotation', nameAr: 'استمارة تقييم نهاية الروتيشن', nameEn: 'End Rotation' },
  ].entries()) {
    await prisma.evaluationForm.upsert({
      where: { id: `e2e00000-0000-4000-8000-00000000000${i + 1}` },
      create: {
        id: `e2e00000-0000-4000-8000-00000000000${i + 1}`,
        organizationId: hospital1.id,
        nameAr: form.nameAr,
        nameEn: form.nameEn,
        formType: form.formType,
        items: [{ code: 'clinical_reasoning', max: 5 }, { code: 'professionalism', max: 5 }],
      },
      update: { organizationId: hospital1.id, nameAr: form.nameAr, formType: form.formType, isActive: true },
    });
  }

  // Specialty codes live in the lookup table; the validation engine rejects any
  // trainee row carrying a code that is not registered there.
  for (const sp of [
    { code: 'internal_medicine', nameAr: 'الباطنة' },
    { code: 'paediatrics', nameAr: 'الأطفال' },
  ]) {
    const existing = await prisma.lookupTable.findFirst({
      where: { category: 'specialty', code: sp.code },
    });
    if (!existing) {
      await prisma.lookupTable.create({
        data: { category: 'specialty', code: sp.code, nameAr: sp.nameAr, isActive: true },
      });
    }
  }

  const program = await prisma.program.upsert({
    where: { code: SCENARIO.codes.program },
    update: {},
    create: {
      code: SCENARIO.codes.program,
      nameAr: 'برنامج امتياز الطب',
      nameEn: 'Internship Programme',
      programType: 'internship',
      durationMonths: 12,
    },
  });

  const accounts = {
    platform: await account({
      email: SCENARIO.accounts.platform, nameAr: 'مدير المنصة',
      nationalId: '9100000001', roleCode: 'platform_owner', organizationId: cluster.id,
    }),
    universityAdmin: await account({
      email: SCENARIO.accounts.universityAdmin, nameAr: 'منسق الجامعة',
      nationalId: '9100000002', roleCode: 'university_administrator', organizationId: university.id,
    }),
    director: await account({
      email: SCENARIO.accounts.clusterTrainingDirector, nameAr: 'مدير التدريب بالتجمع',
      nationalId: '9100000003', roleCode: 'training_director', organizationId: cluster.id,
    }),
    h1Training: await account({
      email: SCENARIO.accounts.hospital1TrainingAdmin, nameAr: 'مدير إدارة التدريب بالمستشفى 1',
      nationalId: '9100000004', roleCode: 'hospital_training_admin', organizationId: hospital1.id,
    }),
    h2Training: await account({
      email: SCENARIO.accounts.hospital2TrainingAdmin, nameAr: 'مدير إدارة التدريب بالمستشفى 2',
      nationalId: '9100000005', roleCode: 'hospital_training_admin', organizationId: hospital2.id,
    }),
    h1Director: await account({
      email: SCENARIO.accounts.hospital1Director, nameAr: 'مدير المستشفى 1',
      nationalId: '9100000006', roleCode: 'hospital_administrator', organizationId: hospital1.id,
    }),
    h1DeptHead: await account({
      // Deliberately carries a role code that is NOT part of the model.
      // Every authorisation test using this account asserts it is refused, which
      // is the regression guard for removed roles regaining access.
      email: SCENARIO.accounts.hospital1DeptHead, nameAr: 'حساب بدور ملغى',
      nationalId: '9100000007', roleCode: 'department_head', organizationId: hospital1.id,
      departmentId: departments.h1Internal.id,
    }),
    h1Trainer: await account({
      email: SCENARIO.accounts.hospital1Trainer, nameAr: 'مدرب الباطنة 1',
      nationalId: '9100000008', roleCode: 'trainer', organizationId: hospital1.id,
    }),
    h1Trainer2: await account({
      email: SCENARIO.accounts.hospital1Trainer2, nameAr: 'مدرب الأطفال',
      nationalId: '9100000009', roleCode: 'trainer', organizationId: hospital1.id,
    }),
    h2Trainer: await account({
      email: SCENARIO.accounts.hospital2Trainer, nameAr: 'مدرب مستشفى 2',
      nationalId: '9100000010', roleCode: 'trainer', organizationId: hospital2.id,
    }),
    trainee: await account({
      email: SCENARIO.accounts.trainee, nameAr: 'متدرب تجريبي',
      nationalId: '9100000011', roleCode: 'trainee', organizationId: hospital1.id,
    }),
    nullCtx: await account({
      email: SCENARIO.accounts.nullContextTrainee, nameAr: 'متدرب بسياق بلا دور',
      nationalId: '9100000012', roleCode: 'trainee', organizationId: hospital1.id,
    }),
    // National ids match the rows already in the database, so `account()` upserts
    // the existing person rather than creating a second one — the trainee profile,
    // rotations and attendance hanging off them stay attached.
    student1: await account({
      email: SCENARIO.accounts.student1, nameAr: 'طالب الرحلة الأول',
      nationalId: '1100000001', roleCode: 'trainee', organizationId: hospital1.id,
    }),
    student2: await account({
      email: SCENARIO.accounts.student2, nameAr: 'طالبة الرحلة الثانية',
      nationalId: '1100000002', roleCode: 'trainee', organizationId: hospital1.id,
    }),
  };

  // The leak's precondition: membership of the cluster with no role attached.
  const existingNullCtx = await prisma.organizationAssignment.findFirst({
    where: { userAccountId: accounts.nullCtx.account.id, organizationId: cluster.id },
  });
  if (!existingNullCtx) {
    await prisma.organizationAssignment.create({
      data: {
        userAccountId: accounts.nullCtx.account.id,
        organizationId: cluster.id,
        roleId: null,
        isActive: true,
        isPrimary: false,
        sourceType: 'manual',
      },
    });
  }

  const trainers = {
    h1Internal: await upsertTrainer(
      accounts.h1Trainer.person.id, hospital1.id, departments.h1Internal.id, 3,
    ),
    h1Paediatrics: await upsertTrainer(
      accounts.h1Trainer2.person.id, hospital1.id, departments.h1Paediatrics.id, 3,
    ),
    h2Internal: await upsertTrainer(
      accounts.h2Trainer.person.id, hospital2.id, departments.h2Internal.id, 4,
    ),
  };

  return { cluster, university, hospital1, hospital2, departments, program, accounts, trainers };
}

async function upsertDepartment(
  organizationId: string, code: string, nameAr: string, capacity: number,
) {
  const existing = await prisma.department.findFirst({ where: { organizationId, code } });
  if (existing) {
    return prisma.department.update({
      where: { id: existing.id },
      data: { capacity, isActive: true, nameAr },
    });
  }
  return prisma.department.create({
    data: { organizationId, code, nameAr, capacity, isActive: true },
  });
}

async function upsertTrainer(
  personId: string, organizationId: string, departmentId: string, maxTrainees: number,
) {
  return prisma.trainerProfile.upsert({
    where: { personId },
    update: { organizationId, departmentId, maxTrainees, isActive: true },
    create: { personId, organizationId, departmentId, maxTrainees, isActive: true },
  });
}

/** Removes only this scenario's rows, so reruns are clean and nothing else is touched. */
export async function resetE2EScenario() {
  assertTestDatabase();

  const orgs = await prisma.organization.findMany({
    where: { code: { in: Object.values(SCENARIO.codes) as string[] } },
    select: { id: true },
  });
  const orgIds = orgs.map((o) => o.id);
  if (orgIds.length === 0) return;

  const requests = await prisma.trainingRequest.findMany({
    where: { OR: [{ sourceOrgId: { in: orgIds } }, { targetOrgId: { in: orgIds } }] },
    select: { id: true },
  });
  const requestIds = requests.map((r) => r.id);

  await prisma.traineeAllocation.deleteMany({ where: { clusterOrgId: { in: orgIds } } });
  await prisma.trainingRequestTrainee.deleteMany({
    where: { trainingRequestId: { in: requestIds } },
  });

  // Trainee profiles and persons the tests themselves create — promoting a
  // candidate row to a real profile through the real approval endpoint, for
  // instance — are not part of the seeded scenario, so without this they
  // survive the reset and the next run collides on national_id, academic
  // number and account email. Every profile living in a scenario organisation
  // is treated as test fixture and torn down completely: its operational
  // records, its allocation history, the account and role/membership rows
  // promotion created for it, and finally the person and profile themselves.
  const testProfiles = await prisma.traineeProfile.findMany({
    where: { organizationId: { in: orgIds } },
    select: { id: true, personId: true },
  });
  const testProfileIds = testProfiles.map((p) => p.id);
  const testPersonIds = testProfiles.map((p) => p.personId);

  if (testProfileIds.length > 0) {
    await prisma.rotation.deleteMany({ where: { traineeProfileId: { in: testProfileIds } } });
    await prisma.attendance.deleteMany({ where: { traineeProfileId: { in: testProfileIds } } });
    await prisma.shift.deleteMany({ where: { traineeProfileId: { in: testProfileIds } } });
    await prisma.clinicalCaseLog.deleteMany({ where: { traineeProfileId: { in: testProfileIds } } });
    // Call participation references the profile too; without this the profile
    // delete below fails on the FK and every suite dies in its own setup.
    await prisma.callParticipant.deleteMany({ where: { traineeProfileId: { in: testProfileIds } } });
    // Graduation approvals hold the same reference once a trainee completes.
    await prisma.graduationApproval.deleteMany({ where: { traineeProfileId: { in: testProfileIds } } });
    await prisma.competencyProgress.deleteMany({ where: { traineeProfileId: { in: testProfileIds } } });
    await prisma.document.deleteMany({ where: { traineeProfileId: { in: testProfileIds } } });
    await prisma.traineeAllocation.deleteMany({ where: { traineeProfileId: { in: testProfileIds } } });
  }

  if (testPersonIds.length > 0) {
    const testAccounts = await prisma.userAccount.findMany({
      where: { personId: { in: testPersonIds } },
      select: { id: true },
    });
    const testAccountIds = testAccounts.map((a) => a.id);
    if (testAccountIds.length > 0) {
      await prisma.userRole.deleteMany({ where: { userAccountId: { in: testAccountIds } } });
      await prisma.userOrganization.deleteMany({ where: { userAccountId: { in: testAccountIds } } });
      await prisma.organizationAssignment.deleteMany({ where: { userAccountId: { in: testAccountIds } } });
      await prisma.notification.deleteMany({ where: { userId: { in: testAccountIds } } });
      await prisma.task.deleteMany({ where: { OR: [{ assignedToId: { in: testAccountIds } }, { assignedById: { in: testAccountIds } }] } });
      await prisma.evaluation.deleteMany({ where: { OR: [{ evaluatorId: { in: testAccountIds } }, { evaluateeId: { in: testAccountIds } }] } });
      await prisma.userAccount.deleteMany({ where: { id: { in: testAccountIds } } });
    }
  }

  await prisma.trainingRequestTrainee.updateMany({
    where: { traineeProfileId: { in: testProfileIds } },
    data: { traineeProfileId: null, personId: null },
  });
  await prisma.traineeProfile.deleteMany({ where: { id: { in: testProfileIds } } });

  // Rows created directly against the scenario's candidate-row national ID
  // prefix (9x) but never promoted to a profile — e.g. rows left at 'draft'
  // when a test stops partway through.
  await prisma.person.deleteMany({
    where: {
      nationalId: { startsWith: '9' },
      traineeProfile: null,
      trainerProfile: null,
      userAccounts: { none: {} },
    },
  });
  await prisma.notification.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.academicIntake.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.trainingRequest.deleteMany({ where: { id: { in: requestIds } } });
}

if (require.main === module) {
  seedE2EScenario()
    .then((r) => {
      console.log('✅ E2E scenario seeded');
      console.log(`   cluster=${r.cluster.code} university=${r.university.code}`);
      console.log(`   hospital1=${r.hospital1.code} (IM 5 + PAED 3 = 8 seats)`);
      console.log(`   hospital2=${r.hospital2.code} (IM 4 = 4 seats)`);
    })
    .catch((e) => {
      console.error('❌', e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
