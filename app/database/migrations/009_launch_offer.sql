CREATE TABLE IF NOT EXISTS launch_offer_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    eligible_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    max_approved_slots SMALLINT NOT NULL DEFAULT 100 CHECK (max_approved_slots BETWEEN 1 AND 100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE launch_offer_settings
DROP CONSTRAINT IF EXISTS launch_offer_settings_max_approved_slots_check;

ALTER TABLE launch_offer_settings
ADD CONSTRAINT launch_offer_settings_max_approved_slots_check
CHECK (max_approved_slots BETWEEN 1 AND 100);

INSERT INTO launch_offer_settings (
    id,
    eligible_after,
    max_approved_slots,
    updated_at
)
VALUES (1, NOW(), 100, NOW())
ON CONFLICT (id) DO NOTHING;

UPDATE launch_offer_settings
SET max_approved_slots = 100,
    updated_at = NOW()
WHERE max_approved_slots < 100;

CREATE TABLE IF NOT EXISTS launch_offer_grants (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL UNIQUE,
    slot_number SMALLINT CHECK (slot_number BETWEEN 1 AND 100),
    plan TEXT CHECK (plan IN ('pro', 'career')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    approved_by_email TEXT,
    expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE launch_offer_grants
ALTER COLUMN slot_number DROP NOT NULL;

ALTER TABLE launch_offer_grants
ALTER COLUMN plan DROP NOT NULL;

ALTER TABLE launch_offer_grants
ALTER COLUMN granted_at DROP NOT NULL;

ALTER TABLE launch_offer_grants
ALTER COLUMN expires_at DROP NOT NULL;

ALTER TABLE launch_offer_grants
ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE launch_offer_grants
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE launch_offer_grants
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE launch_offer_grants
ADD COLUMN IF NOT EXISTS approved_by_email TEXT;

UPDATE launch_offer_grants
SET status = 'approved'
WHERE status = 'active';

UPDATE launch_offer_grants
SET requested_at = COALESCE(requested_at, granted_at, updated_at, NOW()),
    approved_at = COALESCE(approved_at, granted_at, updated_at, NOW()),
    reviewed_at = COALESCE(reviewed_at, granted_at, updated_at, NOW())
WHERE status IN ('approved', 'expired');

UPDATE launch_offer_grants
SET requested_at = COALESCE(requested_at, updated_at, NOW())
WHERE requested_at IS NULL;

ALTER TABLE launch_offer_grants
DROP CONSTRAINT IF EXISTS launch_offer_grants_status_check;

ALTER TABLE launch_offer_grants
DROP CONSTRAINT IF EXISTS launch_offer_grants_plan_check;

ALTER TABLE launch_offer_grants
DROP CONSTRAINT IF EXISTS launch_offer_grants_slot_number_check;

ALTER TABLE launch_offer_grants
ADD CONSTRAINT launch_offer_grants_status_check
CHECK (status IN ('pending', 'approved', 'rejected', 'expired'));

ALTER TABLE launch_offer_grants
ADD CONSTRAINT launch_offer_grants_plan_check
CHECK (plan IS NULL OR plan IN ('pro', 'career'));

ALTER TABLE launch_offer_grants
ADD CONSTRAINT launch_offer_grants_slot_number_check
CHECK (slot_number IS NULL OR slot_number BETWEEN 1 AND 100);

CREATE INDEX IF NOT EXISTS idx_launch_offer_grants_user_id
ON launch_offer_grants(user_id);

CREATE INDEX IF NOT EXISTS idx_launch_offer_grants_status_expiry
ON launch_offer_grants(status, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_launch_offer_grants_slot_number_unique
ON launch_offer_grants(slot_number)
WHERE slot_number IS NOT NULL;
