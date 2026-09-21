-- 0002_path_core.sql
--
-- Feature 30 -- PATH. Everything below this line is new. Naming and
-- conventions (uuid PKs via pgcrypto, tenant_id on every tenant-scoped
-- table, timestamptz, jsonb for structured-but-flexible payloads) follow
-- 0001_reused_domain.sql so this drops cleanly into the existing schema.

CREATE TABLE paths (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id            uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  target_id             uuid NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  slot                  text NOT NULL DEFAULT 'PRIMARY' CHECK (slot IN ('PRIMARY', 'SECONDARY', 'STRETCH')),
  mode                  text NOT NULL DEFAULT 'STANDARD'
                          CHECK (mode IN ('FAST_TRACK', 'STANDARD', 'DEEP_MASTERY', 'RECOVERY', 'REASSESSMENT')),
  status                text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETE', 'ABANDONED')),
  current_stage_id      uuid, -- FK added after path_stages exists (below)
  current_bottleneck    text REFERENCES capabilities(code),
  readiness             numeric NOT NULL DEFAULT 0 CHECK (readiness BETWEEN 0 AND 100),
  target_readiness      numeric NOT NULL DEFAULT 90 CHECK (target_readiness BETWEEN 0 AND 100),
  deadline_days         integer,
  last_recalculated_at  timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, target_id)
);

CREATE TABLE path_stages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  path_id      uuid NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
  key          text NOT NULL,
  name         text NOT NULL,
  sequence     integer NOT NULL,
  status       text NOT NULL DEFAULT 'LOCKED' CHECK (status IN ('LOCKED', 'ACTIVE', 'COMPLETE')),
  UNIQUE (path_id, key)
);

ALTER TABLE paths
  ADD CONSTRAINT fk_paths_current_stage
  FOREIGN KEY (current_stage_id) REFERENCES path_stages(id) ON DELETE SET NULL;

CREATE TABLE path_milestones (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  path_id                uuid NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
  stage_id               uuid NOT NULL REFERENCES path_stages(id) ON DELETE CASCADE,
  name                   text NOT NULL,
  required_capabilities  jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_requirements  jsonb NOT NULL DEFAULT '[]'::jsonb,
  status                 text NOT NULL DEFAULT 'LOCKED'
                           CHECK (status IN ('LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'NEEDS_IMPROVEMENT', 'VERIFIED', 'MASTERED')),
  priority               integer NOT NULL DEFAULT 5,
  critical               boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  verified_at            timestamptz
);

CREATE TABLE path_actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  path_id           uuid NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
  student_id        uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  milestone_id      uuid REFERENCES path_milestones(id) ON DELETE SET NULL,
  type              text NOT NULL CHECK (type IN ('LEARN', 'PRACTICE', 'REVISE', 'RETEST', 'TRANSFER', 'SIMULATE', 'PROVE', 'REFLECT')),
  capability_code   text NOT NULL REFERENCES capabilities(code),
  priority           integer NOT NULL DEFAULT 5,
  reason            text NOT NULL DEFAULT '',
  status            text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'COMPLETED', 'SKIPPED', 'SUPERSEDED')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);

CREATE TABLE path_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  path_id               uuid NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
  stage_key             text NOT NULL,
  readiness             numeric NOT NULL,
  bottleneck_capability text,
  taken_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE path_risks (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  path_id                uuid NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
  type                   text NOT NULL CHECK (type IN
                           ('STALLING', 'INCONSISTENT_PERFORMANCE', 'LOW_EVIDENCE', 'CRITICAL_GAP',
                            'TIME_PRESSURE', 'REPEATED_FAILURE', 'LOW_RETENTION', 'TRANSFER_FAILURE')),
  reason                 text NOT NULL,
  evidence               jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity               text NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')),
  recommended_response   text NOT NULL,
  detected_at            timestamptz NOT NULL DEFAULT now(),
  resolved_at            timestamptz
);

-- Append-only audit/event log driving the event-driven recalculation
-- (Section 47). In production this is the outbox a real queue reads from;
-- here the same table doubles as the queue (see events/eventBus.ts).
CREATE TABLE path_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  path_id      uuid NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason       text, -- PathChangeReason, when this event produced a recalculation
  summary      text, -- human-readable "why did my path change" (Section 17)
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_path_stages_path ON path_stages (path_id, sequence);
CREATE INDEX idx_path_milestones_path ON path_milestones (path_id, priority);
CREATE INDEX idx_path_actions_path ON path_actions (path_id, status, priority);
CREATE INDEX idx_path_snapshots_path ON path_snapshots (path_id, taken_at);
CREATE INDEX idx_path_risks_path ON path_risks (path_id) WHERE resolved_at IS NULL;
CREATE INDEX idx_path_events_path ON path_events (path_id, created_at DESC);
