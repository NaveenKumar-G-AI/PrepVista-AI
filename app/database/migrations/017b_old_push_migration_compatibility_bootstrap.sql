-- OLD-PUSH MIGRATION COMPATIBILITY BOOTSTRAP
-- Restores the `last_seen_at` column to the `profiles` table.
-- Historical evidence (005 patch erasure and runtime usage in user_activity.py)
-- proves this column is an authentic requirement for tracking active users.
-- 018_performance_indexes.sql fails because it expects to index this column.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'profiles' 
          AND column_name = 'last_seen_at'
    ) THEN
        ALTER TABLE profiles ADD COLUMN last_seen_at TIMESTAMPTZ NULL;
        RAISE NOTICE 'Restored missing historical column: profiles.last_seen_at';
    END IF;
END $$;
