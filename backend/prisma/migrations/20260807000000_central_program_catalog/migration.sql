-- Phase 2 / Module 1 — Central Training Program Catalog
-- Additive and non-destructive: no column or row is dropped.

-- 1. A catalog entry belongs to no organization.
ALTER TABLE "programs" ALTER COLUMN "organization_id" DROP NOT NULL;

-- 2. Display ordering for the catalog.
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

-- 3. Convert the pre-existing university-owned program into the canonical
--    Medical Internship catalog entry. Its id is preserved so every existing
--    reference (academic intakes, trainees, rotations, requests) keeps resolving.
--    The original name is kept in `description` so no information is lost.
UPDATE "programs"
SET
  "description" = COALESCE(
    "description",
    'Converted to national catalog entry. Original name: ' || "name_ar"
  ),
  "name_ar" = 'امتياز الطب والجراحة العامة',
  "name_en" = 'Medical Internship',
  "code" = 'MEDICAL_INTERNSHIP',
  "organization_id" = NULL,
  "sort_order" = 1
WHERE "code" = 'MBBS-INT-2027';

-- 4. Any other legacy program without a code gets a deterministic one so the
--    uniqueness constraint below can be applied without data loss.
UPDATE "programs"
SET "code" = 'LEGACY_' || REPLACE("id"::text, '-', '')
WHERE "code" IS NULL OR "code" = '';

-- 5. Programs are centrally managed: no duplicate codes anywhere.
ALTER TABLE "programs" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "programs_code_key" ON "programs"("code");

-- 6. Seed the national catalog. Idempotent — re-running changes nothing.
INSERT INTO "programs"
  ("id", "organization_id", "code", "name_ar", "name_en", "program_type",
   "duration_months", "sort_order", "is_active", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), NULL, 'NURSING_INTERNSHIP',    'امتياز التمريض',        'Nursing Internship',    'internship', 12, 2, true, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'PHARMACY_INTERNSHIP',   'امتياز الصيدلة',        'Pharmacy Internship',   'internship', 12, 3, true, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'LABORATORY_INTERNSHIP', 'امتياز المختبرات',      'Laboratory Internship', 'internship', 12, 4, true, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'RADIOLOGY_INTERNSHIP',  'امتياز الأشعة',         'Radiology Internship',  'internship', 12, 5, true, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'RESPIRATORY_THERAPY',   'امتياز العلاج التنفسي', 'Respiratory Therapy',   'internship', 12, 6, true, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'PHYSIOTHERAPY',         'امتياز العلاج الطبيعي', 'Physiotherapy',         'internship', 12, 7, true, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'DENTISTRY_INTERNSHIP',  'امتياز طب الأسنان',     'Dentistry Internship',  'internship', 12, 8, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
