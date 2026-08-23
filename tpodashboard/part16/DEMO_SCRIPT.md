# PrepVista AI — TPO Demo Script

Combines §71/§72/§91 into one run-through. The lines below are the actual
transcript from `node run-part16-demo.mjs` against this kit's fixture data
(18 students, 3 active drives, one closed golden-path drive) — not
placeholder text. Swap in your real institution's numbers once this is
wired to your repo; the shape of the script doesn't change.

## Open — Command Centre

**AI:** "Good morning. I found 4 things requiring attention."
- Zenith Systems — SDE closes in 4 day(s)
- 11 data-quality issue(s) found
- 3 eligible students haven't applied to Zenith Systems — SDE
- 8 eligible students haven't applied to Orbit Analytics — Data Analyst

## Scene 1 — Ask the AI

**TPO:** "What needs my attention?"
**AI** answers from the signals above — computed from real eligibility ×
application data, not a canned list.

**TPO:** "Show me the highest priority."
AI drills into the biggest eligible-not-applied gap: *8 eligible students
haven't applied to Orbit Analytics — Data Analyst.*

## Scene 2 — Narrow with AI

**TPO:** "Show high-readiness students."
**AI:** "5 of those 8 have readiness 85+: Aditi Rao, Karthik Subramaniam,
Priya Iyer, Yash Malhotra, Rohit Sharma."

This is real narrowing (8 → 5), not the same list repeated back.

## Scene 3 — Prepare and confirm an action

**TPO:** "Prepare a reminder."
**AI:** "Reminder drafted for 5 students about Orbit Analytics — Data
Analyst. Confirm to send?"
**TPO:** "Confirm."

Show the confirmation step explicitly — per §37/§39, this is the one place
the AI is never allowed to act without a human in the loop. The action sits
in `prepared` until a `tpo_head` (only that role, in this kit's RBAC
matrix) confirms it — `department_coordinator` or `student` accounts
cannot.

## Scene 4 — Execute and show the effect, live

**AI:** "Sent to 5. 3 applied within the window."

Return to Command Centre — the eligible-not-applied count for that drive is
now genuinely 5, down from 8. This is the "wow": one system, not sixteen
dashboards pretending to be one.

## Scene 5 — Student view

Open one of the reminded students. Show what *they* see: the drive, their
application, their readiness — and confirm no TPO-only data (other
students' scores, the full attention list) leaks into that view.

## Scene 6 — Drive → Applications → Interviews → Offers → Joining

Walk the funnel on one real student: this kit's `stu-014` went eligible →
applied → interviewed → selected → offer → accepted → joining confirmed →
verified placement outcome, on the (now closed) Vertex Robotics drive.

## Scene 7 — Close the loop with AI

**TPO:** "Did it help?"
**AI:** "Yes — 3 of the 8 moved to applied."

Real attribution: the 3 are exactly the students who both received the
reminder and then applied — not an unrelated number that happens to look
good.

## Scene 8 — Management

**Verified joinings:** 1 · **Reports show:** 1 · **Reconciled:** true

The number Management sees traces back to the same verified joining record
shown in Scene 6 (§44) — same underlying data, not two separately
maintained counts that happen to agree today.

## Scene 9 — Report

Generate the management report live from the same reconciliation check
above, not a separately hardcoded figure.

---

**Rehearsal rule:** if a scene needs a fake number to work, the scene isn't
ready — fix the data path, don't fake the demo. Full transcript, including
the tenant-isolation and RBAC checks that ran right before this: see
`VERIFIED-RUN-OUTPUT.txt`.
