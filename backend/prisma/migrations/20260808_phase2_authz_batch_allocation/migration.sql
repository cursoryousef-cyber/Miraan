-- AlterTable
ALTER TABLE "academic_intakes" ADD COLUMN     "approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "approved_by" UUID,
ADD COLUMN     "training_request_id" UUID,
ADD COLUMN     "university_org_id" UUID;

-- AlterTable
ALTER TABLE "training_request_trainees" ADD COLUMN     "academic_intake_id" UUID;

-- CreateTable
CREATE TABLE "trainee_allocations" (
    "id" UUID NOT NULL,
    "trainee_row_id" UUID NOT NULL,
    "trainee_profile_id" UUID,
    "academic_intake_id" UUID,
    "training_request_id" UUID,
    "cluster_org_id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "department_id" UUID,
    "trainer_profile_id" UUID,
    "supervisor_account_id" UUID,
    "previous_allocation_id" UUID,
    "previous_hospital_id" UUID,
    "previous_department_id" UUID,
    "previous_trainer_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "action" VARCHAR(30) NOT NULL,
    "reason" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "performed_by" UUID,
    "performed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trainee_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trainee_allocations_previous_allocation_id_key" ON "trainee_allocations"("previous_allocation_id");

-- CreateIndex
CREATE INDEX "trainee_allocations_trainee_row_id_status_idx" ON "trainee_allocations"("trainee_row_id", "status");

-- CreateIndex
CREATE INDEX "trainee_allocations_hospital_id_status_idx" ON "trainee_allocations"("hospital_id", "status");

-- CreateIndex
CREATE INDEX "trainee_allocations_cluster_org_id_status_idx" ON "trainee_allocations"("cluster_org_id", "status");

-- CreateIndex
CREATE INDEX "trainee_allocations_academic_intake_id_idx" ON "trainee_allocations"("academic_intake_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_intakes_training_request_id_key" ON "academic_intakes"("training_request_id");

-- CreateIndex
CREATE INDEX "academic_intakes_training_request_id_idx" ON "academic_intakes"("training_request_id");

-- AddForeignKey
ALTER TABLE "academic_intakes" ADD CONSTRAINT "academic_intakes_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_intakes" ADD CONSTRAINT "academic_intakes_university_org_id_fkey" FOREIGN KEY ("university_org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_intakes" ADD CONSTRAINT "academic_intakes_training_request_id_fkey" FOREIGN KEY ("training_request_id") REFERENCES "training_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_request_trainees" ADD CONSTRAINT "training_request_trainees_academic_intake_id_fkey" FOREIGN KEY ("academic_intake_id") REFERENCES "academic_intakes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_allocations" ADD CONSTRAINT "trainee_allocations_trainee_row_id_fkey" FOREIGN KEY ("trainee_row_id") REFERENCES "training_request_trainees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_allocations" ADD CONSTRAINT "trainee_allocations_academic_intake_id_fkey" FOREIGN KEY ("academic_intake_id") REFERENCES "academic_intakes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_allocations" ADD CONSTRAINT "trainee_allocations_training_request_id_fkey" FOREIGN KEY ("training_request_id") REFERENCES "training_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_allocations" ADD CONSTRAINT "trainee_allocations_cluster_org_id_fkey" FOREIGN KEY ("cluster_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_allocations" ADD CONSTRAINT "trainee_allocations_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_allocations" ADD CONSTRAINT "trainee_allocations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_allocations" ADD CONSTRAINT "trainee_allocations_trainer_profile_id_fkey" FOREIGN KEY ("trainer_profile_id") REFERENCES "trainer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_allocations" ADD CONSTRAINT "trainee_allocations_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_allocations" ADD CONSTRAINT "trainee_allocations_previous_allocation_id_fkey" FOREIGN KEY ("previous_allocation_id") REFERENCES "trainee_allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── Invariants enforced by the database, not just by service code ───────────
-- A trainee may hold exactly one OPEN allocation at a time. Expressed as a
-- partial unique index because Prisma cannot model a filtered constraint; this
-- makes "reassignment must close the previous allocation" impossible to violate
-- even by a direct SQL write or a racing request.
CREATE UNIQUE INDEX "trainee_allocations_one_open_per_trainee"
  ON "trainee_allocations" ("trainee_row_id")
  WHERE "status" = 'open';

-- Allocation status and action are closed vocabularies.
ALTER TABLE "trainee_allocations"
  ADD CONSTRAINT "trainee_allocations_status_check"
  CHECK ("status" IN ('open', 'superseded', 'closed', 'cancelled'));

ALTER TABLE "trainee_allocations"
  ADD CONSTRAINT "trainee_allocations_action_check"
  CHECK ("action" IN ('auto', 'manual', 'cluster_reassign', 'hospital_reassign', 'hospital_assign'));

-- A closed allocation must record when and a superseded one must chain back, so
-- history cannot be silently truncated.
ALTER TABLE "trainee_allocations"
  ADD CONSTRAINT "trainee_allocations_closed_has_timestamp"
  CHECK ("status" = 'open' OR "closed_at" IS NOT NULL);

-- Department capacity can never be negative.
ALTER TABLE "departments"
  ADD CONSTRAINT "departments_capacity_non_negative" CHECK ("capacity" >= 0);
