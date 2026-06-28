-- ════════════════════════════════════════════════════════════════════════════
-- 023_audio_audit_trail.sql
--
-- Fix 7 — report audit trail.
--
-- Server-side STT (Fix 1) uploads each answer's audio to the private
-- `interview-audio` bucket and gets back a stable in-bucket object path plus an
-- STT confidence. Those are returned to the live client but were never persisted,
-- so the report could not later re-mint a signed playback URL or show how
-- confident the transcription was. This table records, per real answer turn, the
-- stored object path + confidence so the report's audit trail (corrected
-- transcript, signed audio link, confidence %, retention date, dispute line) can
-- be rebuilt at render time.
--
-- One row per (session, turn). The STT path UPSERTs last-wins: the final window /
-- whole-blob upload for a turn holds the most complete audio + confidence.
-- Rows are NULL/absent whenever server STT is disabled (the default) — the report
-- degrades to the corrected-transcript + retention/dispute info it always has.
--
-- Additive and idempotent.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS interview_audio_turns (
    session_id        UUID NOT NULL
                          REFERENCES interview_sessions(id) ON DELETE CASCADE,
    turn_number       INTEGER NOT NULL,
    audio_object_path TEXT NOT NULL,
    stt_confidence    NUMERIC(4,3),
    stt_provider      TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (session_id, turn_number)
);

-- Report render fetches every audio row for one session in turn order.
CREATE INDEX IF NOT EXISTS idx_interview_audio_turns_session
    ON interview_audio_turns (session_id, turn_number);
