-- AlterTable: add isLocked and archivedAt to trainee_profiles
ALTER TABLE "trainee_profiles" ADD COLUMN IF NOT EXISTS "is_locked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "trainee_profiles" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMPTZ;

-- CreateTable: graduation_approvals for multi-role graduation sign-off chain
CREATE TABLE IF NOT EXISTS "graduation_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trainee_profile_id" UUID NOT NULL,
    "approver_role" VARCHAR(50) NOT NULL,
    "approved_by" UUID NOT NULL,
    "approved_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    CONSTRAINT "graduation_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "graduation_approvals_trainee_profile_id_approver_role_key"
    ON "graduation_approvals"("trainee_profile_id", "approver_role");

-- AddForeignKey
ALTER TABLE "graduation_approvals" ADD CONSTRAINT "graduation_approvals_trainee_profile_id_fkey"
    FOREIGN KEY ("trainee_profile_id") REFERENCES "trainee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "graduation_approvals" ADD CONSTRAINT "graduation_approvals_approved_by_fkey"
    FOREIGN KEY ("approved_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
