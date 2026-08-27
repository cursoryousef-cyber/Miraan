-- Recover trainee profiles that were created by the retired direct-import path.
--
-- The canonical placement path is:
--   TrainingRequest -> AcademicIntake -> TrainingRequestTrainee -> TraineeProfile
--
-- Older direct-imported profiles can exist without the TrainingRequestTrainee row.
-- Reallocation is intentionally keyed on that row because it is the source of
-- request/batch/cluster provenance. This migration repairs that data boundary.
--
-- Phase 1: attach an existing candidate row whenever identity gives an
-- unambiguous match. No synthetic provenance is created in this phase.
-- Phase 2: for the remaining legacy profiles, create an explicitly marked
-- "legacy recovery" request + academic intake + candidate row using only facts
-- already present on the profile (university/sponsor and current hospital).
-- This does NOT pretend the original request existed; the notes identify the
-- records as reconstructed legacy provenance so they can now participate in the
-- canonical allocation workflow and remain auditable.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Link orphan profiles to an existing request row where the identity match
--    is unambiguous. Priority: person_id > national_id > academic number.
-- ---------------------------------------------------------------------------
WITH ranked_matches AS (
  SELECT
    tp.id AS profile_id,
    trt.id AS row_id,
    ROW_NUMBER() OVER (
      PARTITION BY tp.id
      ORDER BY
        CASE
          WHEN trt.person_id = tp.person_id THEN 1
          WHEN trt.national_id = p.national_id AND p.national_id IS NOT NULL THEN 2
          WHEN trt.academic_number = tp.trainee_number THEN 3
          ELSE 9
        END,
        trt.created_at DESC
    ) AS rn
  FROM trainee_profiles tp
  JOIN persons p ON p.id = tp.person_id
  JOIN training_request_trainees trt
    ON trt.trainee_profile_id IS NULL
   AND (
        trt.person_id = tp.person_id
        OR (p.national_id IS NOT NULL AND trt.national_id = p.national_id)
        OR trt.academic_number = tp.trainee_number
   )
  WHERE NOT EXISTS (
    SELECT 1
    FROM training_request_trainees already
    WHERE already.trainee_profile_id = tp.id
  )
)
UPDATE training_request_trainees trt
SET
  trainee_profile_id = m.profile_id,
  person_id = COALESCE(trt.person_id, tp.person_id),
  updated_at = NOW()
FROM ranked_matches m
JOIN trainee_profiles tp ON tp.id = m.profile_id
WHERE m.rn = 1
  AND trt.id = m.row_id;

-- ---------------------------------------------------------------------------
-- 2) Reconstruct a canonical source for genuinely orphaned legacy profiles.
--    Only profiles with a real national ID are reconstructed; records lacking
--    that identity remain untouched rather than inventing an identity value.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_request_id UUID;
  v_intake_id UUID;
  v_row_id UUID;
  v_start_date DATE;
  v_end_date DATE;
  v_source_org_id UUID;
  v_intake_org_id UUID;
  v_year TEXT;
BEGIN
  FOR r IN
    SELECT
      tp.id,
      tp.person_id,
      tp.organization_id,
      tp.trainee_number,
      tp.level,
      tp.specialty_ar,
      tp.specialty_en,
      tp.sponsor_organization_id,
      tp.program_id,
      tp.training_plan_id,
      tp.training_plan_version_id,
      tp.expected_graduation_date,
      tp.access_start_date,
      tp.access_end_date,
      tp.created_by_id,
      tp.created_at,
      p.national_id,
      p.name_ar,
      p.name_en,
      p.gender,
      p.phone,
      p.email
    FROM trainee_profiles tp
    JOIN persons p ON p.id = tp.person_id
    WHERE p.national_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM training_request_trainees trt
        WHERE trt.trainee_profile_id = tp.id
      )
  LOOP
    v_request_id := gen_random_uuid();
    v_intake_id := gen_random_uuid();
    v_row_id := gen_random_uuid();

    v_start_date := COALESCE(r.access_start_date, r.created_at::date);
    v_end_date := COALESCE(
      r.access_end_date,
      r.expected_graduation_date,
      v_start_date + INTERVAL '365 days'
    );
    IF v_end_date < v_start_date THEN
      v_end_date := v_start_date + INTERVAL '365 days';
    END IF;

    v_source_org_id := COALESCE(r.sponsor_organization_id, r.organization_id);
    v_intake_org_id := COALESCE(r.sponsor_organization_id, r.organization_id);
    v_year := EXTRACT(YEAR FROM v_start_date)::TEXT;

    INSERT INTO training_requests (
      id,
      request_number,
      source_org_id,
      target_org_id,
      program_id,
      student_count,
      priority,
      status,
      notes,
      allocations,
      created_by_id,
      updated_by_id,
      created_at,
      updated_at,
      training_plan_id,
      training_plan_version_id,
      training_start_date,
      training_end_date,
      expected_graduation_date,
      specialty
    ) VALUES (
      v_request_id,
      'LEGACY-RECOVERY-' || LEFT(REPLACE(r.id::TEXT, '-', ''), 16),
      v_source_org_id,
      r.organization_id,
      r.program_id,
      1,
      'normal',
      'allocated',
      'سجل استعادة لبيانات متدرب تاريخية أُنشئ خارج دورة العمل القديمة. تم إنشاؤه تلقائياً للمحافظة على مصدر قابل للتتبع وإتاحة إعادة التوزيع عبر سجل التخصيص الرسمي.',
      '[]'::jsonb,
      r.created_by_id,
      r.created_by_id,
      r.created_at,
      NOW(),
      r.training_plan_id,
      r.training_plan_version_id,
      v_start_date,
      v_end_date,
      r.expected_graduation_date,
      r.specialty_ar
    );

    INSERT INTO academic_intakes (
      id,
      organization_id,
      program_id,
      code,
      name_ar,
      name_en,
      academic_year,
      start_date,
      end_date,
      capacity,
      status,
      notes,
      created_by_id,
      updated_by_id,
      created_at,
      updated_at,
      training_request_id,
      university_org_id
    ) VALUES (
      v_intake_id,
      v_intake_org_id,
      r.program_id,
      'LEGACY-INTAKE-' || LEFT(REPLACE(r.id::TEXT, '-', ''), 16),
      'دفعة استعادة بيانات تاريخية - ' || r.trainee_number,
      'Legacy Recovery Batch - ' || r.trainee_number,
      v_year,
      v_start_date,
      v_end_date,
      1,
      'active',
      'دفعة استعادة تلقائية لملف متدرب تاريخي كان موجوداً دون طلب تدريب/دفعة أكاديمية مرتبطة.',
      r.created_by_id,
      r.created_by_id,
      r.created_at,
      NOW(),
      v_request_id,
      r.sponsor_organization_id
    );

    UPDATE training_requests
    SET academic_intake_id = v_intake_id,
        updated_at = NOW()
    WHERE id = v_request_id;

    INSERT INTO training_request_trainees (
      id,
      training_request_id,
      person_id,
      trainee_profile_id,
      academic_number,
      national_id,
      name_ar,
      name_en,
      gender,
      university_org_id,
      specialty,
      mobile,
      email,
      start_date,
      end_date,
      priority,
      status,
      assigned_hospital_id,
      academic_intake_id,
      created_by_id,
      updated_by_id,
      created_at,
      updated_at
    ) VALUES (
      v_row_id,
      v_request_id,
      r.person_id,
      r.id,
      r.trainee_number,
      r.national_id,
      r.name_ar,
      r.name_en,
      r.gender,
      r.sponsor_organization_id,
      r.specialty_ar,
      r.phone,
      r.email,
      v_start_date,
      v_end_date,
      'normal',
      'allocated',
      r.organization_id,
      v_intake_id,
      r.created_by_id,
      r.created_by_id,
      r.created_at,
      NOW()
    );

    UPDATE trainee_profiles
    SET academic_intake_id = v_intake_id,
        updated_at = NOW()
    WHERE id = r.id
      AND academic_intake_id IS NULL;
  END LOOP;
END $$;

COMMIT;
