"""Persistent delivery worker for scheduled college CSV reports."""

from __future__ import annotations

import asyncio
import base64
import html
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any

import structlog

from app.config import get_settings
from app.database.connection import DatabaseConnection

logger = structlog.get_logger("prepvista.report_schedules")

REPORT_SCHEDULE_POLL_SECONDS = 60
REPORT_SCHEDULE_RETRY_MINUTES = 15
REPORT_SCHEDULE_LEASE_MINUTES = 10
REPORT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024


def next_report_run(frequency: str, now: datetime | None = None) -> datetime:
    """Return the next 06:00 UTC weekly/monthly delivery time."""
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    current = current.astimezone(timezone.utc)

    if frequency == "weekly":
        days_until_monday = (7 - current.weekday()) % 7
        candidate = (current + timedelta(days=days_until_monday)).replace(
            hour=6,
            minute=0,
            second=0,
            microsecond=0,
        )
        if candidate <= current:
            candidate += timedelta(days=7)
        return candidate

    if frequency == "monthly":
        this_month = current.replace(
            day=1,
            hour=6,
            minute=0,
            second=0,
            microsecond=0,
        )
        if this_month > current:
            return this_month
        if current.month == 12:
            return current.replace(
                year=current.year + 1,
                month=1,
                day=1,
                hour=6,
                minute=0,
                second=0,
                microsecond=0,
            )
        return current.replace(
            month=current.month + 1,
            day=1,
            hour=6,
            minute=0,
            second=0,
            microsecond=0,
        )

    raise ValueError("Unsupported report frequency")


async def _claim_due_schedules() -> list[Any]:
    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            f"""WITH due AS (
                    SELECT id
                    FROM org_report_schedules
                    WHERE active = TRUE
                      AND next_run_at <= NOW()
                      AND (lease_until IS NULL OR lease_until < NOW())
                    ORDER BY next_run_at ASC
                    LIMIT 5
                    FOR UPDATE SKIP LOCKED
                )
                UPDATE org_report_schedules schedule
                SET lease_until = NOW() + INTERVAL '{REPORT_SCHEDULE_LEASE_MINUTES} minutes',
                    last_status = 'processing',
                    updated_at = NOW()
                FROM due
                WHERE schedule.id = due.id
                RETURNING schedule.id, schedule.organization_id,
                          schedule.frequency, schedule.recipient_email,
                          schedule.department_id, schedule.year_id,
                          schedule.batch_id, schedule.next_run_at"""
        )
    return list(rows)


async def _render_schedule_csv(schedule: Any) -> bytes:
    # Import lazily to avoid a module cycle: the analytics router imports
    # next_report_run for the schedule-creation endpoint.
    from app.routers.org_college_analytics import export_student_reports

    response = await export_student_reports(
        department_id=str(schedule["department_id"]) if schedule["department_id"] else None,
        year_id=str(schedule["year_id"]) if schedule["year_id"] else None,
        batch_id=str(schedule["batch_id"]) if schedule["batch_id"] else None,
        export_format="csv",
        export_type="students",
        admin=SimpleNamespace(organization_id=str(schedule["organization_id"])),
    )
    chunks: list[bytes] = []
    total_bytes = 0
    async for chunk in response.body_iterator:
        encoded = chunk.encode("utf-8") if isinstance(chunk, str) else bytes(chunk)
        total_bytes += len(encoded)
        if total_bytes > REPORT_ATTACHMENT_MAX_BYTES:
            raise RuntimeError("Scheduled report exceeds the 10 MB email attachment limit")
        chunks.append(encoded)
    return b"".join(chunks)


async def _send_schedule_email(schedule: Any, csv_bytes: bytes) -> None:
    settings = get_settings()
    if not settings.RESEND_API_KEY:
        raise RuntimeError("Scheduled report email provider is not configured")

    import resend

    resend.api_key = settings.RESEND_API_KEY
    delivery_date = datetime.now(timezone.utc).date().isoformat()
    recipient = str(schedule["recipient_email"])
    safe_frequency = html.escape(str(schedule["frequency"]).title())
    await asyncio.to_thread(
        resend.Emails.send,
        {
            "from": settings.FROM_EMAIL,
            "to": [recipient],
            "subject": f"PrepVista {safe_frequency} Student Report — {delivery_date}",
            "html": (
                "<p>Your scheduled PrepVista student performance report is attached.</p>"
                "<p>This report contains confidential student data. Store and share it securely.</p>"
            ),
            "attachments": [
                {
                    "filename": f"prepvista_students_{delivery_date}.csv",
                    "content": base64.b64encode(csv_bytes).decode("ascii"),
                    "content_type": "text/csv; charset=utf-8",
                }
            ],
        },
    )


async def _finish_schedule(schedule: Any, error: Exception | None = None) -> None:
    async with DatabaseConnection() as conn:
        if error is None:
            await conn.execute(
                """UPDATE org_report_schedules
                   SET last_run_at = NOW(),
                       last_status = 'sent',
                       last_error = NULL,
                       lease_until = NULL,
                       next_run_at = $2,
                       updated_at = NOW()
                   WHERE id = $1""",
                schedule["id"],
                next_report_run(str(schedule["frequency"])),
            )
            return

        safe_error = (str(error).strip() or type(error).__name__)[:500]
        await conn.execute(
            f"""UPDATE org_report_schedules
               SET last_status = 'failed',
                   last_error = $2,
                   lease_until = NULL,
                   next_run_at = NOW() + INTERVAL '{REPORT_SCHEDULE_RETRY_MINUTES} minutes',
                   updated_at = NOW()
               WHERE id = $1""",
            schedule["id"],
            safe_error,
        )


async def process_due_report_schedules() -> int:
    """Claim and deliver currently due schedules; return the claimed count."""
    schedules = await _claim_due_schedules()
    for schedule in schedules:
        try:
            csv_bytes = await _render_schedule_csv(schedule)
            await _send_schedule_email(schedule, csv_bytes)
            await _finish_schedule(schedule)
            logger.info(
                "scheduled_report_sent",
                schedule_id=str(schedule["id"]),
                organization_id=str(schedule["organization_id"]),
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await _finish_schedule(schedule, exc)
            logger.error(
                "scheduled_report_failed",
                schedule_id=str(schedule["id"]),
                organization_id=str(schedule["organization_id"]),
                error=(str(exc).strip() or type(exc).__name__)[:500],
            )
    return len(schedules)


async def run_report_schedule_loop() -> None:
    """Continuously process due schedules without blocking application startup."""
    while True:
        try:
            await process_due_report_schedules()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error(
                "report_schedule_poll_failed",
                error=(str(exc).strip() or type(exc).__name__)[:500],
            )
        await asyncio.sleep(REPORT_SCHEDULE_POLL_SECONDS)
