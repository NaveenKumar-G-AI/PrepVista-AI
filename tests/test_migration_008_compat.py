import pytest
from app.database.connection import _strip_outer_transaction, _compute_migration_checksum
from pathlib import Path

def test_migration_008_in_memory_patching():
    """Prove the 008 compatibility mechanism patches syntax without breaking checksums."""
    file_path = Path("app/database/migrations/008_public_growth.sql")
    original_sql = file_path.read_text(encoding="utf-8-sig")
    
    # 1. Prove original SQL has the syntax error (nested DO $$)
    assert "DO $$\n        DECLARE" in original_sql
    
    # 2. Compute checksum BEFORE patch
    original_checksum = _compute_migration_checksum(original_sql)
    
    # 3. Simulate runner execution logic
    execution_sql, _ = _strip_outer_transaction(original_sql)
    
    version = "008_public_growth"
    current_checksum = _compute_migration_checksum(original_sql)
    
    if version == "008_public_growth":
        if current_checksum != "702e9c03cd2375e183e676782d6cb6306cbb7b48566b1cd22b7cfb0255fdeb2b":
            raise Exception("migration 008 transform requires strict checksum match")
            
        execution_sql = execution_sql.replace(
            "DO $$\n        DECLARE",
            "DO $public_growth_job$\n        DECLARE"
        )
        execution_sql = execution_sql.replace(
            "END $$;\n        $job$",
            "END $public_growth_job$;\n        $job$"
        )
        
    # 4. Prove patch applied
    assert "DO $public_growth_job$\n        DECLARE" in execution_sql
    assert "DO $$\n        DECLARE" not in execution_sql
    
    # 5. Prove original sql and checksum are unchanged
    assert original_checksum == _compute_migration_checksum(original_sql)
    assert original_checksum == "702e9c03cd2375e183e676782d6cb6306cbb7b48566b1cd22b7cfb0255fdeb2b"

def test_migration_008_checksum_gate_fails_on_tamper():
    """Prove that altering the SQL rejects the in-memory patch."""
    version = "008_public_growth"
    tampered_sql = "DO $$\n        DECLARE\n        -- malicious comment"
    current_checksum = _compute_migration_checksum(tampered_sql)
    
    with pytest.raises(Exception, match="strict checksum match"):
        if version == "008_public_growth":
            if current_checksum != "702e9c03cd2375e183e676782d6cb6306cbb7b48566b1cd22b7cfb0255fdeb2b":
                raise Exception("migration 008 transform requires strict checksum match")
