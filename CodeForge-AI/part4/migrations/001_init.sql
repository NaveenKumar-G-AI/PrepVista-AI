-- CodeForge Evaluation Engine — Migration 001
-- Reused/assumed-existing entities (students, challenges) are modeled here
-- as minimal stand-ins since no host repository/schema exists in this
-- environment. In a real integration these tables already exist upstream
-- and would NOT be recreated — see docs/CODEFORGE_DATABASE.md.

PRAGMA foreign_keys = ON;

-- ---------- Stand-ins for pre-existing CodeForge tables ----------

CREATE TABLE IF NOT EXISTS students (
    student_id      TEXT PRIMARY KEY,
    display_name    TEXT NOT NULL,
    track           TEXT NOT NULL,               -- e.g. "AI/ML Engineer"
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS challenges (
    challenge_id      TEXT NOT NULL,
    challenge_version INTEGER NOT NULL DEFAULT 1,
    title             TEXT NOT NULL,
    role              TEXT,
    skill_id          TEXT NOT NULL,
    subskill_id       TEXT,
    difficulty        TEXT NOT NULL CHECK (difficulty IN ('EASY','INTERMEDIATE','ADVANCED')),
    language          TEXT NOT NULL DEFAULT 'python',
    description       TEXT NOT NULL,
    starter_code      TEXT,
    prompts_explanation TEXT,                    -- optional "why this approach" question
    is_seed           INTEGER NOT NULL DEFAULT 1, -- 1 = clearly marked seed/demo data
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (challenge_id, challenge_version)
);

CREATE TABLE IF NOT EXISTS challenge_tests (
    test_id           TEXT NOT NULL,               -- unique within a challenge, NOT globally
    challenge_id      TEXT NOT NULL,
    challenge_version INTEGER NOT NULL,
    is_hidden         INTEGER NOT NULL DEFAULT 0,
    input_data        TEXT NOT NULL,              -- JSON-encoded stdin/args
    expected_output   TEXT NOT NULL,
    ordinal           INTEGER NOT NULL,
    PRIMARY KEY (challenge_id, challenge_version, test_id),
    FOREIGN KEY (challenge_id, challenge_version) REFERENCES challenges(challenge_id, challenge_version)
);

CREATE TABLE IF NOT EXISTS skill_prerequisites (
    skill_id            TEXT NOT NULL,
    requires_skill_id   TEXT NOT NULL,
    PRIMARY KEY (skill_id, requires_skill_id)
);

-- ---------- Core evaluation-engine entities (this capability) ----------

CREATE TABLE IF NOT EXISTS attempts (
    attempt_id        TEXT PRIMARY KEY,
    student_id        TEXT NOT NULL REFERENCES students(student_id),
    challenge_id      TEXT NOT NULL,
    challenge_version INTEGER NOT NULL,
    attempt_number    INTEGER NOT NULL,           -- 1,2,3... per student+challenge, immutable
    language          TEXT NOT NULL,
    source_code       TEXT NOT NULL,
    explanation_text  TEXT,
    hint_count        INTEGER NOT NULL DEFAULT 0,
    hint_level        INTEGER NOT NULL DEFAULT 0,
    client_request_id TEXT,                       -- for idempotency (double-submit protection)
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    submitted_at      TEXT,
    execution_status  TEXT NOT NULL DEFAULT 'QUEUED'
        CHECK (execution_status IN ('STARTED','QUEUED','RUNNING','COMPLETED','TIMEOUT',
                                     'COMPILATION_ERROR','RUNTIME_ERROR','SYSTEM_ERROR','CANCELLED')),
    evaluation_status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (evaluation_status IN ('PENDING','EVALUATED','AI_EVALUATION_PENDING','FAILED')),
    FOREIGN KEY (challenge_id, challenge_version) REFERENCES challenges(challenge_id, challenge_version),
    UNIQUE (student_id, challenge_id, client_request_id)
);

CREATE INDEX IF NOT EXISTS idx_attempts_student_challenge ON attempts(student_id, challenge_id, challenge_version);

CREATE TABLE IF NOT EXISTS execution_results (
    execution_id      TEXT PRIMARY KEY,
    attempt_id        TEXT NOT NULL REFERENCES attempts(attempt_id),
    test_id           TEXT NOT NULL,
    status            TEXT NOT NULL,               -- mirrors execution_status enum
    actual_output     TEXT,
    stderr_output     TEXT,
    exit_code         INTEGER,
    runtime_ms         REAL,
    memory_kb          REAL,
    passed            INTEGER,                     -- NULL if execution did not complete
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_execresults_attempt ON execution_results(attempt_id);

CREATE TABLE IF NOT EXISTS evaluation_results (
    evaluation_id     TEXT PRIMARY KEY,
    attempt_id        TEXT NOT NULL UNIQUE REFERENCES attempts(attempt_id),
    status            TEXT NOT NULL,               -- PASSED | FAILED | SYSTEM_ERROR
    tests_total        INTEGER NOT NULL,
    tests_passed       INTEGER NOT NULL,
    tests_failed       INTEGER NOT NULL,
    runtime_ms_max      REAL,
    memory_kb_max       REAL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_failure_analysis (
    failure_id        TEXT PRIMARY KEY,
    attempt_id        TEXT NOT NULL REFERENCES attempts(attempt_id),
    test_id           TEXT NOT NULL,
    expected_result    TEXT,
    actual_result      TEXT,
    category          TEXT NOT NULL,               -- COMPILATION|RUNTIME|LOGIC|BOUNDARY|... |UNKNOWN
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS code_analysis_results (
    analysis_id       TEXT PRIMARY KEY,
    attempt_id        TEXT NOT NULL UNIQUE REFERENCES attempts(attempt_id),
    function_count     INTEGER,
    max_nesting_depth   INTEGER,
    cyclomatic_estimate  INTEGER,
    duplicate_blocks    INTEGER,
    unused_names_json    TEXT,
    loc               INTEGER,
    patterns_json      TEXT,                       -- detected structural patterns (loops, recursion, etc.)
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS complexity_analysis (
    complexity_id     TEXT PRIMARY KEY,
    attempt_id        TEXT NOT NULL UNIQUE REFERENCES attempts(attempt_id),
    time_complexity     TEXT,                       -- e.g. "O(n^2)"
    time_basis         TEXT NOT NULL CHECK (time_basis IN ('OBSERVED','INFERRED','ESTIMATED')),
    space_complexity    TEXT,
    space_basis        TEXT NOT NULL CHECK (space_basis IN ('OBSERVED','INFERRED','ESTIMATED')),
    reasoning         TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mistake_instances (
    mistake_instance_id TEXT PRIMARY KEY,
    attempt_id        TEXT NOT NULL REFERENCES attempts(attempt_id),
    student_id        TEXT NOT NULL REFERENCES students(student_id),
    skill_id          TEXT NOT NULL,
    category          TEXT NOT NULL,               -- mistake taxonomy value
    evidence_text      TEXT NOT NULL,
    confidence        TEXT NOT NULL CHECK (confidence IN ('LOW','MEDIUM','HIGH')),
    severity          TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH')),
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mistakes_student_skill ON mistake_instances(student_id, skill_id, category);

CREATE TABLE IF NOT EXISTS diagnoses (
    diagnosis_id      TEXT PRIMARY KEY,
    attempt_id        TEXT NOT NULL UNIQUE REFERENCES attempts(attempt_id),
    observations_json  TEXT NOT NULL,
    inferences_json    TEXT NOT NULL,
    mistakes_json      TEXT NOT NULL,
    strengths_json     TEXT NOT NULL,
    confidence        TEXT NOT NULL CHECK (confidence IN ('LOW','MEDIUM','HIGH')),
    ai_status         TEXT NOT NULL CHECK (ai_status IN ('AI_GENERATED','AI_EVALUATION_PENDING','AI_RESPONSE_INVALID')),
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS potential_misconceptions (
    misconception_id  TEXT PRIMARY KEY,
    student_id        TEXT NOT NULL REFERENCES students(student_id),
    skill_id          TEXT NOT NULL,
    category          TEXT NOT NULL,
    occurrence_count   INTEGER NOT NULL,
    confidence        TEXT NOT NULL CHECK (confidence IN ('LOW','MEDIUM','HIGH')),
    supporting_attempt_ids_json TEXT NOT NULL,
    first_observed_at   TEXT NOT NULL,
    last_observed_at    TEXT NOT NULL,
    UNIQUE(student_id, skill_id, category)
);

CREATE TABLE IF NOT EXISTS evidence (
    evidence_id       TEXT PRIMARY KEY,
    student_id        TEXT NOT NULL REFERENCES students(student_id),
    attempt_id        TEXT NOT NULL REFERENCES attempts(attempt_id),
    challenge_id      TEXT NOT NULL,
    challenge_version INTEGER NOT NULL,
    skill_id          TEXT NOT NULL,
    subskill_id       TEXT,
    evidence_type      TEXT NOT NULL,
    observation       TEXT NOT NULL,
    source            TEXT NOT NULL CHECK (source IN
        ('EXECUTION','TEST_RESULTS','CODE_ANALYSIS','COMPLEXITY_ANALYSIS','DEBUGGING',
         'HINT_USAGE','EXPLANATION','REPEATED_ATTEMPTS','CHALLENGE_DIFFICULTY')),
    strength          TEXT NOT NULL CHECK (strength IN ('LOW','MEDIUM','HIGH')),
    confidence        TEXT NOT NULL CHECK (confidence IN ('LOW','MEDIUM','HIGH')),
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_evidence_student_skill ON evidence(student_id, skill_id);

CREATE TABLE IF NOT EXISTS skill_assessments (
    student_id        TEXT NOT NULL REFERENCES students(student_id),
    skill_id          TEXT NOT NULL,
    level             TEXT NOT NULL CHECK (level IN ('FOUNDATION','DEVELOPING','COMPETENT','STRONG','ADVANCED')),
    score             REAL NOT NULL,                -- 0..1 explainable composite, not a raw average
    is_consistent      INTEGER NOT NULL DEFAULT 1,   -- 0 => "evidence is inconsistent" flag
    evidence_count      INTEGER NOT NULL DEFAULT 0,
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (student_id, skill_id)
);

CREATE TABLE IF NOT EXISTS skill_history (
    history_id        TEXT PRIMARY KEY,
    student_id        TEXT NOT NULL REFERENCES students(student_id),
    skill_id          TEXT NOT NULL,
    level             TEXT NOT NULL,
    score             REAL NOT NULL,
    triggering_attempt_id TEXT NOT NULL REFERENCES attempts(attempt_id),
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback_reports (
    feedback_id       TEXT PRIMARY KEY,
    attempt_id        TEXT NOT NULL UNIQUE REFERENCES attempts(attempt_id),
    level             TEXT NOT NULL CHECK (level IN ('QUICK','STANDARD','DETAILED','DEEP')),
    what_went_well      TEXT NOT NULL,
    what_failed        TEXT NOT NULL,
    why_it_failed       TEXT NOT NULL,
    what_to_improve     TEXT NOT NULL,
    optional_hint       TEXT,
    next_step          TEXT NOT NULL,
    ai_status         TEXT NOT NULL CHECK (ai_status IN ('AI_GENERATED','AI_EVALUATION_PENDING','AI_RESPONSE_INVALID')),
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_events (
    event_id          TEXT PRIMARY KEY,
    event_type        TEXT NOT NULL,
    student_id        TEXT,
    attempt_id        TEXT,
    payload_json       TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_type_time ON audit_events(event_type, created_at);
