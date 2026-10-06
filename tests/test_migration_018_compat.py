import pytest
from pathlib import Path

def test_017b_bootstrap_idempotent():
    """Prove that the 017b bootstrap uses safe IF NOT EXISTS constructs."""
    file_path = Path("app/database/migrations/017b_old_push_migration_compatibility_bootstrap.sql")
    sql = file_path.read_text(encoding="utf-8-sig")
    assert "IF NOT EXISTS" in sql
    assert "ALTER TABLE profiles ADD COLUMN last_seen_at" in sql
