-- Baseline repair: tables declared in schema.prisma but never created by any migration.
--
-- Later migrations (phase1 staging, capacity, allocation, graduation …) add
-- columns and constraints that reference these tables, so a fresh database could
-- not be provisioned through `prisma migrate` at all — the chain assumed a schema
-- that only ever existed via `db push`.
--
-- This migration is deliberately NOT folded into 0_init: 0_init is already
-- recorded as applied on existing databases, and editing it would change its
-- checksum and abort `prisma migrate deploy` at startup. Instead this file sorts
-- immediately after 0_init and before the first phase migration, so a fresh
-- database gets these tables in time for the rest of the chain.
--
-- Every statement is guarded with IF NOT EXISTS: on databases that already carry
-- these tables (created historically via `db push`) this migration is a no-op and
-- records itself as applied without touching anything.
--
-- Foreign keys are intentionally NOT declared here. They are added at the end of
-- the chain by phase9_baseline_repair_foreign_keys, once every
-- referenced table — including ones introduced by later migrations — exists.


-- CreateTable
CREATE TABLE IF NOT EXISTS "training_requests" (
    "id" UUID NOT NULL,
    "request_number" VARCHAR(50) NOT NULL,
    "source_org_id" UUID NOT NULL,
    "target_org_id" UUID NOT NULL,
    "program_id" UUID,
    "academic_intake_id" UUID,
    "student_count" INTEGER NOT NULL DEFAULT 0,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "status" VARCHAR(50) NOT NULL DEFAULT 'submitted',
    "notes" TEXT,
    "allocations" JSONB NOT NULL DEFAULT '[]',
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "training_plan_id" UUID,
    "training_plan_version_id" UUID,
    "training_start_date" DATE,
    "training_end_date" DATE,
    "expected_graduation_date" DATE,
    "specialty" VARCHAR(100),

    CONSTRAINT "training_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "procedure_catalogs" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "title_ar" VARCHAR(300) NOT NULL,
    "title_en" VARCHAR(300) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "min_required" INTEGER NOT NULL DEFAULT 5,
    "description_ar" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "procedure_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "clinical_case_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "trainee_profile_id" UUID NOT NULL,
    "trainer_profile_id" UUID,
    "rotation_id" UUID,
    "department_id" UUID,
    "procedure_id" UUID,
    "diagnosis" VARCHAR(300) NOT NULL,
    "patient_age" INTEGER,
    "patient_gender" VARCHAR(20),
    "specialty_ar" VARCHAR(200),
    "complexity" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "participation_level" VARCHAR(50) NOT NULL DEFAULT 'performed',
    "notes" TEXT,
    "evidence_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(30) NOT NULL DEFAULT 'submitted',
    "performed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clinical_case_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "competency_progress" (
    "id" UUID NOT NULL,
    "trainee_profile_id" UUID NOT NULL,
    "procedure_id" UUID NOT NULL,
    "required_count" INTEGER NOT NULL DEFAULT 5,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "last_updated" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competency_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "logbook_signoffs" (
    "id" UUID NOT NULL,
    "case_log_id" UUID NOT NULL,
    "signer_id" UUID NOT NULL,
    "signer_role" VARCHAR(30) NOT NULL,
    "signature_url" VARCHAR(500),
    "feedback" TEXT,
    "signed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logbook_signoffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "trainer_leaves" (
    "id" UUID NOT NULL,
    "trainer_profile_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "leave_type" VARCHAR(30) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "replacement_trainer_id" UUID,
    "auto_reassigned" BOOLEAN NOT NULL DEFAULT false,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trainer_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "trainer_reassignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "reassignment_type" VARCHAR(30) NOT NULL,
    "reason" VARCHAR(50) NOT NULL,
    "previous_trainer_id" UUID NOT NULL,
    "new_trainer_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "trainer_leave_id" UUID,
    "effective_date" TIMESTAMPTZ(6) NOT NULL,
    "previous_assignment_end" TIMESTAMPTZ(6),
    "notes" TEXT,
    "approved_by" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_reassignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "trainer_reassignment_trainees" (
    "id" UUID NOT NULL,
    "reassignment_id" UUID NOT NULL,
    "trainee_profile_id" UUID NOT NULL,
    "rotation_id" UUID NOT NULL,
    "previous_trainer_id" UUID NOT NULL,
    "new_trainer_id" UUID NOT NULL,

    CONSTRAINT "trainer_reassignment_trainees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "training_schedules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "department_id" UUID,
    "title_ar" VARCHAR(300) NOT NULL,
    "title_en" VARCHAR(300),
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "total_hours" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "training_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "schedule_participants" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "trainee_profile_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "schedule_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "department_id" UUID,
    "name_ar" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200),
    "structure_json" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "schedule_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "schedule_sessions" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "trainer_profile_id" UUID,
    "trainee_profile_id" UUID,
    "date" DATE NOT NULL,
    "start_time" VARCHAR(10) NOT NULL,
    "end_time" VARCHAR(10) NOT NULL,
    "duration_hours" DECIMAL(4,2) NOT NULL,
    "session_type" VARCHAR(50) NOT NULL DEFAULT 'clinical_round',
    "shift_type" VARCHAR(20) NOT NULL DEFAULT 'morning',
    "location" VARCHAR(200),
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,

    CONSTRAINT "schedule_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "schedule_revisions" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "snapshot" JSONB NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "change_reason" TEXT,
    "published_by" UUID,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "training_requests_request_number_key" ON "training_requests"("request_number");
-- CreateIndex
CREATE INDEX IF NOT EXISTS "training_requests_source_org_id_idx" ON "training_requests"("source_org_id");
-- CreateIndex
CREATE INDEX IF NOT EXISTS "training_requests_target_org_id_idx" ON "training_requests"("target_org_id");
-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "procedure_catalogs_code_key" ON "procedure_catalogs"("code");
-- CreateIndex
CREATE INDEX IF NOT EXISTS "clinical_case_logs_trainee_profile_id_idx" ON "clinical_case_logs"("trainee_profile_id");
-- CreateIndex
CREATE INDEX IF NOT EXISTS "clinical_case_logs_organization_id_idx" ON "clinical_case_logs"("organization_id");
-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "competency_progress_trainee_profile_id_procedure_id_key" ON "competency_progress"("trainee_profile_id", "procedure_id");
-- CreateIndex
CREATE INDEX IF NOT EXISTS "trainer_leaves_trainer_profile_id_status_idx" ON "trainer_leaves"("trainer_profile_id", "status");
-- CreateIndex
CREATE INDEX IF NOT EXISTS "trainer_leaves_organization_id_start_date_idx" ON "trainer_leaves"("organization_id", "start_date");
-- CreateIndex
CREATE INDEX IF NOT EXISTS "trainer_reassignments_organization_id_created_at_idx" ON "trainer_reassignments"("organization_id", "created_at");
-- CreateIndex
CREATE INDEX IF NOT EXISTS "trainer_reassignments_previous_trainer_id_idx" ON "trainer_reassignments"("previous_trainer_id");
-- CreateIndex
CREATE INDEX IF NOT EXISTS "trainer_reassignments_new_trainer_id_idx" ON "trainer_reassignments"("new_trainer_id");
-- CreateIndex
CREATE INDEX IF NOT EXISTS "trainer_reassignment_trainees_reassignment_id_idx" ON "trainer_reassignment_trainees"("reassignment_id");
-- CreateIndex
CREATE INDEX IF NOT EXISTS "training_schedules_organization_id_status_idx" ON "training_schedules"("organization_id", "status");
-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_participants_schedule_id_trainee_profile_id_key" ON "schedule_participants"("schedule_id", "trainee_profile_id");
-- CreateIndex
CREATE INDEX IF NOT EXISTS "schedule_sessions_schedule_id_idx" ON "schedule_sessions"("schedule_id");
-- CreateIndex
CREATE INDEX IF NOT EXISTS "schedule_sessions_organization_id_date_idx" ON "schedule_sessions"("organization_id", "date");
-- CreateIndex
CREATE INDEX IF NOT EXISTS "schedule_sessions_trainer_profile_id_date_idx" ON "schedule_sessions"("trainer_profile_id", "date");
-- CreateIndex
CREATE INDEX IF NOT EXISTS "schedule_sessions_trainee_profile_id_date_idx" ON "schedule_sessions"("trainee_profile_id", "date");
