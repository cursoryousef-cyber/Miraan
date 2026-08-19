-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "max_active_interns" INTEGER,
ADD COLUMN     "max_supervisors" INTEGER,
ADD COLUMN     "max_trainers" INTEGER;

-- AlterTable
ALTER TABLE "rotations" ADD COLUMN     "supervisor_account_id" UUID;

-- CreateTable
CREATE TABLE "capacity_allocations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scope_type" VARCHAR(20) NOT NULL,
    "scope_id" VARCHAR(64) NOT NULL DEFAULT '',
    "specialty_code" VARCHAR(100) NOT NULL DEFAULT '',
    "gender" VARCHAR(10) NOT NULL DEFAULT '',
    "training_period" VARCHAR(50) NOT NULL DEFAULT '',
    "total_capacity" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "capacity_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "capacity_allocations_organization_id_scope_type_idx" ON "capacity_allocations"("organization_id", "scope_type");

-- CreateIndex
CREATE UNIQUE INDEX "capacity_allocations_organization_id_scope_type_scope_id_sp_key" ON "capacity_allocations"("organization_id", "scope_type", "scope_id", "specialty_code", "gender", "training_period");

-- AddForeignKey
ALTER TABLE "rotations" ADD CONSTRAINT "rotations_supervisor_account_id_fkey" FOREIGN KEY ("supervisor_account_id") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_allocations" ADD CONSTRAINT "capacity_allocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- DB-level over-allocation guards (defense in depth — the application layer
-- also enforces these via CapacityService/HospitalCapacityService, but these
-- triggers fire regardless of which code path writes to the table, including
-- future code, scripts, or a direct psql session).
--
-- Fallback constants mirror CapacityService's existing behavior: a hospital
-- with capacity <= 0 falls back to 50 seats; a department with no capacity
-- set falls back to its column default of 10; a trainer with no maxTrainees
-- falls back to its column default of 5. These triggers only evaluate on
-- INSERT/UPDATE of the relevant columns, so existing rows are never touched
-- retroactively.
-- ============================================================================

-- 1. Hospital total + specialty/gender/training-period capacity (trainee_profiles)
CREATE OR REPLACE FUNCTION enforce_trainee_capacity() RETURNS TRIGGER AS $$
DECLARE
  v_capacity INT;
  v_occupied INT;
  v_gender VARCHAR;
  v_specialty VARCHAR;
  v_training_period VARCHAR;
  v_row RECORD;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Hospital total capacity (organizations.capacity, existing column)
  SELECT capacity INTO v_capacity FROM organizations WHERE id = NEW.organization_id;
  IF v_capacity IS NULL OR v_capacity <= 0 THEN v_capacity := 50; END IF;

  SELECT count(*) INTO v_occupied FROM trainee_profiles
    WHERE organization_id = NEW.organization_id AND deleted_at IS NULL AND id <> NEW.id;

  IF v_occupied + 1 > v_capacity THEN
    RAISE EXCEPTION 'CAPACITY_EXCEEDED: تجاوز الطاقة الاستيعابية الكلية للمستشفى (المطلوب % من أصل %)', v_occupied + 1, v_capacity;
  END IF;

  -- Granular constraints from capacity_allocations (specialty / gender / training period)
  SELECT p.gender INTO v_gender FROM persons p WHERE p.id = NEW.person_id;
  v_specialty := COALESCE(NULLIF(NEW.specialty_en, ''), NULLIF(NEW.specialty_ar, ''), '');
  SELECT ai.academic_year INTO v_training_period FROM academic_intakes ai WHERE ai.id = NEW.academic_intake_id;

  FOR v_row IN
    SELECT * FROM capacity_allocations
    WHERE organization_id = NEW.organization_id
      AND scope_type = 'specialty'
      AND (specialty_code = '' OR specialty_code = v_specialty)
      AND (gender = '' OR gender = COALESCE(v_gender, ''))
      AND (training_period = '' OR training_period = COALESCE(v_training_period, ''))
  LOOP
    SELECT count(*) INTO v_occupied
      FROM trainee_profiles tp
      LEFT JOIN persons pp ON pp.id = tp.person_id
      LEFT JOIN academic_intakes aai ON aai.id = tp.academic_intake_id
      WHERE tp.organization_id = NEW.organization_id
        AND tp.deleted_at IS NULL
        AND tp.id <> NEW.id
        AND (v_row.specialty_code = '' OR COALESCE(NULLIF(tp.specialty_en,''), NULLIF(tp.specialty_ar,''), '') = v_row.specialty_code)
        AND (v_row.gender = '' OR COALESCE(pp.gender, '') = v_row.gender)
        AND (v_row.training_period = '' OR COALESCE(aai.academic_year, '') = v_row.training_period);

    IF v_occupied + 1 > v_row.total_capacity THEN
      RAISE EXCEPTION 'CAPACITY_EXCEEDED: تجاوز الطاقة الاستيعابية المحددة (تخصص=% جنس=% فترة=%) — الحد % والمطلوب %',
        NULLIF(v_row.specialty_code,''), NULLIF(v_row.gender,''), NULLIF(v_row.training_period,''), v_row.total_capacity, v_occupied + 1;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_trainee_capacity ON trainee_profiles;
CREATE TRIGGER trg_enforce_trainee_capacity
BEFORE INSERT OR UPDATE OF organization_id, specialty_en, specialty_ar, academic_intake_id, deleted_at
ON trainee_profiles
FOR EACH ROW EXECUTE FUNCTION enforce_trainee_capacity();

-- 2. Department + trainer + supervisor capacity (rotations, only 'active' rows occupy a seat)
CREATE OR REPLACE FUNCTION enforce_rotation_capacity() RETURNS TRIGGER AS $$
DECLARE
  v_dept_capacity INT;
  v_max_active_interns INT;
  v_dept_occupied INT;
  v_trainer_capacity INT;
  v_trainer_occupied INT;
  v_sup_capacity INT;
  v_sup_occupied INT;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT capacity, max_active_interns INTO v_dept_capacity, v_max_active_interns
    FROM departments WHERE id = NEW.department_id;
  IF v_dept_capacity IS NULL OR v_dept_capacity <= 0 THEN v_dept_capacity := 10; END IF;

  SELECT count(*) INTO v_dept_occupied FROM rotations
    WHERE department_id = NEW.department_id AND status = 'active' AND id <> NEW.id;

  IF v_dept_occupied + 1 > v_dept_capacity THEN
    RAISE EXCEPTION 'CAPACITY_EXCEEDED: تجاوز الطاقة الاستيعابية للقسم (المطلوب % من أصل %)', v_dept_occupied + 1, v_dept_capacity;
  END IF;

  IF v_max_active_interns IS NOT NULL AND v_dept_occupied + 1 > v_max_active_interns THEN
    RAISE EXCEPTION 'CAPACITY_EXCEEDED: تجاوز الحد الأعلى للمتدربين النشطين بالقسم (المطلوب % من أصل %)', v_dept_occupied + 1, v_max_active_interns;
  END IF;

  IF NEW.trainer_profile_id IS NOT NULL THEN
    SELECT max_trainees INTO v_trainer_capacity FROM trainer_profiles WHERE id = NEW.trainer_profile_id;
    IF v_trainer_capacity IS NULL OR v_trainer_capacity <= 0 THEN v_trainer_capacity := 5; END IF;

    SELECT count(*) INTO v_trainer_occupied FROM rotations
      WHERE trainer_profile_id = NEW.trainer_profile_id AND status = 'active' AND id <> NEW.id;

    IF v_trainer_occupied + 1 > v_trainer_capacity THEN
      RAISE EXCEPTION 'CAPACITY_EXCEEDED: تجاوز الطاقة الاستيعابية للمدرب (المطلوب % من أصل %)', v_trainer_occupied + 1, v_trainer_capacity;
    END IF;
  END IF;

  IF NEW.supervisor_account_id IS NOT NULL THEN
    SELECT total_capacity INTO v_sup_capacity FROM capacity_allocations
      WHERE scope_type = 'supervisor' AND scope_id = NEW.supervisor_account_id::VARCHAR
      ORDER BY created_at DESC LIMIT 1;

    IF v_sup_capacity IS NOT NULL THEN
      SELECT count(*) INTO v_sup_occupied FROM rotations
        WHERE supervisor_account_id = NEW.supervisor_account_id AND status = 'active' AND id <> NEW.id;

      IF v_sup_occupied + 1 > v_sup_capacity THEN
        RAISE EXCEPTION 'CAPACITY_EXCEEDED: تجاوز الطاقة الاستيعابية للمشرف (المطلوب % من أصل %)', v_sup_occupied + 1, v_sup_capacity;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_rotation_capacity ON rotations;
CREATE TRIGGER trg_enforce_rotation_capacity
BEFORE INSERT OR UPDATE OF department_id, trainer_profile_id, supervisor_account_id, status
ON rotations
FOR EACH ROW EXECUTE FUNCTION enforce_rotation_capacity();

