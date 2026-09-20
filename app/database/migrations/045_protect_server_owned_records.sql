-- Profile entitlements, role flags, session tokens and scores are server-owned.
-- The frontend edits account settings and starts interviews through authorized
-- FastAPI endpoints. Browser RLS must not also expose these rows for mutation.
DROP POLICY IF EXISTS profiles_self_update ON profiles;
DROP POLICY IF EXISTS sessions_self_insert ON interview_sessions;
DROP POLICY IF EXISTS sessions_self_update ON interview_sessions;

-- Supabase commonly grants table privileges to these roles by default. Preserve
-- SELECT policies, but remove browser mutation privileges even if a permissive
-- policy is accidentally introduced later. Dedicated backend roles are unchanged.
DO $$
DECLARE browser_role TEXT;
BEGIN
    FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=browser_role) THEN
            EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON profiles, interview_sessions FROM %I', browser_role);
        END IF;
    END LOOP;
END $$;
