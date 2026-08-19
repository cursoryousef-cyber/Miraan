-- Phase 2 / Module 3 — Training Plan & Rotation Templates (immutable versioning)
-- Additive and non-destructive. No column is dropped and no row is rewritten.

-- ── 1. TrainingPlan becomes a template header ────────────────────────────────
-- The plan itself now carries only stable identity; the training content moves
-- into versions. Widening NOT NULL → NULL is safe for existing rows.
ALTER TABLE "training_plans" ALTER COLUMN "organization_id" DROP NOT NULL;
ALTER TABLE "training_plans" ALTER COLUMN "training_year" DROP NOT NULL;
ALTER TABLE "training_plans" ALTER COLUMN "start_date" DROP NOT NULL;
ALTER TABLE "training_plans" ALTER COLUMN "end_date" DROP NOT NULL;
ALTER TABLE "training_plans" ADD COLUMN IF NOT EXISTS "code" VARCHAR(50);
ALTER TABLE "training_plans" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS "training_plans_program_id_code_key"
  ON "training_plans"("program_id", "code");
CREATE INDEX IF NOT EXISTS "training_plans_program_id_idx" ON "training_plans"("program_id");

-- ── 2. Immutable plan versions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "training_plan_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "training_plan_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "label" VARCHAR(200),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "effective_from" DATE,
    "effective_to" DATE,
    "total_weeks" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "superseded_by_version_id" UUID,
    "cloned_from_version_id" UUID,
    "published_at" TIMESTAMPTZ,
    "published_by" UUID,
    "archived_at" TIMESTAMPTZ,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_plan_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "training_plan_versions_training_plan_id_version_number_key"
  ON "training_plan_versions"("training_plan_id", "version_number");
CREATE INDEX IF NOT EXISTS "training_plan_versions_training_plan_id_status_idx"
  ON "training_plan_versions"("training_plan_id", "status");

-- Only one active version per plan. Enforced in the database so a concurrent
-- publish cannot leave two versions active for the same plan.
CREATE UNIQUE INDEX IF NOT EXISTS "training_plan_versions_one_active_per_plan"
  ON "training_plan_versions"("training_plan_id") WHERE "status" = 'active';

ALTER TABLE "training_plan_versions" DROP CONSTRAINT IF EXISTS "training_plan_versions_training_plan_id_fkey";
ALTER TABLE "training_plan_versions" ADD CONSTRAINT "training_plan_versions_training_plan_id_fkey"
  FOREIGN KEY ("training_plan_id") REFERENCES "training_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "training_plan_versions" DROP CONSTRAINT IF EXISTS "training_plan_versions_superseded_by_version_id_fkey";
ALTER TABLE "training_plan_versions" ADD CONSTRAINT "training_plan_versions_superseded_by_version_id_fkey"
  FOREIGN KEY ("superseded_by_version_id") REFERENCES "training_plan_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "training_plan_versions" DROP CONSTRAINT IF EXISTS "training_plan_versions_cloned_from_version_id_fkey";
ALTER TABLE "training_plan_versions" ADD CONSTRAINT "training_plan_versions_cloned_from_version_id_fkey"
  FOREIGN KEY ("cloned_from_version_id") REFERENCES "training_plan_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 3. Ordered rotation templates, owned by a version ────────────────────────
CREATE TABLE IF NOT EXISTS "training_plan_rotations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "training_plan_version_id" UUID NOT NULL,
    "sequence_order" INTEGER NOT NULL,
    "department_code" VARCHAR(50) NOT NULL,
    "department_name_ar" VARCHAR(200) NOT NULL,
    "department_name_en" VARCHAR(200),
    "specialty_code" VARCHAR(100),
    "duration_weeks" INTEGER NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "required_competencies" JSONB NOT NULL DEFAULT '[]',
    "required_procedures" JSONB NOT NULL DEFAULT '[]',
    "required_logbook_items" JSONB NOT NULL DEFAULT '[]',
    "required_evaluations" JSONB NOT NULL DEFAULT '[]',
    "objectives" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_plan_rotations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "training_plan_rotations_version_sequence_key"
  ON "training_plan_rotations"("training_plan_version_id", "sequence_order");
CREATE INDEX IF NOT EXISTS "training_plan_rotations_training_plan_version_id_idx"
  ON "training_plan_rotations"("training_plan_version_id");

ALTER TABLE "training_plan_rotations" DROP CONSTRAINT IF EXISTS "training_plan_rotations_training_plan_version_id_fkey";
ALTER TABLE "training_plan_rotations" ADD CONSTRAINT "training_plan_rotations_training_plan_version_id_fkey"
  FOREIGN KEY ("training_plan_version_id") REFERENCES "training_plan_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 4. The training request records the plan and its dates ───────────────────
ALTER TABLE "training_requests" ADD COLUMN IF NOT EXISTS "training_plan_id" UUID;
ALTER TABLE "training_requests" ADD COLUMN IF NOT EXISTS "training_plan_version_id" UUID;
ALTER TABLE "training_requests" ADD COLUMN IF NOT EXISTS "training_start_date" DATE;
ALTER TABLE "training_requests" ADD COLUMN IF NOT EXISTS "training_end_date" DATE;
ALTER TABLE "training_requests" ADD COLUMN IF NOT EXISTS "expected_graduation_date" DATE;

ALTER TABLE "training_requests" DROP CONSTRAINT IF EXISTS "training_requests_training_plan_id_fkey";
ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_training_plan_id_fkey"
  FOREIGN KEY ("training_plan_id") REFERENCES "training_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "training_requests" DROP CONSTRAINT IF EXISTS "training_requests_training_plan_version_id_fkey";
ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_training_plan_version_id_fkey"
  FOREIGN KEY ("training_plan_version_id") REFERENCES "training_plan_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 5. The trainee is pinned to the version they started on ──────────────────
ALTER TABLE "trainee_profiles" ADD COLUMN IF NOT EXISTS "training_plan_version_id" UUID;
ALTER TABLE "trainee_profiles" ADD COLUMN IF NOT EXISTS "expected_graduation_date" DATE;

ALTER TABLE "trainee_profiles" DROP CONSTRAINT IF EXISTS "trainee_profiles_training_plan_version_id_fkey";
ALTER TABLE "trainee_profiles" ADD CONSTRAINT "trainee_profiles_training_plan_version_id_fkey"
  FOREIGN KEY ("training_plan_version_id") REFERENCES "training_plan_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 6. A rotation remembers the template row it came from ────────────────────
-- Nullable: the 17 existing rotations were created manually and keep working.
ALTER TABLE "rotations" ADD COLUMN IF NOT EXISTS "training_plan_rotation_id" UUID;
ALTER TABLE "rotations" ADD COLUMN IF NOT EXISTS "sequence_order" INTEGER;

ALTER TABLE "rotations" DROP CONSTRAINT IF EXISTS "rotations_training_plan_rotation_id_fkey";
ALTER TABLE "rotations" ADD CONSTRAINT "rotations_training_plan_rotation_id_fkey"
  FOREIGN KEY ("training_plan_rotation_id") REFERENCES "training_plan_rotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
