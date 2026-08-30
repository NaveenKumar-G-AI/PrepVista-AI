"""Regression tests for safe migration execution."""

from pathlib import Path

from app.database.connection import _strip_outer_transaction


MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "app" / "database" / "migrations"


def test_strips_outer_transaction_after_leading_comments() -> None:
    sql = "-- migration header\n\nBEGIN;\nCREATE TABLE example (id int);\nCOMMIT;\n"

    execution_sql, stripped = _strip_outer_transaction(sql)

    assert stripped is True
    assert "BEGIN;" not in execution_sql
    assert "COMMIT;" not in execution_sql
    assert "CREATE TABLE example" in execution_sql
    assert execution_sql.startswith("-- migration header")


def test_preserves_sql_without_complete_outer_transaction() -> None:
    sql = "BEGIN;\nCREATE TABLE example (id int);\n"

    execution_sql, stripped = _strip_outer_transaction(sql)

    assert stripped is False
    assert execution_sql == sql


def test_preserves_transaction_words_inside_migration_body() -> None:
    sql = "CREATE TABLE audit_log (message text DEFAULT 'COMMIT');\n"

    execution_sql, stripped = _strip_outer_transaction(sql)

    assert stripped is False
    assert execution_sql == sql


def test_offers_migration_does_not_recreate_calibration_outcomes_table() -> None:
    sql = (MIGRATIONS_DIR / "028_offers_joining_placement.sql").read_text(encoding="utf-8")

    assert "CREATE TABLE student_placement_outcomes" in sql
    assert "CREATE TABLE placement_outcomes" not in sql


def test_drive_integrity_uses_a_composite_foreign_key_not_a_check_subquery() -> None:
    sql = (MIGRATIONS_DIR / "031_training_and_drive_integrity.sql").read_text(encoding="utf-8")

    assert "FOREIGN KEY (id, active_rule_version_fk)" in sql
    assert "CHECK (" not in sql


def test_integrity_migration_prevents_cross_tenant_offer_links() -> None:
    sql = (MIGRATIONS_DIR / "031_training_and_drive_integrity.sql").read_text(encoding="utf-8")

    assert "FOREIGN KEY (institution_id, drive_id)" in sql
    assert "FOREIGN KEY (institution_id, company_id)" in sql
    assert "FOREIGN KEY (institution_id, student_id)" in sql
    assert "FOREIGN KEY (offer_id, evidence_document_id)" in sql
    assert "FOREIGN KEY (offer_id, student_id, season_id)" in sql


def test_season_migration_backfills_existing_ids_before_foreign_keys() -> None:
    sql = (MIGRATIONS_DIR / "032_placement_seasons.sql").read_text(encoding="utf-8")

    insert_position = sql.index("INSERT INTO placement_seasons")
    foreign_key_position = sql.index("ADD CONSTRAINT offers_season_fk")
    assert insert_position < foreign_key_position
    assert "FOREIGN KEY (institution_id, season_id)" in sql
