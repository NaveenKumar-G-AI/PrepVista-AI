-- ✅ SEC: referral_code capped at 64 chars — matches token_urlsafe(32) output.
-- Without a length cap any arbitrary string can be stored as a referral code.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT
    CHECK (referral_code IS NULL OR char_length(referral_code) <= 64);
-- ✅ SEC: bonus interviews must be non-negative — negative values silently
-- underflow the total interview count used in billing logic.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_bonus_interviews INT NOT NULL DEFAULT 0
    CHECK (referral_bonus_interviews >= 0);

ALTER TABLE referrals ADD COLUMN IF NOT EXISTS invited_email_normalized TEXT;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS invited_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS reward_granted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ;

-- ✅ FIXED: NULL-safe backfill.
-- Previously: UPDATE ... SET invited_email_normalized = LOWER(TRIM(invited_email))
-- If invited_email IS NULL for any row, LOWER(TRIM(NULL)) = NULL.
-- The subsequent SET NOT NULL then crashes the migration with
-- "column 'invited_email_normalized' contains null values" — rolling back
-- every ADD COLUMN above it and leaving the DB in a partial, broken state.
-- Fix: guard with WHERE invited_email IS NOT NULL, then give remaining NULL
-- rows a safe placeholder so SET NOT NULL can always succeed.
UPDATE referrals
SET invited_email_normalized = LOWER(TRIM(invited_email))
WHERE invited_email_normalized IS NULL
  AND invited_email IS NOT NULL;

-- Assign a safe unique placeholder to any row where invited_email itself is NULL
-- so the NOT NULL constraint can be applied without crashing.
UPDATE referrals
SET invited_email_normalized = 'unknown_' || id::text
WHERE invited_email_normalized IS NULL;

ALTER TABLE referrals
ALTER COLUMN invited_email_normalized SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_created ON referrals(referrer_user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_invited_email_unique ON referrals(invited_email_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_invited_user_unique ON referrals(invited_user_id) WHERE invited_user_id IS NOT NULL;