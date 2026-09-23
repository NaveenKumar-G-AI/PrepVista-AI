ALTER TABLE question_evaluations ADD COLUMN IF NOT EXISTS assistance_provenance TEXT DEFAULT 'unknown';
