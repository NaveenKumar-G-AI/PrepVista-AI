# Consented artifact feedback

Implemented locally on 2026-09-19. Default off; no real reviewer has been enrolled,
no student artifact shared and no target database migrated by this work.

## Scope and student journey

On a saved artifact, the student chooses a configured reviewer and explicitly
agrees to share that one version's code, explanation, task, language and assistance
label. No transcript, resume, other artifact, individual readiness report or
organization membership is included. The stored consent version is
`artifact-feedback-v1`. The student can read requests and feedback at
`/readiness/reviews` and withdraw future access there, including after the pilot or
coding workspace is paused. Already read or downloaded copies cannot be recalled.

Configured reviewers use the same page's assigned inbox. Each artifact read checks
the authenticated profile against the current reviewer allowlist and the exact
request recipient. A reviewer, organization administrator or platform administrator
cannot read someone else's assignment merely by knowing its identifier. Request
lists are paginated; older grants remain reachable for withdrawal.

The feedback form uses the six capability names with `NOT_ASSESSED`,
`OBSERVED_STRENGTH`, `OBSERVED_GAP` and `REVIEW_NEEDED` observations plus a bounded
comment. This is a versioned advisory feedback format, not an approved assessment
rubric. Reviewers should leave unsupported capabilities not assessed. A saved
receipt cannot be overwritten; identical retries return the same outcome and
changed retries fail. There is no readiness/outbox adapter for these labels.
`assessment_qualified` remains false. No correctness certification, unaided
authorship claim or institution-wide permission follows from this feedback.

## Configure a reviewed pilot

Apply additive migration `042_artifact_review_consent.sql` only after checking the
actual target ledger and restore rehearsal. The separate migration planner now
recognizes 038–042; it still rejects unknown or changed migration history. Never
renumber an applied file or baseline an unknown checksum to force rollout.

The existing coding workspace and sync pilot must be configured for participating
students. Set `ARTIFACT_REVIEW_ENABLED=true` only for the reviewed pilot deployment
and list at most 50 exact canonical reviewer profile UUIDs in
`ARTIFACT_REVIEWER_PROFILE_IDS`. Empty or wildcard-only lists grant no reviewer
access. The read-only preflight checks an enabled plan for valid reviewer IDs.
Listing a reviewer is an explicit operational grant requiring an actual authorized
assessor decision; this implementation does not nominate accounts automatically.
Reviewer inbox access itself does not require a student coding entitlement.

No new interview credits are consumed. Each student may have at most five open
requests. Profile-scoped serialization makes concurrent creation respect that
limit. A client request UUID makes retry after a lost creation response idempotent;
changing its artifact or recipient fails instead of silently changing consent.

## Authorization, withdrawal and persistence

The server derives student and reviewer identity from existing authenticated
profiles. Owner-bound command fields detect an account switch; client authority
or organization claims do not grant access. The request stores the exact artifact
digest and disclosure version. Reviewer reads and feedback submission check this
digest and the active consent row. Row locks serialize withdrawal with access and
submission: an already authorized read can complete before withdrawal, but a
subsequent request cannot use withdrawn consent. Removal from the configured
reviewer list or disabling review access blocks new reviewer reads/submissions.

New request, feedback and audit tables have RLS enabled and no browser policies.
Only authorized backend operations use them. Audit receipts record the authenticated
actor and grant/save/withdraw action, without duplicating artifact contents. Student
reads and withdrawal survive feature rollback. Deleting a source artifact or its
student account cascades the request, feedback and audit rows; removing a reviewer
account clears the reviewer reference while preserving student-owned feedback.
No queued event can resurrect this feedback because it creates no evidence event.
Retention and legally required audit policies still need an actual product decision;
the current schema does not claim an independently retained compliance archive.

The migration adds tables and indexes only; it does not move existing records,
enable flags, send messages, execute student code or share old artifacts. Flag
rollback blocks new requests and reviewer access while preserving student history
and withdrawal. Application rollback must retain these recovery endpoints.

## Qualification still required

Review consent wording, named recipients, account revocation, accessibility, rubric
examples and data retention with the actual product/assessment owners. Verify live
Supabase access and deployment policies. Test an authorized two-account browser
journey, concurrent withdrawal/submission, lost receipts, source deletion and
staff removal in staging. Local browser API mocks do not replace this exercise.

Advisory feedback is not connected to the offline candidate-policy qualification
tool. An eventual assessment adapter must preserve real assessor identity,
measurement/rubric scope, assistance, source versions, withdrawal/retention rules
and independently reviewed calibration evidence. Do not simply map these labels
to qualified readiness states or substitute this feature for approved role policies.
