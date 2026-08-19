-- Foreign keys for the tables restored into the 0_init baseline.
-- Applied at the end of the chain so every referenced table exists, including
-- ones added by later migrations. Each constraint is guarded: several of them
-- are already created by intermediate migrations (training_plan_versioning,
-- request_specialty …), and re-adding one must not break the chain.
-- No schema change: these are the constraints schema.prisma already declares.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_requests_academic_intake_id_fkey') THEN
    EXECUTE 'ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_academic_intake_id_fkey" FOREIGN KEY ("academic_intake_id") REFERENCES "academic_intakes"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_requests_program_id_fkey') THEN
    EXECUTE 'ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_requests_source_org_id_fkey') THEN
    EXECUTE 'ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_source_org_id_fkey" FOREIGN KEY ("source_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_requests_target_org_id_fkey') THEN
    EXECUTE 'ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_target_org_id_fkey" FOREIGN KEY ("target_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_requests_training_plan_id_fkey') THEN
    EXECUTE 'ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_training_plan_id_fkey" FOREIGN KEY ("training_plan_id") REFERENCES "training_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_requests_training_plan_version_id_fkey') THEN
    EXECUTE 'ALTER TABLE "training_requests" ADD CONSTRAINT "training_requests_training_plan_version_id_fkey" FOREIGN KEY ("training_plan_version_id") REFERENCES "training_plan_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_case_logs_department_id_fkey') THEN
    EXECUTE 'ALTER TABLE "clinical_case_logs" ADD CONSTRAINT "clinical_case_logs_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_case_logs_organization_id_fkey') THEN
    EXECUTE 'ALTER TABLE "clinical_case_logs" ADD CONSTRAINT "clinical_case_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_case_logs_procedure_id_fkey') THEN
    EXECUTE 'ALTER TABLE "clinical_case_logs" ADD CONSTRAINT "clinical_case_logs_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "procedure_catalogs"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_case_logs_rotation_id_fkey') THEN
    EXECUTE 'ALTER TABLE "clinical_case_logs" ADD CONSTRAINT "clinical_case_logs_rotation_id_fkey" FOREIGN KEY ("rotation_id") REFERENCES "rotations"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_case_logs_trainee_profile_id_fkey') THEN
    EXECUTE 'ALTER TABLE "clinical_case_logs" ADD CONSTRAINT "clinical_case_logs_trainee_profile_id_fkey" FOREIGN KEY ("trainee_profile_id") REFERENCES "trainee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_case_logs_trainer_profile_id_fkey') THEN
    EXECUTE 'ALTER TABLE "clinical_case_logs" ADD CONSTRAINT "clinical_case_logs_trainer_profile_id_fkey" FOREIGN KEY ("trainer_profile_id") REFERENCES "trainer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competency_progress_procedure_id_fkey') THEN
    EXECUTE 'ALTER TABLE "competency_progress" ADD CONSTRAINT "competency_progress_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "procedure_catalogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competency_progress_trainee_profile_id_fkey') THEN
    EXECUTE 'ALTER TABLE "competency_progress" ADD CONSTRAINT "competency_progress_trainee_profile_id_fkey" FOREIGN KEY ("trainee_profile_id") REFERENCES "trainee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'logbook_signoffs_case_log_id_fkey') THEN
    EXECUTE 'ALTER TABLE "logbook_signoffs" ADD CONSTRAINT "logbook_signoffs_case_log_id_fkey" FOREIGN KEY ("case_log_id") REFERENCES "clinical_case_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'logbook_signoffs_signer_id_fkey') THEN
    EXECUTE 'ALTER TABLE "logbook_signoffs" ADD CONSTRAINT "logbook_signoffs_signer_id_fkey" FOREIGN KEY ("signer_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainer_leaves_organization_id_fkey') THEN
    EXECUTE 'ALTER TABLE "trainer_leaves" ADD CONSTRAINT "trainer_leaves_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainer_leaves_replacement_trainer_id_fkey') THEN
    EXECUTE 'ALTER TABLE "trainer_leaves" ADD CONSTRAINT "trainer_leaves_replacement_trainer_id_fkey" FOREIGN KEY ("replacement_trainer_id") REFERENCES "trainer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainer_leaves_trainer_profile_id_fkey') THEN
    EXECUTE 'ALTER TABLE "trainer_leaves" ADD CONSTRAINT "trainer_leaves_trainer_profile_id_fkey" FOREIGN KEY ("trainer_profile_id") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainer_reassignments_department_id_fkey') THEN
    EXECUTE 'ALTER TABLE "trainer_reassignments" ADD CONSTRAINT "trainer_reassignments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainer_reassignments_new_trainer_id_fkey') THEN
    EXECUTE 'ALTER TABLE "trainer_reassignments" ADD CONSTRAINT "trainer_reassignments_new_trainer_id_fkey" FOREIGN KEY ("new_trainer_id") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainer_reassignments_organization_id_fkey') THEN
    EXECUTE 'ALTER TABLE "trainer_reassignments" ADD CONSTRAINT "trainer_reassignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainer_reassignments_previous_trainer_id_fkey') THEN
    EXECUTE 'ALTER TABLE "trainer_reassignments" ADD CONSTRAINT "trainer_reassignments_previous_trainer_id_fkey" FOREIGN KEY ("previous_trainer_id") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainer_reassignments_trainer_leave_id_fkey') THEN
    EXECUTE 'ALTER TABLE "trainer_reassignments" ADD CONSTRAINT "trainer_reassignments_trainer_leave_id_fkey" FOREIGN KEY ("trainer_leave_id") REFERENCES "trainer_leaves"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainer_reassignment_trainees_reassignment_id_fkey') THEN
    EXECUTE 'ALTER TABLE "trainer_reassignment_trainees" ADD CONSTRAINT "trainer_reassignment_trainees_reassignment_id_fkey" FOREIGN KEY ("reassignment_id") REFERENCES "trainer_reassignments"("id") ON DELETE CASCADE ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainer_reassignment_trainees_rotation_id_fkey') THEN
    EXECUTE 'ALTER TABLE "trainer_reassignment_trainees" ADD CONSTRAINT "trainer_reassignment_trainees_rotation_id_fkey" FOREIGN KEY ("rotation_id") REFERENCES "rotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainer_reassignment_trainees_trainee_profile_id_fkey') THEN
    EXECUTE 'ALTER TABLE "trainer_reassignment_trainees" ADD CONSTRAINT "trainer_reassignment_trainees_trainee_profile_id_fkey" FOREIGN KEY ("trainee_profile_id") REFERENCES "trainee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_schedules_organization_id_fkey') THEN
    EXECUTE 'ALTER TABLE "training_schedules" ADD CONSTRAINT "training_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_schedules_department_id_fkey') THEN
    EXECUTE 'ALTER TABLE "training_schedules" ADD CONSTRAINT "training_schedules_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_schedules_created_by_fkey') THEN
    EXECUTE 'ALTER TABLE "training_schedules" ADD CONSTRAINT "training_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_participants_schedule_id_fkey') THEN
    EXECUTE 'ALTER TABLE "schedule_participants" ADD CONSTRAINT "schedule_participants_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "training_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_participants_trainee_profile_id_fkey') THEN
    EXECUTE 'ALTER TABLE "schedule_participants" ADD CONSTRAINT "schedule_participants_trainee_profile_id_fkey" FOREIGN KEY ("trainee_profile_id") REFERENCES "trainee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_templates_organization_id_fkey') THEN
    EXECUTE 'ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_templates_department_id_fkey') THEN
    EXECUTE 'ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_sessions_schedule_id_fkey') THEN
    EXECUTE 'ALTER TABLE "schedule_sessions" ADD CONSTRAINT "schedule_sessions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "training_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_sessions_organization_id_fkey') THEN
    EXECUTE 'ALTER TABLE "schedule_sessions" ADD CONSTRAINT "schedule_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_sessions_department_id_fkey') THEN
    EXECUTE 'ALTER TABLE "schedule_sessions" ADD CONSTRAINT "schedule_sessions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_sessions_trainer_profile_id_fkey') THEN
    EXECUTE 'ALTER TABLE "schedule_sessions" ADD CONSTRAINT "schedule_sessions_trainer_profile_id_fkey" FOREIGN KEY ("trainer_profile_id") REFERENCES "trainer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_sessions_trainee_profile_id_fkey') THEN
    EXECUTE 'ALTER TABLE "schedule_sessions" ADD CONSTRAINT "schedule_sessions_trainee_profile_id_fkey" FOREIGN KEY ("trainee_profile_id") REFERENCES "trainee_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_revisions_schedule_id_fkey') THEN
    EXECUTE 'ALTER TABLE "schedule_revisions" ADD CONSTRAINT "schedule_revisions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "training_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_revisions_published_by_fkey') THEN
    EXECUTE 'ALTER TABLE "schedule_revisions" ADD CONSTRAINT "schedule_revisions_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

-- Columns and indexes declared in schema.prisma that no migration ever created
-- (they existed only in databases provisioned with `db push`). Written
-- idempotently so an already-provisioned database is unaffected.

-- Columns and indexes declared in schema.prisma that no migration ever created
-- (they existed only in databases provisioned with `db push`). Written
-- idempotently so an already-provisioned database is unaffected.

ALTER TABLE "academic_intakes" DROP CONSTRAINT IF EXISTS "academic_intakes_program_id_fkey";

DROP INDEX IF EXISTS "rotations_trainee_profile_id_idx";

ALTER TABLE "capacity_allocations" ADD COLUMN IF NOT EXISTS     "training_end_date" DATE,
ADD COLUMN IF NOT EXISTS     "training_start_date" DATE;

ALTER TABLE "graduation_approvals" ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "organization_assignments" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS     "capacity" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "call_participants_call_id_trainee_profile_id_idx" ON "call_participants"("call_id", "trainee_profile_id");

CREATE INDEX IF NOT EXISTS "capacity_allocations_training_start_date_training_end_date_idx" ON "capacity_allocations"("training_start_date", "training_end_date");

CREATE INDEX IF NOT EXISTS "evaluations_rotation_id_evaluatee_id_evaluation_type_idx" ON "evaluations"("rotation_id", "evaluatee_id", "evaluation_type");

CREATE INDEX IF NOT EXISTS "rotations_trainee_profile_id_status_idx" ON "rotations"("trainee_profile_id", "status");

CREATE INDEX IF NOT EXISTS "rotations_trainer_profile_id_idx" ON "rotations"("trainer_profile_id");

ALTER TABLE "academic_intakes" ADD CONSTRAINT "academic_intakes_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
