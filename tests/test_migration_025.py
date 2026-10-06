"""Static checks for the authentic Guided Assistance migration/runtime contract.

Commit a9070c3 introduced this test with migrations/025_guided_assistance_fixes.sql.
Commit 2dc8ea1 consolidated the old 024/025/026 assistance SQL into app/database/
migrations/036_guided_assistance.sql but left this test unchanged. Keep the test
filename for continuity; validate the consolidated schema instead of a deleted
repair script. These checks do not attest upgrades from manually applied legacy
024: CREATE TABLE IF NOT EXISTS does not repair an existing legacy table.
No SQL is executed and no database connection is opened by these tests.
"""

import ast
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = ROOT / "app" / "database" / "migrations"
INSTANCE_KEY = ("session_id", "question_instance_id", "assistance_type", "assistance_level")


def _normalize_sql(sql: str) -> str:
    # Comments cannot satisfy schema assertions; accept formatting and the
    # existing BOM without rewriting any historical migration bytes.
    return " ".join(re.sub(r"--[^\n]*", "", sql).lower().split())


def _migration_sql() -> str:
    return _normalize_sql((MIGRATIONS_DIR / "036_guided_assistance.sql").read_text(encoding="utf-8-sig"))


def _table_body(sql: str, table: str) -> str:
    match = re.search(rf"create table if not exists {table}\s*\((.*?)\);", sql)
    assert match, f"Missing table definition: {table}"
    return match[1]


def _columns(value: str) -> tuple[str, ...]:
    return tuple(column.strip() for column in value.split(","))


def test_guided_assistance_uses_authentic_migration_identity() -> None:
    # 025 already belongs to the recruiter CRM. Assistance's authentic identity
    # must remain 036 in the actual runner's app/database/migrations directory.
    assert [path.name for path in MIGRATIONS_DIR.glob("*guided_assistance*.sql")] == ["036_guided_assistance.sql"]
    recruiter_sql = _normalize_sql((MIGRATIONS_DIR / "025_recruiter_companies.sql").read_text(encoding="utf-8-sig"))
    _table_body(recruiter_sql, "recruiter_companies")
    sql = _migration_sql()
    _table_body(sql, "interview_assistance_policy")
    _table_body(sql, "interview_assistance_event")


def test_assistance_policy_preserves_session_uniqueness_and_opt_in_flags() -> None:
    policy = _table_body(_migration_sql(), "interview_assistance_policy")
    assert "session_id uuid not null unique references interview_sessions(id)" in policy
    for flag in ("enabled", "hints_enabled", "answer_guidance_enabled"):
        assert f"{flag} boolean not null default false" in policy
    assert "policy_version integer not null default 1" in policy


def test_event_instance_uniqueness_matches_both_runtime_upserts() -> None:
    sql = _migration_sql()
    event = _table_body(sql, "interview_assistance_event")
    # Nullable instance IDs preserve legacy rows; non-NULL instances are the
    # retry identity. A second instance on the same turn must not collide.
    assert re.search(r"(?:^|,)\s*question_instance_id uuid\s*(?:,|$)", event)
    assert "request_id text not null unique" in event
    assert "check (assistance_type in ('hint', 'answer_guidance'))" in event
    assert "assistance_level integer not null default 1" in event
    old_key = ("session_id", "turn_number", "assistance_type", "assistance_level")
    assert all(_columns(key) != old_key for key in re.findall(r"unique\s*\(([^)]+)\)", sql))
    assert "interview_assistance_event_session_id_turn_number_a_key" not in sql

    index = re.search(
        r"create unique index if not exists idx_assistance_event_instance_idempotent "
        r"on interview_assistance_event\s*\(([^)]+)\) "
        r"where question_instance_id is not null;", sql,
    )
    assert index, "Missing partial instance-level uniqueness for assistance retries"
    assert _columns(index[1]) == INSTANCE_KEY

    # Cross-check real SQL constants without importing/initializing the app.
    tree = ast.parse((ROOT / "app/routers/interviews_assistance.py").read_text(encoding="utf-8"))
    functions = {node.name: node for node in tree.body if isinstance(node, ast.AsyncFunctionDef)}
    for name in ("request_hint", "request_answer_guidance"):
        inserts = [_normalize_sql(node.value) for node in ast.walk(functions[name])
                   if isinstance(node, ast.Constant) and isinstance(node.value, str)
                   and "INSERT INTO interview_assistance_event" in node.value]
        assert len(inserts) == 1, f"Expected one assistance-event upsert in {name}"
        conflict = re.search(
            r"on conflict\s*\(([^)]+)\) where question_instance_id is not null do nothing", inserts[0],
        )
        assert conflict, f"Runtime upsert no longer matches the partial unique index: {name}"
        assert _columns(conflict[1]) == _columns(index[1])


def test_guided_assistance_preserves_evaluation_and_view_attribution() -> None:
    sql = _migration_sql()
    # Scope both assertions to question_evaluations. The old test repeated the
    # same unscoped ADD COLUMN assertion, so it could miss either target table.
    assert re.search(r"alter table question_evaluations\s+add column if not exists question_instance_id uuid;", sql)
    assert re.search(r"alter table question_evaluations\s+add column if not exists assistance_provenance text default 'unknown';", sql)
    event = _table_body(sql, "interview_assistance_event")
    for column in ("requested_at", "generated_at", "viewed_at"):
        assert f"{column} timestamptz" in event
    assert "used_before_answer boolean" in event
    assert "invalidated boolean not null default false" in event

