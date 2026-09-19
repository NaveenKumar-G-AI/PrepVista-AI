# Follow-up policy

Only `InterviewOrchestrator` selects the next action. `FollowUpController` may
recommend a probe for ownership, measurement, reasoning, behavioral outcome or
AI-output verification. A recommendation must pass all of:

- an open, relevant textual evidence gap;
- per-anchor and whole-session budgets;
- time for remaining primary coverage and a response to the probe;
- no repeated gap on this anchor and no identical issued probe.

Quick permits at most one probe per anchor; standard two; full and focused
project defense at most three. Session probe ceilings are respectively 25%,
40%, 55% and 150% of the selected primary target, also capped by plan allowance.
These are maxima, not quotas. Strong, sufficient answers advance immediately.
The default cannot be an endless chain because each accepted probe consumes
bounded stored counters, while advancement closes the persistent anchor.

Every follow-up retains its parent's family/anchor and an actual answer excerpt.
Legacy answer-aware wording can only refine an authorized reasoning probe; it
cannot replace a primary, change the family or authorize another probe.

Clarification repeats the current question without consuming a slot. One
silence retry is supportive; a second silence skips without scored evidence.
Transcription failures allow retry without adding evidence. Explicit skip
advances. The server clock starts at the first question; low remaining time
reserves closing, and an expired session finishes with partial evidence.
