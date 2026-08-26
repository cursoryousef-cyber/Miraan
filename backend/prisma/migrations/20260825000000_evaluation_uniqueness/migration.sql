-- One assessment per author, per rotation, per type.
--
-- `submitTrainerEvaluation` created unconditionally: it never looked for an
-- existing record, so every tap of "إرسال التقييم" wrote another row and one
-- assessment accumulated duplicates on the trainee's record.
--
-- The key is the one the table's own index already names — rotation, evaluatee,
-- type — widened by the evaluator, because a rotation is legitimately assessed
-- by more than one person (the trainer files theirs, an academic supervisor may
-- file theirs of the same type). Distinct types stay distinct, so a midpoint and
-- a final evaluation still coexist.
--
-- rotation_id is nullable and Postgres treats NULLs as distinct, so ad-hoc
-- evaluations that carry no rotation are deliberately left unconstrained.

-- Repair first: keep the earliest row of each duplicate group and drop the
-- repeats, which are re-submissions of the same assessment.
DELETE FROM evaluations e
USING evaluations keep
WHERE e.rotation_id IS NOT NULL
  AND keep.rotation_id = e.rotation_id
  AND keep.evaluatee_id = e.evaluatee_id
  AND keep.evaluator_id = e.evaluator_id
  AND keep.evaluation_type = e.evaluation_type
  AND (keep.submitted_at, keep.id) < (e.submitted_at, e.id);

CREATE UNIQUE INDEX "evaluations_rotation_evaluatee_evaluator_type_key"
  ON "evaluations" ("rotation_id", "evaluatee_id", "evaluator_id", "evaluation_type");
