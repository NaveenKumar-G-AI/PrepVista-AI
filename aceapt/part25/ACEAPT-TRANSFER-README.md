# ACEAPT TRANSFER — prototype notes

`aceapt-transfer.jsx` is a working prototype of the vertical slice described in
the build prompt (§47): familiar mastery → novel question → diagnosis →
micro-bridge → retest → capability update, feeding a Pathfinder/Proof signal.

## Why this is standalone, not integrated

The prompt's engineering rule (§51) is to inspect the existing PrepVista/ACEAPT
codebase before writing anything. No repository was provided in this
session — only the build prompt itself — so there was nothing to inspect or
extend. Rather than invent a fictional codebase to "integrate" with, this
ships as a self-contained module with explicit seams (marked `INTEGRATION:`
in the source) for a real engineer to wire in on the next pass.

## What's real vs. mocked

| Piece | Status |
|---|---|
| Novel question generation | **Real** — live call to Claude per question, schema-validated |
| Micro-bridge + guided question generation | **Real** — live call to Claude, schema-validated |
| Diagnosis (concept / method / calculation) | **Real** — deterministic, rule-based; AI never grades a student |
| Transfer profile, mastery, retention numbers | **Mocked** — seeded on first load (`SEED_PROFILES`) |
| Persistence | Artifact's built-in `window.storage`, standing in for a real DB |
| Pathfinder / Proof | Signal cards showing what *would* be sent; no real endpoint |

Question generation is validated (§34) before being trusted: required fields,
correct types, and the method must come from that topic's known method list.
Invalid output falls back to a small hand-checked question bank
(`FALLBACK_QUESTIONS`) rather than blocking or penalizing the student (§45) —
verified in testing by forcing malformed AI output and confirming the student
still gets a valid question, just without the "Generated live" badge.

## Why some things are deterministic and some are generative

Novel *content* (question wording, bridge explanations) genuinely benefits
from generation — that's where novelty (§9) has to come from. *Scoring*
does not: whether a concept/method choice is correct is checked against
known-correct labels client-side, and the concept/method/calculation
breakdown (§23) is computed by `classifyAttempt` / `diagnosisRows`, not
judged by a model. This keeps the one number that matters — was the
student right — auditable, and keeps AI restricted to §33's list (question
generation, hints, micro-bridges, explanations).

## Data model → spec entity mapping (§38)

The prompt's proposed entities map onto this prototype's storage keys:

- `TransferChallenge` / `TransferAttempt` → the in-memory `session` object
  during a run, plus the AI-generated question objects
- `TransferEvidence` → `aceapt_transfer_evidence_{topicId}` (append-only,
  capped at last 50 — never overwritten, per §38)
- `TransferProfile` → `aceapt_transfer_profile_{topicId}`
- `TransferContext` → the `context` label on each generated/fallback question

## Integration checklist

1. Fill in `CONFIG` at the top of the file: `PREPVISTA_API_BASE_URL`,
   `AUTH_TOKEN`, `PATHFINDER_ENDPOINT`, `PROOF_ENDPOINT`, `STUDENT_ID`.
2. Replace `loadAllProfiles` / `saveProfile` / `appendEvidence` (search
   `STORAGE —`) with real calls to your backend. **This is the important
   one** — per §44, transfer state must be computed and validated
   server-side. The client should never be trusted to write its own
   `transferState`/confidence the way this prototype currently does.
3. Replace `SEED_PROFILES` with a real fetch of the student's existing
   mastery/retention/transfer data from ACEAPT.
4. Wire `SignalCard`'s two calls into real Pathfinder/Proof requests once
   `handleSeeUpdatedProfile` computes the update.
5. If ACEAPT already has topic/skill IDs, swap `TOPICS` / `TOPIC_METHODS`
   for the real taxonomy instead of the six seeded aptitude topics here.

## Deliberately out of scope for this pass

Per §47 ("the first prototype does NOT need every theoretical capability"):

- **Multi-concept transfer** (§14) — combination challenges aren't generated;
  each question tests one topic.
- **Full multi-session adaptive leveling** (§37) — level is tracked and
  persisted per topic, but a single run doesn't climb levels; that needs
  evidence across multiple sessions to do responsibly.
- **Institutional cohort analytics** (§31) — the "Institution view" screen
  is real UI but illustrative sample data, not a real aggregation pipeline.
- **Automated test suite** (§46) — the core logic (`classifyAttempt`,
  `diagnosisRows`, `computeUpdatedProfile`, question validation) is written
  as small pure functions specifically so they're easy to unit test once
  wired into a real test runner; this pass validated them with a scripted
  runtime harness (jsdom + mocked storage/fetch) driving the actual compiled
  component through the full flow instead of shipping that harness.

## Try it

Open the artifact and click into "Percentages" from the dashboard — it's the
topic seeded with a `Developing` transfer state so the full loop (fail →
diagnose → bridge → retest → improve) is reachable in one run. Any topic
works the same way; Percentages is just pre-seeded to make the demo land.
