import { PrismaClient } from '@prisma/client';

/**
 * Seeds one national training plan template — published as version 1 — for every
 * program in the central catalog.
 *
 * Idempotent: a program that already has a plan is left untouched, so re-running
 * this never creates a second version or disturbs trainees already pinned to one.
 */
const prisma = new PrismaClient();

type RotationSpec = {
  departmentCode: string;
  departmentNameAr: string;
  departmentNameEn: string;
  durationWeeks: number;
  procedures?: string[];
};

/** Every template totals 52 weeks, matching the 12-month duration in the catalog. */
const PLANS: Record<string, RotationSpec[]> = {
  MEDICAL_INTERNSHIP: [
    { departmentCode: 'INTERNAL_MED', departmentNameAr: 'قسم الباطنية', departmentNameEn: 'Internal Medicine', durationWeeks: 8, procedures: ['PROC-ECG', 'PROC-ABG', 'PROC-LP'] },
    { departmentCode: 'SURGERY', departmentNameAr: 'قسم الجراحة العامة', departmentNameEn: 'General Surgery', durationWeeks: 8, procedures: ['PROC-SUTURE', 'PROC-CATH'] },
    { departmentCode: 'PEDIATRICS', departmentNameAr: 'قسم الأطفال', departmentNameEn: 'Pediatrics', durationWeeks: 8, procedures: ['PROC-IV'] },
    { departmentCode: 'OBGYN', departmentNameAr: 'قسم النساء والولادة', departmentNameEn: 'Obstetrics & Gynecology', durationWeeks: 8 },
    { departmentCode: 'EMERGENCY', departmentNameAr: 'قسم الطوارئ', departmentNameEn: 'Emergency Medicine', durationWeeks: 8, procedures: ['PROC-IV', 'PROC-ECG', 'PROC-CPR'] },
    { departmentCode: 'ICU', departmentNameAr: 'قسم العناية المركزة', departmentNameEn: 'Intensive Care', durationWeeks: 6, procedures: ['PROC-INTUB', 'PROC-ABG'] },
    { departmentCode: 'OR', departmentNameAr: 'غرف العمليات', departmentNameEn: 'Operating Room', durationWeeks: 6 },
  ],
  NURSING_INTERNSHIP: [
    { departmentCode: 'INTERNAL_MED', departmentNameAr: 'قسم الباطنية', departmentNameEn: 'Internal Medicine', durationWeeks: 10, procedures: ['PROC-IV', 'PROC-ECG'] },
    { departmentCode: 'SURGERY', departmentNameAr: 'قسم الجراحة العامة', departmentNameEn: 'General Surgery', durationWeeks: 10, procedures: ['PROC-CATH'] },
    { departmentCode: 'EMERGENCY', departmentNameAr: 'قسم الطوارئ', departmentNameEn: 'Emergency Medicine', durationWeeks: 10, procedures: ['PROC-IV', 'PROC-CPR'] },
    { departmentCode: 'PEDIATRICS', departmentNameAr: 'قسم الأطفال', departmentNameEn: 'Pediatrics', durationWeeks: 10 },
    { departmentCode: 'ICU', departmentNameAr: 'قسم العناية المركزة', departmentNameEn: 'Intensive Care', durationWeeks: 12, procedures: ['PROC-ABG'] },
  ],
  PHARMACY_INTERNSHIP: [
    { departmentCode: 'PHARMACY', departmentNameAr: 'قسم الصيدلية', departmentNameEn: 'Pharmacy', durationWeeks: 26 },
    { departmentCode: 'INTERNAL_MED', departmentNameAr: 'قسم الباطنية', departmentNameEn: 'Internal Medicine', durationWeeks: 13 },
    { departmentCode: 'EMERGENCY', departmentNameAr: 'قسم الطوارئ', departmentNameEn: 'Emergency Medicine', durationWeeks: 13 },
  ],
  LABORATORY_INTERNSHIP: [
    { departmentCode: 'LAB', departmentNameAr: 'قسم المختبر وبنك الدم', departmentNameEn: 'Laboratory & Blood Bank', durationWeeks: 40 },
    { departmentCode: 'EMERGENCY', departmentNameAr: 'قسم الطوارئ', departmentNameEn: 'Emergency Medicine', durationWeeks: 12 },
  ],
  RADIOLOGY_INTERNSHIP: [
    { departmentCode: 'RADIOLOGY', departmentNameAr: 'قسم الأشعة', departmentNameEn: 'Radiology', durationWeeks: 40 },
    { departmentCode: 'EMERGENCY', departmentNameAr: 'قسم الطوارئ', departmentNameEn: 'Emergency Medicine', durationWeeks: 12 },
  ],
  RESPIRATORY_THERAPY: [
    { departmentCode: 'ICU', departmentNameAr: 'قسم العناية المركزة', departmentNameEn: 'Intensive Care', durationWeeks: 20, procedures: ['PROC-INTUB', 'PROC-ABG'] },
    { departmentCode: 'EMERGENCY', departmentNameAr: 'قسم الطوارئ', departmentNameEn: 'Emergency Medicine', durationWeeks: 16, procedures: ['PROC-CPR'] },
    { departmentCode: 'INTERNAL_MED', departmentNameAr: 'قسم الباطنية', departmentNameEn: 'Internal Medicine', durationWeeks: 16 },
  ],
  PHYSIOTHERAPY: [
    { departmentCode: 'INTERNAL_MED', departmentNameAr: 'قسم الباطنية', departmentNameEn: 'Internal Medicine', durationWeeks: 18 },
    { departmentCode: 'SURGERY', departmentNameAr: 'قسم الجراحة العامة', departmentNameEn: 'General Surgery', durationWeeks: 18 },
    { departmentCode: 'PEDIATRICS', departmentNameAr: 'قسم الأطفال', departmentNameEn: 'Pediatrics', durationWeeks: 16 },
  ],
  DENTISTRY_INTERNSHIP: [
    { departmentCode: 'SURGERY', departmentNameAr: 'قسم الجراحة العامة', departmentNameEn: 'General Surgery', durationWeeks: 26, procedures: ['PROC-SUTURE'] },
    { departmentCode: 'EMERGENCY', departmentNameAr: 'قسم الطوارئ', departmentNameEn: 'Emergency Medicine', durationWeeks: 13 },
    { departmentCode: 'INTERNAL_MED', departmentNameAr: 'قسم الباطنية', departmentNameEn: 'Internal Medicine', durationWeeks: 13 },
  ],
};

/** Applied to every rotation — the national minimum for an internship rotation. */
const STANDARD_EVALUATIONS = [
  { formType: 'mid_rotation', titleAr: 'تقييم منتصف الروتيشن', timing: 'midpoint' },
  { formType: 'end_rotation', titleAr: 'تقييم نهاية الروتيشن', timing: 'end' },
];
const STANDARD_COMPETENCIES = [
  { code: 'PATIENT_CARE', titleAr: 'رعاية المرضى' },
  { code: 'MEDICAL_KNOWLEDGE', titleAr: 'المعرفة الطبية' },
  { code: 'COMMUNICATION', titleAr: 'مهارات التواصل' },
  { code: 'PROFESSIONALISM', titleAr: 'الاحترافية والأخلاقيات' },
  { code: 'PATIENT_SAFETY', titleAr: 'سلامة المرضى' },
];
const STANDARD_LOGBOOK = [
  { code: 'CASE_LOG', titleAr: 'سجل الحالات السريرية', minCount: 10 },
  { code: 'ADMISSION_NOTE', titleAr: 'ملاحظات الدخول والخروج', minCount: 5 },
];

async function main() {
  console.log('→ Seeding national training plan templates…');

  const programs = await prisma.program.findMany({
    where: { deletedAt: null, organizationId: null },
    select: { id: true, code: true, nameAr: true },
  });
  const catalog = await prisma.procedureCatalog.findMany({
    select: { code: true, titleAr: true, minRequired: true },
  });
  const procByCode = new Map(catalog.map((p) => [p.code, p]));

  let created = 0;
  let skipped = 0;

  for (const program of programs) {
    const spec = PLANS[program.code];
    if (!spec) {
      console.log(`  · ${program.code}: no template defined — skipped`);
      skipped++;
      continue;
    }

    const existing = await prisma.trainingPlan.findFirst({
      where: { programId: program.id },
      include: { versions: true },
    });
    if (existing) {
      console.log(`  · ${program.code}: plan already exists (${existing.versions.length} version/s) — skipped`);
      skipped++;
      continue;
    }

    const totalWeeks = spec.reduce((n, r) => n + r.durationWeeks, 0);

    const plan = await prisma.trainingPlan.create({
      data: {
        programId: program.id,
        organizationId: null, // national template
        code: 'STANDARD',
        nameAr: `الخطة التدريبية المعتمدة — ${program.nameAr}`,
        nameEn: 'Standard Training Plan',
        trainingYear: '2026',
        status: 'active',
        isActive: true,
        versions: {
          create: {
            versionNumber: 1,
            label: 'الإصدار 1 (2026)',
            status: 'active',
            effectiveFrom: new Date('2026-01-01'),
            totalWeeks,
            publishedAt: new Date(),
            notes: 'الإصدار الأول المعتمد للخطة الوطنية',
            rotations: {
              create: spec.map((r, i) => ({
                sequenceOrder: i + 1,
                departmentCode: r.departmentCode,
                departmentNameAr: r.departmentNameAr,
                departmentNameEn: r.departmentNameEn,
                durationWeeks: r.durationWeeks,
                isMandatory: true,
                requiredCompetencies: STANDARD_COMPETENCIES,
                // Snapshot of the catalog at publish time — a later catalog edit
                // must not change what this version required.
                requiredProcedures: (r.procedures ?? [])
                  .map((code) => procByCode.get(code))
                  .filter((p): p is NonNullable<typeof p> => Boolean(p))
                  .map((p) => ({ code: p.code, titleAr: p.titleAr, minCount: p.minRequired })),
                requiredLogbookItems: STANDARD_LOGBOOK,
                requiredEvaluations: STANDARD_EVALUATIONS,
                objectives: [],
              })),
            },
          },
        },
      },
      include: { versions: { include: { rotations: true } } },
    });

    console.log(
      `  ✓ ${program.code}: ${plan.versions[0].rotations.length} rotations, ${totalWeeks} weeks (version 1 active)`,
    );
    created++;
  }

  console.log(`\n  Plans created: ${created}, skipped: ${skipped}`);
  console.log(`  Total plans: ${await prisma.trainingPlan.count()}`);
  console.log(`  Total versions: ${await prisma.trainingPlanVersion.count()}`);
  console.log(`  Total template rotations: ${await prisma.trainingPlanRotation.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
