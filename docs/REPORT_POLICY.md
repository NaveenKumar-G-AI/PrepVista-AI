# Evidence reports and practice

`GET /reports/{id}` adds `evidence_report` for completed V2 sessions. Existing
report authentication, ownership, history gating and numeric fields remain.
Legacy reports return no V2 report and render as before.

The new section leads with mode, role, primary/probe counts, coverage, limited
confidence, textual evidence and remaining gaps. Unmeasured planned families
are distinct from families outside the blueprint. Resume skill claims can be
untested, unclear or partially supported. No claim is called false. Risks and
missions refer to stored evidence IDs; resolved anchor gaps are not presented
as unresolved top risks. Each answer can be retried from the report.

Retry comparison requires new evidence of the missing signal. Removing a claim
or changing wording alone does not repair it. Retries are stored separately and
do not rewrite original scores or interview evidence. Request keys prevent
duplicate retry persistence. The practice page shows recent evidence history,
saved comparisons and an optional personal story bank. Stories are user-authored
preparation notes and are not automatically asserted during interview scoring.

The existing PDF format remains compatible; the new interactive V2 evidence
section and retry controls are currently web-only. Historical provider scores
are not reinterpreted as calibrated hiring predictions. Existing institutional
dashboards are preserved; new cohort evidence dashboards are not part of this
critical-path implementation.
