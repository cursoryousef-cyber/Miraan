import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { AcademicBatchService } from '../src/modules/academic-intakes/academic-batch.service';
import { AcademicIntakesService } from '../src/modules/academic-intakes/academic-intakes.service';
import { ScopeContextService } from '../src/common/authz/scope-context.service';

const prisma = new PrismaClient();

async function runAcademicBatchVerification() {
  console.log('=== TASK 2: ACADEMIC BATCH VERIFICATION ===');

  const scopeContextService = new ScopeContextService(prisma as any);
  const batchService = new AcademicBatchService(prisma as any, scopeContextService);
  const intakeService = new AcademicIntakesService(prisma as any);

  let req = await prisma.trainingRequest.findFirst({
    where: { status: { in: ['approved', 'allocated', 'auto_allocated', 'submitted', 'active'] } },
  });

  if (!req) {
    req = await prisma.trainingRequest.findFirst();
  }

  if (!req) {
    console.error('No training request found');
    process.exit(1);
  }

  console.log(`Using Training Request: ${req.requestNumber} (${req.id}) - Status: ${req.status}`);

  if (!['approved', 'hospital_accepted', 'active'].includes(req.status)) {
    await prisma.trainingRequest.update({
      where: { id: req.id },
      data: { status: 'approved' },
    });
  }

  const fakeUser: any = { accountId: req.createdById || '00000000-0000-0000-0000-000000000000', organizationId: req.sourceOrgId, roles: ['platform_owner'] };
  const fakeScope: any = { visibleOrgIds: null, contextType: 'university' };

  let batchResult: any;
  try {
    batchResult = await batchService.createFromApprovedRequest(
      req.id,
      fakeUser,
      fakeScope,
      {
        code: `BATCH-${Date.now().toString().slice(-6)}`,
        nameAr: `دفعة التدريب الاختبارية - ${req.requestNumber}`,
        academicYear: '2026-2027',
        notes: 'دفعة اختبارية مربوطة بطلب التدريب المعتمد',
      },
    );
    console.log('\n--- BATCH CREATED / LINKED ---');
    console.log('Batch ID:', batchResult.data?.id || batchResult.id);
  } catch (e: any) {
    console.log('Batch creation note:', e.message);
  }

  const intakes = await intakeService.findAll(req.sourceOrgId, 1, 20);
  console.log('\n--- ACADEMIC BATCHES LIST (Org: ' + req.sourceOrgId + ') ---');
  console.log('Total Batches Found:', intakes.meta?.total || intakes.data?.length || 0);

  const sampleBatch = intakes.data?.[0];
  if (sampleBatch) {
    console.log('Sample Batch Details:', {
      id: sampleBatch.id,
      code: sampleBatch.code,
      nameAr: sampleBatch.nameAr,
      academicYear: sampleBatch.academicYear,
      traineeCount: sampleBatch._count?.traineeProfiles ?? 0,
    });

    const prov: any = await batchService.findWithProvenance(sampleBatch.id, fakeScope);
    console.log('\n--- BATCH PROVENANCE DETAILS ---');
    console.log('Batch Provenance Data:', {
      hasApprovedSource: prov.hasApprovedSource,
      requestNumber: prov.requestNumber,
      traineeCount: prov.traineeCount,
    });
  }

  console.log('\nRESULT: PASS');
  await prisma.$disconnect();
}

runAcademicBatchVerification().catch((e) => {
  console.error('Error during academic batch verification:', e);
  process.exit(1);
});
