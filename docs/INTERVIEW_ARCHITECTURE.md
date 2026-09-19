# Interview architecture and pre-change audit

## Existing product (audited before implementation)

The deployed product is `frontend` (Next.js App Router, React, TypeScript) and
`app` (FastAPI, Pydantic, asyncpg, PostgreSQL/Supabase). `CodeForge-AI`, `aceapt`,
`tpodashboard` parts and `legacy` are separate/reference applications, not the
interview implementation. Existing uncommitted delivery/STT fixes are preserved.

Authentication uses Supabase JWTs and `get_current_user`; setup enforces plan
access and quotas. Razorpay billing, plan entitlements, history retention,
organization membership and college APIs remain existing services.

Request trace:

1. `frontend/src/app/interview/setup/page.tsx` uploads multipart resume to
   `POST /interviews/setup` in `interviews_session.py`.
2. Resume parser validates/extracts PDF/DOCX/images and produces structured
   resume data. `create_session` builds a fallback question plan, loads recent
   question memory, stores `interview_sessions`, and records plan usage.
3. Live page sends the start token and subsequent transcript answers to
   `POST /interviews/{id}/answer`. Browser/server STT and stored audio metadata
   are separate from the interview service.
4. `process_answer` locks the session row and writes an idempotency receipt in
   the same transaction as the turn. Existing reload state and expected-turn
   checking prevent duplicate advancement.
5. The legacy path chooses a planned turn, generates a question, then applies
   answer-led overrides and text-based follow-up classification. Evaluation
   runs in a background task against `question_evaluations`.
6. Finish locks the session, backfills pending evaluations, computes the legacy
   score/summary, syncs skill analytics and retention, and marks it FINISHED.
   `GET /reports/{id}` and PDF rendering use stored evaluations and session data.

## Root cause

`_process_answer_in_transaction` uses total conversational turns as plan indices.
`_is_probably_followup` infers depth from technical overlap and wording. Later
`answer_led_followup` overrides (including `_should_force_answer_led_followup`)
can replace a planned primary question. A reset of `consecutive_followups` does
not close a persistent anchor or guarantee the next question is primary. The
system therefore consumes planned breadth slots while discussing one project.

## V2 integration

V2 uses a session-version marker inside the existing JSONB runtime state. A
deterministic domain orchestrator owns anchors, issued question instances,
coverage, evidence, remaining time and closing. A separate transaction adapter
persists that state with conversation messages under the existing row lock and
receipt. Legacy sessions keep their original path. No historical rows are
rewritten. New reports are additive and preserve the legacy numeric contract.
