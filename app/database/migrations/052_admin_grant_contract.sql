BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, public;

-- Deploy only with the corrected writers. Never reinterpret existing markers
-- as finite amounts or manufacture historical journal/audit entries.
LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;
DO $domain$
BEGIN
    IF EXISTS (SELECT FROM public.profiles WHERE admin_bonus_interviews IS NULL
               OR NOT (admin_bonus_interviews BETWEEN 0 AND 1000 OR admin_bonus_interviews IN (9991,9992,9993))) THEN
        RAISE EXCEPTION 'Unsupported bonus data; explicit investigation required';
    END IF;
    IF EXISTS (SELECT FROM pg_constraint WHERE conrelid='public.profiles'::regclass
               AND conname='chk_profiles_admin_bonus_max'
               AND pg_get_constraintdef(oid)<>'CHECK ((admin_bonus_interviews <= 1000))') THEN
        RAISE EXCEPTION 'Unexpected historical bonus constraint definition';
    END IF;
END $domain$;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_admin_bonus_max;
ALTER TABLE public.profiles ALTER COLUMN admin_bonus_interviews SET NOT NULL;
ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_admin_bonus_domain
    CHECK (admin_bonus_interviews BETWEEN 0 AND 1000 OR admin_bonus_interviews IN (9991,9992,9993));

CREATE INDEX IF NOT EXISTS idx_profiles_has_admin_bonus
    ON public.profiles(id,admin_bonus_interviews) WHERE admin_bonus_interviews>0;
DO $index$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_index WHERE indexrelid='public.idx_profiles_has_admin_bonus'::regclass
                   AND indrelid='public.profiles'::regclass AND indisvalid AND indisready AND NOT indisunique)
       OR substring(pg_get_indexdef('public.idx_profiles_has_admin_bonus'::regclass) FROM ' USING .*')
          IS DISTINCT FROM ' USING btree (id, admin_bonus_interviews) WHERE (admin_bonus_interviews > 0)' THEN
        RAISE EXCEPTION 'Incompatible profile bonus index';
    END IF;
END $index$;

-- Deliberately no IF NOT EXISTS: an unexplained pre-existing journal is drift.
CREATE TABLE public.admin_grant_operations (
    request_id uuid PRIMARY KEY,
    actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan text NOT NULL CHECK (plan IN ('free','pro','career')),
    grant_kind text NOT NULL CHECK (grant_kind IN ('normal','unlimited')),
    action text NOT NULL CHECK (action IN ('activate','deactivate')),
    request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
    before_state jsonb NOT NULL CHECK (jsonb_typeof(before_state)='object'),
    after_state jsonb NOT NULL CHECK (jsonb_typeof(after_state)='object'),
    response jsonb NOT NULL CHECK (jsonb_typeof(response)='object'),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_grant_operations_target ON public.admin_grant_operations(target_id,created_at DESC);
DO $acl$
DECLARE r record; role_name text;
BEGIN
    FOR r IN SELECT DISTINCT x.grantee FROM pg_class c,
        LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) x
        WHERE c.oid='public.admin_grant_operations'::regclass AND x.grantee<>c.relowner LOOP
        role_name := CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
        EXECUTE format('REVOKE ALL ON public.admin_grant_operations FROM %s',role_name);
    END LOOP;
END $acl$;
GRANT SELECT,INSERT ON public.admin_grant_operations TO prepvista_runtime;
ALTER TABLE public.admin_grant_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY backend_journal_select ON public.admin_grant_operations FOR SELECT TO prepvista_runtime USING (true);
CREATE POLICY backend_journal_insert ON public.admin_grant_operations FOR INSERT TO prepvista_runtime WITH CHECK (true);
DO $verify_acl$
BEGIN
    IF has_table_privilege('prepvista_runtime','public.admin_grant_operations','UPDATE,DELETE,TRUNCATE')
       OR has_table_privilege('anon','public.admin_grant_operations','SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated','public.admin_grant_operations','SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('prepvista_worker','public.admin_grant_operations','SELECT,INSERT,UPDATE,DELETE') THEN
        RAISE EXCEPTION 'Unsafe inherited journal privileges';
    END IF;
END $verify_acl$;
COMMENT ON COLUMN public.profiles.admin_bonus_interviews IS
    'Finite bonus 0..1000 or tier marker Free=9991, Pro=9992, Career=9993. Expires at rolling usage-period reset. Prospective manual requests recorded in admin_grant_operations; finite adjustments in admin_bonus_grants.';
COMMIT;
