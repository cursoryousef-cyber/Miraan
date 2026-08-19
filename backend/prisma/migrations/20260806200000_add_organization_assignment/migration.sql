-- CreateTable
CREATE TABLE "organization_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_account_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "department_id" UUID,
    "role_id" UUID,
    "assignment_type" VARCHAR(20) NOT NULL DEFAULT 'permanent',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMPTZ,
    "reason" TEXT,
    "notes" TEXT,
    "source_type" VARCHAR(30) NOT NULL DEFAULT 'manual',
    "source_id" UUID,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_assignments_user_account_id_is_active_idx" ON "organization_assignments"("user_account_id", "is_active");

-- CreateIndex
CREATE INDEX "organization_assignments_organization_id_is_active_idx" ON "organization_assignments"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "organization_assignments_user_account_id_organization_id_idx" ON "organization_assignments"("user_account_id", "organization_id");

-- AddForeignKey
ALTER TABLE "organization_assignments" ADD CONSTRAINT "organization_assignments_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_assignments" ADD CONSTRAINT "organization_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_assignments" ADD CONSTRAINT "organization_assignments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_assignments" ADD CONSTRAINT "organization_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
