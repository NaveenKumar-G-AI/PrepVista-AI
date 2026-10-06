# PrepVista Old-Push: Rubric Category / Database CHECK Constraint Compatibility

Date: 2026-10-05 (Asia/Calcutta)

Decision: **A**

---

## 1. Historical Database Constraint (Migration 001)

Table `question_evaluations`, column `rubric_category`:
```
CHECK (rubric_category IN (
    'communication',   'technical_depth', 'problem_solving',
    'confidence',      'structure_star',  'vocabulary',
    'vocal_delivery',  'leadership',      'teamwork',
    'adaptability',    'reasoning',       'conciseness',
    'professionalism', 'role_fit'
))
```

Table `skill_scores`, column `category`: identical 14 values.

No later migration modifies these CHECK constraints.

---

## 2. Authoritative Runtime Category Set

`normalize_rubric_category()` in `app/services/evaluator_feedback.py:315–526`
can emit exactly **13 values** that reach `question_evaluations.rubric_category`:

```
introduction          project_ownership     technical_depth
problem_solving       behavioral            communication
situational_judgment  creative_thinking     ai_tool_fluency
programming_language  skill_verification    certification
self_assessment
```

`derive_skill_score_rows()` in `app/services/analytics_student.py:200–239`
additionally writes `delivery` to `skill_scores.category` (synthesized from
`communication_score`, never a `rubric_category` value).

---

## 3. Exact Mismatch

| Set | Count | Values |
|-----|-------|--------|
| DATABASE_ALLOWED | 14 | communication, technical_depth, problem_solving, confidence, structure_star, vocabulary, vocal_delivery, leadership, teamwork, adaptability, reasoning, conciseness, professionalism, role_fit |
| RUNTIME_CAN_EMIT (evaluations) | 13 | introduction, project_ownership, technical_depth, problem_solving, behavioral, communication, situational_judgment, creative_thinking, ai_tool_fluency, programming_language, skill_verification, certification, self_assessment |
| RUNTIME_CAN_EMIT (skill_scores) | 14 | above 13 + delivery |
| COMMON | 3 | communication, technical_depth, problem_solving |
| DATABASE_ONLY | 11 | confidence, structure_star, vocabulary, vocal_delivery, leadership, teamwork, adaptability, reasoning, conciseness, professionalism, role_fit |
| RUNTIME_ONLY (evaluations) | 10 | introduction, project_ownership, behavioral, situational_judgment, creative_thinking, ai_tool_fluency, programming_language, skill_verification, certification, self_assessment |
| RUNTIME_ONLY (skill_scores) | 11 | above 10 + delivery |

**Every RUNTIME_ONLY value causes a PostgreSQL CHECK constraint violation on write.**

---

## 4. Category Classification

| Category | Status | Notes |
|----------|--------|-------|
| communication | ACTIVE_CURRENT | Common to both sets |
| technical_depth | ACTIVE_CURRENT | Common to both sets |
| problem_solving | ACTIVE_CURRENT | Common to both sets |
| introduction | ACTIVE_CURRENT | Heuristic from "tell me about yourself" questions |
| project_ownership | ACTIVE_CURRENT | Heuristic from "walk me through" questions |
| behavioral | ACTIVE_CURRENT | Heuristic from conflict/pressure questions |
| situational_judgment | ACTIVE_CURRENT | New question family |
| creative_thinking | ACTIVE_CURRENT | New question family |
| ai_tool_fluency | ACTIVE_CURRENT | New question family |
| programming_language | ACTIVE_CURRENT | New PRO/CAREER question family |
| skill_verification | ACTIVE_CURRENT | New PRO/CAREER question family |
| certification | ACTIVE_CURRENT | New PRO/CAREER question family |
| self_assessment | ACTIVE_CURRENT | New PRO/CAREER question family |
| delivery | SYNTHETIC | From communication_score; written to skill_scores only |
| confidence | LEGACY_READ_ONLY | In migration 001; may exist in historical rows |
| structure_star | LEGACY_READ_ONLY | In migration 001; may exist in historical rows |
| vocabulary | LEGACY_READ_ONLY | In migration 001; may exist in historical rows |
| vocal_delivery | LEGACY_READ_ONLY | In migration 001; may exist in historical rows |
| leadership | LEGACY_READ_ONLY | In migration 001; may exist in historical rows |
| teamwork | LEGACY_READ_ONLY | In migration 001; may exist in historical rows |
| adaptability | LEGACY_READ_ONLY | In migration 001; may exist in historical rows |
| reasoning | LEGACY_READ_ONLY | In migration 001; may exist in historical rows |
| conciseness | LEGACY_READ_ONLY | In migration 001; may exist in historical rows |
| professionalism | LEGACY_READ_ONLY | In migration 001; may exist in historical rows |
| role_fit | LEGACY_READ_ONLY | Normalized to 'communication' before DB write |

---

## 5. Forward Migration

**File**: `app/database/migrations/038_rubric_category_expansion.sql`

**Operations**:
1. `ALTER TABLE question_evaluations DROP CONSTRAINT IF EXISTS question_evaluations_rubric_category_check`
2. `ALTER TABLE question_evaluations ADD CONSTRAINT ... CHECK (rubric_category IN (24 values))`
3. `ALTER TABLE skill_scores DROP CONSTRAINT IF EXISTS skill_scores_category_check`
4. `ALTER TABLE skill_scores ADD CONSTRAINT ... CHECK (category IN (25 values))`

**What it does NOT do**:
- No DELETE, UPDATE, or TRUNCATE
- No table recreation
- No row rewriting
- No unrelated constraint/index changes

**New constraint values** = LEGACY_DB_CATEGORIES (14) ∪ CURRENT_RUNTIME_CATEGORIES (13) = 24 unique for evaluations, +1 `delivery` = 25 for skill_scores.

---

## 6. Canonical Contract Module

**File**: `app/services/rubric_contract.py`

Single source of truth providing:
- `LEGACY_DB_CATEGORIES` (14 values from migration 001)
- `CURRENT_RUNTIME_CATEGORIES` (13 values from runtime normalizer)
- `SYNTHETIC_SKILL_CATEGORIES` (`delivery` only)
- `VALID_EVALUATION_CATEGORIES` (24 = union of legacy + current)
- `VALID_SKILL_SCORE_CATEGORIES` (25 = above + synthetic)
- `build_preflight_queries()` — read-only SQL to detect unknown production values

---

## 7. Pre-Deployment Preflight

Two read-only SELECT queries detect any existing production values outside the
proposed new allowlist:

```sql
SELECT DISTINCT rubric_category FROM question_evaluations
WHERE rubric_category NOT IN ('adaptability', 'ai_tool_fluency', ...) LIMIT 100;

SELECT DISTINCT category FROM skill_scores
WHERE category NOT IN ('adaptability', 'ai_tool_fluency', ..., 'delivery') LIMIT 100;
```

Zero rows returned = safe to apply migration.
Any rows returned = unexpected values requiring investigation before migration.

**Not run against production in this task.**

---

## 8. Readiness / Migration Runner Impact

- `expected_migration_checksums()` automatically includes `038_rubric_category_expansion`
  because it reads all `.sql` files in the migrations directory.
- `check_schema_readiness()` will require the DB to have this migration applied.
- **Startup never executes migrations** — Batch 0 invariant preserved.
- Migration runner `_run_migrations` sorts files alphabetically — 038 sorts after 037.
- Checksum tracking prevents silent re-edits.

---

## 9. Additional Findings (Informational)

### A. Analytics Silent Drop (Not fixed — out of scope)
`VALID_RUBRIC_CATEGORIES` in `analytics_helpers.py` omits 7 newer categories
(`situational_judgment`, `creative_thinking`, `ai_tool_fluency`, `programming_language`,
`skill_verification`, `certification`, `self_assessment`). Evaluations in these
categories are silently skipped by `derive_skill_score_rows()` and never appear
in student radars, cohort rollups, or growth heatmaps.

### B. CATEGORY_WEIGHTS Gap (Not fixed — out of scope)
`CATEGORY_WEIGHTS` in `config.py` weights only 9 of the 13 runtime categories.
The 4 newest (`programming_language`, `skill_verification`, `certification`,
`self_assessment`) have 0% weight in the weighted final score.

### C. Sankey Role Fit Disconnect (Not fixed — out of scope)
`compute_role_fit_sankey()` checks `category == "role_fit"` but the normalizer
maps `role_fit` → `communication` before DB write, so new sessions never
produce `role_fit` rows.

These are analytics completeness issues, not data integrity issues. They do not
block the rubric constraint fix.

---

## 10. Test Results

### Focused Rubric Compatibility Tests
**86 passed, 0 failures** (1.31s)

Coverage:
- Contract integrity (9 tests)
- Migration 001 preservation (3 tests)
- Migration 038 correctness (10 tests — no DELETE/UPDATE/TRUNCATE/DROP TABLE)
- Migration ordering (4 tests)
- Runtime emission (12 tests — all 13 current categories + delivery)
- Normalizer output (21 tests — direct, aliases, heuristics)
- Preflight queries (3 tests — read-only, complete, valid SELECT)
- Cross-module consistency (4 tests)
- Historical migration immutability (3 tests)
- Readiness contract (2 tests)

### Full Backend Suite
**926 passed, 0 failures** (35.48s)

### Frontend Tests
**190 passed, 0 failures** (11.28s)

### TypeScript Typecheck
**PASS** (0 errors)

### ESLint
**PASS** (0 warnings)

### git diff --check
**CLEAN** (LF/CRLF warnings only)

---

## 11. Preservation Audit

- ✅ All 38 historical migration SQL files unchanged (git diff empty)
- ✅ 1 new migration file added: `038_rubric_category_expansion.sql`
- ✅ Batch 0 report unchanged
- ✅ Batch 1 report unchanged
- ✅ Batch 2 report unchanged
- ✅ Batch 3 report unchanged
- ✅ Batch 4 report unchanged
- ✅ Batch 5 report unchanged
- ✅ `frontend/package-lock.json` unchanged
- ✅ `C:\PrepVista-AI` untouched (last modification: 2026-10-02)
- ✅ No production connectivity
- ✅ No deployment
- ✅ No existing user data changed

---

## 12. Remaining Risks

1. **Real PostgreSQL execution required** — The new migration has been verified
   offline only. It must be applied to a real PostgreSQL instance to confirm
   the constraint names match PostgreSQL's auto-generated names for the inline
   CHECK constraints from migration 001. `DROP CONSTRAINT IF EXISTS` provides
   safety if the name differs, but the ADD would then layer on top of the old
   constraint.

2. **Unknown production values** — If production contains category values
   outside the proposed 24/25-value set, the new CHECK will reject them.
   The preflight query must be run before migration.

3. **Analytics completeness gaps** — The 3 informational findings (§9) affect
   analytics accuracy but not data integrity. They can be addressed in a
   future batch.

STOP. DO NOT DEPLOY.
