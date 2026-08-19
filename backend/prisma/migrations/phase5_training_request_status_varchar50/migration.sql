-- AlterTable: expand TrainingRequest.status to accommodate longer Phase 5 chain status names
ALTER TABLE "training_requests" ALTER COLUMN "status" SET DATA TYPE VARCHAR(50);
