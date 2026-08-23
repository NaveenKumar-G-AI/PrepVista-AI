-- Generic evidence reference. One row = one piece of proof behind one
-- reportable fact (an offer, a joining, or a computed metric value).
-- Evidence never duplicates source truth — it points at it.

CREATE TABLE evidence (
  id                 TEXT PRIMARY KEY,
  institution_id     TEXT NOT NULL,
  entity_type        TEXT NOT NULL,   -- 'offer' | 'joining' | 'metric_value' | 'report_snapshot'
  entity_id          TEXT NOT NULL,   -- id of the row this backs (or a synthetic key for a computed metric)
  evidence_type      TEXT NOT NULL,   -- 'offer_letter' | 'joining_confirmation' | 'calculation' | 'source_record'
  document_id        TEXT,            -- pointer into an existing document store (owned by Parts 1-9)
  source_type        TEXT NOT NULL,   -- 'record' | 'document' | 'calculation' | 'external_verification'
  source_reference   TEXT NOT NULL,   -- human-readable pointer, e.g. "offers.id=<uuid>" or a formula description
  verified           INTEGER NOT NULL DEFAULT 0,
  verified_by        TEXT,
  verified_at        TEXT,
  created_at         TEXT NOT NULL
);

CREATE INDEX idx_evidence_entity ON evidence(entity_type, entity_id);
CREATE INDEX idx_evidence_institution ON evidence(institution_id);
