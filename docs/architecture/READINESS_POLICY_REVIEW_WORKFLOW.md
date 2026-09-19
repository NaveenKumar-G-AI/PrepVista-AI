# Readiness policy review workflow

Status: offline review tooling implemented; no role policy or rubric is approved.
This tool does not read or write the application database, call providers, fetch
private student data, verify reviewer identity or activate production grading.

The live product continues to use the foundation `practice-evidence-v2` projection.
This separate candidate engine lets the assessment team examine proposed evidence
gates before deciding whether a production policy is justified.

## Run the authored examples

From the repository root, with the existing Python environment:

```powershell
.\.venv\Scripts\python.exe -m scripts.evaluate_readiness_policy --policy docs/architecture/readiness-policy.candidate.json --fixtures docs/architecture/readiness-review.fixtures.example.json
```

Both example cases are authored synthetic fixtures. A zero mismatch count means
the proposed rules matched those fixture labels; it does not demonstrate accuracy
on students. The example policy is `DRAFT`. Its two-demonstration/two-family and
90-day thresholds are review hypotheses, not validated assessment requirements.
The candidate rubric names describe proposed scopes; no completed human rubric
review or reviewer agreement is implied by those names.

## Prepare a reviewed evaluation set

1. Select the target role, required capabilities, supported execution languages,
   accepted measurement versions, demonstration/diversity requirements and
   freshness hypotheses. Keep draft versions immutable when comparing revisions.
2. Establish each source's actual authority before preparing an observation.
   Browser results stay `CLIENT_REPORTED`; text heuristics stay
   `INTERVIEW_TEXT_SIGNAL`. A fixture claiming `QUALIFIED_RUBRIC_REVIEW` is not
   proof that the review happened. Retain the authorized source/reviewer/rubric
   audit record outside this tool. Obtain the necessary student permissions before
   using private work for review; this CLI supplies no new data-access authority.
3. Assign stable correlation IDs to the same artifact/retest or interview anchor.
   Assign task families based on reviewed content, not a student's claimed label.
   Use `comparison_id` only for observations judged comparable under the same
   measurement version. Different suites need not be contradictory merely because
   their outcomes differ.
4. Record expected row and overall states independently from the candidate engine.
   Use `AUTHOR_FIXTURE` for engineering cases. `REVIEWED_CASE` requires a reference
   to the actual review record; the tool does not authenticate that reference.
   Preserve disagreement and inconclusive outcomes. Do not replace labels merely
   to make an evaluation pass.
5. Include missing capabilities, unsupported languages, unaudited source claims,
   assistance unknown, repeated tasks, stale/future/client-provided timestamps,
   unavailable execution, role changes, genuine gaps and comparable contradictory
   observations. Evaluate accessibility and relevant subgroup error patterns using
   sufficient, appropriately collected data. Do not infer protected traits from
   answers or code or use small examples as statistical evidence.

## Rules and output

Inputs are strict bounded JSON: each file is at most 5 MB, each fixture set at most
1,000 cases, and each case at most 500 normalized observations. No source code,
transcripts, resumes, tokens or arbitrary extra fields are accepted by the schema.
The result contains policy/input hashes, source references, coverage and exclusions,
candidate states and mismatches against the supplied labels. Treat these reports
as private if their case/source identifiers refer to real people.

The engine rejects conflicting records with the same observation ID. Exact replay
duplicates have no effect. Repeated correlation groups count once; different task
IDs in the same family do not satisfy a diversity requirement. Conflicting family
metadata in one correlation group requires review rather than inflating coverage.
Execution results may support declared correctness only. They cannot establish
reasoning, ownership, communication or interview judgment.

Unaccepted authorities/measurement versions, role/language mismatches, inconclusive
outcomes, stale/future/client-claimed timestamps and unavailable measurements are
reported as exclusions. They never become a numerical zero. Current eligible gaps
cannot be compensated by successful evidence elsewhere. Comparable contradictory
outcomes produce a review-needed row without an accusation about the student.

Required-capability coverage is non-compensatory: missing adequate coverage keeps
the overall candidate at `MORE_EVIDENCE_NEEDED`. With adequate coverage, unresolved
conflicts take precedence over gaps, and gaps take precedence over demonstration.
Every result remains `SHADOW_ONLY`, with `NOT_CALIBRATED` confidence,
`NOT_ESTABLISHED` independence and `release_authorized: false`. Both known assistance
and unknown assistance retain that independence limit. The policy schema accepts
only `DRAFT` or `IN_REVIEW`; this tool has no approval or publication command.

Exit 0 means the supplied labels matched (or a case had no labels). Exit 1 means
one or more labelled expectations differed. Exit 2 means an invalid or unavailable
input; validation exceptions are redacted so their input values are not printed.
The report separately records whether a case has labels and how many cases claim
reviewed status. No exit code authorizes student grading or a hiring claim.

## Compare separately supplied review annotations

The 2026-09-15 comparison extension accepts an optional private `--reviews` file.
It measures descriptive agreement between submitted labels and the candidate, and
between submitted reviewer references, without creating a consensus label or
approving a policy. It still does not authenticate reviewers, establish independent
review, collect student consent or read production evidence.

Run the authored example:

```powershell
.\.venv\Scripts\python.exe -m scripts.evaluate_readiness_policy --policy docs/architecture/readiness-policy.candidate.json --fixtures docs/architecture/readiness-review.fixtures.example.json --reviews docs/architecture/readiness-reviewer-annotations.example.json --comparison-only
```

Both `synthetic-example-*` reviewer references and their annotations are engineering
fixtures, not records of completed human reviews. Their agreement is not evidence
of assessment quality. No real review data was collected during implementation.

For an authorized review, supply a bounded JSON object with `schema_version: 1`,
the exact `policy_sha256` from the candidate report and an `annotations` array.
Each annotation contains:

- `case_id` and that case's candidate `input_sha256`.
- Stable opaque `reviewer_reference` and versioned `rubric_reference` values.
- A `rows` object containing the capability labels actually supplied by the reviewer.
- An optional `overall` label supplied separately from the row labels.

Use existing authorized review records for these references; do not generate new
identities to increase reviewer counts. The schema accepts identifier characters,
not free-form names, comments, transcripts or source code. It accepts at most
10,000 annotations within the existing 5 MB file limit. Duplicate case/reviewer/
rubric submissions, unknown cases, labels outside the selected policy, policy drift
and changed case inputs are rejected. Reordering annotations preserves the result
and review-input hash. Changing labels, case inputs or policy changes that hash.
Reviewers should label the authorized evidence independently before inspecting
candidate results. This command cannot prove that they did so.

The report separates each rubric version and each capability, including overall.
Only reviewers who labeled the same case, capability and rubric version form a
comparison. Missing labels abstain; they do not become disagreement, agreement or
weak student performance. Counts show unlabeled cases, cases with one reviewer,
cases with multiple reviewers, unanimous cases, disagreement cases, candidate-label
comparisons and a supplied-label/candidate-label count table. A case with three
reviewers contributes three unordered reviewer pairs. Cases with larger panels
therefore contribute more pairs: the fraction is a descriptive pair proportion,
not a student-weighted accuracy estimate, chance-adjusted statistic or confidence
interval. No comparable pair yields `null`, not zero or perfect agreement.

`--comparison-only` emits aggregate comparison results without raw case, source,
reviewer or rubric references. Rubric references are hashed. This is still private
assessment output: hashes and aggregate counts do not prove anonymization, consent
or safe institutional distribution, especially with small review sets. Without
that switch, the original detailed candidate report includes the comparison and
continues to contain case/source references. Preserve the tool/code revision with
the report; `comparison_version` identifies the comparison semantics.

Exit 1 indicates candidate/annotation differences or reviewer disagreement; exit 2
indicates invalid/unavailable input. In comparison-only mode, exit status concerns
the emitted annotation comparison, not the fixture's separate expected labels.
Exit 0 only means no reported differences in the supplied comparisons. Inspect
denominators and unreviewed capabilities: even one matching annotation can yield
exit 0, and none of these outcomes establishes adequate review coverage. Every
comparison explicitly keeps reviewer identity, independence, consent, assessment
qualification and release authorization unverified/false. Disagreements require
review; they are never resolved by silently taking a majority vote.

## Remaining production qualification work

Use the reports to review source validity, rubric examples, assessor agreement,
coverage, relevant error patterns, threshold sensitivity and measurement limits.
Approve a versioned role policy only with a traceable assessment decision and its
supporting evidence. The production adapter must derive authority from authenticated
server records, not from uploaded fixture fields. Qualified human-review collection,
approval publication and live shadow read-switch remain separate work requiring
the actual reviewed policy and institutional privacy scope. A locally implemented
[artifact feedback workflow](ARTIFACT_REVIEW_WORKFLOW.md) now collects authenticated,
explicitly consented advisory feedback for one saved artifact. It does not populate
qualified evidence, approve rubrics or replace the measurement review described here.
The candidate files are deliberately not imported by student-facing services.
