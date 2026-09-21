# ACEAPT AI — Feature 17
### Adaptive Question Intelligence & Assessment Generation Engine
*A working vertical-slice prototype, built from the Feature 17 master prompt.*

---

## 0. Read this first: what "codebase-first" meant here

The master prompt's Section 53 ("CODEBASE-FIRST RULE") assumes Feature 17 is being
added to an existing ACEAPT repository containing Features 10–16, a student model,
a skill taxonomy, etc. **No such repository was provided.** Rather than inventing
one or fabricating "existing architecture" that doesn't exist (which Section 54
explicitly forbids), this build treats Feature 17 as a **self-contained vertical
slice** with clean, explicitly-labeled integration seams for Features 10, 11, 13,
14, 15, and 16 — see `src/integrations/*.stub.js`. Every one of those files says so
in its header comment and describes exactly what to replace when the real feature
exists.

Nothing in `.env` is required to run this. `ANTHROPIC_API_KEY` is left blank on
purpose — fill it in later; the Generation Engine works without it (see §4).

---

## 1. Quick start

```bash
npm install
cp .env.example .env      # optional — defaults work with nothing filled in
npm start                 # -> http://localhost:4000
npm test                  # runs the engine smoke tests (no server needed)
```

Open `http://localhost:4000`, click **"Load demo: Percentage journey"**, and answer
the first question *incorrectly* using option B — that triggers the full
diagnose → intervene → verify → transfer → mixed-practice arc described in the
master prompt's Section 52. Toggle **System Intelligence** (top right, appears
after you start a session) to watch skill-state meters, the active remediation
arc, and the live event feed as you answer.

---

## 2. What's actually real vs. what's a stand-in

| Layer | Status |
|---|---|
| Question Purpose Engine, Difficulty Engine, Selection Engine, Anti-Repetition, Diagnostic Engine, Generation Engine, Validation Engine, Explanation Engine | **Real.** Deterministic, tested, no fakery. |
| Question bank (18 questions) | **Real content**, hand-authored with verified math and misconception-tagged distractors — not placeholder text. |
| Branching / remediation arcs (Sections 17–20) | **Real**, driven by actual student evidence — not scripted. See §5. |
| Mastery/transfer scoring, diagnosis, journey staging, readiness (Features 14/16/15/13) | **Stubbed contracts**, clearly labeled in `src/integrations/`. The logic inside is a reasonable simplified model, not the real Feature 14/15/16 — those don't exist yet for this to integrate with. Swap the file, keep the function signature. |
| LLM-backed generation | **Real code path**, calls the Anthropic API — but untested end-to-end here because no key was provided (by design, per your instruction). The **template generation path is real, tested, and mathematically verified** (see §4), and is what actually runs today. |
| Persistence | Flat JSON file (`data/db.json`) behind a small repository module (`src/db/`), not a real database. Swap `src/db/store.js` for a real driver without touching call sites. |

If you only remember one thing: **everything upstream of "call a real Feature X
service" is genuine working logic; everything at that boundary is a labeled stub.**

---

## 3. Running the demo scenario by hand

1. `POST /api/session` with `{"studentId":"...", "preset":"percentage-demo"}`
   seeds a student with concept=0.75, strategy=0.45, transfer=0.25, speed=0.7 on
   `successive-percentage-change` — strong concept, shaky strategy, untested transfer.
2. `GET /api/question/next/:id` → purpose engine sees `strategy < 0.5 ≤ concept`
   → **DIAGNOSTIC** → selects `q-pct-004` (the markup/discount question).
3. Answer **B** (the naive-subtraction distractor) → Feature 16 stub maps that
   misconception to `strategy_gap` at confidence 0.5 → a **remediation arc** starts:
   `INTERVENTION_VERIFICATION → TRANSFER → MIXED_PRACTICE`.
4. Each subsequent `GET /api/question/next/:id` walks one arc step; answering
   correctly advances it. Finishing the arc gives transfer a completion bonus,
   flips `masteredAt`, and moves the journey stage to `MASTERY`.
5. `GET /api/student/:id/state` and `GET /api/events/:id` show the raw evidence
   trail — this is what the System Intelligence panel renders.

This exact sequence is asserted in `tests/engine.test.js`, not just described here.

---

## 4. The Generation Engine, concretely

Section 9's rule — spec first, generate second, never the reverse — is
`generationEngine.buildSpec()` followed by `generate()`. Section 46 — "use
deterministic validation where possible" — is `validationEngine.validate()`.

- **With no API key** (`GENERATION_MODE=auto`, default): falls through to a
  deterministic template for `successive-percentage-change` that *computes* the
  correct multiplier and constructs distractors from known misconception
  patterns, so it's correct by construction, not by LLM guess. Verified: run
  ```bash
  node -e "require('./src/engines/generationEngine').generate(require('./src/engines/generationEngine').buildSpec({skillId:'successive-percentage-change',purpose:'DIAGNOSTIC',difficultyTarget:{}})).then(q=>console.log(q.stem, q.options))"
  ```
- **With `ANTHROPIC_API_KEY` set**: calls the real API first, and only falls back
  to the template if the call fails or the result fails validation (Section 57).
- **Any other skill with no template**: `generate()` returns `null`, and the
  orchestrator falls back to the closest bank question via `selectRelaxed()` —
  it never fabricates a question with no basis.

---

## 5. Section → file map

| Master prompt section | File |
|---|---|
| 1–2 Question Purpose / Intent | `src/engines/purposeEngine.js` |
| 4–6 Multi-dimensional & adaptive difficulty | `src/engines/difficultyEngine.js` |
| 7–8 Selection Engine | `src/engines/selectionEngine.js` |
| 9–10 Generation spec + multi-stage pipeline | `src/engines/generationEngine.js`, `src/engines/validationEngine.js` |
| 11 Distractor intelligence | authored into `data/question-bank.json` + generation templates |
| 12, 33 Diagnostic sensor / diagnostic mode | `src/engines/diagnosticEngine.js` |
| 14–15, 27 Anti-repetition / smart repetition | `src/engines/antiRepetitionEngine.js` |
| 17–20 Branching, success/struggle branches, sequences | `activeArc` logic in `src/services/questionOrchestrator.js` |
| 23–24 Transfer / retention questions | orchestrator's retention check + `q-pct-006`/`q-tw-002`/`q-avg-002` |
| 34–35 "Why this question" / targets | `src/engines/explanationEngine.js` |
| 36 Personalized 10-minute set | `getPracticeSet()` in the orchestrator |
| 38–43 Feature 10/11/13/14/15/16 integration | `src/integrations/*.stub.js` |
| 48 Event architecture | `src/events/eventBus.js` |
| 56 Critical test (two students ≠ same sequence) | `tests/engine.test.js` |
| 57 Failure handling / graceful degradation | fallback chain in `getNextQuestion()` |

---

## 6. Known simplifications (said out loud, not hidden)

- Retention interval is seconds (`RETENTION_INTERVAL_SECONDS`, default 120), not
  days/weeks, so it's observable in a live demo. Change it in `.env` for anything
  resembling real spaced repetition.
- Only one micro-skill (`successive-percentage-change`) has a generation template
  and a full 4-step arc's worth of bank content. The other 12 micro-skills have
  1–3 bank questions each — enough to exercise selection/difficulty/mixed-practice
  logic, not a full curriculum.
- Mathematical validation of *LLM-generated* questions is structural and
  self-consistency based (one correct option, no duplicate options, correct skill),
  not symbolic re-derivation of arbitrary generated math — that's a materially
  harder problem and claiming otherwise here would be dishonest. The *template*
  path sidesteps this by computing the answer instead of asking an LLM to.
- The "System Intelligence" panel intentionally shows internal state (misconception
  tags, confidence, raw events) that Section 34 says should **not** reach students —
  it's labeled as a judge/demo view in both the UI and the code for that reason.
- ASSESSMENT mode and DIAGNOSTIC mode are implemented but lightly exercised
  compared to LEARNING and EXAM — the mode selector in the UI lets you try both.

## 7. Project layout

```
server.js                      Express entry point
data/question-bank.json        18 hand-authored, validated questions
src/db/                        JSON-file datastore behind a repository interface
src/events/eventBus.js         In-memory event log
src/engines/                   Purpose, difficulty, selection, generation,
                                validation, anti-repetition, diagnostic, explanation
src/integrations/*.stub.js     Feature 10/11/13/14/15/16 contracts (see §2)
src/services/questionOrchestrator.js   The core SELECT→GENERATE→VALIDATE→...loop
src/routes/                    session, question, student, events
public/                        Static frontend (no build step)
tests/engine.test.js           Smoke tests incl. Section 56's critical test
```
