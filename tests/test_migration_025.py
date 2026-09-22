from pathlib import Path
import pytest

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations"

def test_025_migration_has_required_changes() -> None:
    sql = (MIGRATIONS_DIR / "025_guided_assistance_fixes.sql").read_text(encoding="utf-8")
    
    # 1. Adds question_instance_id
    assert "ADD COLUMN IF NOT EXISTS question_instance_id UUID;" in sql
    
    # 2. Drops old constraint
    assert "DROP CONSTRAINT IF EXISTS interview_assistance_event_session_id_turn_number_a_key" in sql
    
    # 3. Creates partial unique index
    assert "CREATE UNIQUE INDEX IF NOT EXISTS idx_assistance_event_instance_idempotent" in sql
    assert "WHERE question_instance_id IS NOT NULL;" in sql
    
    # 4. Adds question_instance_id to evaluations
    assert "ADD COLUMN IF NOT EXISTS question_instance_id UUID;" in sql

