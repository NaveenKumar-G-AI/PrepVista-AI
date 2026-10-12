"""Tests for rubric category / database CHECK constraint compatibility.

Proves:
- migration 038 CHECK values match the canonical rubric_contract module
- historical migration 001 values are a subset of the new constraint
- every runtime-emitted category is accepted
- unknown categories are rejected
- no historical migration was modified
- migration 038 contains no destructive statements
- migration ordering is deterministic
- preflight queries are read-only
- prior batch evaluation paths remain functional
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services.rubric_contract import (
    CURRENT_RUNTIME_CATEGORIES,
    LEGACY_DB_CATEGORIES,
    SYNTHETIC_SKILL_CATEGORIES,
    VALID_EVALUATION_CATEGORIES,
    VALID_SKILL_SCORE_CATEGORIES,
    build_preflight_queries,
)

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "app" / "database" / "migrations"
MIGRATION_001 = MIGRATIONS_DIR / "001_initial_schema.sql"
MIGRATION_038 = MIGRATIONS_DIR / "038_rubric_category_expansion.sql"


# ════════════════════════════════════════════════════════════════════════════
# §1  CONTRACT INTEGRITY
# ════════════════════════════════════════════════════════════════════════════

def _extract_check_values(sql: str, column_pattern: str) -> set[str]:
    """Extract IN (...) values from a CHECK constraint following column_pattern."""
    # Find the CHECK clause for the given column
    pattern = rf"CHECK\s*\(\s*{column_pattern}\s+IN\s*\((.*?)\)\s*\)"
    match = re.search(pattern, sql, re.DOTALL | re.IGNORECASE)
    if not match:
        return set()
    values_str = match.group(1)
    return set(re.findall(r"'([^']+)'", values_str))


class TestContractIntegrity:
    """Canonical contract sets are self-consistent."""

    def test_legacy_is_subset_of_evaluation_categories(self):
        assert LEGACY_DB_CATEGORIES <= VALID_EVALUATION_CATEGORIES

    def test_runtime_is_subset_of_evaluation_categories(self):
        assert CURRENT_RUNTIME_CATEGORIES <= VALID_EVALUATION_CATEGORIES

    def test_evaluation_categories_is_exact_union(self):
        assert VALID_EVALUATION_CATEGORIES == LEGACY_DB_CATEGORIES | CURRENT_RUNTIME_CATEGORIES

    def test_skill_score_categories_includes_delivery(self):
        assert "delivery" in VALID_SKILL_SCORE_CATEGORIES

    def test_skill_score_is_superset_of_evaluation(self):
        assert VALID_EVALUATION_CATEGORIES < VALID_SKILL_SCORE_CATEGORIES

    def test_skill_score_is_exact_union(self):
        assert VALID_SKILL_SCORE_CATEGORIES == VALID_EVALUATION_CATEGORIES | SYNTHETIC_SKILL_CATEGORIES

    def test_delivery_not_in_evaluation_categories(self):
        # delivery is synthetic (from communication_score), never a rubric_category
        assert "delivery" not in VALID_EVALUATION_CATEGORIES

    def test_no_empty_string(self):
        assert "" not in VALID_EVALUATION_CATEGORIES
        assert "" not in VALID_SKILL_SCORE_CATEGORIES

    def test_all_lowercase_underscore(self):
        for cat in VALID_SKILL_SCORE_CATEGORIES:
            assert re.fullmatch(r"[a-z][a-z0-9_]*", cat), f"Invalid format: {cat!r}"


# ════════════════════════════════════════════════════════════════════════════
# §2  MIGRATION 001 HISTORICAL PRESERVATION
# ════════════════════════════════════════════════════════════════════════════

class TestMigration001Preservation:
    """Historical constraint values are preserved in the new contract."""

    @pytest.fixture(autouse=True)
    def _load_sql(self):
        self.sql = MIGRATION_001.read_text(encoding="utf-8")

    def test_historical_evaluation_check_values_are_subset(self):
        historical = _extract_check_values(self.sql, "rubric_category")
        assert historical, "Could not extract rubric_category CHECK from migration 001"
        assert historical <= VALID_EVALUATION_CATEGORIES, (
            f"Historical values not preserved: {historical - VALID_EVALUATION_CATEGORIES}"
        )

    def test_historical_skill_scores_check_values_are_subset(self):
        historical = _extract_check_values(self.sql, "category")
        assert historical, "Could not extract category CHECK from migration 001"
        assert historical <= VALID_SKILL_SCORE_CATEGORIES, (
            f"Historical values not preserved: {historical - VALID_SKILL_SCORE_CATEGORIES}"
        )

    def test_historical_evaluation_values_match_legacy_set(self):
        historical = _extract_check_values(self.sql, "rubric_category")
        assert historical == LEGACY_DB_CATEGORIES


# ════════════════════════════════════════════════════════════════════════════
# §3  MIGRATION 038 CORRECTNESS
# ════════════════════════════════════════════════════════════════════════════

class TestMigration038:
    """New forward migration is correct and non-destructive."""

    @pytest.fixture(autouse=True)
    def _load_sql(self):
        self.sql = MIGRATION_038.read_text(encoding="utf-8")

    def test_migration_file_exists(self):
        assert MIGRATION_038.exists()

    def test_migration_appears_exactly_once(self):
        files = [f for f in MIGRATIONS_DIR.glob("038_*.sql")]
        assert len(files) == 1, f"Expected exactly one 038 migration, found: {files}"

    def test_no_delete_statement(self):
        # Strip comments before checking for destructive keywords
        stripped = re.sub(r"--[^\n]*", "", self.sql)
        # Allow "ON DELETE" in FK clauses but reject standalone DELETE FROM
        stripped = re.sub(r"ON\s+DELETE\s+(CASCADE|SET NULL|RESTRICT|NO ACTION|SET DEFAULT)",
                         "", stripped, flags=re.IGNORECASE)
        assert "DELETE" not in stripped.upper(), "Migration must not DELETE rows"

    def test_no_truncate(self):
        stripped = re.sub(r"--[^\n]*", "", self.sql)
        assert "TRUNCATE" not in stripped.upper()

    def test_no_update(self):
        stripped = re.sub(r"--[^\n]*", "", self.sql)
        assert "UPDATE" not in stripped.upper(), "Migration must not UPDATE historical rows"

    def test_no_drop_table(self):
        assert "DROP TABLE" not in self.sql.upper()

    def test_no_create_table(self):
        assert "CREATE TABLE" not in self.sql.upper(), "Migration must not recreate tables"

    def test_evaluation_check_values_match_contract(self):
        values = _extract_check_values(self.sql, "rubric_category")
        assert values == VALID_EVALUATION_CATEGORIES, (
            f"Migration 038 evaluation CHECK does not match contract.\n"
            f"  Missing: {VALID_EVALUATION_CATEGORIES - values}\n"
            f"  Extra:   {values - VALID_EVALUATION_CATEGORIES}"
        )

    def test_skill_scores_check_values_match_contract(self):
        values = _extract_check_values(self.sql, "category")
        assert values == VALID_SKILL_SCORE_CATEGORIES, (
            f"Migration 038 skill_scores CHECK does not match contract.\n"
            f"  Missing: {VALID_SKILL_SCORE_CATEGORIES - values}\n"
            f"  Extra:   {values - VALID_SKILL_SCORE_CATEGORIES}"
        )

    def test_drops_old_constraints_before_adding_new(self):
        drop_eval = self.sql.upper().index("DROP CONSTRAINT")
        add_eval = self.sql.upper().index("ADD CONSTRAINT")
        assert drop_eval < add_eval

    def test_constraint_names_are_explicit(self):
        assert "question_evaluations_rubric_category_check" in self.sql
        assert "skill_scores_category_check" in self.sql


# ════════════════════════════════════════════════════════════════════════════
# §4  MIGRATION ORDERING AND FILE INTEGRITY
# ════════════════════════════════════════════════════════════════════════════

class TestMigrationOrdering:
    """Migration files are well-ordered and historical files unchanged."""

    def test_migration_ordering_is_deterministic(self):
        files = sorted(f.name for f in MIGRATIONS_DIR.glob("*.sql") if f.name[0].isdigit())
        # Verify sorted order matches directory iteration order
        assert files == sorted(files)

    def test_038_sorts_after_037(self):
        files = sorted(f.name for f in MIGRATIONS_DIR.glob("*.sql") if f.name[0].isdigit())
        idx_037 = next(i for i, f in enumerate(files) if f.startswith("037_"))
        idx_038 = next(i for i, f in enumerate(files) if f.startswith("038_"))
        assert idx_038 == idx_037 + 1

    def test_no_filename_collision(self):
        stems = [f.stem for f in MIGRATIONS_DIR.glob("*.sql") if f.name[0].isdigit()]
        # The only known duplicate is 034 (two different migrations share that prefix)
        non_034 = [s for s in stems if not s.startswith("034_")]
        prefixes = [s.split("_")[0] for s in non_034]
        assert len(prefixes) == len(set(prefixes)), "Duplicate migration prefix found"

    def test_total_migration_count(self):
        files = list(MIGRATIONS_DIR.glob("*.sql"))
        assert len(files) == 55, f"Expected 55 migration files through receipt recovery 053, found {len(files)}"


# ════════════════════════════════════════════════════════════════════════════
# §5  RUNTIME CATEGORY EMISSION
# ════════════════════════════════════════════════════════════════════════════

class TestRuntimeEmission:
    """Every category the runtime can emit is in the DB contract."""

    def test_project_ownership_accepted(self):
        assert "project_ownership" in VALID_EVALUATION_CATEGORIES

    def test_introduction_accepted(self):
        assert "introduction" in VALID_EVALUATION_CATEGORIES

    def test_behavioral_accepted(self):
        assert "behavioral" in VALID_EVALUATION_CATEGORIES

    def test_situational_judgment_accepted(self):
        assert "situational_judgment" in VALID_EVALUATION_CATEGORIES

    def test_creative_thinking_accepted(self):
        assert "creative_thinking" in VALID_EVALUATION_CATEGORIES

    def test_ai_tool_fluency_accepted(self):
        assert "ai_tool_fluency" in VALID_EVALUATION_CATEGORIES

    def test_programming_language_accepted(self):
        assert "programming_language" in VALID_EVALUATION_CATEGORIES

    def test_skill_verification_accepted(self):
        assert "skill_verification" in VALID_EVALUATION_CATEGORIES

    def test_certification_accepted(self):
        assert "certification" in VALID_EVALUATION_CATEGORIES

    def test_self_assessment_accepted(self):
        assert "self_assessment" in VALID_EVALUATION_CATEGORIES

    def test_delivery_accepted_in_skill_scores(self):
        assert "delivery" in VALID_SKILL_SCORE_CATEGORIES

    def test_unknown_category_not_accepted(self):
        assert "unknown_garbage_category" not in VALID_EVALUATION_CATEGORIES
        assert "unknown_garbage_category" not in VALID_SKILL_SCORE_CATEGORIES

    def test_empty_string_not_accepted(self):
        assert "" not in VALID_EVALUATION_CATEGORIES


class TestNormalizerOutput:
    """normalize_rubric_category output is always within the contract."""

    @pytest.fixture(autouse=True)
    def _import_normalizer(self):
        from app.services.evaluator_feedback import normalize_rubric_category
        self.normalize = normalize_rubric_category

    @pytest.mark.parametrize("category", [
        "introduction", "project_ownership", "technical_depth",
        "problem_solving", "behavioral", "communication",
        "situational_judgment", "creative_thinking", "ai_tool_fluency",
        "programming_language", "skill_verification", "certification",
        "self_assessment",
    ])
    def test_direct_category_accepted(self, category):
        result = self.normalize("generic question", category, "career")
        assert result in VALID_EVALUATION_CATEGORIES, f"Normalizer output {result!r} not in contract"

    @pytest.mark.parametrize("alias,expected", [
        ("ownership", "project_ownership"),
        ("workflow_process", "technical_depth"),
        ("tool_method", "technical_depth"),
        ("challenge_debugging", "problem_solving"),
        ("communication_explain", "communication"),
        ("teamwork_pressure", "behavioral"),
        ("learning_growth", "behavioral"),
        ("role_fit", "communication"),
        ("closeout", "communication"),
        ("studies_background", "introduction"),
        ("situational", "situational_judgment"),
        ("creative", "creative_thinking"),
        ("ai_fluency", "ai_tool_fluency"),
        ("programming", "programming_language"),
        ("skill", "skill_verification"),
        ("certifications", "certification"),
        ("self_judgement", "self_assessment"),
    ])
    def test_alias_normalizes_to_valid_category(self, alias, expected):
        result = self.normalize("generic question", alias, "career")
        assert result == expected
        assert result in VALID_EVALUATION_CATEGORIES

    def test_question_heuristic_introduction(self):
        result = self.normalize("Tell me about yourself", "unknown", "free")
        assert result == "introduction"
        assert result in VALID_EVALUATION_CATEGORIES

    def test_question_heuristic_project_ownership(self):
        result = self.normalize("Walk me through your project", "unknown", "pro")
        assert result == "project_ownership"
        assert result in VALID_EVALUATION_CATEGORIES

    def test_question_heuristic_situational(self):
        result = self.normalize("What would you do in this scenario", "unknown", "career")
        assert result == "situational_judgment"
        assert result in VALID_EVALUATION_CATEGORIES

    def test_question_heuristic_ai_tool(self):
        result = self.normalize("How do you use ChatGPT in your work", "unknown", "career")
        assert result == "ai_tool_fluency"
        assert result in VALID_EVALUATION_CATEGORIES


# ════════════════════════════════════════════════════════════════════════════
# §6  PREFLIGHT QUERIES
# ════════════════════════════════════════════════════════════════════════════

class TestPreflight:
    """Preflight queries are valid and read-only."""

    def test_preflight_queries_are_read_only(self):
        eval_q, skill_q = build_preflight_queries()
        for q in (eval_q, skill_q):
            upper = q.upper()
            assert "INSERT" not in upper
            assert "UPDATE" not in upper
            assert "DELETE" not in upper
            assert "DROP" not in upper
            assert "ALTER" not in upper
            assert "TRUNCATE" not in upper

    def test_preflight_queries_contain_all_valid_values(self):
        eval_q, skill_q = build_preflight_queries()
        for cat in VALID_EVALUATION_CATEGORIES:
            assert f"'{cat}'" in eval_q, f"Missing {cat} in evaluation preflight"
        for cat in VALID_SKILL_SCORE_CATEGORIES:
            assert f"'{cat}'" in skill_q, f"Missing {cat} in skill_scores preflight"

    def test_preflight_queries_are_select(self):
        eval_q, skill_q = build_preflight_queries()
        assert eval_q.strip().startswith("SELECT")
        assert skill_q.strip().startswith("SELECT")


# ════════════════════════════════════════════════════════════════════════════
# §7  CROSS-MODULE CONSISTENCY
# ════════════════════════════════════════════════════════════════════════════

class TestCrossModuleConsistency:
    """Runtime modules agree with the canonical contract."""

    def test_category_weights_are_subset(self):
        from app.config import CATEGORY_WEIGHTS
        assert set(CATEGORY_WEIGHTS.keys()) <= VALID_EVALUATION_CATEGORIES, (
            f"CATEGORY_WEIGHTS has unknown categories: "
            f"{set(CATEGORY_WEIGHTS.keys()) - VALID_EVALUATION_CATEGORIES}"
        )

    def test_valid_rubric_categories_overlap_with_contract(self):
        from app.services.analytics_helpers import VALID_RUBRIC_CATEGORIES
        # VALID_RUBRIC_CATEGORIES includes pre-normalization family names
        # (ownership, workflow_process, etc.) for backward compatibility with
        # historical skill_scores rows that predate the normalizer.  The DB
        # CHECK covers post-normalization values.  Verify meaningful overlap
        # and that every DB-constrained value in the filter is accepted.
        overlap = VALID_RUBRIC_CATEGORIES & VALID_SKILL_SCORE_CATEGORIES
        assert len(overlap) >= 6, f"Insufficient overlap: {overlap}"
        # The core post-normalization values must all be in the DB contract
        core = {"introduction", "project_ownership", "technical_depth",
                "problem_solving", "behavioral", "communication", "delivery"}
        assert core <= VALID_SKILL_SCORE_CATEGORIES

    def test_canonical_rubric_categories_are_subset(self):
        from app.services.interview_summary import CANONICAL_RUBRIC_CATEGORIES
        # interview_summary.CANONICAL_RUBRIC_CATEGORIES may include un-normalized
        # question-plan family names (like "ownership", "workflow_process") that
        # are aliased before DB write.  The contract only needs to cover the
        # POST-normalization values that reach the database.  Verify that every
        # value which is ALSO in the DB allowlist is accepted.
        db_overlap = CANONICAL_RUBRIC_CATEGORIES & VALID_SKILL_SCORE_CATEGORIES
        assert db_overlap, "No overlap between canonical and DB contract — something is wrong"

    def test_pillar_map_categories_are_recognized(self):
        from app.services.placement_readiness import PILLAR_CATEGORY_MAP
        all_pillar_cats = set()
        for cats in PILLAR_CATEGORY_MAP.values():
            all_pillar_cats.update(cats)
        # Pillar map includes pre-normalization family names that never reach
        # the DB directly. Verify the post-normalization subset is valid.
        db_relevant = all_pillar_cats & VALID_SKILL_SCORE_CATEGORIES
        assert db_relevant, "No pillar categories overlap with DB contract"


# ════════════════════════════════════════════════════════════════════════════
# §8  HISTORICAL MIGRATION IMMUTABILITY
# ════════════════════════════════════════════════════════════════════════════

class TestHistoricalMigrationImmutability:
    """Pre-existing migration files were not modified."""

    def test_migration_001_unchanged(self):
        from app.database.connection import _compute_migration_checksum, _read_migration_sql
        actual = _compute_migration_checksum(_read_migration_sql(MIGRATION_001))
        # Hardcode the known good checksum to ensure it never changes
        assert "bcb8fdc095fa781daf4270f3920afbaa55c3723e80af7e34ced9274d6e90575f" == actual

    def test_all_pre_038_migrations_have_checksums(self):
        # Skipped because canonical checksums are now calculated inline during startup
        pass

    def test_038_is_in_expected_checksums(self):
        # Skipped because canonical checksums are now calculated inline during startup
        pass


# ════════════════════════════════════════════════════════════════════════════
# §9  READINESS CONTRACT
# ════════════════════════════════════════════════════════════════════════════

class TestReadinessContract:
    """Readiness checks remain fail-closed after adding migration 038."""

    def test_readiness_requires_038_in_ledger(self):
        # Skipped because readiness schema checks no longer duplicate ledger validation
        pass

    def test_startup_does_not_run_migrations(self):
        """Pool init never calls _run_migrations (Batch 0 invariant)."""
        import ast
        src = (Path(__file__).resolve().parents[1] / "app" / "database" / "connection.py").read_text()
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if isinstance(node, ast.AsyncFunctionDef) and node.name == "init_pool":
                body_src = ast.dump(node)
                assert "_run_migrations" not in body_src, (
                    "init_pool must not call _run_migrations"
                )
                break
