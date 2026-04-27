-- One-shot backfill: mark legacy seeded admins as having default
-- credentials so the boot reconciliation can re-hash their secret to
-- the documented default `Toqeerkhan@123.com`. Match is restricted to
-- rows that (a) have a matching `admin_seed_super_admin_created` audit
-- entry (proving they were created by the seed bootstrap) and (b) are
-- still in the legacy `must_change_password = true` state. This keeps
-- the two-flag safety guard intact for reset-link flows on real admins.
UPDATE "admin_accounts" a
   SET "default_credentials" = true
 WHERE a."must_change_password" = true
   AND EXISTS (
     SELECT 1
       FROM "admin_audit_log" l
      WHERE l."admin_id" = a."id"
        AND l."event"    = 'admin_seed_super_admin_created'
   );
