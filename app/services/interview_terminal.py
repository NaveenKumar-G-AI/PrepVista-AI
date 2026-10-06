"""Additive question terminal ledger in the existing runtime_state JSONB.

No evaluation row is fabricated for an unmeasured turn. All mutations are made
under the answer/finalization transaction and the session row lock.
"""
from contextlib import asynccontextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from uuid import UUID, uuid5

OUTCOMES = frozenset({"EVALUATED", "NO_ANSWER", "TRANSCRIPTION_FAILED", "UNINTELLIGIBLE", "SKIPPED", "ABORTED"})
UNMEASURED = frozenset({"TRANSCRIPTION_FAILED", "UNINTELLIGIBLE", "ABORTED"})
connection = ContextVar("interview_operation_connection", default=None)
intent = ContextVar("interview_answer_intent", default=None)

@asynccontextmanager
async def connection_scope(factory):
    current = connection.get()
    if current is not None:
        yield current
    else:
        async with factory() as conn:
            yield conn


def register_question(runtime, session_id, turn, text, instance=None):
    if int(turn or 0) <= 0:
        return None
    records = runtime.setdefault("question_records", {})
    # Deterministic recovery of a current in-progress question; never mutate
    # historical conversation/evaluation rows.
    instance = str(instance or uuid5(UUID(str(session_id)), f"question:{turn}"))
    existing = next((key for key, value in records.items() if value["turn"] == int(turn)), None)
    if existing:
        return existing
    records[instance] = {"question_instance_id": instance, "turn": int(turn), "question_text": text}
    return instance


def terminalize(runtime, instance, outcome, text="", evidence=None):
    if outcome not in OUTCOMES:
        raise ValueError("Unknown terminal outcome")
    record = runtime["question_records"][str(instance)]
    if record.get("outcome"):
        # First committed outcome wins. A retry/late STT result cannot replace it.
        if record["outcome"] != outcome or record.get("raw_answer", "") != text:
            raise ValueError("Question already terminal")
        return record
    record.update(outcome=outcome, raw_answer=text, evidence=evidence or {},
                  terminal_at=datetime.now(timezone.utc).isoformat(),
                  measured=outcome == "EVALUATED")
    return record


def classify(text, requested=None, evidence=None):
    evidence = evidence or {}
    if requested in {"SKIPPED", "ABORTED"}:
        return requested
    # Partial text must not masquerade as a fully captured candidate answer.
    if evidence.get("failed") or evidence.get("flush_status") == "timeout":
        return "TRANSCRIPTION_FAILED"
    if requested == "TRANSCRIPTION_FAILED":
        return requested
    if requested == "UNINTELLIGIBLE" or evidence.get("unintelligible"):
        return "UNINTELLIGIBLE"
    if text.strip() and text not in {"[NO_ANSWER_TIMEOUT]", "[USER_REQUESTED_END]", "[SYSTEM_TIME_UP]"}:
        return "EVALUATED"
    if text in {"[USER_REQUESTED_END]", "[SYSTEM_TIME_UP]"}:
        return "ABORTED"
    if evidence.get("audio_bytes", 0) or evidence.get("speech_detected"):
        return "UNINTELLIGIBLE"
    return "NO_ANSWER"


def terminal_records(runtime):
    return sorted((dict(value) for value in runtime.get("question_records", {}).values()), key=lambda value: value["turn"])
