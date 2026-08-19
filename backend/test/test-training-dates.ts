import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateAndVerifyTrainingDates() {
  console.log('=== TASK 1: TRAINING TEST DATA VERIFICATION ===');

  const startDate = new Date('2026-08-10T00:00:00.000Z');
  const endDate = new Date('2027-02-10T00:00:00.000Z');

  let request = await prisma.trainingRequest.findFirst({
    include: {
      trainees: true,
      traineeAllocations: true,
    },
  });

  if (!request) {
    console.error('No training request found in DB');
    process.exit(1);
  }

  console.log(`Updating Training Request ${request.requestNumber} (${request.id})...`);

  // Update TrainingRequest dates
  await prisma.trainingRequest.update({
    where: { id: request.id },
    data: {
      trainingStartDate: startDate,
      trainingEndDate: endDate,
    },
  });

  // Update Trainee Rows under this request
  await prisma.trainingRequestTrainee.updateMany({
    where: { trainingRequestId: request.id },
    data: {
      startDate,
      endDate,
    },
  });

  // Update TraineeAllocations
  await prisma.traineeAllocation.updateMany({
    where: { trainingRequestId: request.id },
    data: {
      startDate,
      endDate,
    },
  });

  // Find TraineeProfiles associated with these rows
  const traineeRows = await prisma.trainingRequestTrainee.findMany({
    where: { trainingRequestId: request.id },
    select: { id: true, traineeProfileId: true },
  });
  const profileIds = traineeRows
    .map((r) => r.traineeProfileId)
    .filter((id): id is string => !!id);

  if (profileIds.length > 0) {
    await prisma.traineeProfile.updateMany({
      where: { id: { in: profileIds } },
      data: {
        accessStartDate: startDate,
        accessEndDate: endDate,
      },
    });

    await prisma.rotation.updateMany({
      where: { traineeProfileId: { in: profileIds } },
      data: {
        startDate,
        endDate,
      },
    });
  }

  // Verification from DB
  const reqCheck = await prisma.trainingRequest.findUnique({
    where: { id: request.id },
    include: {
      trainees: {
        include: {
          assignedHospital: true,
          assignedTrainer: { include: { person: true } },
        },
      },
      traineeAllocations: true,
    },
  });

  const rotationsCheck = profileIds.length
    ? await prisma.rotation.findMany({
        where: { traineeProfileId: { in: profileIds } },
        select: { id: true, startDate: true, endDate: true, status: true },
      })
    : [];

  console.log('\n--- VERIFICATION IN DB ---');
  console.log('Request Number:', reqCheck?.requestNumber);
  console.log('Request Dates:', {
    start: reqCheck?.trainingStartDate?.toISOString().slice(0, 10),
    end: reqCheck?.trainingEndDate?.toISOString().slice(0, 10),
  });
  console.log('Trainee Rows Count:', reqCheck?.trainees.length);
  if (reqCheck?.trainees[0]) {
    console.log('Sample Trainee Row Dates:', {
      nameAr: reqCheck.trainees[0].nameAr,
      hospital: reqCheck.trainees[0].assignedHospital?.nameAr ?? '—',
      trainer: reqCheck.trainees[0].assignedTrainer?.person?.nameAr ?? '—',
      start: reqCheck.trainees[0].startDate?.toISOString().slice(0, 10),
      end: reqCheck.trainees[0].endDate?.toISOString().slice(0, 10),
    });
  }
  console.log('Allocations Count:', reqCheck?.traineeAllocations.length);
  if (reqCheck?.traineeAllocations[0]) {
    console.log('Sample Allocation Dates:', {
      start: reqCheck.traineeAllocations[0].startDate?.toISOString().slice(0, 10),
      end: reqCheck.traineeAllocations[0].endDate?.toISOString().slice(0, 10),
    });
  }
  console.log('Rotations Count:', rotationsCheck.length);
  if (rotationsCheck[0]) {
    console.log('Sample Rotation Dates:', {
      start: rotationsCheck[0].startDate?.toISOString().slice(0, 10),
      end: rotationsCheck[0].endDate?.toISOString().slice(0, 10),
      status: rotationsCheck[0].status,
    });
  }

  const pass =
    reqCheck?.trainingStartDate?.toISOString().slice(0, 10) === '2026-08-10' &&
    reqCheck?.trainingEndDate?.toISOString().slice(0, 10) === '2027-02-10';

  console.log('\nRESULT:', pass ? 'PASS' : 'FAIL');
  await prisma.$disconnect();
}

updateAndVerifyTrainingDates().catch((e) => {
  console.error('Error updating training dates:', e);
  process.exit(1);
});
