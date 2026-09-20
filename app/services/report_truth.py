"""One evidence/availability contract for API, finish responses and PDF reports."""
import math

from app.services.evaluator_scoring import compute_final_score
from app.services.interview_summary import compute_interview_summary, coerce_runtime_state


ANSWER_SENTINELS = {'[NO_ANSWER_TIMEOUT]', '[SYSTEM_DURATION_EXPIRED]', '__start__', '[NO_ANSWER]', '[START_INTERVIEW]', '[SYSTEM_TIME_UP]', '[USER_REQUESTED_END]', '[TRANSCRIPTION_FAILED]'}


def is_recorded_answer(row):
    content = str(row['content'] or '').strip()
    return row['role'] == 'user' and row['turn_number'] > 0 and bool(content) and content not in ANSWER_SENTINELS


def build_report_truth(session, evaluations, messages=None, jobs=None):
    valid = []
    seen = set()
    for row in evaluations:
        value = row.get('score')
        if isinstance(value, bool) or value is None:
            continue
        try:
            value = float(value)
        except (TypeError, ValueError):
            continue
        turn = row.get('turn_number')
        if turn in seen or not math.isfinite(value) or not 0 <= value <= 10:
            continue
        seen.add(turn)
        valid.append(dict(row))
    summary = compute_interview_summary(
        plan=session.get('plan', 'free'), question_plan=session.get('question_plan'),
        total_turns=int(session.get('total_turns') or 0), evaluations=valid,
        duration_seconds=session.get('duration_actual_seconds'), runtime_state=session.get('runtime_state'))
    if messages is not None:
        answered = {row['turn_number'] for row in messages
                    if is_recorded_answer(row)}
        summary['answered_questions'] = len(answered)
    if messages is not None:
        valid = [row for row in valid if row['turn_number'] in answered]
    answered_count = summary['answered_questions']
    evaluated_count = len(valid)
    coverage = round(100 * evaluated_count / answered_count, 1) if answered_count else None
    status = 'UNAVAILABLE' if not valid else 'PARTIAL' if evaluated_count < answered_count else 'AVAILABLE'
    aggregate = compute_final_score(valid, plan=session.get('plan'), expected_questions=answered_count)
    summary.update(evaluated_questions=evaluated_count, evaluation_coverage=coverage, evaluation_status=status)
    if not valid:
        interpretation = 'Evaluation unavailable. Your recorded answers are preserved; no performance score or readiness tier has been assigned.'
    elif status == 'PARTIAL':
        interpretation = f'Partial evaluation: {evaluated_count} of {answered_count} recorded answers evaluated. The score describes evaluated answers only.'
    else:
        interpretation = 'This score summarizes evaluated answers. It does not predict hiring or placement.'
    runtime = coerce_runtime_state(session.get('runtime_state'))
    evidence = runtime.get('evidence_report_v2')
    if evidence:
        evidence = {**evidence, 'numeric_evaluation_status': status.lower(), 'evaluated_answers': evaluated_count}
    pending = sum(row['state'] in {'PENDING', 'RUNNING'} for row in (jobs or []))
    failed = sum(row['state'] == 'FAILED' for row in (jobs or []))
    return {'pending_evaluations': pending, 'failed_evaluations': failed, 'summary': summary, 'aggregate': aggregate, 'evaluations': valid,
            'evaluation_status': status, 'report_state': 'GENERATING' if pending else 'READY' if status == 'AVAILABLE' else 'PARTIAL',
            'interpretation': interpretation, 'evidence_report': evidence, 'report_version': 2}


async def hydrate_session_scores(conn, sessions):
    """Batch evidence reads for an already-authorized list; never trust stale aggregates."""
    rows = [dict(row) for row in sessions]
    ids = [row['id'] for row in rows if row['state'] == 'FINISHED']
    if not ids:
        return rows
    evaluations = await conn.fetch('SELECT * FROM question_evaluations WHERE session_id=ANY($1::uuid[]) ORDER BY session_id,turn_number', ids)
    messages = await conn.fetch('SELECT session_id,role,content,turn_number FROM conversation_messages WHERE session_id=ANY($1::uuid[])', ids)
    from collections import defaultdict
    eval_by_session, messages_by_session = defaultdict(list), defaultdict(list)
    for item in evaluations:
        eval_by_session[str(item['session_id'])].append(dict(item))
    for item in messages:
        messages_by_session[str(item['session_id'])].append(item)
    for row in rows:
        if row['state'] != 'FINISHED':
            continue
        truth = build_report_truth(row, eval_by_session[str(row['id'])], messages_by_session[str(row['id'])])
        row['final_score'] = truth['aggregate']['final_score']
        row['evaluation_status'] = truth['evaluation_status']
        row['evaluation_coverage'] = truth['summary']['evaluation_coverage']
    return rows
