-- One definition of "occupied": placements whose dates overlap the requested period.
--
-- The guard counted every rotation with status='active' in a department, with no
-- reference to when those rotations run. A department whose seats are taken by a
-- placement ending in September was therefore treated as full for a placement
-- starting the following January, and a department reported as having no seats
-- left could still accept a non-overlapping one — the number shown and the number
-- enforced were computed two different ways.
--
-- A seat is occupied for a period only while another placement holds it during
-- that period. The comparison is the one AllocationEngine and the rotation
-- overlap gate already use (`start <= other_end AND end >= other_start`), so the
-- three layers now agree. Historical rows are untouched: this changes what counts
-- as a conflict, never what is stored.

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
    WHERE department_id = NEW.department_id
      AND status = 'active'
      AND id <> NEW.id
      AND start_date <= NEW.end_date
      AND end_date   >= NEW.start_date;

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
      WHERE trainer_profile_id = NEW.trainer_profile_id
        AND status = 'active'
        AND id <> NEW.id
        AND start_date <= NEW.end_date
        AND end_date   >= NEW.start_date;

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
        WHERE supervisor_account_id = NEW.supervisor_account_id
          AND status = 'active'
          AND id <> NEW.id
          AND start_date <= NEW.end_date
          AND end_date   >= NEW.start_date;

      IF v_sup_occupied + 1 > v_sup_capacity THEN
        RAISE EXCEPTION 'CAPACITY_EXCEEDED: تجاوز الطاقة الاستيعابية للمشرف (المطلوب % من أصل %)', v_sup_occupied + 1, v_sup_capacity;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
