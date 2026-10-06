"""Read-only score, measurement and evidence semantics for existing records."""
import json
import math

from app.services.interview_terminal import terminal_records, UNMEASURED

INTENTIONAL = frozenset({"NO_ANSWER", "SKIPPED"})
STATUS_LABELS = {
    "COMPLETE": "Measured", "PARTIALLY_COMPLETE": "Partially measured",
    "PENDING": "Evaluation pending", "UNAVAILABLE": "Evaluation unavailable",
    "NOT_MEASURED": "Not measured",
}


def numeric_score(value, maximum=100):
    if value is None or isinstance(value, bool):
        return None
    try:
        value = float(value)
    except (ValueError, TypeError):
        return None
    return value if math.isfinite(value) and 0 <= value <= maximum else None


def object_value(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            return {}
    return value if isinstance(value, dict) else {}


def valid_evaluations(evaluations):
    return [dict(row) for row in evaluations if
            str(row.get("terminal_outcome") or "") not in UNMEASURED
            and numeric_score(row.get("score"), 10) is not None]


def feedback_evidence(evaluations):
    """Detailed coaching needs measured subscores, including genuine zeros."""
    rows = valid_evaluations(evaluations)
    return bool(rows) and all(all(numeric_score(row.get(key), 10) is not None
                                  for key in ("communication_score", "relevance_score", "clarity_score", "specificity_score", "structure_score"))
                              for row in rows)


def assessment(session, evaluations=None, questions=None):
    """Project existing evidence without rewriting finished rows.

    A ledger is conclusive evidence; legacy stored scores stay unchanged when
    their provenance is ambiguous. Detailed readers pass actual evaluations.
    Summary readers use the finalization's saved assessment, or Batch 2 ledger.
    """
    session = dict(session)
    if evaluations is None and isinstance(session.get("assessment"), dict):
        return session["assessment"]
    runtime = object_value(session.get("runtime_state"))
    records = terminal_records(runtime)
    current = runtime.get("terminal_contract_version") == 1
    saved = object_value(object_value(runtime.get("final_summary")).get("assessment"))
    if evaluations is None and saved and all(key in saved for key in SUMMARY_KEYS):
        return saved
    actual = [dict(row) for row in evaluations] if evaluations is not None else None
    by_turn = {int(row.get("turn_number") or 0): row for row in actual or []}
    if not records and actual is not None:
        records = [dict(row, turn=int(row.get("turn_number") or 0), outcome="EVALUATED") for row in actual]
        known = {record["turn"] for record in records}
        for row in questions or []:
            turn = int(row.get("turn_number") or 0)
            if row.get("role") == "assistant" and turn > 0 and turn not in known:
                records.append(dict(turn=turn, question_text=row.get("content"), outcome="EVALUATED"))
                known.add(turn)
    asked = len(records) if current and records else max(len(records), int(session.get("total_turns") or 0))
    measured = intentional = pending = unavailable = unmeasured = 0
    scoreable = []
    details = []
    for record in records:
        record = dict(record)
        outcome = record.get("outcome")
        row = by_turn.get(int(record["turn"]))
        if outcome in INTENTIONAL:
            intentional += 1
            scoreable.append(dict(turn_number=record["turn"], score=0, rubric_category="communication",
                                  classification="silent", communication_score=0, terminal_outcome=outcome))
            state, value = "COMPLETE", 0
        elif outcome in UNMEASURED or not outcome:
            unmeasured += 1
            state, value = "NOT_MEASURED", None
        elif outcome == "EVALUATED" and (numeric_score((row or {}).get("score"), 10) is not None
                                        or (actual is None and numeric_score(session.get("final_score")) is not None)):
            measured += 1
            if row:
                scoreable.append(row)
            state, value = "COMPLETE", numeric_score((row or {}).get("score"), 10)
        else:
            state = record.get("evaluation_state") or (row or {}).get("evaluation_state") or "PENDING"
            if state == "UNAVAILABLE":
                unavailable += 1
            else:
                pending += 1
                state = "PENDING"
            value = None
        record.update(evaluation_state=state, score=value)
        details.append(record)
    if not records and actual is None and saved:
        return saved
    if asked > len(records):
        unavailable += asked - len(records)
    counted = measured + intentional
    state = ("PARTIALLY_COMPLETE" if counted and counted < asked else "COMPLETE" if counted
             else "PENDING" if pending else "UNAVAILABLE" if unavailable else "NOT_MEASURED")
    score = numeric_score(session.get("final_score"))
    categories = {key: numeric_score(value, 10) for key, value in object_value(session.get("rubric_scores")).items()}
    if current and actual is not None:
        from app.services.evaluator_scoring import compute_final_score
        result = compute_final_score(scoreable, session.get("plan"), expected_questions=asked)
        score, categories = result["final_score"], result["category_scores"]
    elif current and not counted:
        score, categories = None, {}
    elif not current and actual is not None and not valid_evaluations(actual):
        # Ambiguous historical zero remains stored/visible, but it proves no
        # category evidence or readiness, and never creates an evaluation row.
        categories = {}
    elif not records and score is not None:
        state = "UNAVAILABLE"
    if not current and score is None and counted:
        state = "PENDING"
    eligible = state == "COMPLETE" and measured > 0 and score is not None
    from app.config import CATEGORY_WEIGHTS
    weights = {key: value for key, value in CATEGORY_WEIGHTS.items() if categories.get(key) is not None}
    denominator = sum(weights.values())
    contributions = {key: round(categories[key] * weight / denominator * 10, 4) for key, weight in weights.items()} if current and denominator else {}
    if contributions and (score is None or round(sum(contributions.values())) != score):
        contributions = {}
    return {
        "final_score": score, "category_scores": categories, "score_contributions": contributions,
        "evaluation_state": state, "measurement_label": STATUS_LABELS[state],
        "measurement_coverage": {"asked": asked, "measured": measured, "intentional": intentional,
                                 "scoreable": counted, "pending": pending, "unavailable": unavailable,
                                 "unmeasured": unmeasured,
                                 "measured_pct": round(measured / asked * 100, 1) if asked else None,
                                 "scoreable_pct": round(counted / asked * 100, 1) if asked else None},
        "readiness_eligible": eligible, "feedback_eligible": eligible and feedback_evidence(actual or []),
        "terminal_answer_records": details,
    }


def interpretation_for(assessment_data, plan=None):
    if not assessment_data["readiness_eligible"]:
        return assessment_data["measurement_label"] + ". Measurement coverage is separate from candidate performance."
    from app.services.evaluator_scoring import get_score_interpretation
    return get_score_interpretation(assessment_data["final_score"], plan)


SUMMARY_KEYS = ("evaluation_state", "measurement_label", "measurement_coverage", "readiness_eligible")


def project_session(session, evaluations=None, questions=None):
    result = dict(session)
    integrity = assessment(result, evaluations, questions)
    result.update({key: integrity[key] for key in SUMMARY_KEYS})
    result.update(final_score=integrity["final_score"], rubric_scores=integrity["category_scores"])
    result["assessment"] = integrity
    if evaluations is not None:
        measured_turns = {record["turn"] for record in integrity["terminal_answer_records"] if record.get("outcome") == "EVALUATED" and record["evaluation_state"] == "COMPLETE"}
        result["_score_evaluations"] = [dict(row) for row in valid_evaluations(evaluations) if int(row.get("turn_number") or 0) in measured_turns]
    return result


async def org_measurement_rows(conn, org_id, rows):
    """One tenant-scoped evidence read replaces stale trigger score/tier caches.

    Existing roster filters already selected these user IDs. No ownership or
    tenant scope is widened, and no cached/historical row is written.
    """
    rows = [dict(row) for row in rows]
    if not rows:
        return rows
    ids = [row["user_id"] for row in rows]
    sessions = await conn.fetch(
        """SELECT id, user_id, plan, final_score, rubric_scores, runtime_state,
                  total_turns, created_at, finished_at
           FROM interview_sessions
           WHERE organization_id = $1 AND user_id = ANY($2::uuid[]) AND state = 'FINISHED'
           ORDER BY COALESCE(finished_at, created_at), created_at, id""", org_id, ids)
    by_user = {}
    session_ids = [row["id"] for row in sessions]
    evaluation_rows = await conn.fetch(
        """SELECT session_id, turn_number, rubric_category, score, communication_score
           FROM question_evaluations WHERE session_id = ANY($1::uuid[])
           ORDER BY turn_number""", session_ids) if session_ids else []
    by_session = {}
    for row in evaluation_rows:
        by_session.setdefault(str(row["session_id"]), []).append(dict(row))
    legacy_ids = [row["id"] for row in sessions if object_value(row.get("runtime_state")).get("terminal_contract_version") != 1]
    asked = await conn.fetch("SELECT session_id, role, turn_number, content FROM conversation_messages WHERE session_id = ANY($1::uuid[]) AND role = 'assistant' AND turn_number > 0", legacy_ids) if legacy_ids else []
    questions = {}
    for row in asked:
        questions.setdefault(str(row["session_id"]), []).append(dict(row))
    for row in sessions:
        by_user.setdefault(str(row["user_id"]), []).append(project_session(row, by_session.get(str(row["id"]), []), questions.get(str(row["id"]), [])))
    for row in rows:
        history = by_user.get(str(row["user_id"]), [])
        scored = [value for value in history if value["final_score"] is not None]
        latest = history[-1] if history else None
        row.update(session_count=len(scored), total_interviews=len(history), total_finished_sessions=len(history),
                   avg_score=round(sum(value["final_score"] for value in scored)/len(scored),1) if scored else None,
                   best_score=max((value["final_score"] for value in scored), default=None),
                   first_score=scored[0]["final_score"] if scored else None,
                   latest_score=latest["final_score"] if latest else None,
                   cached_tier=None, cached_zero_risk=None,
                   readiness_eligible=bool(latest and latest["readiness_eligible"]),
                   evaluation_state=latest["evaluation_state"] if latest else "NOT_MEASURED",
                   measurement_label=latest["measurement_label"] if latest else "Not measured",
                   measurement_coverage=latest["measurement_coverage"] if latest else assessment({})["measurement_coverage"])
        if not row["readiness_eligible"]:
            row.update(cached_tier="partially_measured" if row["latest_score"] is not None else "not_measured", cached_zero_risk=False)
        else:
            from app.routers.org_college_helpers import _readiness_tier, _zero_offer_risk, _compute_slope
            slope = _compute_slope([value["final_score"] for value in scored])
            evidence_count = sum(value["readiness_eligible"] for value in scored)
            row.update(cached_tier=_readiness_tier(row["latest_score"], evidence_count),
                       cached_zero_risk=_zero_offer_risk(row["latest_score"], evidence_count, slope))
        # Basic roster responses expose the original snapshot column names.
        # Project these aliases too so they cannot contradict analytics.
        aliases = {"latest_overall_score": row["latest_score"],
                   "first_overall_score": row["first_score"],
                   "total_sessions_completed": len(history),
                   "readiness_tier": row["cached_tier"],
                   "is_zero_offer_risk": row["cached_zero_risk"]}
        row.update({key: value for key, value in aliases.items() if key in row})
        if "score_delta" in row:
            row["score_delta"] = row["latest_score"] - scored[-2]["final_score"] if row["readiness_eligible"] and len(scored) >= 2 else None
        if "sessions_without_improvement" in row:
            count = 0
            measured_scores = [value["final_score"] for value in scored if value["readiness_eligible"]]
            for previous, following in reversed(list(zip(measured_scores, measured_scores[1:]))):
                if following > previous:
                    break
                count += 1
            row["sessions_without_improvement"] = count if row["readiness_eligible"] else None
        for key in tuple(row):
            if key.startswith("avg_") and key != "avg_score":
                category = key[4:]
                if category in {"filler_ratio","tone_positivity","specificity","confidence_markers","technical_accuracy"}:
                    if not row["readiness_eligible"]:
                        row[key] = None
                    continue
                values = [value["rubric_scores"].get(category) for value in scored]
                values = [value for value in values if value is not None]
                row[key] = round(sum(values)/len(values),1) if values else None
    return rows


async def project_sessions(conn, rows):
    rows = [dict(row) for row in rows]
    if not rows:
        return rows
    ids = [row["id"] for row in rows]
    placeholders = ",".join(f"${index + 1}" for index in range(len(ids)))
    evaluations = await conn.fetch(
        f"SELECT session_id, turn_number, rubric_category, score, communication_score FROM question_evaluations WHERE session_id IN ({placeholders})",
        *ids)
    grouped = {}
    for row in evaluations:
        grouped.setdefault(str(row["session_id"]), []).append(dict(row))
    legacy_ids = [row["id"] for row in rows if object_value(row.get("runtime_state")).get("terminal_contract_version") != 1]
    questions = {}
    if legacy_ids:
        placeholders = ",".join(f"${index + 1}" for index in range(len(legacy_ids)))
        asked_rows = await conn.fetch(
            f"SELECT session_id, role, turn_number, content FROM conversation_messages WHERE session_id IN ({placeholders}) AND role = 'assistant' AND turn_number > 0",
            *legacy_ids)
        for row in asked_rows:
            questions.setdefault(str(row["session_id"]), []).append(dict(row))
    return [project_session(row, grouped.get(str(row["id"]), []), questions.get(str(row["id"]), [])) for row in rows]



def project_skill_rows(rows, sessions):
    """Do not let a stale derived skill zero override conclusive terminal evidence."""
    from app.services.analytics_student import derive_skill_score_rows
    by_id = {str(row["id"]): row for row in sessions}
    result = []
    for raw in rows:
        row = dict(raw)
        source = by_id.get(str(row.get("session_id")))
        if source and object_value(source.get("runtime_state")).get("terminal_contract_version") == 1:
            derived = {item["category"]: item["average_score"] for item in derive_skill_score_rows(source.get("_score_evaluations", []))}
            if row["category"] not in derived:
                continue
            row["average_score"] = derived[row["category"]]
        if numeric_score(row.get("average_score"), 10) is not None:
            result.append(row)
    return result
