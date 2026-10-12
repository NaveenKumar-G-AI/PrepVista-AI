BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, public;

-- Reconcile only current tables from 012/017. Transaction-local canonical tables
-- make column/default/constraint comparisons independent of generated names.
-- No historical records or institution-era helpers are reconstructed.
-- TEMP tables cannot reference permanent parents. This private comparison
-- schema is created and removed in this transaction; collisions fail closed.
CREATE SCHEMA pv_reconcile_048a;
REVOKE ALL ON SCHEMA pv_reconcile_048a FROM PUBLIC,anon,authenticated,prepvista_runtime,prepvista_worker,service_role;
DO $reconcile$
DECLARE r record; target oid; expected oid; mismatch boolean; seq text;
BEGIN
    FOR r IN SELECT * FROM (VALUES
('admin_bonus_grants', $ddl$    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    granted_by     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    granted_to     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount         INT         NOT NULL
                               CHECK (amount BETWEEN -1000 AND 1000)
                               CHECK (amount != 0),
    reason         TEXT,
    snapshot_after INT         NOT NULL CHECK (snapshot_after >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()$ddl$),
('org_admin_invites', $ddl$    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invited_email   TEXT         NOT NULL,
    invited_by      UUID         REFERENCES public.profiles(id) ON DELETE SET NULL,
    role            TEXT         NOT NULL DEFAULT 'org_admin'
                    CHECK (role IN (
                        'org_admin', 'dept_admin', 'viewer', 'placement_officer'
                    )),
    department_id   UUID         REFERENCES public.college_departments(id) ON DELETE SET NULL,
    token           TEXT         NOT NULL UNIQUE,
    status          TEXT         NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    sent_at         TIMESTAMPTZ  DEFAULT NOW(),
    accepted_at     TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    created_at      TIMESTAMPTZ  DEFAULT NOW()$ddl$),
('org_cohort_snapshots', $ddl$    id                   BIGSERIAL    PRIMARY KEY,
    organization_id      UUID         NOT NULL REFERENCES public.organizations(id)      ON DELETE CASCADE,
    snapshot_date        DATE         NOT NULL,
    department_id        UUID         REFERENCES public.college_departments(id) ON DELETE SET NULL,
    year_id              UUID         REFERENCES public.college_years(id)       ON DELETE SET NULL,
    batch_id             UUID         REFERENCES public.college_batches(id)     ON DELETE SET NULL,
    total_students       INT          NOT NULL DEFAULT 0,
    active_students      INT          NOT NULL DEFAULT 0,
    total_sessions       INT          NOT NULL DEFAULT 0,
    avg_overall_score    NUMERIC(5,2) NOT NULL DEFAULT 0,
    avg_communication    NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_technical_depth  NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_problem_solving  NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_confidence       NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_structure_star   NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_vocabulary       NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_vocal_delivery   NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_leadership       NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_teamwork         NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_adaptability     NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_reasoning        NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_conciseness      NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_professionalism  NUMERIC(4,2) NOT NULL DEFAULT 0,
    avg_role_fit         NUMERIC(4,2) NOT NULL DEFAULT 0,
    ready_count          INT          NOT NULL DEFAULT 0,
    almost_ready_count   INT          NOT NULL DEFAULT 0,
    developing_count     INT          NOT NULL DEFAULT 0,
    at_risk_count        INT          NOT NULL DEFAULT 0,
    avg_score_delta      NUMERIC(5,2),
    avg_slope            NUMERIC(5,3),
    created_at           TIMESTAMPTZ  DEFAULT NOW()$ddl$)
    ) AS definitions(name, body) LOOP
        EXECUTE format('CREATE TABLE pv_reconcile_048a.%I (%s)', 'pv_expected_'||r.name, r.body);
        expected := to_regclass('pv_reconcile_048a.pv_expected_'||r.name);
        target := to_regclass('public.'||r.name);
        IF target IS NULL THEN
            EXECUTE format('CREATE TABLE public.%I (%s)',r.name,r.body);
            target := to_regclass('public.'||r.name);
        END IF;
        IF NOT EXISTS (SELECT FROM pg_class WHERE oid=target AND relkind='r' AND relpersistence='p')
           OR EXISTS (SELECT FROM pg_inherits WHERE inhrelid=target)
           OR EXISTS (SELECT FROM pg_trigger WHERE tgrelid=target AND NOT tgisinternal) THEN
            RAISE EXCEPTION 'Incompatible table kind, inheritance or triggers: %',r.name;
        END IF;
        EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',r.name);
        WITH columns AS (
            SELECT a.attrelid, a.attname, a.atttypid, a.atttypmod, a.attnotnull,
                   a.attidentity, a.attgenerated, a.attcollation,
                   CASE WHEN r.name='org_cohort_snapshots' AND a.attname='id'
                        AND pg_get_expr(d.adbin,d.adrelid) LIKE 'nextval(%'
                        THEN 'owned_sequence' ELSE pg_get_expr(d.adbin,d.adrelid) END AS default_expr
            FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
            WHERE a.attrelid IN (target,expected) AND a.attnum>0 AND NOT a.attisdropped
        ), actual AS (SELECT attname,atttypid,atttypmod,attnotnull,attidentity,attgenerated,attcollation,default_expr FROM columns WHERE attrelid=target),
           wanted AS (SELECT attname,atttypid,atttypmod,attnotnull,attidentity,attgenerated,attcollation,default_expr FROM columns WHERE attrelid=expected)
        SELECT EXISTS((TABLE actual EXCEPT TABLE wanted) UNION ALL (TABLE wanted EXCEPT TABLE actual)) INTO mismatch;
        IF mismatch THEN RAISE EXCEPTION 'Incompatible columns/defaults: %',r.name; END IF;
        WITH actual AS (SELECT pg_get_constraintdef(oid) AS definition, convalidated, condeferrable, condeferred
                        FROM pg_constraint WHERE conrelid=target),
             wanted AS (SELECT pg_get_constraintdef(oid) AS definition, convalidated, condeferrable, condeferred
                        FROM pg_constraint WHERE conrelid=expected)
        SELECT EXISTS((TABLE actual EXCEPT TABLE wanted) UNION ALL (TABLE wanted EXCEPT TABLE actual)) INTO mismatch;
        IF mismatch THEN RAISE EXCEPTION 'Incompatible constraints: %',r.name; END IF;
        IF r.name='org_cohort_snapshots' THEN
            seq := pg_get_serial_sequence('public.org_cohort_snapshots','id');
            IF seq IS DISTINCT FROM 'public.org_cohort_snapshots_id_seq'
               OR NOT EXISTS (SELECT FROM pg_sequence WHERE seqrelid=to_regclass(seq)
                              AND seqtypid='bigint'::regtype AND seqincrement=1 AND seqmin=1
                              AND seqmax=9223372036854775807 AND NOT seqcycle)
               OR (SELECT pg_get_expr(adbin,adrelid) FROM pg_attrdef
                   WHERE adrelid=target AND adnum=(SELECT attnum FROM pg_attribute WHERE attrelid=target AND attname='id'))
                   IS DISTINCT FROM 'nextval(''org_cohort_snapshots_id_seq''::regclass)' THEN
                RAISE EXCEPTION 'Incompatible snapshot sequence ownership/default';
            END IF;
        END IF;
    END LOOP;
END $reconcile$;

DO $indexes$
DECLARE r record; actual oid; expected oid;
BEGIN
    FOR r IN SELECT * FROM (VALUES
('admin_bonus_grants','idx_admin_bonus_grants_recipient','',$ddl$(granted_to, created_at DESC)$ddl$),
('admin_bonus_grants','idx_admin_bonus_grants_grantor','',$ddl$(granted_by, created_at DESC)$ddl$),
('org_admin_invites','idx_org_invites_org','',$ddl$(organization_id, status)$ddl$),
('org_admin_invites','idx_org_invites_email','',$ddl$(invited_email, status)$ddl$),
('org_admin_invites','idx_org_invites_token','',$ddl$(token) WHERE status = 'pending'$ddl$),
('org_cohort_snapshots','idx_org_cohort_snapshots_unique','UNIQUE ',$ddl$(
        organization_id,
        snapshot_date,
        COALESCE(department_id::TEXT, ''),
        COALESCE(year_id::TEXT,       ''),
        COALESCE(batch_id::TEXT,      '')
    )$ddl$),
('org_cohort_snapshots','idx_org_cohort_snapshots_date','',$ddl$(organization_id, snapshot_date DESC)$ddl$),
('org_cohort_snapshots','idx_org_cohort_snapshots_dept','',$ddl$(organization_id, department_id, snapshot_date DESC)$ddl$)
    ) AS definitions(table_name,index_name,uniqueness,body) LOOP
        EXECUTE format('CREATE %s INDEX %I ON pv_reconcile_048a.%I %s',r.uniqueness,'pv_'||r.index_name,'pv_expected_'||r.table_name,r.body);
        expected := to_regclass('pv_reconcile_048a.pv_'||r.index_name);
        actual := to_regclass('public.'||r.index_name);
        IF actual IS NULL THEN
            EXECUTE format('CREATE %s INDEX %I ON public.%I %s',r.uniqueness,r.index_name,r.table_name,r.body);
            actual := to_regclass('public.'||r.index_name);
        END IF;
        IF NOT EXISTS (SELECT FROM pg_index WHERE indexrelid=actual AND indisvalid AND indisready
                       AND indrelid=to_regclass('public.'||r.table_name))
           OR substring(pg_get_indexdef(actual) FROM ' USING .*') IS DISTINCT FROM substring(pg_get_indexdef(expected) FROM ' USING .*')
           OR (SELECT indisunique FROM pg_index WHERE indexrelid=actual) IS DISTINCT FROM (r.uniqueness='UNIQUE ') THEN
            RAISE EXCEPTION 'Incompatible index: %',r.index_name;
        END IF;
    END LOOP;
END $indexes$;

-- Deliberately replace these three tables' old browser/default ACLs and
-- policies with the current backend contract. Ownership is never transferred.
DO $security$
DECLARE name text; target oid; grant_row record; policy_row record; col record; role_name text;
BEGIN
    FOREACH name IN ARRAY ARRAY['admin_bonus_grants','org_admin_invites','org_cohort_snapshots'] LOOP
        target := to_regclass('public.'||name);
        FOR grant_row IN SELECT DISTINCT x.grantee FROM pg_class c,
            LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) x
            WHERE c.oid=target AND x.grantee<>c.relowner LOOP
            role_name := CASE WHEN grant_row.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(grant_row.grantee)) END;
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %s',name,role_name);
        END LOOP;
        FOR col IN SELECT a.attname,x.grantee FROM pg_attribute a, LATERAL aclexplode(a.attacl) x
                   WHERE a.attrelid=target AND a.attnum>0 AND NOT a.attisdropped LOOP
            role_name := CASE WHEN col.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(col.grantee)) END;
            EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM %s',col.attname,name,role_name);
        END LOOP;
        FOR policy_row IN SELECT polname FROM pg_policy WHERE polrelid=target LOOP
            EXECUTE format('DROP POLICY %I ON public.%I',policy_row.polname,name);
        END LOOP;
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
        IF name='admin_bonus_grants' THEN
            EXECUTE 'GRANT SELECT, INSERT ON public.admin_bonus_grants TO prepvista_runtime,service_role';
            EXECUTE 'CREATE POLICY backend_audit_select ON public.admin_bonus_grants FOR SELECT TO prepvista_runtime,service_role USING (true)';
            EXECUTE 'CREATE POLICY backend_audit_insert ON public.admin_bonus_grants FOR INSERT TO prepvista_runtime,service_role WITH CHECK (true)';
        END IF;
        -- No executable backend currently consumes invites or snapshots.
        -- Keep these declared objects under deny-by-default RLS without table
        -- ACLs or policies. A future consumer must introduce reviewed access.
        IF has_table_privilege('anon',target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           OR has_table_privilege('authenticated',target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           OR has_table_privilege('prepvista_worker',target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           OR (name='admin_bonus_grants' AND (has_table_privilege('prepvista_runtime',target,'UPDATE,DELETE,TRUNCATE')
                OR has_table_privilege('service_role',target,'UPDATE,DELETE,TRUNCATE')))
           OR (name<>'admin_bonus_grants' AND (has_table_privilege('prepvista_runtime',target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                OR has_table_privilege('service_role',target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) THEN
            RAISE EXCEPTION 'Unexpected inherited or owner access: %',name;
        END IF;
    END LOOP;
    FOR grant_row IN SELECT DISTINCT x.grantee FROM pg_class c,
        LATERAL aclexplode(COALESCE(c.relacl,acldefault('s',c.relowner))) x
        WHERE c.oid='public.org_cohort_snapshots_id_seq'::regclass AND x.grantee<>c.relowner LOOP
        role_name := CASE WHEN grant_row.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(grant_row.grantee)) END;
        EXECUTE format('REVOKE ALL ON SEQUENCE public.org_cohort_snapshots_id_seq FROM %s',role_name);
    END LOOP;
END $security$;
DO $sequence_acl$
BEGIN
    IF has_sequence_privilege('anon','public.org_cohort_snapshots_id_seq','USAGE,SELECT,UPDATE')
       OR has_sequence_privilege('authenticated','public.org_cohort_snapshots_id_seq','USAGE,SELECT,UPDATE')
       OR has_sequence_privilege('prepvista_worker','public.org_cohort_snapshots_id_seq','USAGE,SELECT,UPDATE')
       OR has_sequence_privilege('prepvista_runtime','public.org_cohort_snapshots_id_seq','USAGE,SELECT,UPDATE')
       OR has_sequence_privilege('service_role','public.org_cohort_snapshots_id_seq','USAGE,SELECT,UPDATE') THEN
        RAISE EXCEPTION 'Unexpected inherited snapshot sequence access';
    END IF;
END $sequence_acl$;
COMMENT ON TABLE public.admin_bonus_grants IS 'Prospective finite grant adjustments; no reconstructed history. Runtime SELECT/INSERT only; target deletion retains historical FK CASCADE semantics.';
DROP SCHEMA pv_reconcile_048a CASCADE;
COMMIT;
