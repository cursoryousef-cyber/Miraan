import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { TrainerQualificationService } from '../src/modules/trainers/trainer-qualification.service';

const prisma = new PrismaClient();

async function runRuntimeVerification() {
  console.log('=== RUNTIME VERIFICATION START ===');

  const trainer = await prisma.trainerProfile.findFirst({
    where: { isActive: true },
    include: { person: true, organization: true },
  });

  if (!trainer) {
    console.error('No active trainer found');
    process.exit(1);
  }

  console.log(`Testing with Trainer: ${trainer.person.nameAr} (${trainer.id}) at Org: ${trainer.organizationId}`);
  console.log(`Trainer Max Capacity: ${trainer.maxTrainees}`);

  const service = new TrainerQualificationService(prisma as any);

  // 1. BEFORE ASSIGNMENT
  console.log('\n--- 1. BEFORE ASSIGNMENT ---');
  const cardsBefore = await service.listWorkspaceCards(trainer.organizationId);
  const cardBefore = cardsBefore.data.find((c: any) => c.id === trainer.id)!;

  console.log('API / Service Response (Before):', {
    nameAr: cardBefore.nameAr,
    maxTrainees: cardBefore.maxTrainees,
    occupied: cardBefore.occupied,
    available: cardBefore.available,
    occupancyPercentage: cardBefore.occupancyPercentage,
    currentTraineesCount: cardBefore.currentTrainees.length,
  });

  // Find a trainee row NOT currently assigned to this trainer
  let testTraineeRow = await prisma.trainingRequestTrainee.findFirst({
    where: {
      assignedHospitalId: trainer.organizationId,
      OR: [
        { assignedTrainerProfileId: null },
        { assignedTrainerProfileId: { not: trainer.id } },
      ],
    },
  });

  if (!testTraineeRow) {
    // Pick any trainee row and clear its trainer for initial baseline
    testTraineeRow = await prisma.trainingRequestTrainee.findFirst();
  }

  if (!testTraineeRow) {
    console.error('No trainee row available for assignment test');
    process.exit(1);
  }

  const previousTrainerId = testTraineeRow.assignedTrainerProfileId;

  // If the test row was assigned to our trainer, unassign it first to get clean baseline
  if (previousTrainerId === trainer.id) {
    await prisma.trainingRequestTrainee.update({
      where: { id: testTraineeRow.id },
      data: { assignedTrainerProfileId: null },
    });
    await prisma.traineeAllocation.updateMany({
      where: { traineeRowId: testTraineeRow.id, status: 'open' },
      data: { trainerProfileId: null },
    });
  }

  const cardsBaseline = await service.listWorkspaceCards(trainer.organizationId);
  const cardBaseline = cardsBaseline.data.find((c: any) => c.id === trainer.id)!;

  console.log('\nBaseline Card (Unassigned test row):', {
    occupied: cardBaseline.occupied,
    available: cardBaseline.available,
    occupancyPercentage: cardBaseline.occupancyPercentage,
  });

  console.log(`\nUsing Trainee Row for Assignment Test: ${testTraineeRow.nameAr} (${testTraineeRow.id})`);

  // 2. ASSIGN TRAINEE TO TRAINER
  console.log('\n--- 2. PERFORMING TRAINEE ASSIGNMENT ---');

  await prisma.trainingRequestTrainee.update({
    where: { id: testTraineeRow.id },
    data: {
      assignedHospitalId: trainer.organizationId,
      assignedTrainerProfileId: trainer.id,
      status: 'hospital_review',
    },
  });

  const openAlloc = await prisma.traineeAllocation.findFirst({
    where: { traineeRowId: testTraineeRow.id, status: 'open' },
  });
  if (openAlloc) {
    await prisma.traineeAllocation.update({
      where: { id: openAlloc.id },
      data: { trainerProfileId: trainer.id },
    });
  } else {
    await prisma.traineeAllocation.create({
      data: {
        traineeRowId: testTraineeRow.id,
        clusterOrgId: trainer.organizationId,
        hospitalId: trainer.organizationId,
        trainerProfileId: trainer.id,
        status: 'open',
        action: 'hospital_assign',
      },
    });
  }

  // 3. AFTER ASSIGNMENT
  console.log('\n--- 3. AFTER ASSIGNMENT ---');
  const cardsAfter = await service.listWorkspaceCards(trainer.organizationId);
  const cardAfter = cardsAfter.data.find((c: any) => c.id === trainer.id)!;

  console.log('API / Service Response (After Assignment):', {
    nameAr: cardAfter.nameAr,
    maxTrainees: cardAfter.maxTrainees,
    occupied: cardAfter.occupied,
    available: cardAfter.available,
    occupancyPercentage: cardAfter.occupancyPercentage,
    currentTraineesCount: cardAfter.currentTrainees.length,
    traineeNames: cardAfter.currentTrainees.map((t: any) => t.nameAr),
  });

  const occupiedDiff = cardAfter.occupied - cardBaseline.occupied;
  const availableDiff = cardBaseline.available - cardAfter.available;

  console.log('\n--- VERIFICATION CHECKS ---');
  console.log(`Occupied diff (expected +1): ${occupiedDiff}`);
  console.log(`Available diff (expected -1): ${availableDiff}`);
  console.log(`Occupancy % formula match: ${cardAfter.occupancyPercentage}% vs calculated ${Math.min(100, Math.round((cardAfter.occupied / cardAfter.maxTrainees) * 100))}%`);

  // 4. UNASSIGN / REMOVE TRAINEE
  console.log('\n--- 4. PERFORMING UNASSIGNMENT / REASSIGNMENT RESET ---');
  await prisma.trainingRequestTrainee.update({
    where: { id: testTraineeRow.id },
    data: {
      assignedTrainerProfileId: null,
    },
  });
  await prisma.traineeAllocation.updateMany({
    where: { traineeRowId: testTraineeRow.id, status: 'open' },
    data: { trainerProfileId: null },
  });

  const cardsReset = await service.listWorkspaceCards(trainer.organizationId);
  const cardReset = cardsReset.data.find((c: any) => c.id === trainer.id)!;

  console.log('API / Service Response (After Unassignment):', {
    nameAr: cardReset.nameAr,
    maxTrainees: cardReset.maxTrainees,
    occupied: cardReset.occupied,
    available: cardReset.available,
    occupancyPercentage: cardReset.occupancyPercentage,
  });

  // Restore original state if needed
  if (previousTrainerId) {
    await prisma.trainingRequestTrainee.update({
      where: { id: testTraineeRow.id },
      data: { assignedTrainerProfileId: previousTrainerId },
    });
    await prisma.traineeAllocation.updateMany({
      where: { traineeRowId: testTraineeRow.id, status: 'open' },
      data: { trainerProfileId: previousTrainerId },
    });
  }

  const finalCheckPass =
    occupiedDiff === 1 &&
    availableDiff === 1 &&
    cardAfter.occupied === cardBaseline.occupied + 1 &&
    cardReset.occupied === cardBaseline.occupied;

  console.log('\n=== RUNTIME VERIFICATION RESULT ===');
  console.log(finalCheckPass ? 'PASS: ALL CHECKS VERIFIED SUCCESSFULLY!' : 'FAIL: Discrepancy detected');

  await prisma.$disconnect();
}

runRuntimeVerification().catch((e) => {
  console.error('Error during verification:', e);
  process.exit(1);
});
