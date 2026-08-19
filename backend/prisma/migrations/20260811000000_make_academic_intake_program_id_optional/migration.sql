-- Make program_id optional in academic_intakes
-- Non-destructive migration: allows NULL for program_id on academic_intakes while preserving FK constraint.

ALTER TABLE "academic_intakes" ALTER COLUMN "program_id" DROP NOT NULL;
