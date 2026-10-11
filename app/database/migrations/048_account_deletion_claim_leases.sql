BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.account_deletion_requests
    ADD COLUMN claim_token UUID,
    ADD COLUMN lease_expires_at TIMESTAMPTZ,
    ADD COLUMN next_attempt_at TIMESTAMPTZ;

ALTER TABLE public.account_deletion_requests
    ADD CONSTRAINT account_deletion_requests_claim_pair_check
    CHECK ((claim_token IS NULL) = (lease_expires_at IS NULL));

CREATE INDEX account_deletion_requests_due_idx
    ON public.account_deletion_requests
       ((COALESCE(next_attempt_at, created_at)), id)
    WHERE status IN (
        'REQUESTED', 'DB_DELETED', 'AUTH_PENDING', 'AUTH_DELETED',
        'STORAGE_PENDING', 'STORAGE_DELETED', 'RETRY_REQUIRED'
    );
COMMIT;
