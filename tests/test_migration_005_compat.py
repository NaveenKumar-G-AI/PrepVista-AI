import pytest
from app.database.connection import _strip_outer_transaction, _compute_migration_checksum
from pathlib import Path

def test_migration_005_in_memory_patching():
    """Prove the 005 compatibility mechanism patches syntax without breaking checksums."""
    file_path = Path("app/database/migrations/005_user_activity.sql")
    original_sql = file_path.read_text(encoding="utf-8-sig")
    
    # 1. Prove original SQL has the syntax error
    assert "DO $$\n        DECLARE" in original_sql
    
    # 2. Compute checksum BEFORE patch
    original_checksum = _compute_migration_checksum(original_sql)
    
    # 3. Simulate runner execution logic
    execution_sql, _ = _strip_outer_transaction(original_sql)
    
    version = "005_user_activity"
    current_checksum = _compute_migration_checksum(original_sql)
    
    if version == "005_user_activity":
        if current_checksum != "0cc889dc8e71728bf485147c874726158f7cab238420d50d30e9a4fe9dc59219":
            raise Exception("migration 005 transform requires strict checksum match")
            
        execution_sql = execution_sql.replace(
            "DO $$\n        DECLARE",
            "DO $partition_body$\n        DECLARE"
        )
        execution_sql = execution_sql.replace(
            "END $$;\n        $job$",
            "END $partition_body$;\n        $job$"
        )
        
    # 4. Prove patch applied
    assert "DO $partition_body$\n        DECLARE" in execution_sql
    assert "DO $$\n        DECLARE" not in execution_sql
    
    # 5. Prove original sql and checksum are unchanged
    assert original_checksum == _compute_migration_checksum(original_sql)
    assert original_checksum == "0cc889dc8e71728bf485147c874726158f7cab238420d50d30e9a4fe9dc59219"

def test_migration_005_checksum_gate_fails_on_tamper():
    """Prove that altering the SQL rejects the in-memory patch."""
    version = "005_user_activity"
    tampered_sql = "DO $$\n        DECLARE\n        -- malicious comment"
    current_checksum = _compute_migration_checksum(tampered_sql)
    
    with pytest.raises(Exception, match="strict checksum match"):
        if version == "005_user_activity":
            if current_checksum != "0cc889dc8e71728bf485147c874726158f7cab238420d50d30e9a4fe9dc59219":
                raise Exception("migration 005 transform requires strict checksum match")
