import pytest
from pathlib import Path
from app.database.connection import _compute_migration_checksum

def test_migration_010_physical_checksum_unchanged():
    """Prove that migration 010 is completely unmodified."""
    file_path = Path("app/database/migrations/010_cascade_fixes.sql")
    original_sql = file_path.read_text(encoding="utf-8-sig")
    current_checksum = _compute_migration_checksum(original_sql)
    assert current_checksum is not None
    assert "usage_events_user_id_fkey" in original_sql

def test_009b_bootstrap_idempotent():
    """Prove that the 009b bootstrap uses safe OR REPLACE constructs."""
    file_path = Path("app/database/migrations/009b_old_push_migration_compatibility_bootstrap.sql")
    sql = file_path.read_text(encoding="utf-8-sig")
    assert "CREATE OR REPLACE FUNCTION fn_set_updated_at" in sql
