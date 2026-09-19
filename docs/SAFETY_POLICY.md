# Interview safety and privacy

All existing authentication, tenant checks, upload validation, STT, billing and
plan enforcement remain. V2 answer processing executes within the existing
session-owner check, row lock, expected-turn check and idempotency transaction.
Retry and story endpoints require the authenticated owner; SQL is parameterized.
New tables use RLS with no direct browser policies. API responses never include
another user's stories, answers or private transcript.

Protected-attribute question patterns are rejected in catalog text and variants
and excluded from contextualized wording. The list is conservative, not a legal
classification engine. Pressure mode uses professional scenarios, not invasive
or humiliating questions. Resume and JD prompt-injection screening is preserved;
JD URLs are not fetched. React text rendering escapes story and evidence content.

Ordinary V2 telemetry contains identifiers, transitions and counts, not resume
or answer excerpts. Evidence is private report data. Existing raw-transcript
retention and account deletion mechanisms remain; no new retention guarantee is
claimed. Retry records cascade with session/account deletion. Stories cascade
with account deletion and have an owner-scoped delete action. Production data
deletion and retention behavior still require staging verification.
