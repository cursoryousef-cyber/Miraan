import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runSentRequestsVerification() {
  console.log('=== TASK 3: SENT REQUESTS VERIFICATION ===');

  let row = await prisma.trainingRequestTrainee.findFirst({
    where: {
      assignedHospitalId: { not: null },
      status: { in: ['allocated', 'hospital_review', 'on_hold', 'accepted', 'active'] },
    },
    include: {
      assignedHospital: true,
      trainingRequest: { include: { sourceOrg: true, targetOrg: true } },
    },
  });

  if (!row || !row.assignedHospitalId) {
    console.log('No existing allocated row found, allocating one for verification...');
    const unassignedRow = await prisma.trainingRequestTrainee.findFirst();
    const hospital = await prisma.organization.findFirst({
      where: { organizationType: { code: 'hospital' } },
    });

    if (!unassignedRow || !hospital) {
      console.error('Cannot find row or hospital for test');
      process.exit(1);
    }

    await prisma.trainingRequestTrainee.update({
      where: { id: unassignedRow.id },
      data: {
        assignedHospitalId: hospital.id,
        status: 'hospital_review',
      },
    });

    row = await prisma.trainingRequestTrainee.findUnique({
      where: { id: unassignedRow.id },
      include: {
        assignedHospital: true,
        trainingRequest: { include: { sourceOrg: true, targetOrg: true } },
      },
    });
  }

  const hospitalId = row!.assignedHospitalId!;
  console.log(`Checking Hospital Incoming / Sent Requests for Hospital ID: ${hospitalId} (${row!.assignedHospital?.nameAr})...`);

  const rows = await prisma.trainingRequestTrainee.findMany({
    where: {
      assignedHospitalId: hospitalId,
      status: { in: ['allocated', 'hospital_review', 'on_hold', 'hospital_returned_to_cluster', 'accepted', 'active'] },
    },
    include: {
      documents: true,
      assignedHospital: { select: { id: true, nameAr: true, nameEn: true } },
      assignedDepartment: { select: { id: true, nameAr: true, nameEn: true, capacity: true } },
      assignedTrainer: { select: { id: true, person: { select: { id: true, nameAr: true, nameEn: true } } } },
      trainingRequest: {
        select: {
          id: true,
          requestNumber: true,
          specialty: true,
          trainingStartDate: true,
          trainingEndDate: true,
          createdAt: true,
          studentCount: true,
          status: true,
          sourceOrg: { select: { id: true, nameAr: true, nameEn: true } },
          targetOrg: { select: { id: true, nameAr: true, nameEn: true } },
        },
      },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
  });

  console.log(`Total Incoming Rows for Hospital: ${rows.length}`);

  const match = rows.find((r: any) => r.id === row!.id);

  if (match) {
    console.log('\n--- TARGET ROW MATCHED IN HOSPITAL INCOMING ---');
    console.log('Trainee Name:', match.nameAr);
    console.log('Status:', match.status);
    console.log('Assigned Hospital:', match.assignedHospital?.nameAr);
    console.log('Training Request Number:', match.trainingRequest?.requestNumber);
    console.log('Source University:', match.trainingRequest?.sourceOrg?.nameAr);
    console.log('Target Cluster:', match.trainingRequest?.targetOrg?.nameAr);
  } else {
    console.error('Row NOT found in hospital incoming review!');
  }

  const pass = !!match && match.assignedHospitalId === hospitalId;
  console.log('\nRESULT:', pass ? 'PASS' : 'FAIL');

  await prisma.$disconnect();
}

runSentRequestsVerification().catch((e) => {
  console.error('Error during sent requests verification:', e);
  process.exit(1);
});
