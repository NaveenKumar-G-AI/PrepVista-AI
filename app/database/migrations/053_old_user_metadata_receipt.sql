SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, public;

-- Legacy archives remain unchanged and require review without a receipt.
DO $receipt_column$
DECLARE metadata_type oid;
BEGIN
    IF to_regclass('public.old_user') IS NULL THEN
        RAISE EXCEPTION 'Required table public.old_user is missing';
    END IF;
    LOCK TABLE public.old_user IN ACCESS EXCLUSIVE MODE;
    SELECT atttypid INTO metadata_type
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.old_user'::regclass
      AND attname = 'metadata' AND attnum > 0 AND NOT attisdropped;

    IF NOT FOUND THEN
        ALTER TABLE public.old_user ADD COLUMN metadata jsonb;
    ELSIF metadata_type <> 'pg_catalog.jsonb'::regtype THEN
        RAISE EXCEPTION 'Incompatible public.old_user.metadata type: expected jsonb';
    END IF;
END $receipt_column$;
