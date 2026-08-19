-- Reconcile the existing schedule models with Neon.
-- Schema-only migration: no application data is created or changed.

-- Keep the already-applied nullable program contract aligned with Prisma.
ALTER TABLE "academic_intakes" DROP CONSTRAINT IF EXISTS "academic_intakes_program_id_fkey";
ALTER TABLE "academic_intakes"
  ADD CONSTRAINT "academic_intakes_program_id_fkey"
  FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "training_schedules" (
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

CREATE TABLE "schedule_participants" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "trainee_profile_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "schedule_participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "schedule_templates" (
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

CREATE TABLE "schedule_sessions" (
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

CREATE TABLE "schedule_revisions" (
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

CREATE INDEX "training_schedules_organization_id_status_idx" ON "training_schedules"("organization_id", "status");
CREATE UNIQUE INDEX "schedule_participants_schedule_id_trainee_profile_id_key" ON "schedule_participants"("schedule_id", "trainee_profile_id");
CREATE INDEX "schedule_sessions_schedule_id_idx" ON "schedule_sessions"("schedule_id");
CREATE INDEX "schedule_sessions_organization_id_date_idx" ON "schedule_sessions"("organization_id", "date");
CREATE INDEX "schedule_sessions_trainer_profile_id_date_idx" ON "schedule_sessions"("trainer_profile_id", "date");
CREATE INDEX "schedule_sessions_trainee_profile_id_date_idx" ON "schedule_sessions"("trainee_profile_id", "date");

ALTER TABLE "training_schedules" ADD CONSTRAINT "training_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_schedules" ADD CONSTRAINT "training_schedules_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "training_schedules" ADD CONSTRAINT "training_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "schedule_participants" ADD CONSTRAINT "schedule_participants_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "training_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "schedule_participants" ADD CONSTRAINT "schedule_participants_trainee_profile_id_fkey" FOREIGN KEY ("trainee_profile_id") REFERENCES "trainee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "schedule_sessions" ADD CONSTRAINT "schedule_sessions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "training_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "schedule_sessions" ADD CONSTRAINT "schedule_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "schedule_sessions" ADD CONSTRAINT "schedule_sessions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "schedule_sessions" ADD CONSTRAINT "schedule_sessions_trainer_profile_id_fkey" FOREIGN KEY ("trainer_profile_id") REFERENCES "trainer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "schedule_sessions" ADD CONSTRAINT "schedule_sessions_trainee_profile_id_fkey" FOREIGN KEY ("trainee_profile_id") REFERENCES "trainee_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "schedule_revisions" ADD CONSTRAINT "schedule_revisions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "training_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "schedule_revisions" ADD CONSTRAINT "schedule_revisions_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
