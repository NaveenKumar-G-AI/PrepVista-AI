# Feature 18 prototype — integration notes

No ACEAPT repo, Feature 10–17 services, or existing data model were present
in this session, so this wasn't an integration — it's a standalone vertical
slice of the loop the spec describes (attempt → diagnosis → teaching →
repair → transfer → evidence), built to be dropped into a real codebase
later. Everything below is exactly what's mocked and where to unmock it.

## What's real right now
- **The math**: all percentage calculations, answer validation, and error
  classification are deterministic — no LLM ever decides if an answer is
  right (spec §29/§50).
- **The evidence capture**: selected option, confidence, and response time
  are genuinely measured from user interaction, not scripted.
- **"Ask a follow-up" in Understand Why**: a real, live call to Claude
  (`askClaudeWhy`, ~line 260), grounded only in this problem's numbers, with
  a hard fallback to pre-written text if the call fails or is unreachable —
  this is the one place the prototype needs network access to shine, and it
  degrades gracefully if it doesn't have it (spec §53).

## What's simulated (clearly labelled in the UI, not hidden)
- **The mastery/transfer numbers on the final screen** (`MasteryUpdate`,
  search the file for it) — the 58%→76% and "Weak→Verified" values are
  illustrative, not computed from a real student model.
- **The four "evidence targets" chips** (Feature 14/15/10/16) — nothing is
  actually written to those systems; they don't exist here.
- **`emitEvent(...)`** calls throughout — currently just `console.log`, one
  at every point the real event pipeline (spec §49) would fire: submission,
  classification, each coaching action taken, transfer verified.

## The blanks you asked to be left blank
At the top of the file:
```js
const CONFIG = {
  STUDENT_ID: null,             // real authenticated student id
  BACKEND_BASE_URL: "",         // ACEAPT API base
  QUESTION_SERVICE_ENDPOINT: "",// Feature 17 — real question + transfer question
  EVENT_ENDPOINT: "",           // real event/analytics pipeline
  AUTH_TOKEN: null,
};
```
Nothing else needs a key — the "Ask a follow-up" call uses the built-in
Claude API bridge these artifacts get automatically, no credential to add.

## Turning this into a real Feature 18
1. **Question source**: `QUESTION`, `OPTIONS`, `BRANCHES`, and
   `TRANSFER_QUESTION` are hardcoded content. In production these come from
   Feature 17 per `QUESTION_SERVICE_ENDPOINT` — Feature 17 decides *which*
   question, this layer still decides *how to teach it*, matching the
   Feature 17 boundary in the spec (§36).
2. **Move `askClaudeWhy` server-side** so the prompt and any student context
   aren't fully client-visible, and so real evidence (branch, hint history,
   past explanations) can feed it instead of the four constants it gets now.
3. **Replace `emitEvent`** with a real POST to `EVENT_ENDPOINT`, keeping the
   same event names already in the code so downstream consumers don't need
   to change.
4. **Replace `MasteryUpdate`'s static numbers** with a read from the real
   Feature 14 (mastery/transfer) and Feature 15 (journey) state after they
   process the events above.
5. **Wire `CONFIG.STUDENT_ID` / `AUTH_TOKEN`** through whatever auth this
   sits behind, and pass them into the event/API calls.

Everything else — the branching logic, step-break visualization, guided
solve, alternative methods, transfer flow — needs no rewrite, only real data
in place of the constants at the top of the file.
