"""Read-only readiness contracts; never repair or migrate a database."""

from pathlib import Path

from app.database import connection
from app.database.connection import DatabaseNotReadyError


# Core persisted contracts, including active Guided Assistance and attribution.
# The migration ledger also has to match this release: historical schema drift
# cannot be silently adopted by recording new baselines during runtime startup.
REQUIRED_SCHEMA = {
    "admin_grant_operations": {
        "uuid": "request_id actor_id target_id",
        "text": "plan grant_kind action request_fingerprint",
        "jsonb": "before_state after_state response",
        "timestamp with time zone": "created_at",
    },
    "admin_bonus_grants": {
        "uuid": "id granted_by granted_to",
        "integer": "amount snapshot_after", "text": "reason",
        "timestamp with time zone": "created_at",
    },
    "profiles": {
        "uuid": "id",
        "text": "plan email full_name subscription_status",
        "integer": "interviews_used_this_period referral_bonus_interviews admin_bonus_interviews",
        "boolean": "org_student onboarding_completed",
        "timestamp with time zone": "period_start last_seen_at",
    },
    "interview_sessions": {
        "uuid": "id user_id",
        "text": "plan state access_token resume_text share_token",
        "jsonb": "resume_summary question_plan runtime_state rubric_scores proctoring_violations",
        "integer": "total_turns duration_actual_seconds active_question_turn question_retry_count",
        "numeric": "final_score",
        "text[]": "strengths weaknesses",
        "timestamp with time zone": "created_at finished_at",
    },
    "conversation_messages": {
        "uuid": "session_id", "text": "role content", "integer": "turn_number",
        "timestamp with time zone": "created_at",
    },
    "question_evaluations": {
        "uuid": "id session_id question_instance_id",
        "integer": "turn_number answer_duration_seconds",
        "text": "rubric_category question_text raw_answer normalized_answer classification "
                "scoring_rationale ideal_answer communication_notes answer_status "
                "content_understanding depth_quality communication_clarity what_worked "
                "what_was_missing how_to_improve answer_blueprint corrected_intent "
                "repaired_answer assistance_provenance",
        "text[]": "missing_elements",
        "numeric": "score communication_score relevance_score clarity_score specificity_score structure_score",
    },
    "interview_assistance_policy": {
        "uuid": "id session_id", "boolean": "enabled hints_enabled answer_guidance_enabled",
        "integer": "policy_version",
    },
    "interview_assistance_event": {
        "uuid": "id session_id user_id question_instance_id",
        "integer": "turn_number assistance_level",
        "text": "assistance_type request_id question_text question_family question_version "
                "generated_content content_hash model_provider model_version prompt_version",
        "timestamp with time zone": "requested_at generated_at viewed_at",
        "boolean": "used_before_answer invalidated",
    },
    "user_plan_entitlements": {
        "uuid": "user_id", "text": "plan status",
        "timestamp with time zone": "activated_at expires_at created_at",
    },
    "skill_scores": {
        "uuid": "user_id session_id", "text": "category", "numeric": "average_score",
        "integer": "question_count", "timestamp with time zone": "recorded_at",
    },
    "usage_events": {"uuid": "user_id", "text": "event_type", "jsonb": "metadata"},
    "interview_audio_turns": {
        "uuid": "session_id", "integer": "turn_number",
        "text": "audio_object_path stt_provider",
    },
    "account_deletion_requests": {
        "integer": "id retry_count",
        "uuid": "user_id claim_token",
        "text": "email status last_error",
        "text[]": "auth_user_ids",
        "jsonb": "storage_paths",
        "timestamp with time zone": "created_at updated_at lease_expires_at next_attempt_at",
    },
    "old_user": {"uuid": "user_id", "jsonb": "metadata"},
}


def expected_migration_checksums():
    directory = Path(connection.__file__).parent / 'migrations'
    files = sorted(p for p in directory.iterdir() if p.suffix == '.sql' and p.name[0].isdigit())
    if not files:
        raise DatabaseNotReadyError('Release migration manifest unavailable')
    return {p.stem: connection._compute_migration_checksum(connection._read_migration_sql(p)) for p in files}


async def check_schema_readiness(conn) -> None:
    """Fail closed on unknown ledger, missing columns/types or read permissions.

    Only SELECTs are issued, inside a read-only transaction. No baseline
    backfill, schema repair, DDL or writes to application records are permitted.
    """
    async with conn.transaction(readonly=True):
        ledger = {r['version']: r['checksum'] for r in await conn.fetch('SELECT version, checksum FROM schema_migrations')}
        if any(ledger.get(version) != checksum for version, checksum in expected_migration_checksums().items()):
            raise DatabaseNotReadyError('Release migration ledger missing or incompatible')
        columns = await conn.fetch(
            """SELECT required.table_name, attribute.attname AS column_name,
                      attribute.atttypid::regtype::text AS column_type
               FROM unnest($1::text[]) AS required(table_name)
               JOIN pg_catalog.pg_attribute attribute
                 ON attribute.attrelid = to_regclass(required.table_name)
               WHERE attribute.attnum > 0 AND NOT attribute.attisdropped""",
            list(REQUIRED_SCHEMA),
        )
        actual_columns = {
            (row["table_name"], row["column_name"]): row["column_type"] for row in columns
        }
        for table, type_groups in REQUIRED_SCHEMA.items():
            names = []
            for column_type, column_names in type_groups.items():
                for name in column_names.split():
                    actual_type = actual_columns.get((table, name))
                    if actual_type != column_type:
                        import structlog
                        logger = structlog.get_logger()
                        logger.error(
                            "schema_readiness_failed",
                            table=table,
                            column=name,
                            expected_type=column_type,
                            actual_value=actual_type or "missing"
                        )
                        raise DatabaseNotReadyError(f"Required schema contract missing or incompatible: {table}.{name}")
                    names.append(name)
            # Zero-row projections also verify SELECT privileges under the
            # runtime role without fetching any historical user data.
            await conn.fetch(f"SELECT {', '.join(names)} FROM {table} WHERE FALSE")

        await check_deletion_claim_constraint(conn)


async def check_deletion_claim_constraint(conn):
    rows = await conn.fetch("""
        SELECT convalidated, pg_get_expr(conbin, conrelid) AS expression
        FROM pg_catalog.pg_constraint
        WHERE conrelid=to_regclass('account_deletion_requests')
          AND conname='account_deletion_requests_claim_pair_check' AND contype='c'
    """)
    import re
    if (len(rows) != 1 or not rows[0]["convalidated"]
            or re.sub(r'[\s()"]', "", rows[0]["expression"]).lower()
            != "claim_tokenisnull=lease_expires_atisnull"):
        raise DatabaseNotReadyError("Required deletion claim-pair constraint missing or incompatible")
