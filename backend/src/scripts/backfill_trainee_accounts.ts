import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function backfill() {
  console.log('=== Starting Safe Trainee Backfill ===');

  const rows = await prisma.trainingRequestTrainee.findMany({
    where: {
      status: { notIn: ['rejected', 'merged', 'split'] },
    },
    include: {
      trainingRequest: true,
      traineeProfile: true,
      person: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${rows.length} active training request trainee rows.`);

  let createdPersons = 0;
  let createdAccounts = 0;
  let createdProfiles = 0;
  let updatedRows = 0;
  let updatedAllocations = 0;

  const traineeRole = await prisma.role.findUnique({ where: { code: 'trainee' } });

  for (const row of rows) {
    const cleanEmail = row.email ? row.email.trim().toLowerCase() : null;
    const accountEmail = cleanEmail || `${row.academicNumber || row.nationalId}@trainee.miran.health`;
    const targetOrgId = row.assignedHospitalId || row.trainingRequest?.targetOrgId || row.universityOrgId;

    if (!targetOrgId) {
      console.warn(`Skipping row ${row.id} (${row.nameAr}): no target org found.`);
      continue;
    }

    // 1. Person
    let person = row.person;
    if (!person) {
      person = await prisma.person.upsert({
        where: { nationalId: row.nationalId },
        create: {
          nationalId: row.nationalId,
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          gender: row.gender,
          phone: row.mobile,
          email: accountEmail,
        },
        update: {
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          gender: row.gender,
          phone: row.mobile,
          ...(cleanEmail ? { email: cleanEmail } : {}),
        },
      });
      createdPersons++;
    }

    // 2. UserAccount
    let account = await prisma.userAccount.findFirst({
      where: {
        OR: [
          { email: accountEmail },
          { personId: person.id },
        ],
        deletedAt: null,
      },
    });

    if (!account) {
      account = await prisma.userAccount.create({
        data: {
          personId: person.id,
          email: accountEmail,
          passwordHash: await bcrypt.hash('Trainee@123456', 10),
          isActive: true,
          activationToken: randomUUID(),
        },
      });
      createdAccounts++;
    } else {
      await prisma.userAccount.update({
        where: { id: account.id },
        data: { isActive: true, personId: person.id },
      });
    }

    // 3. UserRole & Org Assignment
    const orgsToLink = Array.from(
      new Set([row.trainingRequest?.targetOrgId, row.assignedHospitalId, targetOrgId].filter(Boolean) as string[]),
    );

    for (const orgId of orgsToLink) {
      if (traineeRole) {
        await prisma.userRole.upsert({
          where: {
            userAccountId_roleId_organizationId: {
              userAccountId: account.id,
              roleId: traineeRole.id,
              organizationId: orgId,
            },
          },
          create: {
            userAccountId: account.id,
            roleId: traineeRole.id,
            organizationId: orgId,
          },
          update: {},
        });
      }

      await prisma.userOrganization.upsert({
        where: {
          userAccountId_organizationId: { userAccountId: account.id, organizationId: orgId },
        },
        create: {
          userAccountId: account.id,
          organizationId: orgId,
          isPrimary: orgId === (row.assignedHospitalId || targetOrgId),
          isActive: true,
        },
        update: { isActive: true },
      });

      const existingAssignment = await prisma.organizationAssignment.findFirst({
        where: {
          userAccountId: account.id,
          organizationId: orgId,
          sourceType: { in: ['user_organization', 'user_role', 'manual'] },
        },
      });

      if (!existingAssignment) {
        await prisma.organizationAssignment.create({
          data: {
            userAccountId: account.id,
            organizationId: orgId,
            roleId: traineeRole?.id ?? null,
            assignmentType: 'permanent',
            isPrimary: orgId === (row.assignedHospitalId || targetOrgId),
            isActive: true,
            sourceType: 'user_organization',
          },
        });
      } else if (!existingAssignment.roleId && traineeRole) {
        await prisma.organizationAssignment.update({
          where: { id: existingAssignment.id },
          data: { roleId: traineeRole.id, isActive: true },
        });
      }
    }

    // 4. TraineeProfile
    let profile = row.traineeProfile;
    if (!profile) {
      profile = await prisma.traineeProfile.upsert({
        where: { personId: person.id },
        create: {
          personId: person.id,
          organizationId: row.assignedHospitalId || targetOrgId,
          sponsorOrganizationId: row.universityOrgId || row.trainingRequest?.sourceOrgId,
          traineeNumber: row.academicNumber,
          level: 'intern',
          specialtyEn: row.specialty,
          programId: row.trainingRequest?.programId,
          academicIntakeId: row.academicIntakeId || row.trainingRequest?.academicIntakeId,
          applicationStatus: 'approved',
          accessStartDate: row.startDate,
          accessEndDate: row.endDate,
        },
        update: {
          organizationId: row.assignedHospitalId || targetOrgId,
          sponsorOrganizationId: row.universityOrgId || row.trainingRequest?.sourceOrgId,
          programId: row.trainingRequest?.programId,
          academicIntakeId: row.academicIntakeId || row.trainingRequest?.academicIntakeId,
          applicationStatus: 'approved',
        },
      });
      createdProfiles++;
    }

    // 5. Update TrainingRequestTrainee
    if (!row.personId || !row.traineeProfileId) {
      await prisma.trainingRequestTrainee.update({
        where: { id: row.id },
        data: {
          personId: person.id,
          traineeProfileId: profile.id,
        },
      });
      updatedRows++;
    }

    // 6. Update any unlinked TraineeAllocations
    const allocUpdate = await prisma.traineeAllocation.updateMany({
      where: {
        traineeRowId: row.id,
        traineeProfileId: null,
      },
      data: {
        traineeProfileId: profile.id,
      },
    });
    updatedAllocations += allocUpdate.count;
  }

  console.log('=== Backfill Completed Successfully ===');
  console.log({
    createdPersons,
    createdAccounts,
    createdProfiles,
    updatedRows,
    updatedAllocations,
  });

  await prisma.$disconnect();
}

backfill().catch((err) => {
  console.error('Backfill error:', err);
  prisma.$disconnect().then(() => process.exit(1));
});
