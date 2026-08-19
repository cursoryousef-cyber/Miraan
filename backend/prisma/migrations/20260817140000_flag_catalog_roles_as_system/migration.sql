-- Bring `roles.is_system` into line with the role catalogue defined in code.
--
-- Authority in this system is derived from a role's *code*: ROLE_CAPABILITIES
-- in src/common/authz/capabilities.ts maps each code to what it may do, and
-- `RequireRoles` compares codes directly. Every code listed there is therefore
-- part of the security model.
--
-- The column had drifted badly from that: in the live data `platform_owner`,
-- `trainer`, `trainee`, `cluster_manager`, `academic_supervisor`,
-- `hospital_training_admin` and `university_administrator` all carried
-- `is_system = false`, while only `hospital_administrator` and `org_manager`
-- were flagged. Anything guarding on this column alone would have protected
-- almost nothing.
--
-- The application guard does not depend on this migration — it reads the code
-- catalogue and treats those codes as protected regardless of the column — so
-- this is a data repair that makes the stored flag agree with the model, not
-- the security boundary itself.
--
-- Safety:
--   * UPDATE only. No role, permission, grant or user row is created or removed.
--   * Restricted to codes that appear in the code catalogue, so a legitimate
--     dynamic role is never promoted to a system role by accident.
--   * Only flips false -> true; a role already flagged is left alone.
--   * Idempotent: re-running matches nothing.

UPDATE "roles"
SET "is_system" = true
WHERE "is_system" = false
  AND "code" IN (
    -- Platform
    'platform_owner',
    'system_admin',
    'holding_administrator',
    -- Cluster
    'cluster_manager',
    'cluster_administrator',
    'training_director',
    -- Hospital
    'hospital_training_admin',
    'hospital_administrator',
    -- Training delivery
    'trainer',
    'trainee',
    -- Academic / university
    'academic_supervisor',
    'university_administrator',
    'academic_affairs',
    -- Organisation
    'org_manager'
  );
