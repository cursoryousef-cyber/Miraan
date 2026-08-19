-- Phase 2 / Module 5 — University Request Workflow
-- Additive and non-destructive.

-- The batch-level specialty the university declares on the request. Per-trainee
-- specialty already lives on training_request_trainees and stays authoritative
-- for each individual row; this is the default the batch was submitted under.
ALTER TABLE "training_requests" ADD COLUMN IF NOT EXISTS "specialty" VARCHAR(100);
