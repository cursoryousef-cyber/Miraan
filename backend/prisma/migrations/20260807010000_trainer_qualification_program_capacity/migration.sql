-- Phase 2 / Module 2 — Trainer Qualification + Program Capacity
-- Additive and non-destructive.

-- ── 1. Program dimension on the existing capacity model ──────────────────────
-- Text with an '' sentinel rather than a nullable FK, matching how scope_id
-- already stores department/trainer/supervisor ids. A nullable column would make
-- Postgres treat NULLs as distinct and silently permit duplicate allocation rows
-- for every non-program scope, weakening a constraint that holds today.
ALTER TABLE "capacity_allocations"
  ADD COLUMN IF NOT EXISTS "program_id" VARCHAR(64) NOT NULL DEFAULT '';

-- The uniqueness key must include the program, otherwise two program
-- allocations for the same hospital would collide (identical scope_id,
-- specialty_code, gender and training_period).
DROP INDEX IF EXISTS "capacity_allocations_organization_id_scope_type_scope_id_sp_key";
CREATE UNIQUE INDEX IF NOT EXISTS "capacity_allocations_org_scope_program_key"
  ON "capacity_allocations"("organization_id", "scope_type", "scope_id", "program_id", "specialty_code", "gender", "training_period");

CREATE INDEX IF NOT EXISTS "capacity_allocations_organization_id_program_id_idx"
  ON "capacity_allocations"("organization_id", "program_id");

-- ── 2. Trainer qualification ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "trainer_programs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trainer_profile_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "max_trainees" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_programs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "trainer_programs_trainer_profile_id_program_id_key"
  ON "trainer_programs"("trainer_profile_id", "program_id");
CREATE INDEX IF NOT EXISTS "trainer_programs_program_id_idx" ON "trainer_programs"("program_id");

ALTER TABLE "trainer_programs" DROP CONSTRAINT IF EXISTS "trainer_programs_trainer_profile_id_fkey";
ALTER TABLE "trainer_programs" ADD CONSTRAINT "trainer_programs_trainer_profile_id_fkey"
  FOREIGN KEY ("trainer_profile_id") REFERENCES "trainer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trainer_programs" DROP CONSTRAINT IF EXISTS "trainer_programs_program_id_fkey";
ALTER TABLE "trainer_programs" ADD CONSTRAINT "trainer_programs_program_id_fkey"
  FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 3. Seed qualifications for trainers that already exist ───────────────────
-- Trainer qualification becomes a hard allocation constraint. Every existing
-- trainer must therefore carry at least one qualification, or allocations that
-- succeed today would start failing. The program is inferred from the trainer's
-- specialisation and department name, defaulting to Medical Internship, which
-- matches how these trainers are used today. Idempotent.
INSERT INTO "trainer_programs" ("id", "trainer_profile_id", "program_id", "is_active", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  tp."id",
  (
    SELECT pr."id" FROM "programs" pr
    WHERE pr."deleted_at" IS NULL AND pr."code" = CASE
      WHEN LOWER(COALESCE(tp."specialization", '') || ' ' || COALESCE(d."name_ar", '') || ' ' || COALESCE(d."name_en", ''))
           ~ '(nurs|تمريض)'                THEN 'NURSING_INTERNSHIP'
      WHEN LOWER(COALESCE(tp."specialization", '') || ' ' || COALESCE(d."name_ar", '') || ' ' || COALESCE(d."name_en", ''))
           ~ '(pharm|صيدل)'                THEN 'PHARMACY_INTERNSHIP'
      WHEN LOWER(COALESCE(tp."specialization", '') || ' ' || COALESCE(d."name_ar", '') || ' ' || COALESCE(d."name_en", ''))
           ~ '(lab|مختبر)'                 THEN 'LABORATORY_INTERNSHIP'
      WHEN LOWER(COALESCE(tp."specialization", '') || ' ' || COALESCE(d."name_ar", '') || ' ' || COALESCE(d."name_en", ''))
           ~ '(radiol|أشعة|اشعة)'          THEN 'RADIOLOGY_INTERNSHIP'
      WHEN LOWER(COALESCE(tp."specialization", '') || ' ' || COALESCE(d."name_ar", '') || ' ' || COALESCE(d."name_en", ''))
           ~ '(respirat|تنفس)'             THEN 'RESPIRATORY_THERAPY'
      WHEN LOWER(COALESCE(tp."specialization", '') || ' ' || COALESCE(d."name_ar", '') || ' ' || COALESCE(d."name_en", ''))
           ~ '(physio|طبيعي)'              THEN 'PHYSIOTHERAPY'
      WHEN LOWER(COALESCE(tp."specialization", '') || ' ' || COALESCE(d."name_ar", '') || ' ' || COALESCE(d."name_en", ''))
           ~ '(dent|أسنان|اسنان)'          THEN 'DENTISTRY_INTERNSHIP'
      ELSE 'MEDICAL_INTERNSHIP'
    END
  ),
  true, NOW(), NOW()
FROM "trainer_profiles" tp
LEFT JOIN "departments" d ON d."id" = tp."department_id"
ON CONFLICT ("trainer_profile_id", "program_id") DO NOTHING;
