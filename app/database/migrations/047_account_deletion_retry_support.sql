-- 047_account_deletion_retry_support.sql
-- Add missing retry_count column for deletion worker and expand status check constraint

ALTER TABLE account_deletion_requests
    ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;

ALTER TABLE account_deletion_requests
    DROP CONSTRAINT IF EXISTS account_deletion_requests_status_check;

ALTER TABLE account_deletion_requests
    ADD CONSTRAINT account_deletion_requests_status_check
    CHECK (status IN (
        'REQUESTED',
        'DB_DELETED',
        'AUTH_PENDING',
        'AUTH_DELETED',
        'STORAGE_PENDING',
        'STORAGE_DELETED',
        'RETRY_REQUIRED',
        'COMPLETED',
        'FAILED'
    ));
