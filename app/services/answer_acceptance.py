"""Immutable candidate evidence in the existing per-session JSONB ledger.

Acceptance is written under the session lock in its own transaction. Response
caches and terminal records are derived data; neither rewrites this envelope.
"""
from app.services.interview_terminal import terminalize


def evidence_ack(accepted):
    return {"durable": True, **{key: accepted[key] for key in
            ("session_id", "question_instance_id", "client_request_id", "accepted_at")}}


def pending_accepted_answers(runtime):
    records = runtime.get("question_records", {})
    return [{"request": item["request"], "evidence_ack": evidence_ack(item)}
            for key, item in runtime.get("accepted_attempts", {}).items()
            if key not in runtime.get("answer_responses", {})
            and not records.get(item["question_instance_id"], {}).get("outcome")]


def settle_accepted_evidence(runtime):
    """Finish already committed attempts before filling unanswered turns.

    No provider work is needed to preserve evidence at session finish. An
    accepted transcript is EVALUATED with unavailable measurement when optional
    processing did not commit. It is never converted to ABORTED or silent.
    """
    for accepted in runtime.get("accepted_attempts", {}).values():
        instance = accepted["question_instance_id"]
        record = runtime.get("question_records", {}).get(instance)
        if record is None:
            raise RuntimeError("Accepted evidence question is missing")
        if record.get("outcome"):
            continue
        original = accepted["request"]
        record = terminalize(runtime, instance, accepted["outcome"], original["user_text"],
                             original.get("capture_evidence"))
        record.update(answered_at=accepted["accepted_at"],
                      assistance_provenance=accepted["assistance_provenance"],
                      accepted_request_id=accepted["client_request_id"])
        if accepted["outcome"] == "EVALUATED":
            record.update(evaluation_state="UNAVAILABLE", measured=False)
