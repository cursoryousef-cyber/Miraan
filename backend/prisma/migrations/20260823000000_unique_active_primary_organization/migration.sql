-- One active primary organisation per account.
--
-- Membership rows carried is_primary independently, so an account could be
-- flagged primary in a hospital *and* in the cluster above it. Org context is
-- resolved by picking the first primary row found, which made the active
-- organisation depend on row order, and surfaced the trainee as though posted to
-- two places at once. Repair the data, then let the database hold the invariant.

-- Demote a primary row whose organisation is the parent of another primary row
-- held by the same account: you cannot be primarily in both a parent and its child.
UPDATE organization_assignments oa SET is_primary = false
FROM organizations o, organization_assignments oa2, organizations child
WHERE oa.organization_id = o.id
  AND oa2.user_account_id = oa.user_account_id AND oa2.is_primary AND oa2.is_active
  AND child.id = oa2.organization_id
  AND oa.is_primary AND oa.is_active
  AND child.parent_id = o.id;

UPDATE user_organizations uo SET is_primary = false
FROM organizations o, user_organizations uo2, organizations child
WHERE uo.organization_id = o.id
  AND uo2.user_account_id = uo.user_account_id AND uo2.is_primary AND uo2.is_active
  AND child.id = uo2.organization_id
  AND uo.is_primary AND uo.is_active
  AND child.parent_id = o.id;

-- Partial so that ended memberships may keep their historical is_primary flag.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_primary_org_assignment
  ON organization_assignments (user_account_id)
  WHERE is_primary AND is_active;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_primary_user_organization
  ON user_organizations (user_account_id)
  WHERE is_primary AND is_active;
