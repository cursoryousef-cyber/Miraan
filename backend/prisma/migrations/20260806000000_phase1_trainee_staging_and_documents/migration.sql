-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_user_id_fkey";

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "trainee_profile_id" UUID,
ADD COLUMN     "training_request_trainee_id" UUID,
ALTER COLUMN "user_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "training_request_trainees" (
    "id" UUID NOT NULL,
    "training_request_id" UUID NOT NULL,
    "person_id" UUID,
    "trainee_profile_id" UUID,
    "academic_number" VARCHAR(50) NOT NULL,
    "national_id" VARCHAR(20) NOT NULL,
    "name_ar" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200),
    "gender" VARCHAR(10),
    "university_org_id" UUID,
    "college_org_id" UUID,
    "internship_program" VARCHAR(200),
    "specialty" VARCHAR(200),
    "gpa" DECIMAL(4,2),
    "mobile" VARCHAR(20),
    "email" VARCHAR(200),
    "training_period" VARCHAR(50),
    "start_date" DATE,
    "end_date" DATE,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "validation_errors" JSONB NOT NULL DEFAULT '[]',
    "cluster_internal_notes" TEXT,
    "official_comments" TEXT,
    "return_reason" TEXT,
    "required_documents" JSONB NOT NULL DEFAULT '[]',
    "correction_deadline" DATE,
    "assigned_hospital_id" UUID,
    "assigned_department_id" UUID,
    "assigned_trainer_profile_id" UUID,
    "assigned_supervisor_account_id" UUID,
    "merged_into_id" UUID,
    "split_from_id" UUID,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "training_request_trainees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "training_request_trainees_trainee_profile_id_key" ON "training_request_trainees"("trainee_profile_id");

-- CreateIndex
CREATE INDEX "training_request_trainees_training_request_id_idx" ON "training_request_trainees"("training_request_id");

-- CreateIndex
CREATE INDEX "training_request_trainees_national_id_idx" ON "training_request_trainees"("national_id");

-- CreateIndex
CREATE INDEX "training_request_trainees_academic_number_idx" ON "training_request_trainees"("academic_number");

-- CreateIndex
CREATE INDEX "training_request_trainees_status_idx" ON "training_request_trainees"("status");

-- CreateIndex
CREATE INDEX "documents_trainee_profile_id_idx" ON "documents"("trainee_profile_id");

-- CreateIndex
CREATE INDEX "documents_training_request_trainee_id_idx" ON "documents"("training_request_trainee_id");

-- AddForeignKey
ALTER TABLE "training_request_trainees" ADD CONSTRAINT "training_request_trainees_training_request_id_fkey" FOREIGN KEY ("training_request_id") REFERENCES "training_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_request_trainees" ADD CONSTRAINT "training_request_trainees_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_request_trainees" ADD CONSTRAINT "training_request_trainees_trainee_profile_id_fkey" FOREIGN KEY ("trainee_profile_id") REFERENCES "trainee_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_request_trainees" ADD CONSTRAINT "training_request_trainees_university_org_id_fkey" FOREIGN KEY ("university_org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_request_trainees" ADD CONSTRAINT "training_request_trainees_college_org_id_fkey" FOREIGN KEY ("college_org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_request_trainees" ADD CONSTRAINT "training_request_trainees_assigned_hospital_id_fkey" FOREIGN KEY ("assigned_hospital_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_request_trainees" ADD CONSTRAINT "training_request_trainees_assigned_department_id_fkey" FOREIGN KEY ("assigned_department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_request_trainees" ADD CONSTRAINT "training_request_trainees_assigned_trainer_profile_id_fkey" FOREIGN KEY ("assigned_trainer_profile_id") REFERENCES "trainer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_request_trainees" ADD CONSTRAINT "training_request_trainees_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "training_request_trainees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_request_trainees" ADD CONSTRAINT "training_request_trainees_split_from_id_fkey" FOREIGN KEY ("split_from_id") REFERENCES "training_request_trainees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_trainee_profile_id_fkey" FOREIGN KEY ("trainee_profile_id") REFERENCES "trainee_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_training_request_trainee_id_fkey" FOREIGN KEY ("training_request_trainee_id") REFERENCES "training_request_trainees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

