-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "assigned_to" UUID,
ADD COLUMN     "category" VARCHAR(50),
ADD COLUMN     "escalation_level" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "evidence_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "target_organization_id" UUID,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "incident_comments" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incident_comments_incident_id_idx" ON "incident_comments"("incident_id");

-- CreateIndex
CREATE INDEX "incidents_organization_id_idx" ON "incidents"("organization_id");

-- CreateIndex
CREATE INDEX "incidents_target_organization_id_idx" ON "incidents"("target_organization_id");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_target_organization_id_fkey" FOREIGN KEY ("target_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_comments" ADD CONSTRAINT "incident_comments_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_comments" ADD CONSTRAINT "incident_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
