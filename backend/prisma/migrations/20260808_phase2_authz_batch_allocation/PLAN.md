# Phase 2 migration — plan for review

**Status: NOT APPLIED to production.** Applied and verified on the local test
database (`miran_test`) only. Nothing in this migration has run against Neon.

---

## 1. What the SQL does

`migration.sql` is **purely additive**. It contains no `DROP`, no column type
change, no data modification, and no row deletion. Verify with:

```bash
# Matches only statement-leading keywords, so ON DELETE / updated_at do not
# produce false positives. Exit code 1 (no matches) is the expected result.
grep -inE '^\s*(DROP|DELETE|TRUNCATE|UPDATE)\b' \
  prisma/migrations/20260808_phase2_authz_batch_allocation/migration.sql
```

Verified 2026-08-08: **no matches**.

| # | Change | Kind | Nullable / default | Reversible |
|---|--------|------|--------------------|------------|
| 1 | `academic_intakes.training_request_id` (UUID, UNIQUE, FK) | ADD COLUMN | NULL | yes |
| 2 | `academic_intakes.university_org_id` (UUID, FK) | ADD COLUMN | NULL | yes |
| 3 | `academic_intakes.approved_by` (UUID, FK) | ADD COLUMN | NULL | yes |
| 4 | `academic_intakes.approved_at` (timestamptz) | ADD COLUMN | NULL | yes |
| 5 | `training_request_trainees.academic_intake_id` (UUID, FK) | ADD COLUMN | NULL | yes |
| 6 | `trainee_allocations` | CREATE TABLE | — | yes (drop) |
| 7 | `trainee_allocations_one_open_per_trainee` | partial UNIQUE INDEX | — | yes |
| 8 | 3 × CHECK constraint on `trainee_allocations` | ADD CONSTRAINT | — | yes |
| 9 | `departments_capacity_non_negative` CHECK | ADD CONSTRAINT | — | yes |

Every new column is nullable, so existing rows remain valid without backfill.

### The one constraint that touches existing data

`departments_capacity_non_negative` (`capacity >= 0`) is validated against
existing rows at `ALTER TABLE` time and will **fail** if any department currently
holds a negative capacity. Check before applying:

```sql
SELECT id, name_ar, capacity FROM departments WHERE capacity < 0;
```

Production check performed 2026-08-08: **0 rows**. The constraint will apply
cleanly. Re-run immediately before applying, since the data may have changed.

---

## 2. Before / after counts (production, measured 2026-08-08, read-only)

| Table | Before | After migration | Change |
|-------|--------|-----------------|--------|
| `organizations` | 12 | 12 | none |
| `user_accounts` | unchanged | unchanged | none |
| `roles` | 19 | 19 | **none — no role is created, renamed or deleted** |
| `user_roles` | 51 | 51 | **none — no user is migrated** |
| `organization_assignments` | 59 | 59 | none |
| `notifications` | 32 | 32 | **none — no notification is deleted** |
| `training_requests` | 2 | 2 | none |
| `academic_intakes` | 1 | 1 (+4 NULL columns) | schema only |
| `training_request_trainees` | 0 | 0 (+1 NULL column) | schema only |
| `departments` | 21 | 21 | none |
| `trainee_allocations` | — | 0 (new, empty) | new table |

**No row in any existing table is inserted, updated or deleted.**

---

## 3. Affected organisations, users, roles, notifications

### Organisations — none modified
Diagnosed but **not changed**:
- `NB-CLUSTER` and `NB-CLUSTER-PROD` are duplicate clusters (1 vs 4 hospitals).
- `NBU-UNIVERSITY`, `NBU-UNI-PROD`, `TU` are three university records.
- `HOSP-TEST-ADD` has no parent cluster.
Merging these is a **separate, later migration** requiring your decision on which
record survives. It is not part of this one.

### Users — none migrated
No user's roles change. Two behavioural consequences follow from *code*, not from
data:

| Account | Effect | Why |
|---------|--------|-----|
| `hospadmin@miran.health`, `hospital.director@miran.health` | lose training actions (capacity, trainers, allocation) | `hospital_administrator` holds no training capability |
| 12 accounts with roleless cluster/hospital memberships | can no longer switch into that context | the context granted a session with zero roles |

**Recommended follow-up (needs your approval, not included here):** grant
`hospital_training_admin` to the two hospital directors so their hospitals retain
an operator, and grant `training_director` at the correct cluster to
`cluster@miran.health`.

### Roles — none deleted or renamed
`cluster_manager` is deprecated in the training workflow by holding no training
capability. Its database row, its legacy permissions and its two holders are
untouched. `cluster_administrator` keeps its full existing authority verbatim.

### Notifications — none deleted
13 notifications reference records that no longer exist. They are now hidden from
the feed and the unread count **at read time**; the rows remain for audit.
Deleting them is a separate migration.

---

## 4. Rollback

Fully reversible. In a transaction:

```sql
BEGIN;

ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "departments_capacity_non_negative";

DROP TABLE IF EXISTS "trainee_allocations";

ALTER TABLE "training_request_trainees"
  DROP COLUMN IF EXISTS "academic_intake_id";

ALTER TABLE "academic_intakes"
  DROP COLUMN IF EXISTS "training_request_id",
  DROP COLUMN IF EXISTS "university_org_id",
  DROP COLUMN IF EXISTS "approved_by",
  DROP COLUMN IF EXISTS "approved_at";

COMMIT;
```

Rolling back discards any allocation history written after the migration, so take
a snapshot of `trainee_allocations` first if the system has been live on it.
The application code must be rolled back with it — the current code reads
`trainee_allocations`.

---

## 5. Order of operations when you approve

1. Snapshot the database (Neon branch or `pg_dump`).
2. Run the negative-capacity check above; expect 0 rows.
3. Apply `migration.sql` inside a transaction.
4. Deploy the backend (it reads the new table).
5. Re-run `src/scripts/production-discrepancy-report.ts` — it now reports
   post-migration state and confirms the columns exist.
6. Have each hospital's training administration enter its departments and
   capacity. **Until then, `HOSP-RAFHA` and `HOSP-TURAIF` compute to 0 capacity
   and cannot receive allocations** — they declare capacity on the organisation
   row but have no departments.

Step 6 is the operational consequence of making departments the source of truth.
It is data entry by the hospitals, not something to fix by script.

---

## 6. Deliberately excluded from this migration

- Merging duplicate clusters or universities
- Attaching `HOSP-TEST-ADD` to a cluster
- Deleting dangling notifications
- Deleting or renaming any role
- Migrating any user between roles
- Backfilling `academic_intake_id` on the 15 existing trainee profiles
- Correcting any capacity value

Each needs its own reviewed migration with its own before/after counts.
